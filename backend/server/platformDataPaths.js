/**
 * Central persistent data paths — NEVER store user data inside the git repo in production.
 *
 * Env:
 *   GEOSYNTRA_ENV          — development | staging | production
 *   AGRI_DATA_DIR          — root for all durable files (mount a volume here in prod)
 *   AGRI_USER_DB_PATH      — SQLite platform DB (users, RBAC, migrations, platform_kv)
 *   AGRI_API_SECRETS_FILE  — API vault file
 *   AGRI_ADMIN_DIRECTORY_FILE — legacy JSON import source (optional)
 *   AGRI_USER_PROFILES_FILE
 */
import fs from 'fs'
import path from 'path'

function resolvePath(baseDir, envValue, defaultRelative) {
  const raw = String(envValue || '').trim()
  if (raw) {
    return path.isAbsolute(raw) ? raw : path.join(baseDir, raw)
  }
  return path.join(baseDir, defaultRelative)
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

  const dataDir = resolvePath(serverDir, process.env.AGRI_DATA_DIR, 'data')

  const paths = {
    env,
    isProduction,
    isStaging,
    dataDir,
    userDb: resolvePath(dataDir, process.env.AGRI_USER_DB_PATH, 'geosyntra_platform.db'),
    apiSecretsFile: resolvePath(dataDir, process.env.AGRI_API_SECRETS_FILE, 'agri_api_secrets.json'),
    adminDirectoryFile: resolvePath(
      serverDir,
      process.env.AGRI_ADMIN_DIRECTORY_FILE,
      'agri_admin_directory.json',
    ),
    userProfilesFile: resolvePath(
      dataDir,
      process.env.AGRI_USER_PROFILES_FILE,
      'agri_user_profiles.json',
    ),
    apiVaultBackupDir: process.env.AGRI_API_VAULT_BACKUP_DIR?.trim()
      ? resolvePath(dataDir, process.env.AGRI_API_VAULT_BACKUP_DIR, 'api-vault-backups')
      : path.join(dataDir, 'api-vault-backups'),
    adminBackupDir: process.env.AGRI_ADMIN_BACKUP_DIR?.trim()
      ? resolvePath(dataDir, process.env.AGRI_ADMIN_BACKUP_DIR, 'admin-backups')
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
      '[platform] CRITICAL: AGRI_DATA_DIR is inside the git repository. Mount an external volume (e.g. /data) or set AGRI_DATA_DIR to a path outside the repo. Deploys will overwrite user data.',
    )
  }

  return {
    dataInRepo,
    storage: paths.userDb ? 'sqlite' : 'json',
  }
}
