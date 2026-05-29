import crypto from 'crypto'
import { signAccessToken, verifyAccessToken } from './jwt.js'

const REFRESH_TTL_SEC = 60 * 60 * 24 * 30 // 30 days

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex')
}

export function signRefreshToken(payload) {
  return signAccessToken({ ...payload, typ: 'refresh' }, REFRESH_TTL_SEC)
}

export function verifyRefreshToken(token) {
  const result = verifyAccessToken(token)
  if (!result.ok) return result
  if (result.payload?.typ !== 'refresh') return { ok: false, error: 'invalid_token_type' }
  return result
}

/**
 * @param {import('better-sqlite3').Database | null} db
 */
export function createRefreshTokenStore(db) {
  if (!db) {
    return {
      persist() {},
      revokeAll() {},
      isRevoked() {
        return false
      },
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      revoked_at TEXT,
      user_agent TEXT
    );
  `)

  const ins = db.prepare(`
    INSERT INTO auth_refresh_tokens (user_id, token_hash, expires_at, created_at, user_agent)
    VALUES (@userId, @tokenHash, @expiresAt, @createdAt, @userAgent)
  `)
  const revoke = db.prepare(
    `UPDATE auth_refresh_tokens SET revoked_at = @at WHERE token_hash = @tokenHash AND revoked_at IS NULL`,
  )
  const revokeUser = db.prepare(
    `UPDATE auth_refresh_tokens SET revoked_at = @at WHERE user_id = @userId AND revoked_at IS NULL`,
  )
  const find = db.prepare(
    `SELECT id, user_id AS userId, expires_at AS expiresAt, revoked_at AS revokedAt
     FROM auth_refresh_tokens WHERE token_hash = @tokenHash LIMIT 1`,
  )

  return {
    persist(userId, token, userAgent) {
      const payload = verifyRefreshToken(token)
      if (!payload.ok) return
      const exp = payload.payload.exp
      const expiresAt = new Date(exp * 1000).toISOString()
      ins.run({
        userId,
        tokenHash: hashToken(token),
        expiresAt,
        createdAt: new Date().toISOString(),
        userAgent: String(userAgent || '').slice(0, 500),
      })
    },
    isRevoked(token) {
      const row = find.get({ tokenHash: hashToken(token) })
      if (!row) return false
      if (row.revokedAt) return true
      if (row.expiresAt && Date.parse(row.expiresAt) < Date.now()) return true
      return false
    },
    revoke(token) {
      revoke.run({ tokenHash: hashToken(token), at: new Date().toISOString() })
    },
    revokeAll(userId) {
      revokeUser.run({ userId, at: new Date().toISOString() })
    },
  }
}
