import fs from 'node:fs'

/**
 * @param {ReturnType<import('../../config/migration.config.js').loadMigrationConfig>} cfg
 */
export function validateConfig(cfg) {
  const errors = []
  const warnings = []

  if (!cfg.secretsLoaded) {
    warnings.push('hostinger.secrets.env not found — using defaults and process.env only')
  }

  if (cfg.local.dialect === 'sqlite' && !fs.existsSync(cfg.local.sqlitePath)) {
    if (!isDry) errors.push(`Local SQLite database not found: ${cfg.local.sqlitePath}`)
    else warnings.push(`Local SQLite not found (dry-run): ${cfg.local.sqlitePath}`)
  }
  if (cfg.local.dialect === 'postgres' && !cfg.local.pgUrl) {
    errors.push('DB_LOCAL_PG_URL is required when DB_LOCAL_DIALECT=postgres')
  }

  const isDry = cfg.flags.dryRun || effectiveMode === 'dry-run'

  if (cfg.prod.dialect === 'sqlite') {
    if (!cfg.prod.sqlitePath && !cfg.migration.remotePullPush) {
      if (!isDry) errors.push('DB_PROD_SQLITE_PATH is required when DB_PROD_DIALECT=sqlite')
      else warnings.push('DB_PROD_SQLITE_PATH empty — dry-run will skip prod connection')
    } else if (
      cfg.prod.sqlitePath &&
      !cfg.migration.remotePullPush &&
      !fs.existsSync(cfg.prod.sqlitePath)
    ) {
      if (!isDry) errors.push(`Production SQLite database not found: ${cfg.prod.sqlitePath}`)
      else warnings.push(`Production SQLite not found (dry-run): ${cfg.prod.sqlitePath}`)
    }
  }
  if (cfg.prod.dialect === 'postgres' && !cfg.prod.pgUrl) {
    errors.push('DB_PROD_PG_URL is required when DB_PROD_DIALECT=postgres')
  }

  const effectiveMode = cfg.flags.dryRun ? 'dry-run' : cfg.migration.mode
  const touchesProd = ['migrate', 'sync'].includes(effectiveMode) && !cfg.flags.dryRun

  if (touchesProd && cfg.migration.requireProdConfirm && !cfg.flags.confirmProduction) {
    errors.push(
      'Production sync blocked: pass --confirm-production (and set DB_SYNC_REQUIRE_PROD_CONFIRM=yes in secrets)',
    )
  }

  if (touchesProd && cfg.geosyntraEnv === 'production' && cfg.flags.confirmProduction) {
    warnings.push('Running against production with explicit confirmation')
  }

  if (cfg.local.dialect === 'sqlite' && cfg.prod.dialect === 'postgres') {
    warnings.push('Cross-dialect sync sqlite→postgres: review type mapping for GIS columns')
  }

  return { ok: errors.length === 0, errors, warnings, effectiveMode }
}

/**
 * @param {ReturnType<import('../../config/migration.config.js').loadMigrationConfig>} cfg
 * @param {any} localConn
 * @param {any} prodConn
 */
export async function testConnections(cfg, localConn, prodConn) {
  const result = { local: false, prod: false }
  try {
    if (localConn.prepare) {
      localConn.prepare('SELECT 1').get()
    } else {
      await localConn.query('SELECT 1')
    }
    result.local = true
  } catch (e) {
    result.localError = String(e?.message || e)
  }
  try {
    if (prodConn.prepare) {
      prodConn.prepare('SELECT 1').get()
    } else {
      await prodConn.query('SELECT 1')
    }
    result.prod = true
  } catch (e) {
    result.prodError = String(e?.message || e)
  }
  return result
}
