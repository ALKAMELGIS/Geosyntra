/**
 * Platform database — PostgreSQL when DATABASE_URL (or DB_DIALECT=postgres) is set;
 * otherwise SQLite at GEOSYNTRA_USER_DB_PATH (local dev default).
 */
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

function envDialect() {
  const explicit = String(process.env.DB_DIALECT || '').trim().toLowerCase()
  if (explicit === 'postgres' || explicit === 'postgresql') return 'postgres'
  if (explicit === 'sqlite') return 'sqlite'
  const url = String(process.env.DATABASE_URL || '').trim()
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) return 'postgres'
  return 'sqlite'
}

/**
 * @param {{ userDb: string, dataDir: string }} paths
 */
export function resolvePlatformDatabaseConfig(paths) {
  const dialect = envDialect()
  const pgUrl = String(process.env.DATABASE_URL || process.env.DB_LOCAL_PG_URL || '').trim()
  const pgSchema = String(process.env.DB_PG_SCHEMA || process.env.DB_LOCAL_PG_SCHEMA || 'public').trim() || 'public'

  if (dialect === 'postgres') {
    if (!pgUrl) {
      throw new Error('[platform-db] DB_DIALECT=postgres requires DATABASE_URL (postgres://…)')
    }
    return {
      dialect: 'postgres',
      pgUrl,
      pgSchema,
      sqlitePath: null,
      storage: 'postgres',
    }
  }

  const sqlitePath = String(paths.userDb || '').trim()
  if (sqlitePath) {
    fs.mkdirSync(path.dirname(sqlitePath), { recursive: true })
  }
  return {
    dialect: 'sqlite',
    pgUrl: null,
    pgSchema,
    sqlitePath: sqlitePath || null,
    storage: sqlitePath ? 'sqlite' : 'json',
  }
}

/**
 * @param {{ dialect: string, pgUrl?: string | null, pgSchema?: string, sqlitePath?: string | null }} config
 */
export async function openPlatformDatabase(config) {
  if (config.dialect === 'postgres') {
    let pg
    try {
      pg = require('pg')
    } catch {
      throw new Error('[platform-db] pg package required. Run: npm install pg -w geosyntra-platform-backend')
    }
    const pool = new pg.Pool({
      connectionString: config.pgUrl,
      max: Number(process.env.DB_POOL_MAX || 8),
    })
    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO ${quoteIdent(config.pgSchema || 'public')}`)
    } finally {
      client.release()
    }
    return {
      dialect: 'postgres',
      storage: 'postgres',
      pgUrl: config.pgUrl,
      pgSchema: config.pgSchema || 'public',
      pool,
      sqlitePath: null,
      sqlite: null,
    }
  }

  if (!config.sqlitePath) {
    return {
      dialect: 'none',
      storage: 'json',
      pool: null,
      sqlitePath: null,
      sqlite: null,
    }
  }

  const Database = require('better-sqlite3')
  const sqlite = new Database(config.sqlitePath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  return {
    dialect: 'sqlite',
    storage: 'sqlite',
    pool: null,
    sqlitePath: config.sqlitePath,
    sqlite,
    pgUrl: null,
    pgSchema: null,
  }
}

export async function closePlatformDatabase(platformDb) {
  if (!platformDb) return
  if (platformDb.dialect === 'postgres' && platformDb.pool) {
    await platformDb.pool.end()
    return
  }
  if (platformDb.dialect === 'sqlite' && platformDb.sqlite) {
    try {
      platformDb.sqlite.close()
    } catch {
      /* ignore */
    }
  }
}

/** @param {string | { dialect?: string, sqlitePath?: string | null, pool?: import('pg').Pool | null } | null | undefined} input */
export function resolvePlatformStoreDb(input) {
  if (input && typeof input === 'object' && 'dialect' in input) {
    return input
  }
  const sqlitePath = typeof input === 'string' ? input.trim() : ''
  if (sqlitePath) {
    return { dialect: 'sqlite', sqlitePath, pool: null, sqlite: null, storage: 'sqlite' }
  }
  return { dialect: 'none', sqlitePath: null, pool: null, sqlite: null, storage: 'json' }
}

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`
}
