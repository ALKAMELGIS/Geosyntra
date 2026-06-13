/**
 * Per-user encrypted API token persistence — SQLite or PostgreSQL.
 */
import { createRequire } from 'module'
import { encryptJsonEnvelope, decryptJsonEnvelope } from '../apiVaultCrypto.js'
import { maskValue } from './systemTokenStore.js'
import { resolvePlatformStoreDb } from '../platformDatabase.js'
import { createSqlRunner } from '../sqlRunner.js'
import { platformEnvVar } from '../platformDataPaths.js'

const require = createRequire(import.meta.url)

function emptyUserApiTokenStore() {
  return {
    ready: false,
    listMaskedForUser: () => [],
    listDecryptedForUser: () => [],
    listMaskedAll: () => [],
    upsert: async () => ({ ok: false, error: 'no_db' }),
    remove: async () => ({ ok: false, error: 'no_db' }),
  }
}

function resolveMasterKey() {
  return platformEnvVar('API_VAULT_MASTER_KEY') || platformEnvVar('BACKUP_MASTER_KEY')
}

function encryptValue(plaintext) {
  const masterKey = resolveMasterKey()
  const value = String(plaintext || '').trim()
  if (!value) return JSON.stringify({ v: 1, empty: true })
  if (!masterKey) {
    console.warn('[user-api-tokens] GEOSYNTRA_API_VAULT_MASTER_KEY unset — storing envelope without AES (dev only).')
    return JSON.stringify({ v: 1, plain: value })
  }
  return JSON.stringify({ v: 1, enc: encryptJsonEnvelope({ value }, masterKey) })
}

function decryptValue(envelopeJson) {
  if (!envelopeJson) return null
  let parsed
  try {
    parsed = JSON.parse(envelopeJson)
  } catch {
    return null
  }
  if (parsed?.empty) return null
  if (typeof parsed?.plain === 'string') return parsed.plain.trim() || null
  const masterKey = resolveMasterKey()
  if (!parsed?.enc || !masterKey) return null
  try {
    const payload = decryptJsonEnvelope(parsed.enc, masterKey)
    return typeof payload?.value === 'string' ? payload.value.trim() || null : null
  } catch (e) {
    console.error('[user-api-tokens] decrypt failed', e)
    return null
  }
}

function rowToMasked(row) {
  const value = decryptValue(row.value_envelope)
  return {
    userId: row.user_id,
    userEmail: row.user_email || '',
    provider: row.provider,
    active: Boolean(row.is_active ?? row.active),
    configured: Boolean(value),
    masked: maskValue(value),
    updatedAt: row.updated_at,
    encrypted: Boolean(resolveMasterKey()),
  }
}

/**
 * @param {string | import('../platformDatabase.js').resolvePlatformStoreDb extends Function ? ReturnType<typeof import('../platformDatabase.js').resolvePlatformStoreDb> : any} platformDb
 */
export function createUserApiTokenStore(platformDb) {
  const resolved = resolvePlatformStoreDb(platformDb)
  if (resolved.dialect === 'postgres' && resolved.pool) {
    return createUserApiTokenStoreSql(createSqlRunner(resolved))
  }
  const sqlitePath =
    resolved.dialect === 'sqlite' ? resolved.sqlitePath : typeof platformDb === 'string' ? platformDb : null
  if (!sqlitePath) return emptyUserApiTokenStore()
  return createUserApiTokenStoreSqlite(sqlitePath)
}

