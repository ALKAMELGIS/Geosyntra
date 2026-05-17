/**
 * Auth-facing user directory — SQLite (preferred) or JSON file fallback.
 */
import fs from 'fs'
import path from 'path'
import { createHash } from 'crypto'
import bcrypt from 'bcryptjs'
import { createSqliteAdminDirectoryStore } from './sqliteAdminDirectoryStore.js'
import {
  generateVerificationToken,
  isVerificationExpired,
  verificationExpiresAt,
} from './authVerification.js'

function appendAuditEntry(auditLog, entry) {
  const row = {
    at: new Date().toISOString(),
    actor: entry.actor ?? null,
    action: String(entry.action || 'event'),
    target: entry.target ?? null,
    details: entry.details ?? undefined,
  }
  const next = [...(Array.isArray(auditLog) ? auditLog : []), row]
  return next.slice(-80000)
}

function normalizeEmail(e) {
  return String(e || '').trim().toLowerCase()
}

function isLegacySha256Hex(s) {
  return s.length === 64 && /^[0-9a-f]+$/i.test(s)
}

function emptyStore() {
  return { version: 1, updatedAt: null, users: [], auditLog: [] }
}

function readJsonStore(filePath) {
  try {
    if (!fs.existsSync(filePath)) return { persisted: false, data: emptyStore() }
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    if (!raw || typeof raw !== 'object') return { persisted: true, data: emptyStore() }
    return {
      persisted: true,
      data: {
        version: 1,
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
        users: Array.isArray(raw.users) ? raw.users : [],
        auditLog: Array.isArray(raw.auditLog) ? raw.auditLog : [],
      },
    }
  } catch {
    return { persisted: false, data: emptyStore() }
  }
}

function writeJsonStore(filePath, data) {
  const dir = path.dirname(filePath)
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch {
    /* ignore */
  }
  const next = {
    version: 1,
    updatedAt: new Date().toISOString(),
    users: Array.isArray(data.users) ? data.users : [],
    auditLog: Array.isArray(data.auditLog) ? data.auditLog : [],
  }
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2), 'utf8')
}

function nextUserId(users) {
  let max = 0
  for (const u of users) {
    const id = Number(u?.id)
    if (Number.isFinite(id) && id > max) max = id
  }
  return max + 1
}

function checkPassword(storedHash, plain) {
  const hash = String(storedHash || '')
  const pwd = String(plain || '')
  if (!hash || !pwd) return false
  if (hash.startsWith('$2')) return bcrypt.compareSync(pwd, hash)
  if (isLegacySha256Hex(hash)) {
    const hex = createHash('sha256').update(pwd).digest('hex')
    return hex === hash
  }
  return false
}

function hashPassword(plain) {
  return bcrypt.hashSync(String(plain || ''), 12)
}

/**
 * @param {{ sqlitePath?: string, jsonFilePath: string }} opts
 */
