import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import crypto from 'crypto'
import { normalizeRbacRole, rbacRoleToDisplay } from './roles.js'

const require = createRequire(import.meta.url)

function nowIso() {
  return new Date().toISOString()
}

function generateInviteToken() {
  return crypto.randomBytes(32).toString('hex')
}

export function createInviteStore(sqlitePath) {
  if (!sqlitePath) {
    return createMemoryInviteStore()
  }
  const Database = require('better-sqlite3')
  const parent = path.dirname(sqlitePath)
  fs.mkdirSync(parent, { recursive: true })
  const db = new Database(sqlitePath)
  db.exec(`
    CREATE TABLE IF NOT EXISTS role_invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL COLLATE NOCASE,
      role TEXT NOT NULL,
      invited_by INTEGER,
      invited_by_email TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      expires_at TEXT NOT NULL,
      accepted_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_role_invites_email ON role_invites(email);
    CREATE INDEX IF NOT EXISTS idx_role_invites_token ON role_invites(token);
  `)

  const ins = db.prepare(`
    INSERT INTO role_invites (token, email, role, invited_by, invited_by_email, status, expires_at, created_at)
    VALUES (@token, @email, @role, @invitedBy, @invitedByEmail, 'pending', @expiresAt, @createdAt)
  `)
  const selToken = db.prepare(`SELECT * FROM role_invites WHERE token = ? LIMIT 1`)
  const selEmailPending = db.prepare(
    `SELECT * FROM role_invites WHERE email = ? COLLATE NOCASE AND status = 'pending' ORDER BY id DESC LIMIT 1`,
  )
  const markAccepted = db.prepare(
    `UPDATE role_invites SET status = 'accepted', accepted_at = @at WHERE id = @id`,
  )
  const revokePending = db.prepare(
    `UPDATE role_invites SET status = 'revoked' WHERE email = ? COLLATE NOCASE AND status = 'pending'`,
  )
  const listRecent = db.prepare(
    `SELECT * FROM role_invites ORDER BY id DESC LIMIT ?`,
  )

  return {
    createInvite({ email, role, invitedById, invitedByEmail, ttlHours = 72 }) {
      const em = String(email || '').trim().toLowerCase()
      const slug = normalizeRbacRole(role)
      const token = generateInviteToken()
      const createdAt = nowIso()
      const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString()
      revokePending.run(em)
      ins.run({
        token,
        email: em,
        role: rbacRoleToDisplay(slug),
        invitedBy: invitedById ?? null,
        invitedByEmail: invitedByEmail ?? null,
        expiresAt,
        createdAt,
      })
      return { ok: true, token, email: em, role: slug, displayRole: rbacRoleToDisplay(slug), expiresAt }
    },
    getByToken(token) {
      const row = selToken.get(String(token || '').trim())
      return row ? mapRow(row) : null
    },
    getPendingByEmail(email) {
      const row = selEmailPending.get(String(email || '').trim().toLowerCase())
      return row ? mapRow(row) : null
    },
    acceptInvite(token) {
      const row = selToken.get(String(token || '').trim())
      if (!row || row.status !== 'pending') return { ok: false, error: 'invalid_invite' }
      if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, error: 'invite_expired' }
      markAccepted.run({ id: row.id, at: nowIso() })
      return { ok: true, invite: mapRow(row) }
    },
    list(limit = 100) {
      return listRecent.all(limit).map(mapRow)
    },
  }
}

function mapRow(row) {
  return {
    id: row.id,
    token: row.token,
    email: row.email,
    role: row.role,
    roleSlug: normalizeRbacRole(row.role),
    invitedById: row.invited_by ?? undefined,
    invitedByEmail: row.invited_by_email ?? undefined,
    status: row.status,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at ?? undefined,
    createdAt: row.created_at,
  }
}

function createMemoryInviteStore() {
  const invites = []
  return {
    createInvite({ email, role, invitedById, invitedByEmail, ttlHours = 72 }) {
      const em = String(email || '').trim().toLowerCase()
      const slug = normalizeRbacRole(role)
      const token = generateInviteToken()
      const createdAt = nowIso()
      const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString()
      for (let i = invites.length - 1; i >= 0; i--) {
        if (invites[i].email === em && invites[i].status === 'pending') invites[i].status = 'revoked'
      }
      const row = {
        id: invites.length + 1,
        token,
        email: em,
        role: rbacRoleToDisplay(slug),
        roleSlug: slug,
        invitedById: invitedById,
        invitedByEmail: invitedByEmail,
        status: 'pending',
        expiresAt,
        createdAt,
      }
      invites.push(row)
      return { ok: true, token, email: em, role: slug, displayRole: rbacRoleToDisplay(slug), expiresAt }
    },
    getByToken(token) {
      return invites.find(i => i.token === token && i.status === 'pending') ?? null
    },
    getPendingByEmail(email) {
      const em = String(email || '').trim().toLowerCase()
      return [...invites].reverse().find(i => i.email === em && i.status === 'pending') ?? null
    },
    acceptInvite(token) {
      const idx = invites.findIndex(i => i.token === token && i.status === 'pending')
      if (idx < 0) return { ok: false, error: 'invalid_invite' }
      if (new Date(invites[idx].expiresAt).getTime() < Date.now()) return { ok: false, error: 'invite_expired' }
      invites[idx].status = 'accepted'
      invites[idx].acceptedAt = nowIso()
      return { ok: true, invite: invites[idx] }
    },
    list(limit = 100) {
      return invites.slice(-limit).reverse()
    },
  }
}
