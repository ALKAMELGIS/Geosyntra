/**
 * Apply platform schema migrations — SQLite (numbered files) or PostgreSQL (001_platform_schema.sql).
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { runSqliteMigrations } from './runSqliteMigrations.js'

const require = createRequire(import.meta.url)
const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations')
const PG_BOOTSTRAP = path.join(MIGRATIONS_DIR, 'postgres', '001_platform_schema.sql')

/**
 * @param {{ dialect: string, sqlitePath?: string | null, pool?: import('pg').Pool | null }} platformDb
 */
export async function runPlatformMigrations(platformDb) {
  if (platformDb.dialect === 'sqlite' && platformDb.sqlitePath) {
    return runSqliteMigrations(platformDb.sqlitePath)
  }

  if (platformDb.dialect === 'postgres' && platformDb.pool) {
    const pool = platformDb.pool
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `)

    const appliedRes = await pool.query('SELECT version FROM schema_migrations ORDER BY version ASC')
    const applied = new Set(appliedRes.rows.map(r => Number(r.version)))

    if (!applied.has(1)) {
      const sql = fs.readFileSync(PG_BOOTSTRAP, 'utf8')
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query(sql)
        await client.query(
          `INSERT INTO schema_migrations (version, name, applied_at) VALUES ($1, $2, NOW())`,
          [1, 'postgres/001_platform_schema.sql'],
        )
        await client.query('COMMIT')
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      } finally {
        client.release()
      }
      return { ok: true, dialect: 'postgres', applied: ['postgres/001_platform_schema.sql'] }
    }

    return { ok: true, dialect: 'postgres', applied: [] }
  }

  return { ok: false, reason: 'no_database' }
}
