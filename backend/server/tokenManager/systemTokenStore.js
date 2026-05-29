/**
 * SQLite persistence for encrypted system API tokens.
 */
import { createRequire } from 'module'
import { encryptJsonEnvelope, decryptJsonEnvelope } from '../apiVaultCrypto.js'

const require = createRequire(import.meta.url)

function resolveMasterKey() {
  return (
    process.env.AGRI_API_VAULT_MASTER_KEY?.trim() ||
    process.env.AGRI_BACKUP_MASTER_KEY?.trim() ||
    ''
  )
}

function maskValue(value) {
  const v = String(value || '').trim()
  if (!v) return ''
  if (v.length <= 8) return '••••••••'
  return `${v.slice(0, 4)}••••${v.slice(-4)}`
}

export function createSystemTokenStore(sqlitePath) {
  if (!sqlitePath) {
    return {
      ready: false,
      listMasked: () => [],
      getDecrypted: async () => null,
      upsert: async () => ({ ok: false, error: 'no_db' }),
      setActive: async () => ({ ok: false, error: 'no_db' }),
      appendAudit: () => {},
      migrateEnvelope: () => null,
    }
  }

  const Database = require('better-sqlite3')
  const db = new Database(sqlitePath)
  db.pragma('journal_mode = WAL')

  function encryptValue(plaintext) {
    const masterKey = resolveMasterKey()
    const value = String(plaintext || '').trim()
    if (!value) return JSON.stringify({ v: 1, empty: true })
    if (!masterKey) {
      console.warn('[system-tokens] AGRI_API_VAULT_MASTER_KEY unset — storing envelope without AES (dev only).')
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
      console.error('[system-tokens] decrypt failed', e)
      return null
    }
  }

  function rowToMasked(row) {
    const value = decryptValue(row.value_envelope)
    return {
      name: row.name,
      label: row.label || row.name,
      category: row.category || 'integration',
      active: Boolean(row.active),
      configured: Boolean(value),
      masked: maskValue(value),
      expiresAt: row.expires_at || null,
      lastTestedAt: row.last_tested_at || null,
      lastTestOk: row.last_test_ok == null ? null : Boolean(row.last_test_ok),
      lastTestMessage: row.last_test_message || null,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by || null,
      encrypted: Boolean(resolveMasterKey()),
    }
  }

  return {
    ready: true,
    db,

    listMasked() {
      const rows = db.prepare('SELECT * FROM system_tokens ORDER BY name ASC').all()
      return rows.map(rowToMasked)
    },

    getDecrypted(name) {
      const row = db.prepare('SELECT * FROM system_tokens WHERE name = ?').get(String(name || '').trim().toLowerCase())
      if (!row || !row.active) return null
      return decryptValue(row.value_envelope)
    },

    upsert({ name, label, category, value, active = true, expiresAt = null, updatedBy = null }) {
      const n = String(name || '').trim().toLowerCase()
      if (!n) return { ok: false, error: 'name_required' }
      const now = new Date().toISOString()
      const existing = db.prepare('SELECT name FROM system_tokens WHERE name = ?').get(n)
      const envelope = encryptValue(value)
      if (existing) {
        db.prepare(
          `UPDATE system_tokens SET label = ?, category = ?, value_envelope = ?, active = ?, expires_at = ?, updated_by = ?, updated_at = ? WHERE name = ?`,
        ).run(
          String(label || n),
          String(category || 'integration'),
          envelope,
          active ? 1 : 0,
          expiresAt,
          updatedBy,
          now,
          n,
        )
      } else {
        db.prepare(
          `INSERT INTO system_tokens (name, label, category, value_envelope, active, expires_at, updated_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          n,
          String(label || n),
          String(category || 'integration'),
          envelope,
          active ? 1 : 0,
          expiresAt,
          updatedBy,
          now,
          now,
        )
      }
      return { ok: true, row: rowToMasked(db.prepare('SELECT * FROM system_tokens WHERE name = ?').get(n)) }
    },

    setActive(name, active, updatedBy = null) {
      const n = String(name || '').trim().toLowerCase()
      const now = new Date().toISOString()
      db.prepare('UPDATE system_tokens SET active = ?, updated_by = ?, updated_at = ? WHERE name = ?').run(
        active ? 1 : 0,
        updatedBy,
        now,
        n,
      )
      return { ok: true }
    },

    recordTest(name, { ok, message }) {
      const n = String(name || '').trim().toLowerCase()
      const now = new Date().toISOString()
      db.prepare(
        `UPDATE system_tokens SET last_tested_at = ?, last_test_ok = ?, last_test_message = ?, updated_at = ? WHERE name = ?`,
      ).run(now, ok ? 1 : 0, message || null, now, n)
    },

    appendAudit({ tokenName, action, actorEmail, detail }) {
      db.prepare(
        `INSERT INTO system_token_audit (token_name, action, actor_email, detail, created_at) VALUES (?, ?, ?, ?, ?)`,
      ).run(String(tokenName || ''), String(action || ''), actorEmail || null, detail || null, new Date().toISOString())
    },
  }
}

export { maskValue }
