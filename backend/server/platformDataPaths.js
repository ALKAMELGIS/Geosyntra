/**
 * Central persistent data paths — NEVER store user data inside the git repo in production.
 *
 * Env (GEOSYNTRA_* preferred; AGRI_* aliases kept for backward compatibility):
 *   GEOSYNTRA_ENV / NODE_ENV     — development | staging | production
 *   GEOSYNTRA_DATA_DIR           — root for all durable files (mount a volume here in prod)
 *   GEOSYNTRA_USER_DB_PATH       — SQLite platform DB (users, RBAC, migrations, platform_kv)
 *   DATABASE_URL                 — PostgreSQL (default DB name: geosyntra)
 *   DB_DIALECT                   — sqlite | postgres (auto-detected from DATABASE_URL)
 *   GEOSYNTRA_API_SECRETS_FILE   — API vault file
 *   GEOSYNTRA_ADMIN_DIRECTORY_FILE — legacy JSON import source (optional)
 *   GEOSYNTRA_USER_PROFILES_FILE
 */
import fs from 'fs'
import path from 'path'

/** GEOSYNTRA_* preferred; AGRI_* legacy alias. */
export function platformEnvVar(shortName) {
  const key = String(shortName || '').trim().toUpperCase()
  return String(process.env[`GEOSYNTRA_${key}`] || process.env[`AGRI_${key}`] || '').trim()
}

function resolvePath(baseDir, envValue, defaultRelative) {
  const raw = String(envValue || '').trim()
  if (raw) {
    return path.isAbsolute(raw) ? raw : path.join(baseDir, raw)
  }
  return path.join(baseDir, defaultRelative)
}

/** Prefer new GeoSyntra filename; fall back to legacy agri_* if it already exists on disk. */
function resolveDefaultDataFile(baseDir, newRelative, legacyRelative) {
  const next = path.join(baseDir, newRelative)
  const legacy = path.join(baseDir, legacyRelative)
  try {
    if (fs.existsSync(next)) return next
    if (fs.existsSync(legacy)) return legacy
  } catch {
    /* ignore */
  }
  return next
}

/**
 * @param {{ serverDir: string, repoRoot: string }} roots
 */
export function resolvePlatformPaths({ serverDir, repoRoot }) {
  const env = String(process.env.GEOSYNTRA_ENV || process.env.NODE_ENV || 'development')
    .trim()
    .toLowerCase()
  const isProduction = env === 'production'
  const isStaging = env === 'staging'

  const dataDir = resolvePath(serverDir, platformEnvVar('DATA_DIR'), 'data')

  const paths = {
    env,
    isProduction,
    isStaging,
    dataDir,
    userDb: resolvePath(dataDir, platformEnvVar('USER_DB_PATH'), 'geosyntra_platform.db'),
    apiSecretsFile: platformEnvVar('API_SECRETS_FILE')
      ? resolvePath(dataDir, platformEnvVar('API_SECRETS_FILE'), 'geosyntra_api_secrets.json')
      : resolveDefaultDataFile(dataDir, 'geosyntra_api_secrets.json', 'agri_api_secrets.json'),
    adminDirectoryFile: platformEnvVar('ADMIN_DIRECTORY_FILE')
      ? resolvePath(serverDir, platformEnvVar('ADMIN_DIRECTORY_FILE'), 'geosyntra_admin_directory.json')
      : resolveDefaultDataFile(serverDir, 'geosyntra_admin_directory.json', 'agri_admin_directory.json'),
    userProfilesFile: platformEnvVar('USER_PROFILES_FILE')
      ? resolvePath(dataDir, platformEnvVar('USER_PROFILES_FILE'), 'geosyntra_user_profiles.json')
      : resolveDefaultDataFile(dataDir, 'geosyntra_user_profiles.json', 'agri_user_profiles.json'),
    apiVaultBackupDir: platformEnvVar('API_VAULT_BACKUP_DIR')
      ? resolvePath(dataDir, platformEnvVar('API_VAULT_BACKUP_DIR'), 'api-vault-backups')
      : path.join(dataDir, 'api-vault-backups'),
    adminBackupDir: platformEnvVar('ADMIN_BACKUP_DIR')
      ? resolvePath(dataDir, platformEnvVar('ADMIN_BACKUP_DIR'), 'admin-backups')
      : path.join(dataDir, 'admin-backups'),
  }

  return paths
}

/**
 * Ensure data directory exists; warn when production data lives inside the repository clone.
 */
export function ensurePlatformDataLayout(paths, repoRoot) {
  try {
    fs.mkdirSync(paths.dataDir, { recursive: true })
    fs.mkdirSync(paths.apiVaultBackupDir, { recursive: true })
    fs.mkdirSync(paths.adminBackupDir, { recursive: true })
  } catch (e) {
    console.error('[platform] failed to create data directories', e)
  }

  const dataInRepo = path.normalize(paths.dataDir).startsWith(path.normalize(repoRoot))
  if ((paths.isProduction || paths.isStaging) && dataInRepo) {
    console.error(
      '[platform] CRITICAL: GEOSYNTRA_DATA_DIR is inside the git repository. Mount an external volume (e.g. /data) or set GEOSYNTRA_DATA_DIR to a path outside the repo. Deploys will overwrite user data.',
    )
  }

  const dialect =
    String(process.env.DB_DIALECT || '').trim().toLowerCase() === 'postgres' ||
    String(process.env.DATABASE_URL || '').trim().startsWith('postgres')
      ? 'postgres'
      : paths.userDb
        ? 'sqlite'
        : 'json'

  return {
    dataInRepo,
    storage: dialect,
  }
}