export function createAuthDirectoryStore(opts) {
  const jsonFilePath = opts.jsonFilePath
  const sqlitePath = String(opts.sqlitePath || '').trim()
  let sqlite = null
  if (sqlitePath) {
    try {
      const parent = path.dirname(sqlitePath)
      fs.mkdirSync(parent, { recursive: true })
      sqlite = createSqliteAdminDirectoryStore(sqlitePath)
    } catch (e) {
      console.error('[auth-directory] SQLite init failed; using JSON fallback', e)
      sqlite = null
    }
  }

  if (sqlite) {
    const db = sqlite.db
    const selByEmail = db.prepare(
      `SELECT id, email, name, role, status, scope, managed_by_id AS managedById, last_login AS lastLogin,
              password_hash AS passwordHash, email_verified AS emailVerified, verification_token AS verificationToken,
              verification_token_expires AS verificationTokenExpires,
              oauth_google_sub AS oauthGoogleSub, oauth_apple_sub AS oauthAppleSub,
              created_at AS createdAt, updated_at AS updatedAt, profile_extra AS profileExtraRaw
       FROM admin_users WHERE email = ? COLLATE NOCASE LIMIT 1`,
    )
    const selByToken = db.prepare(
      `SELECT id, email, name, role, status, scope, managed_by_id AS managedById, last_login AS lastLogin,
              password_hash AS passwordHash, email_verified AS emailVerified, verification_token AS verificationToken,
              verification_token_expires AS verificationTokenExpires,
              oauth_google_sub AS oauthGoogleSub, oauth_apple_sub AS oauthAppleSub,
              created_at AS createdAt, updated_at AS updatedAt, profile_extra AS profileExtraRaw
       FROM admin_users WHERE verification_token = ? LIMIT 1`,
    )
    const maxId = db.prepare(`SELECT MAX(id) AS m FROM admin_users`)

    function rowToUser(r) {
      if (!r) return null
      let profileExtra
      if (r.profileExtraRaw) {
        try {
          profileExtra = JSON.parse(String(r.profileExtraRaw))
        } catch {
          profileExtra = undefined
        }
      }
      return {
        id: r.id,
        email: r.email,
        name: r.name,
        role: r.role,
        status: r.status,
        lastLogin: r.lastLogin || 'Never',
        passwordHash: r.passwordHash || undefined,
        emailVerified: Boolean(r.emailVerified),
        verificationToken: r.verificationToken || undefined,
        verificationTokenExpires: r.verificationTokenExpires || undefined,
        oauthGoogleSub: r.oauthGoogleSub || undefined,
        oauthAppleSub: r.oauthAppleSub || undefined,
        createdAt: r.createdAt,
        profileExtra,
      }
    }

    function publicUser(u) {
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        emailVerified: Boolean(u.emailVerified),
      }
    }

    return {
      storage: 'sqlite',
      getUserByEmail(email) {
        return rowToUser(selByEmail.get(normalizeEmail(email)))
      },
      getUserByVerificationToken(token) {
        const t = String(token || '').trim()
        if (!t) return null
        return rowToUser(selByToken.get(t))
      },
      registerUser({ name, email, password, profileExtra }) {
        const em = normalizeEmail(email)
        if (selByEmail.get(em)) return { ok: false, error: 'email_exists' }
        const id = Number(maxId.get()?.m || 0) + 1
        const ts = new Date().toISOString()
        const token = generateVerificationToken()
        const expires = verificationExpiresAt()
        const user = {
          id,
          email: em,
          name: String(name || em).trim(),
          role: 'Viewer',
          status: 'Pending Verification',
          lastLogin: 'Never',
          passwordHash: hashPassword(password),
          emailVerified: false,
          verificationToken: token,
          verificationTokenExpires: expires,
          createdAt: ts,
          profileExtra: profileExtra || {},
        }
        const dir = sqlite.readDirectory()
        const auditLog = appendAuditEntry(dir.auditLog, {
          actor: em,
          action: 'user_registered',
          target: em,
          details: { status: 'Pending Verification' },
        })
        sqlite.writeDirectory({ users: [...dir.users, user], auditLog })
        return { ok: true, user, verificationToken: token, verificationTokenExpires: expires }
      },
      verifyEmailByToken(token) {
        const u = rowToUser(selByToken.get(String(token || '').trim()))
        if (!u || !u.verificationToken) return { ok: false, error: 'invalid_token' }
        if (isVerificationExpired(u.verificationTokenExpires)) {
          return { ok: false, error: 'token_expired' }
        }
        const dir = sqlite.readDirectory()
        const users = dir.users.map(row => {
          if (row.id !== u.id) return row
          return {
            ...row,
            emailVerified: true,
            status: 'Active',
            verificationToken: null,
            verificationTokenExpires: null,
            updatedAt: new Date().toISOString(),
          }
        })
        const auditLog = appendAuditEntry(dir.auditLog, {
          actor: u.email,
          action: 'email_verified',
          target: u.email,
        })
        sqlite.writeDirectory({ users, auditLog })
        const verified = { ...u, emailVerified: true, verificationToken: undefined }
        return { ok: true, user: verified, publicUser: publicUser(verified) }
      },
      setVerificationToken(email, token, expiresAt) {
        const em = normalizeEmail(email)
        const dir = sqlite.readDirectory()
        let found = false
        const expires = expiresAt || verificationExpiresAt()
        const users = dir.users.map(row => {
          if (normalizeEmail(row.email) !== em) return row
          found = true
          return {
            ...row,
            verificationToken: token,
            verificationTokenExpires: expires,
            emailVerified: false,
            status: 'Pending Verification',
          }
        })
        if (!found) return { ok: false, error: 'not_found' }
        sqlite.writeDirectory({ users, auditLog: dir.auditLog })
        return { ok: true }
      },
      loginUser(email, password) {
        const u = rowToUser(selByEmail.get(normalizeEmail(email)))
        if (!u) return { ok: false, error: 'invalid_credentials' }
        if (!checkPassword(u.passwordHash, password)) return { ok: false, error: 'invalid_credentials' }
        if (!u.emailVerified) return { ok: false, error: 'email_not_verified' }
        const ts = new Date().toISOString()
        const dir = sqlite.readDirectory()
        const users = dir.users.map(row =>
          row.id === u.id ? { ...row, lastLogin: ts } : row,
        )
        sqlite.writeDirectory({ users, auditLog: dir.auditLog })
        return { ok: true, user: u, publicUser: publicUser(u) }
      },
      upsertOAuthUser({ email, name, provider, sub }) {
        const em = normalizeEmail(email)
        if (!em) return { ok: false, error: 'email_required' }
        const dir = sqlite.readDirectory()
        let existing = dir.users.find(u => normalizeEmail(u.email) === em)
        const ts = new Date().toISOString()
        if (existing) {
          existing = {
            ...existing,
            name: String(name || existing.name).trim(),
            emailVerified: true,
            verificationToken: null,
            lastLogin: ts,
            ...(provider === 'google' ? { oauthGoogleSub: sub } : {}),
            ...(provider === 'apple' ? { oauthAppleSub: sub } : {}),
          }
          const users = dir.users.map(u => (u.id === existing.id ? existing : u))
          sqlite.writeDirectory({ users, auditLog: dir.auditLog })
          return { ok: true, user: existing, publicUser: publicUser(existing) }
        }
        const id = Number(maxId.get()?.m || 0) + 1
        const user = {
          id,
          email: em,
          name: String(name || em).trim(),
          role: 'Viewer',
          status: 'Active',
          lastLogin: ts,
          passwordHash: null,
          emailVerified: true,
          verificationToken: null,
          createdAt: ts,
          profileExtra: { oauthProvider: provider },
          ...(provider === 'google' ? { oauthGoogleSub: sub } : {}),
          ...(provider === 'apple' ? { oauthAppleSub: sub } : {}),
        }
        sqlite.writeDirectory({ users: [...dir.users, user], auditLog: dir.auditLog })
        return { ok: true, user, publicUser: publicUser(user) }
      },
    }
  }

  /* JSON file fallback */
  return {
    storage: 'json',
    getUserByEmail(email) {
      const { data } = readJsonStore(jsonFilePath)
      const em = normalizeEmail(email)
      return data.users.find(u => normalizeEmail(u.email) === em) || null
    },
    getUserByVerificationToken(token) {
      const { data } = readJsonStore(jsonFilePath)
      const t = String(token || '').trim()
      return data.users.find(u => String(u.verificationToken || '') === t) || null
    },
    registerUser({ name, email, password, profileExtra }) {
      const { data } = readJsonStore(jsonFilePath)
      const em = normalizeEmail(email)
      if (data.users.some(u => normalizeEmail(u.email) === em)) return { ok: false, error: 'email_exists' }
      const token = generateVerificationToken()
      const expires = verificationExpiresAt()
      const user = {
        id: nextUserId(data.users),
        email: em,
        name: String(name || em).trim(),
        role: 'Viewer',
        status: 'Pending Verification',
        lastLogin: 'Never',
        passwordHash: hashPassword(password),
        emailVerified: false,
        verificationToken: token,
        verificationTokenExpires: expires,
        createdAt: new Date().toISOString(),
        profileExtra: profileExtra || {},
      }
      const auditLog = appendAuditEntry(data.auditLog, {
        actor: em,
        action: 'user_registered',
        target: em,
        details: { status: 'Pending Verification' },
      })
      writeJsonStore(jsonFilePath, { ...data, users: [...data.users, user], auditLog })
      return { ok: true, user, verificationToken: token, verificationTokenExpires: expires }
    },
    verifyEmailByToken(token) {
      const { data } = readJsonStore(jsonFilePath)
      const t = String(token || '').trim()
      const idx = data.users.findIndex(u => String(u.verificationToken || '') === t)
      if (idx < 0) return { ok: false, error: 'invalid_token' }
      const prev = data.users[idx]
      if (isVerificationExpired(prev.verificationTokenExpires)) {
        return { ok: false, error: 'token_expired' }
      }
      const u = {
        ...prev,
        emailVerified: true,
        status: 'Active',
        verificationToken: null,
        verificationTokenExpires: null,
      }
      const users = [...data.users]
      users[idx] = u
      const auditLog = appendAuditEntry(data.auditLog, {
        actor: u.email,
        action: 'email_verified',
        target: u.email,
      })
      writeJsonStore(jsonFilePath, { ...data, users, auditLog })
      return {
        ok: true,
        user: u,
        publicUser: { id: u.id, name: u.name, email: u.email, role: u.role, emailVerified: true },
      }
    },
    setVerificationToken(email, token, expiresAt) {
      const { data } = readJsonStore(jsonFilePath)
      const em = normalizeEmail(email)
      const idx = data.users.findIndex(u => normalizeEmail(u.email) === em)
      if (idx < 0) return { ok: false, error: 'not_found' }
      const expires = expiresAt || verificationExpiresAt()
      const users = [...data.users]
      users[idx] = {
        ...users[idx],
        verificationToken: token,
        verificationTokenExpires: expires,
        emailVerified: false,
        status: 'Pending Verification',
      }
      writeJsonStore(jsonFilePath, { ...data, users })
      return { ok: true }
    },
    loginUser(email, password) {
      const { data } = readJsonStore(jsonFilePath)
      const u = data.users.find(x => normalizeEmail(x.email) === normalizeEmail(email))
      if (!u) return { ok: false, error: 'invalid_credentials' }
      if (!checkPassword(u.passwordHash, password)) return { ok: false, error: 'invalid_credentials' }
      if (!u.emailVerified) return { ok: false, error: 'email_not_verified' }
      const users = data.users.map(row =>
        normalizeEmail(row.email) === normalizeEmail(email)
          ? { ...row, lastLogin: new Date().toISOString() }
          : row,
      )
      writeJsonStore(jsonFilePath, { ...data, users })
      return {
        ok: true,
        user: u,
        publicUser: { id: u.id, name: u.name, email: u.email, role: u.role, emailVerified: true },
      }
    },
    upsertOAuthUser({ email, name, provider, sub }) {
      const { data } = readJsonStore(jsonFilePath)
      const em = normalizeEmail(email)
      if (!em) return { ok: false, error: 'email_required' }
      const idx = data.users.findIndex(u => normalizeEmail(u.email) === em)
      const ts = new Date().toISOString()
      if (idx >= 0) {
        const prev = data.users[idx]
        const u = {
          ...prev,
          name: String(name || prev.name).trim(),
          emailVerified: true,
          verificationToken: null,
          lastLogin: ts,
          ...(provider === 'google' ? { oauthGoogleSub: sub } : {}),
          ...(provider === 'apple' ? { oauthAppleSub: sub } : {}),
        }
        const users = [...data.users]
        users[idx] = u
        writeJsonStore(jsonFilePath, { ...data, users })
        return {
          ok: true,
          user: u,
          publicUser: { id: u.id, name: u.name, email: u.email, role: u.role, emailVerified: true },
        }
      }
      const user = {
        id: nextUserId(data.users),
        email: em,
        name: String(name || em).trim(),
        role: 'Viewer',
        status: 'Active',
        lastLogin: ts,
        passwordHash: null,
        emailVerified: true,
        verificationToken: null,
        createdAt: ts,
        profileExtra: { oauthProvider: provider },
        ...(provider === 'google' ? { oauthGoogleSub: sub } : {}),
        ...(provider === 'apple' ? { oauthAppleSub: sub } : {}),
      }
      writeJsonStore(jsonFilePath, { ...data, users: [...data.users, user] })
      return {
        ok: true,
        user,
        publicUser: { id: user.id, name: user.name, email: user.email, role: user.role, emailVerified: true },
      }
    },
  }
}
