/**
 * Admin directory: users + audit log with durable storage.
 *
 * Modes:
 *   GEOSYNTRA_USER_DB_PATH — SQLite (recommended for production volumes). Survives deploys/restarts.
 *   Otherwise — JSON file via GEOSYNTRA_ADMIN_DIRECTORY_FILE (legacy).
 *
 * PUT merge policy (users): union by stable numeric `id` so rows missing from the client
 * snapshot are not removed (no silent data loss on partial sync).
 *
 * Env (GEOSYNTRA_* preferred; AGRI_* legacy):
 *   GEOSYNTRA_ADMIN_DIRECTORY_FILE — JSON path when SQLite is not used
 *   GEOSYNTRA_ADMIN_DIRECTORY_TOKEN — optional guard (X-Agri-Admin-Directory-Token / Bearer)
 *   GEOSYNTRA_USER_DB_PATH — SQLite database file path
 *   GEOSYNTRA_BACKUP_MASTER_KEY — hex 64 chars or passphrase; enables AES-256-GCM backup/restore + optional auto-backup on PUT
 *   GEOSYNTRA_ADMIN_BACKUP_DIR — optional directory for automatic pre-PUT backup files (SQLite mode)
 */
import fs from 'fs'
import path from 'path'
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'
import { createSqliteAdminDirectoryStore } from './sqliteAdminDirectoryStore.js'
import { platformEnvVar } from './platformDataPaths.js'

const MAX_USERS = 20000
const MAX_AUDIT = 8000

function emptyStore() {
  return { version: 1, updatedAt: null, users: [], auditLog: [], deletedEmails: [] }
}

function normalizeEmailList(list) {
  const out = new Set()
  for (const raw of Array.isArray(list) ? list : []) {
    const em = String(raw || '')
      .trim()
      .toLowerCase()
    if (em) out.add(em)
  }
  return [...out]
}

function mergeDeletedEmails(existing, incoming) {
  return normalizeEmailList([...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])])
}

function filterUsersByDeleted(users, deletedEmails) {
  const tomb = new Set(normalizeEmailList(deletedEmails))
  if (!tomb.size) return Array.isArray(users) ? users : []
  return (Array.isArray(users) ? users : []).filter(u => !tomb.has(String(u?.email || '').trim().toLowerCase()))
}

function mergeUsersById(existing, incoming) {
  const byId = new Map()
  for (const u of Array.isArray(existing) ? existing : []) {
    const id = Number(u?.id)
    if (!Number.isFinite(id) || id <= 0) continue
    byId.set(id, { ...u, id })
  }
  for (const u of Array.isArray(incoming) ? incoming : []) {
    const id = Number(u?.id)
    if (!Number.isFinite(id) || id <= 0) continue
    const prev = byId.get(id) || {}
    byId.set(id, { ...prev, ...u, id })
  }
  return Array.from(byId.values()).sort((a, b) => a.id - b.id)
}

function readStore(filePath) {
  try {
    if (!fs.existsSync(filePath)) return { persisted: false, data: emptyStore() }
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    if (!raw || typeof raw !== 'object') return { persisted: true, data: emptyStore() }
    const users = Array.isArray(raw.users) ? raw.users : []
    const auditLog = Array.isArray(raw.auditLog) ? raw.auditLog : []
    const deletedEmails = mergeDeletedEmails([], raw.deletedEmails)
    return {
      persisted: true,
      data: {
        version: 1,
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
        users: filterUsersByDeleted(users, deletedEmails).slice(0, MAX_USERS),
        auditLog: auditLog.slice(0, MAX_AUDIT),
        deletedEmails,
      },
    }
  } catch (e) {
    console.error('[admin-directory] read failed', e)
    return { persisted: false, data: emptyStore() }
  }
}

function writeStore(filePath, data) {
  const dir = path.dirname(filePath)
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch {
    // ignore
  }
  const prev = readStore(filePath).data
  const deletedEmails = mergeDeletedEmails(prev.deletedEmails, data.deletedEmails)
  let mergedUsers = mergeUsersById(prev.users, data.users)
  mergedUsers = filterUsersByDeleted(mergedUsers, deletedEmails)
  const next = {
    version: 1,
    updatedAt: new Date().toISOString(),
    users: mergedUsers.slice(0, MAX_USERS),
    auditLog: Array.isArray(data.auditLog) ? data.auditLog.slice(0, MAX_AUDIT) : prev.auditLog || [],
    deletedEmails,
  }
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2), 'utf8')
}

/** Full replace (e.g. encrypted restore) — does not merge with previous file contents. */
function writeStoreReplace(filePath, data) {
  const dir = path.dirname(filePath)
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch {
    // ignore
  }
  const next = {
    version: 1,
    updatedAt: new Date().toISOString(),
    users: Array.isArray(data.users) ? data.users.slice(0, MAX_USERS) : [],
    auditLog: Array.isArray(data.auditLog) ? data.auditLog.slice(0, MAX_AUDIT) : [],
  }
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2), 'utf8')
}

