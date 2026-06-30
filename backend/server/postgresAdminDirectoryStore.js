/**
 * PostgreSQL admin directory store — async API matching sqliteAdminDirectoryStore.
 */
import fs from 'fs'
import bcrypt from 'bcryptjs'
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

const MAX_USERS = 20000
const MAX_AUDIT = 80000
const MAX_LOGIN_HISTORY = 50000

function nowIso() {
  return new Date().toISOString()
}

/** pg timestamptz columns reject JS Date `.toString()` — always ISO-8601. */
function toPgTimestamptz(value, fallback) {
  const fb = fallback ?? nowIso()
  if (value == null || value === '') return fb
  if (value instanceof Date) return value.toISOString()
  const s = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s
  const parsed = new Date(s)
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  return fb
}

function normalizeEmail(e) {
  return String(e || '').trim().toLowerCase()
}

function deriveKeyFromSecret(secret) {
  const raw = String(secret || '').trim()
  if (!raw) return null
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex')
  return scryptSync(raw, 'agri-user-backup-salt', 32)
}

function isLegacySha256Hex(s) {
  return s.length === 64 && /^[0-9a-f]+$/i.test(s)
}

function parseProfileExtra(raw) {
  if (raw == null || raw === '') return undefined
  if (typeof raw === 'object') return raw
  try {
    return JSON.parse(String(raw))
  } catch {
    return undefined
  }
}

function profileExtraToSql(v) {
  if (v == null) return null
  if (typeof v === 'string') return v.trim() ? v : null
  try {
    const s = JSON.stringify(v)
    return s === '{}' ? null : s
  } catch {
    return null
  }
}

function rowToUser(r) {
  if (!r) return null
  return {
    id: Number(r.id),
    email: r.email,
    name: r.name,
    role: r.role,
    status: r.status,
    scope: r.scope || undefined,
    managedById: r.managedbyid ?? r.managedById ?? undefined,
    lastLogin: r.lastlogin || r.lastLogin || 'Never',
    createdAt: r.createdat || r.createdAt || undefined,
    passwordHash: r.passwordhash || r.passwordHash || undefined,
    emailVerified: Boolean(r.emailverified ?? r.emailVerified),
    verificationToken: r.verificationtoken || r.verificationToken || undefined,
    verificationTokenExpires: r.verificationtokenexpires || r.verificationTokenExpires || undefined,
    oauthGoogleSub: r.oauthgooglesub || r.oauthGoogleSub || undefined,
    oauthAppleSub: r.oauthapplesub || r.oauthAppleSub || undefined,
    profileExtra: parseProfileExtra(r.profileextraraw || r.profileExtraRaw),
  }
}

function toPublicUser(u) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    status: u.status,
    scope: u.scope,
    managedById: u.managedById,
    lastLogin: u.lastLogin,
    createdAt: u.createdAt,
    emailVerified: u.emailVerified,
    hasPassword: Boolean(u.passwordHash),
    oauthGoogleLinked: Boolean(u.oauthGoogleSub),
    oauthAppleLinked: Boolean(u.oauthAppleSub),
    ...(u.profileExtra && typeof u.profileExtra === 'object' ? { profileExtra: u.profileExtra } : {}),
  }
}

function maybeHashPassword(hashOrPlain) {
  const s = String(hashOrPlain || '')
  if (!s) return null
  if (s.startsWith('$2')) return s
  if (isLegacySha256Hex(s)) return s
  if (s.length > 120) return s
  return bcrypt.hashSync(s, 12)
}

/**
 * @param {ReturnType<import('./sqlRunner.js').createSqlRunner>} sql
 */
