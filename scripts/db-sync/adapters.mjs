import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../backend/package.json'))

export function openSqlite(dbPath, { readonly = false } = {}) {
  const Database = require('better-sqlite3')
  const fs = require('node:fs')
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  }
  const db = new Database(dbPath, readonly ? { readonly: true } : {})
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return db
}

export async function openPostgres(pgUrl, schema = 'public') {
  let pg
  try {
    pg = require('pg')
  } catch {
    throw new Error('pg package required for PostgreSQL. Run: npm install pg -w geosyntra-platform')
  }
  const pool = new pg.Pool({ connectionString: pgUrl, max: 4 })
  const client = await pool.connect()
  await client.query(`SET search_path TO ${quoteIdent(schema)}`)
  return {
    dialect: 'postgres',
    pool,
    client,
    async query(sql, params = []) {
      return client.query(sql, params)
    },
    async close() {
      client.release()
      await pool.end()
    },
  }
}

export function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`
}

/** @param {import('better-sqlite3').Database | { query: Function, dialect: string }} conn */
export async function listTables(conn) {
  if (conn.prepare) {
    return conn
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
      )
      .all()
      .map(r => r.name)
  }
  const res = await conn.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' ORDER BY table_name`,
  )
  return res.rows.map(r => r.table_name)
}

/** @param {any} conn @param {string} table */
export async function getTableColumns(conn, table) {
  if (conn.prepare) {
    return conn.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all()
  }
  const res = await conn.query(
    `SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = $1
     ORDER BY ordinal_position`,
    [table],
  )
  return res.rows.map(r => ({
    name: r.column_name,
    type: r.data_type,
    notnull: r.is_nullable === 'NO' ? 1 : 0,
    dflt_value: r.column_default,
  }))
}

/** @param {any} conn @param {string} table */
export async function getPrimaryKeyColumns(conn, table) {
  if (conn.prepare) {
    const cols = conn.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all()
    const pk = cols.filter(c => c.pk > 0).sort((a, b) => a.pk - b.pk).map(c => c.name)
    if (pk.length) return pk
    const indexes = conn.prepare(`PRAGMA index_list(${quoteIdent(table)})`).all()
    for (const idx of indexes) {
      if (!idx.unique) continue
      const parts = conn
        .prepare(`PRAGMA index_info(${quoteIdent(idx.name)})`)
        .all()
        .sort((a, b) => a.seqno - b.seqno)
        .map(p => cols.find(c => c.cid === p.cid)?.name)
        .filter(Boolean)
      if (parts.length) return parts
    }
    return []
  }
  const res = await conn.query(
    `SELECT kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
     WHERE tc.table_schema = current_schema()
       AND tc.table_name = $1
       AND tc.constraint_type = 'PRIMARY KEY'
     ORDER BY kcu.ordinal_position`,
    [table],
  )
  return res.rows.map(r => r.column_name)
}

/** @param {import('better-sqlite3').Database} conn @param {string} table */
export function getCreateTableSql(conn, table) {
  const row = conn
    .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name = ?`)
    .get(table)
  return row?.sql || null
}

export function sqliteTypeToPostgres(sqliteType) {
  const t = String(sqliteType || '').toUpperCase()
  if (t.includes('INT')) return 'BIGINT'
  if (t.includes('REAL') || t.includes('FLOA') || t.includes('DOUB')) return 'DOUBLE PRECISION'
  if (t.includes('BLOB')) return 'BYTEA'
  if (t.includes('BOOL')) return 'BOOLEAN'
  return 'TEXT'
}

export function buildPostgresCreateFromSqlite(createSql, tableName) {
  if (!createSql) return null
  let body = createSql.replace(/^CREATE TABLE\s+(?:IF NOT EXISTS\s+)?[`"]?[\w]+[`"]?\s*\(/i, '')
  body = body.replace(/\)\s*;?\s*$/s, '')
  const cols = []
  for (const part of splitSqliteColumns(body)) {
    const trimmed = part.trim()
    if (!trimmed || /^PRIMARY KEY/i.test(trimmed) || /^UNIQUE/i.test(trimmed) || /^FOREIGN KEY/i.test(trimmed)) {
      if (/^PRIMARY KEY/i.test(trimmed)) cols.push(trimmed)
      continue
    }
    const m = trimmed.match(/^[`"]?(\w+)[`"]?\s+(.+)$/i)
    if (!m) continue
    const name = m[1]
    let rest = m[2]
    rest = rest.replace(/AUTOINCREMENT/i, '')
    rest = rest.replace(/INTEGER PRIMARY KEY/i, 'BIGSERIAL PRIMARY KEY')
    const typeMatch = rest.match(/^(\w+)/)
    const sqliteType = typeMatch ? typeMatch[1] : 'TEXT'
    if (!/PRIMARY KEY|BIGSERIAL/i.test(rest)) {
      rest = rest.replace(typeMatch[0], sqliteTypeToPostgres(sqliteType))
    }
    cols.push(`${quoteIdent(name)} ${rest}`)
  }
  return `CREATE TABLE IF NOT EXISTS ${quoteIdent(tableName)} (\n  ${cols.join(',\n  ')}\n)`
}

function splitSqliteColumns(body) {
  const parts = []
  let cur = ''
  let depth = 0
  for (const ch of body) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      parts.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  if (cur.trim()) parts.push(cur)
  return parts
}
