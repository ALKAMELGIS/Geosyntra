/**
 * Database migration & sync configuration.
 * Loads hostinger.secrets.env (repo root) then process.env overrides.
 *
 * @typedef {'sqlite' | 'postgres'} DbDialect
 * @typedef {'dry-run' | 'migrate' | 'sync' | 'rollback'} MigrationMode
 * @typedef {'full' | 'incremental' | 'schema-only'} SyncStrategy
 * @typedef {'skip-duplicate' | 'prod-wins' | 'local-wins'} ConflictPolicy
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = path.resolve(__dirname, '..')

/** @param {string} filePath */
export function loadEnvFile(filePath) {
  const out = {}
  if (!fs.existsSync(filePath)) return out
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    if (/^\s*#/.test(line) || !line.trim()) continue
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i)
    if (!m) continue
    let v = m[2].trim()
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    out[m[1]] = v
  }
  return out
}

function envBool(raw, fallback = false) {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase()
  if (!v) return fallback
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

function envInt(raw, fallback) {
  const n = Number.parseInt(String(raw ?? ''), 10)
  return Number.isFinite(n) ? n : fallback
}

function resolveRepoPath(raw, fallbackRelative) {
  const s = String(raw || '').trim()
  if (!s) {
    if (!fallbackRelative) return ''
    return path.join(REPO_ROOT, fallbackRelative)
  }
  return path.isAbsolute(s) ? s : path.join(REPO_ROOT, s)
}

/**
 * @param {{ argv?: string[], secretsPath?: string }} [opts]
 */
export function loadMigrationConfig(opts = {}) {
  const secretsPath = opts.secretsPath || path.join(REPO_ROOT, 'hostinger.secrets.env')
  const fileEnv = loadEnvFile(secretsPath)
  const env = { ...fileEnv, ...process.env }

  const localDialect = (env.DB_LOCAL_DIALECT || 'sqlite').toLowerCase()
  const prodDialect = (env.DB_PROD_DIALECT || 'sqlite').toLowerCase()

  const mode = String(env.DB_MIGRATION_MODE || 'dry-run').toLowerCase()
  const strategy = String(env.DB_SYNC_STRATEGY || 'incremental').toLowerCase()

  const blocklist = String(env.DB_SYNC_TABLE_BLOCKLIST || 'schema_migrations,sqlite_sequence')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  const allowlist = String(env.DB_SYNC_TABLE_ALLOWLIST || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  return {
    secretsPath,
    secretsLoaded: fs.existsSync(secretsPath),
    geosyntraEnv: String(env.GEOSYNTRA_ENV || env.NODE_ENV || 'development').toLowerCase(),

    local: {
      dialect: /** @type {DbDialect} */ (localDialect === 'postgres' ? 'postgres' : 'sqlite'),
      sqlitePath: resolveRepoPath(
        env.DB_LOCAL_SQLITE_PATH || env.AGRI_USER_DB_PATH,
        'backend/server/data/geosyntra_platform.db',
      ),
      pgUrl: String(env.DB_LOCAL_PG_URL || env.DATABASE_URL || '').trim(),
      pgSchema: String(env.DB_LOCAL_PG_SCHEMA || 'public').trim(),
    },

    prod: {
      dialect: /** @type {DbDialect} */ (prodDialect === 'postgres' ? 'postgres' : 'sqlite'),
      sqlitePath: resolveRepoPath(env.DB_PROD_SQLITE_PATH || '', ''),
      pgUrl: String(env.DB_PROD_PG_URL || env.DATABASE_URL_PROD || '').trim(),
      pgSchema: String(env.DB_PROD_PG_SCHEMA || 'public').trim(),
      ssh: {
        host: String(env.DB_PROD_SQLITE_SSH_HOST || env.HOSTINGER_SSH_HOST || '').trim(),
        port: envInt(env.DB_PROD_SQLITE_SSH_PORT || env.HOSTINGER_SSH_PORT, 65002),
        user: String(env.DB_PROD_SQLITE_SSH_USER || env.HOSTINGER_SSH_USER || '').trim(),
        pass: String(env.DB_PROD_SQLITE_SSH_PASS || env.HOSTINGER_SSH_PASS || '').trim(),
        remotePath: String(env.DB_PROD_SQLITE_SSH_REMOTE_PATH || '').trim(),
      },
    },

    migration: {
      mode: /** @type {MigrationMode} */ (
        ['dry-run', 'migrate', 'sync', 'rollback'].includes(mode) ? mode : 'dry-run'
      ),
      strategy: /** @type {SyncStrategy} */ (
        ['full', 'incremental', 'schema-only'].includes(strategy) ? strategy : 'incremental'
      ),
      conflictPolicy: /** @type {ConflictPolicy} */ (
        ['skip-duplicate', 'prod-wins', 'local-wins'].includes(
          String(env.DB_SYNC_CONFLICT_POLICY || 'skip-duplicate').toLowerCase(),
        )
          ? String(env.DB_SYNC_CONFLICT_POLICY || 'skip-duplicate').toLowerCase()
          : 'skip-duplicate'
      ),
      batchSize: Math.max(50, envInt(env.DB_SYNC_BATCH_SIZE, 500)),
      requireProdConfirm: envBool(env.DB_SYNC_REQUIRE_PROD_CONFIRM, true),
      applyBackendMigrations: envBool(env.DB_SYNC_APPLY_BACKEND_MIGRATIONS, true),
      remotePullPush: envBool(env.DB_SYNC_REMOTE_SSH, false),
    },

    paths: {
      backupDir: resolveRepoPath(env.DB_BACKUP_DIR, 'data/db-backups'),
      logDir: resolveRepoPath(env.DB_SYNC_LOG_DIR, 'data/db-sync-logs'),
      migrationsDir: path.join(REPO_ROOT, 'backend', 'server', 'migrations'),
      gisSqlFile: resolveRepoPath(env.DB_GIS_MIGRATION_SQL, 'db_migration.sql'),
    },

    retention: {
      backupDays: Math.max(1, envInt(env.DB_BACKUP_RETENTION_DAYS, 14)),
    },

    tables: {
      blocklist,
      allowlist,
      metaTable: 'db_sync_meta',
    },

    argv: opts.argv || [],
    flags: {
      dryRun: (opts.argv || []).includes('--dry-run'),
      confirmProduction: (opts.argv || []).includes('--confirm-production'),
      testConnections: (opts.argv || []).includes('--test-connections'),
      schemaOnly: (opts.argv || []).includes('--schema-only'),
      rollback: (opts.argv || []).includes('--rollback'),
      verbose: (opts.argv || []).includes('--verbose'),
    },
  }
}

export default loadMigrationConfig