export function createPostgresAdminDirectoryStore(sql) {
  async function readDeletedEmails() {
    const row = await sql.queryOne(`SELECT value FROM admin_directory_meta WHERE key = ?`, ['deletedEmails'])
    if (!row?.value) return []
    try {
      const parsed = JSON.parse(String(row.value))
      return Array.isArray(parsed) ? parsed.map(e => normalizeEmail(e)).filter(Boolean) : []
    } catch {
      return []
    }
  }

  async function writeDeletedEmails(list) {
    const normalized = [...new Set((Array.isArray(list) ? list : []).map(e => normalizeEmail(e)).filter(Boolean))]
    await sql.run(
      `INSERT INTO admin_directory_meta (key, value) VALUES (?, ?)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      ['deletedEmails', JSON.stringify(normalized)],
    )
    return normalized
  }

  async function applyDeletedEmails(deletedEmails) {
    const list = Array.isArray(deletedEmails) ? deletedEmails : await readDeletedEmails()
    for (const em of list) {
      if (em) await sql.run(`DELETE FROM admin_users WHERE LOWER(email) = LOWER(?)`, [em])
    }
  }

  async function readDirectory() {
    const users = (await sql.query(
      `SELECT id, email, name, role, status, scope, managed_by_id AS "managedById", last_login AS "lastLogin",
              password_hash AS "passwordHash", email_verified AS "emailVerified", verification_token AS "verificationToken",
              verification_token_expires AS "verificationTokenExpires",
              oauth_google_sub AS "oauthGoogleSub", oauth_apple_sub AS "oauthAppleSub",
              created_at AS "createdAt", updated_at AS "updatedAt", profile_extra AS "profileExtraRaw"
       FROM admin_users ORDER BY id ASC`,
    )).map(rowToUser)

    const auditRows = await sql.query(
      `SELECT id, at, actor, action, target, details FROM admin_audit ORDER BY id DESC LIMIT ?`,
      [MAX_AUDIT],
    )
    const auditLog = auditRows.map(r => ({
      id: r.id,
      at: r.at,
      actor: r.actor,
      action: r.action,
      target: r.target,
      details: r.details ? (() => { try { return JSON.parse(r.details) } catch { return r.details } })() : undefined,
    }))
    const updatedRow = await sql.queryOne(`SELECT MAX(updated_at) AS m FROM admin_users`)
    return {
      users,
      auditLog,
      deletedEmails: await readDeletedEmails(),
      updatedAt: updatedRow?.m || null,
    }
  }

  async function writeDirectory({ users, auditLog, deletedEmails }) {
    const ts = nowIso()
    await sql.transaction(async tx => {
      await tx.run(`DELETE FROM admin_audit`)
      if (deletedEmails !== undefined) {
        await writeDeletedEmails(deletedEmails)
      }
      const cur = (await tx.query(
        `SELECT id, email, name, role, status, scope, managed_by_id AS "managedById", last_login AS "lastLogin",
                password_hash AS "passwordHash", email_verified AS "emailVerified", verification_token AS "verificationToken",
                verification_token_expires AS "verificationTokenExpires",
                oauth_google_sub AS "oauthGoogleSub", oauth_apple_sub AS "oauthAppleSub",
                created_at AS "createdAt", updated_at AS "updatedAt", profile_extra AS "profileExtraRaw"
         FROM admin_users ORDER BY id ASC`,
      )).map(rowToUser)

      const byId = new Map()
      for (const u of cur) byId.set(Number(u.id), { ...u })
      for (const u of Array.isArray(users) ? users : []) {
        const id = Number(u.id)
        if (!Number.isFinite(id) || id <= 0) continue
        byId.set(id, { ...(byId.get(id) || {}), ...u, id })
      }
      const merged = Array.from(byId.values()).sort((a, b) => a.id - b.id)

      for (const u of merged.slice(0, MAX_USERS)) {
        const id = Number(u.id)
        const email = normalizeEmail(u.email)
        await tx.runNamed(
          `INSERT INTO admin_users (
            id, email, name, role, status, scope, managed_by_id, last_login, password_hash,
            email_verified, verification_token, verification_token_expires,
            oauth_google_sub, oauth_apple_sub, profile_extra, created_at, updated_at
          ) VALUES (
            @id, @email, @name, @role, @status, @scope, @managedById, @lastLogin, @passwordHash,
            @emailVerified, @verificationToken, @verificationTokenExpires,
            @oauthGoogleSub, @oauthAppleSub, @profileExtra, @createdAt, @updatedAt
          )
          ON CONFLICT (id) DO UPDATE SET
            email = EXCLUDED.email,
            name = EXCLUDED.name,
            role = EXCLUDED.role,
            status = EXCLUDED.status,
            scope = EXCLUDED.scope,
            managed_by_id = EXCLUDED.managed_by_id,
            last_login = EXCLUDED.last_login,
            password_hash = COALESCE(EXCLUDED.password_hash, admin_users.password_hash),
            email_verified = EXCLUDED.email_verified,
            verification_token = COALESCE(EXCLUDED.verification_token, admin_users.verification_token),
            verification_token_expires = COALESCE(EXCLUDED.verification_token_expires, admin_users.verification_token_expires),
            oauth_google_sub = COALESCE(EXCLUDED.oauth_google_sub, admin_users.oauth_google_sub),
            oauth_apple_sub = COALESCE(EXCLUDED.oauth_apple_sub, admin_users.oauth_apple_sub),
            profile_extra = CASE
              WHEN EXCLUDED.profile_extra IS NOT NULL AND EXCLUDED.profile_extra != ''
              THEN EXCLUDED.profile_extra
              ELSE admin_users.profile_extra
            END,
            created_at = COALESCE(admin_users.created_at, EXCLUDED.created_at),
            updated_at = EXCLUDED.updated_at`,
          {
            id,
            email,
            name: String(u.name || email || 'User').trim(),
            role: String(u.role || 'User').trim(),
            status: String(u.status || 'Active').trim(),
            scope: u.scope != null ? String(u.scope) : null,
            managedById: typeof u.managedById === 'number' ? u.managedById : null,
            lastLogin: u.lastLogin != null ? String(u.lastLogin) : 'Never',
            passwordHash: u.passwordHash != null ? maybeHashPassword(u.passwordHash) : null,
            emailVerified: u.emailVerified === true,
            verificationToken: u.verificationToken != null ? String(u.verificationToken) : null,
            verificationTokenExpires: u.verificationTokenExpires != null ? String(u.verificationTokenExpires) : null,
            oauthGoogleSub: u.oauthGoogleSub != null ? String(u.oauthGoogleSub) : null,
            oauthAppleSub: u.oauthAppleSub != null ? String(u.oauthAppleSub) : null,
            profileExtra: profileExtraToSql(u.profileExtra),
            createdAt: toPgTimestamptz(u.createdAt, ts),
            updatedAt: toPgTimestamptz(ts, ts),
          },
        )
      }

      if (Array.isArray(auditLog)) {
        for (const a of auditLog.slice(-MAX_AUDIT)) {
          await tx.runNamed(
            `INSERT INTO admin_audit (at, actor, action, target, details) VALUES (@at, @actor, @action, @target, @details)`,
            {
              at: toPgTimestamptz(a.at, ts),
              actor: a.actor != null ? String(a.actor) : null,
              action: String(a.action || 'event'),
              target: a.target != null ? String(a.target) : null,
              details: a.details != null ? JSON.stringify(a.details) : null,
            },
          )
        }
      }
      await applyDeletedEmails(await readDeletedEmails())
    })
    const next = await readDirectory()
    return { updatedAt: next.updatedAt || ts }
  }

  return {
    dialect: 'postgres',
    db: null,
    readDirectory,
    readPublicDirectory: async () => {
      const internal = await readDirectory()
      return {
        users: internal.users.map(toPublicUser),
        auditLog: internal.auditLog,
        deletedEmails: internal.deletedEmails || (await readDeletedEmails()),
        updatedAt: internal.updatedAt,
      }
    },
    replaceFullDirectory: async ({ users, auditLog }) => writeDirectory({ users, auditLog }),
    writeDirectory,
    appendLoginEvent: async ({ userId, email, ip, userAgent, success }) => {
      await sql.run(
        `INSERT INTO admin_login_history (user_id, email, at, ip, user_agent, success) VALUES (?, ?, ?, ?, ?, ?)`,
        [userId || null, normalizeEmail(email), nowIso(), ip || null, userAgent || null, Boolean(success)],
      )
    },
    getStats: async () => {
      const rows = await sql.query(`SELECT role, status, COUNT(*)::int AS c FROM admin_users GROUP BY role, status`)
      const byRole = {}
      const byStatus = {}
      for (const r of rows) {
        byRole[r.role] = (byRole[r.role] || 0) + r.c
        byStatus[r.status] = (byStatus[r.status] || 0) + r.c
      }
      const total = await sql.queryOne(`SELECT COUNT(*)::int AS c FROM admin_users`)
      const verified = await sql.queryOne(`SELECT COUNT(*)::int AS c FROM admin_users WHERE email_verified = TRUE`)
      const recentLogins = await sql.queryOne(
        `SELECT COUNT(*)::int AS c FROM admin_login_history WHERE at > NOW() - INTERVAL '7 days'`,
      )
      return {
        totalUsers: Number(total?.c || 0),
        verifiedUsers: Number(verified?.c || 0),
        loginsLast7Days: Number(recentLogins?.c || 0),
        byRole,
        byStatus,
      }
    },
    getLoginHistory: async ({ userId, email, limit = 200 }) => {
      const lim = Math.min(2000, Math.max(1, Number(limit) || 200))
      if (userId) {
        return sql.query(
          `SELECT id, user_id AS "userId", email, at, ip, user_agent AS "userAgent", success
           FROM admin_login_history WHERE user_id = ? ORDER BY id DESC LIMIT ?`,
          [Number(userId), lim],
        )
      }
      const em = normalizeEmail(email)
      if (em) {
        return sql.query(
          `SELECT id, user_id AS "userId", email, at, ip, user_agent AS "userAgent", success
           FROM admin_login_history WHERE LOWER(email) = LOWER(?) ORDER BY id DESC LIMIT ?`,
          [em, lim],
        )
      }
      return sql.query(
        `SELECT id, user_id AS "userId", email, at, ip, user_agent AS "userAgent", success
         FROM admin_login_history ORDER BY id DESC LIMIT ?`,
        [lim],
      )
    },
    createEncryptedBackup: async masterSecret => {
      const key = deriveKeyFromSecret(masterSecret)
      if (!key) throw new Error('missing_backup_key')
      const payload = JSON.stringify(await readDirectory())
      const iv = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', key, iv)
      const enc = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()])
      const tag = cipher.getAuthTag()
      return { v: 1, alg: 'aes-256-gcm', iv: iv.toString('base64'), tag: tag.toString('base64'), data: enc.toString('base64'), at: nowIso() }
    },
    restoreFromEncryptedBackup: async (blob, masterSecret) => {
      const key = deriveKeyFromSecret(masterSecret)
      if (!key) throw new Error('missing_backup_key')
      const iv = Buffer.from(String(blob.iv || ''), 'base64')
      const tag = Buffer.from(String(blob.tag || ''), 'base64')
      const data = Buffer.from(String(blob.data || ''), 'base64')
      const decipher = createDecipheriv('aes-256-gcm', key, iv)
      decipher.setAuthTag(tag)
      const json = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
      const parsed = JSON.parse(json)
      await writeDirectory({ users: parsed.users || [], auditLog: parsed.auditLog || [] })
      return readDirectory()
    },
    importFromJsonFileIfEmpty: async jsonFilePath => {
      const cnt = await sql.queryOne(`SELECT COUNT(*)::int AS c FROM admin_users`)
      if (Number(cnt?.c || 0) > 0) return false
      if (!fs.existsSync(jsonFilePath)) return false
      try {
        const raw = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'))
        await writeDirectory({
          users: Array.isArray(raw.users) ? raw.users : [],
          auditLog: Array.isArray(raw.auditLog) ? raw.auditLog : [],
        })
        return true
      } catch {
        return false
      }
    },
    getUserRowByEmail: async email => {
      const row = await sql.queryOne(
        `SELECT id, email, name, role, status, scope, managed_by_id AS "managedById", last_login AS "lastLogin",
                password_hash AS "passwordHash", email_verified AS "emailVerified", verification_token AS "verificationToken",
                verification_token_expires AS "verificationTokenExpires",
                oauth_google_sub AS "oauthGoogleSub", oauth_apple_sub AS "oauthAppleSub",
                created_at AS "createdAt", updated_at AS "updatedAt", profile_extra AS "profileExtraRaw"
         FROM admin_users WHERE LOWER(email) = LOWER(?) LIMIT 1`,
        [normalizeEmail(email)],
      )
      return rowToUser(row)
    },
    getUserRowByVerificationToken: async token => {
      const t = String(token || '').trim()
      if (!t) return null
      const row = await sql.queryOne(
        `SELECT id, email, name, role, status, scope, managed_by_id AS "managedById", last_login AS "lastLogin",
                password_hash AS "passwordHash", email_verified AS "emailVerified", verification_token AS "verificationToken",
                verification_token_expires AS "verificationTokenExpires",
                oauth_google_sub AS "oauthGoogleSub", oauth_apple_sub AS "oauthAppleSub",
                created_at AS "createdAt", updated_at AS "updatedAt", profile_extra AS "profileExtraRaw"
         FROM admin_users WHERE verification_token = ? LIMIT 1`,
        [t],
      )
      return rowToUser(row)
    },
    getMaxUserId: async () => {
      const row = await sql.queryOne(`SELECT MAX(id)::bigint AS m FROM admin_users`)
      return Number(row?.m || 0)
    },
  }
}
