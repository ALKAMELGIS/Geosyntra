/**
 * Persistent SQLite backing store for admin user directory + audit trail.
 * Survives deploys/restarts when AGRI_USER_DB_PATH points to a mounted volume.
 *
 * Merge policy on PUT: union by stable `id` — rows present in DB but missing from
 * the incoming snapshot are retained (no silent deletion during sync).
 */
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'
import bcrypt from 'bcryptjs'

const require = createRequire(import.meta.url)

const MAX_USERS = 20000
const MAX_AUDIT = 80000
const MAX_LOGIN_HISTORY = 50000

function nowIso() {
  return new Date().toISOString()
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

export function createSqliteAdminDirectoryStore(dbPath) {
  const Database = require('better-sqlite3')
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY,
      email TEXT NOT NULL COLLATE NOCASE,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Active',
      scope TEXT,
      managed_by_id INTEGER,
      last_login TEXT,
      password_hash TEXT,
      email_verified INTEGER NOT NULL DEFAULT 0,
      verification_token TEXT,
      oauth_google_sub TEXT,
      oauth_apple_sub TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);
    CREATE INDEX IF NOT EXISTS idx_admin_users_role ON admin_users(role);
    CREATE INDEX IF NOT EXISTS idx_admin_users_status ON admin_users(status);

    CREATE TABLE IF NOT EXISTS admin_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at TEXT NOT NULL,
      actor TEXT,
      action TEXT NOT NULL,
      target TEXT,
      details TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_admin_audit_at ON admin_audit(at);

    CREATE TABLE IF NOT EXISTS admin_login_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      email TEXT,
      at TEXT NOT NULL,
      ip TEXT,
      user_agent TEXT,
      success INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (user_id) REFERENCES admin_users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_admin_login_at ON admin_login_history(at);
  `)

  const selUsers = db.prepare(
    `SELECT id, email, name, role, status, scope, managed_by_id AS managedById, last_login AS lastLogin,
            password_hash AS passwordHash, email_verified AS emailVerified, verification_token AS verificationToken,
            oauth_google_sub AS oauthGoogleSub, oauth_apple_sub AS oauthAppleSub,
            created_at AS createdAt, updated_at AS updatedAt
     FROM admin_users ORDER BY id ASC`,
  )
  const selAudit = db.prepare(
    `SELECT id, at, actor, action, target, details FROM admin_audit ORDER BY id DESC LIMIT ?`,
  )
  const insAudit = db.prepare(
    `INSERT INTO admin_audit (at, actor, action, target, details) VALUES (@at, @actor, @action, @target, @details)`,
  )
  const upsertUser = db.prepare(`
    INSERT INTO admin_users (
      id, email, name, role, status, scope, managed_by_id, last_login, password_hash,
      email_verified, verification_token, oauth_google_sub, oauth_apple_sub, created_at, updated_at
    ) VALUES (
      @id, @email, @name, @role, @status, @scope, @managedById, @lastLogin, @passwordHash,
      @emailVerified, @verificationToken, @oauthGoogleSub, @oauthAppleSub, @createdAt, @updatedAt
    )
    ON CONFLICT(id) DO UPDATE SET
      email = excluded.email,
      name = excluded.name,
      role = excluded.role,
      status = excluded.status,
      scope = excluded.scope,
      managed_by_id = excluded.managed_by_id,
      last_login = excluded.last_login,
      password_hash = COALESCE(excluded.password_hash, admin_users.password_hash),
      email_verified = excluded.email_verified,
      verification_token = COALESCE(excluded.verification_token, admin_users.verification_token),
      oauth_google_sub = COALESCE(excluded.oauth_google_sub, admin_users.oauth_google_sub),
      oauth_apple_sub = COALESCE(excluded.oauth_apple_sub, admin_users.oauth_apple_sub),
      created_at = COALESCE(admin_users.created_at, excluded.created_at),
      updated_at = excluded.updated_at
  `)

  function rowToUser(r) {
    return {
      id: r.id,
      email: r.email,
      name: r.name,
      role: r.role,
      status: r.status,
      scope: r.scope || undefined,
      managedById: r.managedById ?? undefined,
      lastLogin: r.lastLogin || 'Never',
      createdAt: r.createdAt || undefined,
      passwordHash: r.passwordHash || undefined,
      emailVerified: Boolean(r.emailVerified),
      verificationToken: r.verificationToken || undefined,
      oauthGoogleSub: r.oauthGoogleSub || undefined,
      oauthAppleSub: r.oauthAppleSub || undefined,
    }
  }

  /** Strips secrets for API responses (GET directory, stats views). */
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
    }
  }

  function readDirectory() {
    const users = selUsers.all().map(rowToUser)
    const auditRows = selAudit.all(MAX_AUDIT)
    const auditLog = auditRows.map(r => ({
      id: r.id,
      at: r.at,
      actor: r.actor,
      action: r.action,
      target: r.target,
      details: r.details ? (() => { try { return JSON.parse(r.details) } catch { return r.details } })() : undefined,
    }))
    const updatedRow = db.prepare(`SELECT MAX(updated_at) AS m FROM admin_users`).get()
    return {
      users,
      auditLog,
      updatedAt: updatedRow?.m || null,
    }
  }

  function mergeUnionById(existing, incoming) {
    const byId = new Map()
    for (const u of existing) byId.set(Number(u.id), { ...u })
    for (const u of incoming) {
      const id = Number(u.id)
      if (!Number.isFinite(id) || id <= 0) continue
      const prev = byId.get(id) || {}
      byId.set(id, { ...prev, ...u, id })
    }
    return Array.from(byId.values()).sort((a, b) => a.id - b.id)
  }

  /**
   * Bcrypt for short server-side plaintext; keep bcrypt hashes; pass through legacy SHA-256 hex from older clients.
   */
  function maybeHashPassword(hashOrPlain) {
    const s = String(hashOrPlain || '')
    if (!s) return null
    if (s.startsWith('$2')) return s
    if (isLegacySha256Hex(s)) return s
    if (s.length > 120) return s
    return bcrypt.hashSync(s, 12)
  }

  /** Replace all users + audit from a full snapshot (disaster recovery). */
  function replaceFullDirectory({ users, auditLog }) {
    const ts = nowIso()
    const t = db.transaction(() => {
      db.exec(`DELETE FROM admin_login_history`)
      db.exec(`DELETE FROM admin_audit`)
      db.exec(`DELETE FROM admin_users`)
      const list = Array.isArray(users) ? users : []
      const seenEmail = new Map()
      for (const u of list) {
        const em = normalizeEmail(u.email)
        if (!em) continue
        if (seenEmail.has(em)) throw new Error(`duplicate_email:${em}`)
        seenEmail.set(em, true)
      }
      for (const u of list.slice(0, MAX_USERS)) {
        const id = Number(u.id)
        if (!Number.isFinite(id) || id <= 0) continue
        const email = normalizeEmail(u.email)
        const name = String(u.name || email || 'User').trim()
        const role = String(u.role || 'User').trim()
        const status = String(u.status || 'Active').trim()
        const scope = u.scope != null ? String(u.scope) : null
        const managedById = typeof u.managedById === 'number' ? u.managedById : null
        const lastLogin = u.lastLogin != null ? String(u.lastLogin) : 'Never'
        const passwordHash = u.passwordHash != null ? maybeHashPassword(u.passwordHash) : null
        const emailVerified = u.emailVerified === true ? 1 : 0
        const verificationToken = u.verificationToken != null ? String(u.verificationToken) : null
        const oauthGoogleSub = u.oauthGoogleSub != null ? String(u.oauthGoogleSub) : null
        const oauthAppleSub = u.oauthAppleSub != null ? String(u.oauthAppleSub) : null
        const createdAt = u.createdAt ? String(u.createdAt) : ts
        upsertUser.run({
          id,
          email,
          name,
          role,
          status,
          scope,
          managedById,
          lastLogin,
          passwordHash,
          emailVerified,
          verificationToken,
          oauthGoogleSub,
          oauthAppleSub,
          createdAt,
          updatedAt: ts,
        })
      }
      if (Array.isArray(auditLog)) {
        for (const a of auditLog.slice(-MAX_AUDIT)) {
          const at = String(a.at || ts)
          const actor = a.actor != null ? String(a.actor) : null
          const action = String(a.action || 'event')
          const target = a.target != null ? String(a.target) : null
          const details = a.details != null ? JSON.stringify(a.details) : null
          insAudit.run({ at, actor, action, target, details })
        }
      }
    })
    t()
    return readDirectory()
  }

  function writeDirectory({ users, auditLog }) {
    const t = db.transaction(() => {
      db.exec(`DELETE FROM admin_audit`)
      const cur = selUsers.all().map(rowToUser)
      const merged = mergeUnionById(cur, Array.isArray(users) ? users : [])
      const seenEmail = new Map()
      for (const u of merged) {
        const em = normalizeEmail(u.email)
        if (!em) continue
        if (seenEmail.has(em)) throw new Error(`duplicate_email:${em}`)
        seenEmail.set(em, true)
      }
      const ts = nowIso()
      for (const u of merged.slice(0, MAX_USERS)) {
        const id = Number(u.id)
        if (!Number.isFinite(id) || id <= 0) continue
        const email = normalizeEmail(u.email)
        const name = String(u.name || email || 'User').trim()
        const role = String(u.role || 'User').trim()
        const status = String(u.status || 'Active').trim()
        const scope = u.scope != null ? String(u.scope) : null
        const managedById = typeof u.managedById === 'number' ? u.managedById : null
        const lastLogin = u.lastLogin != null ? String(u.lastLogin) : 'Never'
        const passwordHash = u.passwordHash != null ? maybeHashPassword(u.passwordHash) : null
        const emailVerified = u.emailVerified === true ? 1 : 0
        const verificationToken = u.verificationToken != null ? String(u.verificationToken) : null
        const oauthGoogleSub = u.oauthGoogleSub != null ? String(u.oauthGoogleSub) : null
        const oauthAppleSub = u.oauthAppleSub != null ? String(u.oauthAppleSub) : null
        const createdAt = u.createdAt ? String(u.createdAt) : ts
        upsertUser.run({
          id,
          email,
          name,
          role,
          status,
          scope,
          managedById,
          lastLogin,
          passwordHash,
          emailVerified,
          verificationToken,
          oauthGoogleSub,
          oauthAppleSub,
          createdAt,
          updatedAt: ts,
        })
      }

      if (Array.isArray(auditLog)) {
        for (const a of auditLog.slice(-MAX_AUDIT)) {
          const at = String(a.at || ts)
          const actor = a.actor != null ? String(a.actor) : null
          const action = String(a.action || 'event')
          const target = a.target != null ? String(a.target) : null
          const details = a.details != null ? JSON.stringify(a.details) : null
          insAudit.run({ at, actor, action, target, details })
        }
      }
      pruneTable('admin_audit', MAX_AUDIT)
    })
    t()
    const next = readDirectory()
    return { updatedAt: next.updatedAt || ts }
  }

  function appendLoginEvent({ userId, email, ip, userAgent, success }) {
    const st = db.prepare(
      `INSERT INTO admin_login_history (user_id, email, at, ip, user_agent, success) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    st.run(userId || null, normalizeEmail(email), nowIso(), ip || null, userAgent || null, success ? 1 : 0)
    pruneTable('admin_login_history', MAX_LOGIN_HISTORY)
  }

  function pruneTable(table, maxRows) {
    const c = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()
    const n = Number(c?.n || 0)
    if (n <= maxRows) return
    const del = n - maxRows
    db.prepare(`DELETE FROM ${table} WHERE id IN (SELECT id FROM ${table} ORDER BY id ASC LIMIT ?)`).run(del)
  }

  function getStats() {
    const byRole = {}
    const byStatus = {}
    const rows = db.prepare(`SELECT role, status, COUNT(*) AS c FROM admin_users GROUP BY role, status`).all()
    for (const r of rows) {
      byRole[r.role] = (byRole[r.role] || 0) + r.c
      byStatus[r.status] = (byStatus[r.status] || 0) + r.c
    }
    const total = db.prepare(`SELECT COUNT(*) AS c FROM admin_users`).get()
    const verified = db.prepare(`SELECT COUNT(*) AS c FROM admin_users WHERE email_verified = 1`).get()
    const recentLogins = db
      .prepare(
        `SELECT COUNT(*) AS c FROM admin_login_history WHERE datetime(at) > datetime('now', '-7 day')`,
      )
      .get()
    return {
      totalUsers: Number(total?.c || 0),
      verifiedUsers: Number(verified?.c || 0),
      loginsLast7Days: Number(recentLogins?.c || 0),
      byRole,
      byStatus,
    }
  }

  function createEncryptedBackup(masterSecret) {
    const key = deriveKeyFromSecret(masterSecret)
    if (!key) throw new Error('missing_backup_key')
    const payload = JSON.stringify(readDirectory())
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const enc = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return {
      v: 1,
      alg: 'aes-256-gcm',
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      data: enc.toString('base64'),
      at: nowIso(),
    }
  }

  function restoreFromEncryptedBackup(blob, masterSecret) {
    const key = deriveKeyFromSecret(masterSecret)
    if (!key) throw new Error('missing_backup_key')
    const iv = Buffer.from(String(blob.iv || ''), 'base64')
    const tag = Buffer.from(String(blob.tag || ''), 'base64')
    const data = Buffer.from(String(blob.data || ''), 'base64')
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    const json = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
    const parsed = JSON.parse(json)
    replaceFullDirectory({ users: parsed.users || [], auditLog: parsed.auditLog || [] })
    return readDirectory()
  }

  function importFromJsonFileIfEmpty(jsonFilePath) {
    const cnt = db.prepare(`SELECT COUNT(*) AS c FROM admin_users`).get()
    if (Number(cnt?.c || 0) > 0) return false
    if (!fs.existsSync(jsonFilePath)) return false
    try {
      const raw = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'))
      const users = Array.isArray(raw.users) ? raw.users : []
      const auditLog = Array.isArray(raw.auditLog) ? raw.auditLog : []
      writeDirectory({ users, auditLog })
      return true
    } catch {
      return false
    }
  }

  function getLoginHistory({ userId, email, limit = 200 }) {
    const lim = Math.min(2000, Math.max(1, Number(limit) || 200))
    if (userId) {
      return db
        .prepare(
          `SELECT id, user_id AS userId, email, at, ip, user_agent AS userAgent, success
           FROM admin_login_history WHERE user_id = ? ORDER BY id DESC LIMIT ?`,
        )
        .all(Number(userId), lim)
    }
    const em = normalizeEmail(email)
    if (em) {
      return db
        .prepare(
          `SELECT id, user_id AS userId, email, at, ip, user_agent AS userAgent, success
           FROM admin_login_history WHERE email = ? ORDER BY id DESC LIMIT ?`,
        )
        .all(em, lim)
    }
    return db
      .prepare(
        `SELECT id, user_id AS userId, email, at, ip, user_agent AS userAgent, success
         FROM admin_login_history ORDER BY id DESC LIMIT ?`,
      )
      .all(lim)
  }

  function readPublicDirectory() {
    const internal = readDirectory()
    return {
      users: internal.users.map(toPublicUser),
      auditLog: internal.auditLog,
      updatedAt: internal.updatedAt,
    }
  }

  return {
    db,
    readDirectory,
    readPublicDirectory,
    replaceFullDirectory,
    writeDirectory,
    appendLoginEvent,
    getStats,
    getLoginHistory,
    createEncryptedBackup,
    restoreFromEncryptedBackup,
    importFromJsonFileIfEmpty,
  }
}
