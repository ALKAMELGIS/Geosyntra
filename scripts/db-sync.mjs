#!/usr/bin/env node
/**
 * GeoSyntra database migration & sync — local ↔ production.
 *
 * Usage:
 *   cp hostinger.secrets.env.example hostinger.secrets.env
 *   npm run db:sync:dry
 *   npm run db:sync:test
 *   npm run db:sync -- --confirm-production
 *   npm run db:sync:rollback
 *
 * Flags:
 *   --dry-run              No writes (default when DB_MIGRATION_MODE=dry-run)
 *   --confirm-production   Required for prod writes when DB_SYNC_REQUIRE_PROD_CONFIRM=yes
 *   --test-connections     Ping local + prod databases and exit
 *   --schema-only          Schema diff/apply only
 *   --rollback             Restore latest backup manifest
 *   --verbose              Extra logging
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadMigrationConfig } from '../config/migration.config.js'
import { createSyncLogger } from './db-sync/logger.mjs'
import {
  backupSqliteFile,
  checkpointSqlite,
  createRunId,
  pruneOldBackups,
  readLatestManifest,
  restoreSqliteBackup,
  tryPgDump,
  writeManifest,
} from './db-sync/backup.mjs'
import { openSqlite, openPostgres } from './db-sync/adapters.mjs'
import { applySchemaSync, applyBackendSqliteMigrations } from './db-sync/schema.mjs'
import { syncData } from './db-sync/sync-engine.mjs'
import { validateConfig, testConnections } from './db-sync/validate.mjs'
import { pullSqliteOverSsh, pushSqliteOverSsh, tempProdSqlitePath } from './db-sync/remote.mjs'

const argv = process.argv.slice(2)

function printHelp() {
  console.log(`GeoSyntra db-sync

  npm run db:sync:dry              Schema + data plan (no writes)
  npm run db:sync:test             Test DB connections
  npm run db:sync -- --confirm-production

  Configure: hostinger.secrets.env (see hostinger.secrets.env.example)
`)
}

async function openConnection(target, label) {
  if (target.dialect === 'postgres') {
    if (!target.pgUrl) throw new Error(`${label}: PostgreSQL URL missing`)
    return openPostgres(target.pgUrl, target.pgSchema)
  }
  if (!target.sqlitePath) throw new Error(`${label}: SQLite path missing`)
  return openSqlite(target.sqlitePath, { readonly: false })
}

async function closeConnection(conn) {
  if (!conn) return
  if (conn.close) await conn.close()
  else if (conn.prepare) conn.close()
}

async function main() {
  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp()
    process.exit(0)
  }

  const cfg = loadMigrationConfig({ argv })
  const validation = validateConfig(cfg)
  for (const w of validation.warnings) console.warn(`[db-sync] WARN: ${w}`)
  if (!validation.ok) {
    for (const e of validation.errors) console.error(`[db-sync] ERROR: ${e}`)
    process.exit(2)
  }

  const runId = createRunId()
  const logger = createSyncLogger(cfg.paths.logDir, runId)
  const dryRun =
    cfg.flags.dryRun ||
    validation.effectiveMode === 'dry-run' ||
    (cfg.flags.dryRun === false && cfg.migration.mode === 'dry-run')

  logger.info('db-sync starting', {
    runId,
    mode: validation.effectiveMode,
    strategy: cfg.migration.strategy,
    dryRun,
    local: cfg.local.dialect,
    prod: cfg.prod.dialect,
  })

  if (cfg.flags.rollback || cfg.migration.mode === 'rollback') {
    const manifest = readLatestManifest(cfg.paths.backupDir)
    if (!manifest?.prodSqliteBackup) {
      logger.error('No rollback manifest with prodSqliteBackup found')
      logger.flush()
      process.exit(1)
    }
    if (dryRun) {
      logger.info('Dry-run rollback would restore', manifest)
      logger.flush()
      process.exit(0)
    }
    restoreSqliteBackup(manifest.prodSqliteBackup, cfg.prod.sqlitePath)
    logger.info('Rollback complete', { from: manifest.prodSqliteBackup })
    logger.flush()
    process.exit(0)
  }

  let localSqlitePath = cfg.local.sqlitePath
  let tempLocalDb = null
  if (cfg.local.dialect === 'sqlite' && !fs.existsSync(localSqlitePath)) {
    if (dryRun) {
      tempLocalDb = path.join(os.tmpdir(), `geosyntra-local-dry-${runId}.db`)
      logger.warn('Local SQLite missing — seeding temp DB for dry-run', { tempLocalDb })
      await applyBackendSqliteMigrations(tempLocalDb, cfg.paths.migrationsDir, logger, false)
      localSqlitePath = tempLocalDb
    } else {
      throw new Error(`Local SQLite not found: ${localSqlitePath}`)
    }
  }

  let prodSqlitePath = String(cfg.prod.sqlitePath || '').trim()
  let pulledTemp = null

  if (!prodSqlitePath && cfg.prod.dialect === 'sqlite') {
    if (dryRun) prodSqlitePath = localSqlitePath
    else if (!cfg.migration.remotePullPush) {
      throw new Error('DB_PROD_SQLITE_PATH is required for production sync')
    }
  }

  const prodSqliteMissing =
    cfg.prod.dialect === 'sqlite' &&
    prodSqlitePath &&
    !cfg.migration.remotePullPush &&
    !fs.existsSync(prodSqlitePath)

  if (prodSqliteMissing && dryRun) {
    logger.warn('Production SQLite missing — dry-run using local DB as prod stand-in', {
      prodSqlitePath,
    })
    prodSqlitePath = localSqlitePath
  } else if (prodSqliteMissing) {
    throw new Error(`Production SQLite not found: ${prodSqlitePath}`)
  }

  if (cfg.prod.dialect === 'sqlite' && cfg.migration.remotePullPush && cfg.prod.ssh.host) {
    pulledTemp = tempProdSqlitePath(runId)
    logger.info('Pulling production SQLite via SSH', { dest: pulledTemp })
    if (!dryRun) pullSqliteOverSsh(cfg.prod.ssh, pulledTemp)
    prodSqlitePath = pulledTemp
  }

  let localConn
  let prodConn
  try {
    localConn = await openConnection(
      { ...cfg.local, sqlitePath: localSqlitePath },
      'local',
    )
    if (
      cfg.prod.dialect === 'sqlite' &&
      cfg.local.dialect === 'sqlite' &&
      path.resolve(localSqlitePath) === path.resolve(prodSqlitePath)
    ) {
      prodConn = localConn
      logger.info('Prod connection reuses local SQLite handle (same file)')
    } else {
      prodConn = await openConnection(
        { ...cfg.prod, sqlitePath: prodSqlitePath },
        'prod',
      )
    }

    const connTest = await testConnections(cfg, localConn, prodConn)
    logger.info('Connection test', connTest)
    if (cfg.flags.testConnections) {
      logger.flush()
      process.exit(connTest.local && connTest.prod ? 0 : 1)
    }
    if (!connTest.local || !connTest.prod) {
      throw new Error('Connection test failed')
    }

    const schemaReport = await applySchemaSync(cfg, localConn, prodConn, {
      dryRun,
      logger,
    })
    logger.info('Schema comparison', schemaReport.diff)
    logger.info('Schema apply stats', schemaReport.stats)

    if (cfg.migration.applyBackendMigrations && cfg.prod.dialect === 'sqlite' && prodSqlitePath) {
      await applyBackendSqliteMigrations(
        prodSqlitePath,
        cfg.paths.migrationsDir,
        logger,
        dryRun,
      )
    }

    const manifest = {
      runId,
      startedAt: new Date().toISOString(),
      mode: validation.effectiveMode,
      strategy: cfg.migration.strategy,
      dryRun,
      localSqlite: cfg.local.sqlitePath,
      prodTarget: prodSqlitePath,
    }

    if (!dryRun && cfg.prod.dialect === 'sqlite' && prodSqlitePath) {
      if (prodConn.prepare) checkpointSqlite(prodConn)
      manifest.prodSqliteBackup = backupSqliteFile(
        prodSqlitePath,
        cfg.paths.backupDir,
        runId,
        'prod-before',
      )
      if (cfg.local.sqlitePath && fs.existsSync(cfg.local.sqlitePath)) {
        manifest.localSqliteBackup = backupSqliteFile(
          cfg.local.sqlitePath,
          cfg.paths.backupDir,
          runId,
          'local-before',
        )
      }
    }

    if (!dryRun && cfg.prod.dialect === 'postgres' && cfg.prod.pgUrl) {
      const dump = tryPgDump(cfg.prod.pgUrl, cfg.paths.backupDir, runId, 'prod-pg')
      if (typeof dump === 'string') manifest.prodPgDump = dump
      else logger.warn('pg_dump skipped', dump)
    }

    const dataStats = await syncData(cfg, localConn, prodConn, { dryRun, logger })
    logger.info('Data sync complete', dataStats)

    manifest.finishedAt = new Date().toISOString()
    manifest.schema = schemaReport.stats
    manifest.data = dataStats
    if (!dryRun) writeManifest(cfg.paths.backupDir, runId, manifest)

    const removed = pruneOldBackups(cfg.paths.backupDir, cfg.retention.backupDays)
    if (removed.length) logger.info('Pruned old backups', { removed })

    if (
      !dryRun &&
      cfg.migration.remotePullPush &&
      pulledTemp &&
      cfg.prod.ssh.host &&
      cfg.flags.confirmProduction
    ) {
      logger.warn('Pushing SQLite to production via SSH')
      pushSqliteOverSsh(cfg.prod.ssh, pulledTemp)
    }

    logger.info('db-sync finished successfully', { runId, log: logger.logPath })
    logger.flush()
    process.exit(0)
  } catch (e) {
    logger.error('db-sync failed', { error: String(e?.message || e), stack: e?.stack })
    logger.flush()
    process.exit(1)
  } finally {
    await closeConnection(localConn)
    await closeConnection(prodConn)
    if (pulledTemp && fs.existsSync(pulledTemp) && !cfg.flags.keepTemp) {
      try {
        fs.unlinkSync(pulledTemp)
      } catch {
        /* ignore */
      }
    }
    if (tempLocalDb && fs.existsSync(tempLocalDb)) {
      try {
        fs.unlinkSync(tempLocalDb)
      } catch {
        /* ignore */
      }
    }
  }
}

main()
