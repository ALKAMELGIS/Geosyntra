import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

export function createRunId() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

/**
 * @param {import('better-sqlite3').Database} db
 */
export function checkpointSqlite(db) {
  try {
    db.pragma('wal_checkpoint(TRUNCATE)')
  } catch {
    try {
      db.pragma('wal_checkpoint(FULL)')
    } catch {
      /* ignore */
    }
  }
}

export function backupSqliteFile(sourcePath, backupDir, runId, label) {
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    throw new Error(`SQLite backup source not found: ${sourcePath}`)
  }
  const dir = path.join(backupDir, runId)
  fs.mkdirSync(dir, { recursive: true })
  const base = path.basename(sourcePath)
  const dest = path.join(dir, `${label}-${base}`)
  fs.copyFileSync(sourcePath, dest)
  for (const ext of ['-wal', '-shm']) {
    const side = `${sourcePath}${ext}`
    if (fs.existsSync(side)) fs.copyFileSync(side, `${dest}${ext}`)
  }
  return dest
}

export function tryPgDump(pgUrl, backupDir, runId, label) {
  const dir = path.join(backupDir, runId)
  fs.mkdirSync(dir, { recursive: true })
  const dest = path.join(dir, `${label}-${Date.now()}.sql`)
  try {
    execFileSync('pg_dump', ['--no-owner', '--no-acl', '-f', dest, pgUrl], {
      stdio: 'pipe',
      encoding: 'utf8',
    })
    return dest
  } catch (e) {
    return { error: String(e?.message || e), dest: null }
  }
}

export function writeManifest(backupDir, runId, manifest) {
  const dir = path.join(backupDir, runId)
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'manifest.json')
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return file
}

export function readLatestManifest(backupDir) {
  if (!fs.existsSync(backupDir)) return null
  const runs = fs
    .readdirSync(backupDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort()
  if (!runs.length) return null
  const latest = runs[runs.length - 1]
  const file = path.join(backupDir, latest, 'manifest.json')
  if (!fs.existsSync(file)) return null
  return { runId: latest, ...JSON.parse(fs.readFileSync(file, 'utf8')) }
}

export function restoreSqliteBackup(backupPath, targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.copyFileSync(backupPath, targetPath)
  for (const ext of ['-wal', '-shm']) {
    const side = `${backupPath}${ext}`
    if (fs.existsSync(side)) fs.copyFileSync(side, `${targetPath}${ext}`)
  }
}

export function pruneOldBackups(backupDir, retentionDays) {
  if (!fs.existsSync(backupDir)) return []
  const cutoff = Date.now() - retentionDays * 86400000
  const removed = []
  for (const name of fs.readdirSync(backupDir)) {
    const full = path.join(backupDir, name)
    const st = fs.statSync(full)
    if (!st.isDirectory()) continue
    if (st.mtimeMs < cutoff) {
      fs.rmSync(full, { recursive: true, force: true })
      removed.push(name)
    }
  }
  return removed
}
