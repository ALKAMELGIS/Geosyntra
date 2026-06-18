/**
 * Apply numbered SQL migrations to the platform SQLite database (no destructive resets).
 */
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations')

export function runSqliteMigrations(dbPath) {
  if (!dbPath) return { ok: false, reason: 'no_db_path' }
  const Database = require('better-sqlite3')
  const parent = path.dirname(dbPath)
  fs.mkdirSync(parent, { recursive: true })

  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `)

  const applied = new Set(
    db
      .prepare('SELECT version FROM schema_migrations ORDER BY version ASC')
      .all()
      .map(r => r.version),
  )

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter(f => /^\d+_.+\.sql$/i.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

  const appliedNow = []
  for (const file of files) {
    const version = Number.parseInt(file.split('_')[0], 10)
    if (!Number.isFinite(version) || applied.has(version)) continue
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
    try {
      db.exec(sql)
    } catch (err) {
      const msg = String(err?.message || err)
      if (!msg.includes('duplicate column name')) throw err
    }
    db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
      version,
      file,
      new Date().toISOString(),
    )
    applied.add(version)
    appliedNow.push(file)
  }

  db.close()
  return { ok: true, applied: appliedNow }
}