function createUserApiTokenStoreSqlite(sqlitePath) {
  const Database = require('better-sqlite3')
  const db = new Database(sqlitePath)
  db.pragma('journal_mode = WAL')

  return {
    ready: true,
    db,

    listMaskedForUser(userId) {
      const rows = db
        .prepare('SELECT * FROM user_api_tokens WHERE user_id = ? AND is_active = 1 ORDER BY provider ASC')
        .all(Number(userId))
      return rows.map(rowToMasked)
    },

    listDecryptedForUser(userId) {
      const rows = db
        .prepare('SELECT * FROM user_api_tokens WHERE user_id = ? AND is_active = 1 ORDER BY provider ASC')
        .all(Number(userId))
      return rows
        .map(row => ({
          provider: row.provider,
          value: decryptValue(row.value_envelope),
        }))
        .filter(r => r.value)
    },

    listMaskedAll() {
      const rows = db
        .prepare('SELECT * FROM user_api_tokens WHERE is_active = 1 ORDER BY user_email ASC, provider ASC')
        .all()
      return rows.map(rowToMasked)
    },

    upsert({ userId, userEmail, provider, value }) {
      const uid = Number(userId)
      const p = String(provider || '').trim().toLowerCase()
      if (!Number.isFinite(uid) || uid <= 0) return { ok: false, error: 'user_required' }
      if (!p) return { ok: false, error: 'provider_required' }
      const now = new Date().toISOString()
      const envelope = encryptValue(value)
      const existing = db.prepare('SELECT id FROM user_api_tokens WHERE user_id = ? AND provider = ?').get(uid, p)
      if (existing) {
        db.prepare(
          `UPDATE user_api_tokens SET user_email = ?, value_envelope = ?, is_active = 1, updated_at = ? WHERE user_id = ? AND provider = ?`,
        ).run(String(userEmail || '').trim().toLowerCase(), envelope, now, uid, p)
      } else {
        db.prepare(
          `INSERT INTO user_api_tokens (user_id, user_email, provider, value_envelope, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, 1, ?, ?)`,
        ).run(uid, String(userEmail || '').trim().toLowerCase(), p, envelope, now, now)
      }
      const row = db.prepare('SELECT * FROM user_api_tokens WHERE user_id = ? AND provider = ?').get(uid, p)
      return { ok: true, row: rowToMasked(row) }
    },

    remove(userId, provider) {
      const uid = Number(userId)
      const p = String(provider || '').trim().toLowerCase()
      const now = new Date().toISOString()
      db.prepare('UPDATE user_api_tokens SET is_active = 0, updated_at = ? WHERE user_id = ? AND provider = ?').run(
        now,
        uid,
        p,
      )
      return { ok: true }
    },
  }
}

function createUserApiTokenStoreSql(sql) {
  return {
    ready: true,
    db: null,

    async listMaskedForUser(userId) {
      const rows = await sql.query(
        'SELECT * FROM user_api_tokens WHERE user_id = ? AND is_active = TRUE ORDER BY provider ASC',
        [Number(userId)],
      )
      return rows.map(rowToMasked)
    },

    async listDecryptedForUser(userId) {
      const rows = await sql.query(
        'SELECT * FROM user_api_tokens WHERE user_id = ? AND is_active = TRUE ORDER BY provider ASC',
        [Number(userId)],
      )
      return rows
        .map(row => ({
          provider: row.provider,
          value: decryptValue(row.value_envelope),
        }))
        .filter(r => r.value)
    },

    async listMaskedAll() {
      const rows = await sql.query(
        'SELECT * FROM user_api_tokens WHERE is_active = TRUE ORDER BY user_email ASC, provider ASC',
      )
      return rows.map(rowToMasked)
    },

    async upsert({ userId, userEmail, provider, value }) {
      const uid = Number(userId)
      const p = String(provider || '').trim().toLowerCase()
      if (!Number.isFinite(uid) || uid <= 0) return { ok: false, error: 'user_required' }
      if (!p) return { ok: false, error: 'provider_required' }
      const now = new Date().toISOString()
      const envelope = encryptValue(value)
      const existing = await sql.queryOne('SELECT id FROM user_api_tokens WHERE user_id = ? AND provider = ?', [
        uid,
        p,
      ])
      if (existing) {
        await sql.run(
          `UPDATE user_api_tokens SET user_email = ?, value_envelope = ?, is_active = TRUE, updated_at = ? WHERE user_id = ? AND provider = ?`,
          [String(userEmail || '').trim().toLowerCase(), envelope, now, uid, p],
        )
      } else {
        await sql.run(
          `INSERT INTO user_api_tokens (user_id, user_email, provider, value_envelope, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, TRUE, ?, ?)`,
          [uid, String(userEmail || '').trim().toLowerCase(), p, envelope, now, now],
        )
      }
      const row = await sql.queryOne('SELECT * FROM user_api_tokens WHERE user_id = ? AND provider = ?', [uid, p])
      return { ok: true, row: rowToMasked(row) }
    },

    async remove(userId, provider) {
      const uid = Number(userId)
      const p = String(provider || '').trim().toLowerCase()
      const now = new Date().toISOString()
      await sql.run('UPDATE user_api_tokens SET is_active = FALSE, updated_at = ? WHERE user_id = ? AND provider = ?', [
        now,
        uid,
        p,
      ])
      return { ok: true }
    },
  }
}