function jsonPublicSnapshot(filePath) {
  const { data } = readStore(filePath)
  const users = (data.users || []).map(u => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    status: u.status,
    scope: u.scope,
    managedById: u.managedById,
    lastLogin: u.lastLogin,
    createdAt: u.createdAt,
    emailVerified: Boolean(u.emailVerified),
    hasPassword: Boolean(u.passwordHash),
    oauthGoogleLinked: Boolean(u.oauthGoogleSub),
    oauthAppleLinked: Boolean(u.oauthAppleSub),
    ...(u.profileExtra && typeof u.profileExtra === 'object' ? { profileExtra: u.profileExtra } : {}),
  }))
  return { ...data, users }
}

function backupKeyFromEnv(secret) {
  const raw = String(secret || '').trim()
  if (!raw) return null
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex')
  return scryptSync(raw, 'agri-user-backup-salt', 32)
}

function writeAutoBackup(sqliteStore, backupDir, masterSecret) {
  const key = backupKeyFromEnv(masterSecret)
  if (!key || !backupDir) return
  try {
    fs.mkdirSync(backupDir, { recursive: true })
    const blob = sqliteStore.createEncryptedBackup(masterSecret)
    const name = `admin-directory-${new Date().toISOString().replace(/[:.]/g, '-')}.enc.json`
    fs.writeFileSync(path.join(backupDir, name), JSON.stringify(blob), 'utf8')
    const files = fs
      .readdirSync(backupDir)
      .filter(f => f.endsWith('.enc.json'))
      .map(f => ({ f, t: fs.statSync(path.join(backupDir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)
    for (const x of files.slice(40)) {
      try {
        fs.unlinkSync(path.join(backupDir, x.f))
      } catch {
        /* ignore */
      }
    }
  } catch (e) {
    console.error('[admin-directory] auto-backup failed', e)
  }
}

/**
 * @param {import('express').Express} app
 * @param {{ filePath: string, accessToken?: string, sqlitePath?: string }} opts
 */
export function registerAdminDirectoryPersistence(app, opts) {
  const filePath = opts.filePath
  const sqlitePath = String(opts.sqlitePath || '').trim()
  const token = String(opts.accessToken || '').trim()
  const backupMaster = platformEnvVar('BACKUP_MASTER_KEY')
  const backupDir = platformEnvVar('ADMIN_BACKUP_DIR')

  let sqlite = null
  if (sqlitePath) {
    try {
      const parent = path.dirname(sqlitePath)
      fs.mkdirSync(parent, { recursive: true })
      sqlite = createSqliteAdminDirectoryStore(sqlitePath)
      const migrated = sqlite.importFromJsonFileIfEmpty(filePath)
      if (migrated) {
        console.log('[admin-directory] SQLite initialized from JSON:', path.basename(filePath))
      }
    } catch (e) {
      console.error('[admin-directory] SQLite init failed; falling back to JSON file only for reads', e)
      sqlite = null
    }
  }

  function guard(req, res, next) {
    if (!token) return next()
    const hdr = String(req.headers['x-agri-admin-directory-token'] || '').trim()
    const auth = String(req.headers.authorization || '')
      .replace(/^Bearer\s+/i, '')
      .trim()
    if (hdr === token || auth === token) return next()
    return res.status(401).json({ ok: false, error: 'Invalid or missing admin directory token.' })
  }

  app.get('/api/v1/admin/directory', guard, (_req, res) => {
    try {
      if (sqlite) {
        const data = sqlite.readPublicDirectory()
        return res.json({ ok: true, version: 1, ...data })
      }
      return res.json({ ok: true, version: 1, ...jsonPublicSnapshot(filePath) })
    } catch (e) {
      console.error('[admin-directory] get failed', e)
      return res.status(500).json({ ok: false, error: 'Failed to read admin directory.' })
    }
  })

  app.get('/api/v1/admin/directory/stats', guard, (_req, res) => {
    try {
      if (!sqlite) {
        const { data } = readStore(filePath)
        const users = data.users || []
        const byRole = {}
        const byStatus = {}
        for (const u of users) {
          const r = String(u.role || 'User')
          const s = String(u.status || 'Active')
          byRole[r] = (byRole[r] || 0) + 1
          byStatus[s] = (byStatus[s] || 0) + 1
        }
        return res.json({
          ok: true,
          storage: 'json',
          totalUsers: users.length,
          verifiedUsers: users.filter(u => u.emailVerified).length,
          loginsLast7Days: null,
          byRole,
          byStatus,
        })
      }
      return res.json({ ok: true, storage: 'sqlite', ...sqlite.getStats() })
    } catch (e) {
      console.error('[admin-directory] stats failed', e)
      return res.status(500).json({ ok: false, error: 'stats_failed' })
    }
  })

  app.get('/api/v1/admin/directory/login-history', guard, (req, res) => {
    try {
      if (!sqlite) {
        return res.json({ ok: true, storage: 'json', entries: [] })
      }
      const userId = req.query.userId ? Number(req.query.userId) : undefined
      const email = req.query.email ? String(req.query.email) : undefined
      const limit = req.query.limit ? Number(req.query.limit) : 200
      const entries = sqlite.getLoginHistory({ userId, email, limit })
      return res.json({ ok: true, entries })
    } catch (e) {
      console.error('[admin-directory] login-history failed', e)
      return res.status(500).json({ ok: false, error: 'login_history_failed' })
    }
  })

  app.post('/api/v1/admin/directory/login-event', guard, (req, res) => {
    try {
      if (!sqlite) {
        return res.json({ ok: true, ignored: true })
      }
      const body = req.body && typeof req.body === 'object' ? req.body : {}
      sqlite.appendLoginEvent({
        userId: body.userId != null ? Number(body.userId) : null,
        email: body.email,
        ip: req.ip || req.headers['x-forwarded-for'] || '',
        userAgent: String(req.headers['user-agent'] || ''),
        success: body.success !== false,
      })
      return res.json({ ok: true })
    } catch (e) {
      console.error('[admin-directory] login-event failed', e)
      return res.status(500).json({ ok: false, error: 'login_event_failed' })
    }
  })

  app.post('/api/v1/admin/directory/backup', guard, (_req, res) => {
    try {
      if (!backupMaster) {
        return res.status(503).json({ ok: false, error: 'backup_key_not_configured' })
      }
      if (!sqlite) {
        const { data } = readStore(filePath)
        const key = backupKeyFromEnv(backupMaster)
        if (!key) return res.status(503).json({ ok: false, error: 'backup_key_invalid' })
        const payload = JSON.stringify(data)
        const iv = randomBytes(12)
        const cipher = createCipheriv('aes-256-gcm', key, iv)
        const enc = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()])
        const tag = cipher.getAuthTag()
        return res.json({
          ok: true,
          blob: {
            v: 1,
            alg: 'aes-256-gcm',
            iv: iv.toString('base64'),
            tag: tag.toString('base64'),
            data: enc.toString('base64'),
            at: new Date().toISOString(),
            source: 'json',
          },
        })
      }
      const blob = sqlite.createEncryptedBackup(backupMaster)
      return res.json({ ok: true, blob: { ...blob, source: 'sqlite' } })
    } catch (e) {
      console.error('[admin-directory] backup failed', e)
      return res.status(500).json({ ok: false, error: 'backup_failed' })
    }
  })

  app.post('/api/v1/admin/directory/restore', guard, (req, res) => {
    try {
      if (!backupMaster) {
        return res.status(503).json({ ok: false, error: 'backup_key_not_configured' })
      }
      const body = req.body && typeof req.body === 'object' ? req.body : {}
      const blob = body.blob || body
      if (!blob || !blob.data) {
        return res.status(400).json({ ok: false, error: 'missing_blob' })
      }
      const key = backupKeyFromEnv(backupMaster)
      if (!key) return res.status(503).json({ ok: false, error: 'backup_key_invalid' })
      const iv = Buffer.from(String(blob.iv || ''), 'base64')
      const tag = Buffer.from(String(blob.tag || ''), 'base64')
      const data = Buffer.from(String(blob.data || ''), 'base64')
      const decipher = createDecipheriv('aes-256-gcm', key, iv)
      decipher.setAuthTag(tag)
      const json = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
      const parsed = JSON.parse(json)

      if (sqlite) {
        sqlite.restoreFromEncryptedBackup(blob, backupMaster)
        const pub = sqlite.readPublicDirectory()
        return res.json({ ok: true, updatedAt: pub.updatedAt, userCount: pub.users.length })
      }

      writeStoreReplace(filePath, { users: parsed.users || [], auditLog: parsed.auditLog || [] })
      return res.json({ ok: true, updatedAt: new Date().toISOString() })
    } catch (e) {
      console.error('[admin-directory] restore failed', e)
      return res.status(400).json({ ok: false, error: 'restore_failed' })
    }
  })

  app.put('/api/v1/admin/directory', guard, (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {}
      const users = Array.isArray(body.users) ? body.users : null
      const auditLog = Array.isArray(body.auditLog) ? body.auditLog : null
      const deletedEmails = body.deletedEmails
      if (!users || !auditLog) {
        return res.status(400).json({ ok: false, error: 'Body must include users[] and auditLog[] arrays.' })
      }

      if (sqlite) {
        if (backupMaster && backupDir) {
          writeAutoBackup(sqlite, backupDir, backupMaster)
        }
        const { updatedAt } = sqlite.writeDirectory({ users, auditLog, deletedEmails })
        return res.json({ ok: true, updatedAt })
      }

      writeStore(filePath, { users, auditLog, deletedEmails })
      return res.json({ ok: true, updatedAt: new Date().toISOString() })
    } catch (e) {
      const msg = String(e?.message || e)
      if (msg.startsWith('duplicate_email:')) {
        return res.status(409).json({ ok: false, error: 'duplicate_email', email: msg.split(':')[1] })
      }
      console.error('[admin-directory] write failed', e)
      return res.status(500).json({ ok: false, error: 'Failed to persist admin directory.' })
    }
  })
}
