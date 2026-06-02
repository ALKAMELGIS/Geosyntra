import fs from 'node:fs'
import path from 'node:path'
import {
  buildPostgresCreateFromSqlite,
  getCreateTableSql,
  getTableColumns,
  listTables,
  quoteIdent,
  sqliteTypeToPostgres,
} from './adapters.mjs'

/**
 * @param {object} cfg
 * @param {any} localConn
 * @param {any} prodConn
 */
export async function compareSchemas(cfg, localConn, prodConn) {
  const localTables = await listTables(localConn)
  const prodTables = await listTables(prodConn)
  const prodSet = new Set(prodTables)

  const report = {
    missingTables: [],
    missingColumns: /** @type {{ table: string, columns: string[] }[]} */ ([]),
    tablesCompared: 0,
  }

  for (const table of filterTables(cfg, localTables)) {
    if (!prodSet.has(table)) {
      report.missingTables.push(table)
      continue
    }
    report.tablesCompared++
    const localCols = await getTableColumns(localConn, table)
    const prodCols = await getTableColumns(prodConn, table)
    const prodColSet = new Set(prodCols.map(c => c.name))
    const missing = localCols.map(c => c.name).filter(n => !prodColSet.has(n))
    if (missing.length) report.missingColumns.push({ table, columns: missing })
  }

  return report
}

export function filterTables(cfg, tables) {
  const { blocklist, allowlist } = cfg.tables
  return tables.filter(t => {
    if (blocklist.includes(t)) return false
    if (allowlist.length && !allowlist.includes(t)) return false
    return true
  })
}

/**
 * @param {object} cfg
 * @param {any} localConn
 * @param {any} prodConn
 * @param {{ dryRun: boolean, logger: import('./logger.mjs').createSyncLogger }} ctx
 */
export async function applySchemaSync(cfg, localConn, prodConn, ctx) {
  const diff = await compareSchemas(cfg, localConn, prodConn)
  const stats = { tablesCreated: 0, columnsAdded: 0, errors: [] }

  for (const table of diff.missingTables) {
    try {
      const ddl = await buildCreateDdl(localConn, prodConn, table)
      if (!ddl) continue
      ctx.logger.info(`Schema: create table ${table}`, { dryRun: ctx.dryRun })
      if (!ctx.dryRun) {
        await execDdl(prodConn, ddl)
        stats.tablesCreated++
      }
    } catch (e) {
      stats.errors.push({ table, op: 'create', error: String(e?.message || e) })
      ctx.logger.error(`Schema create failed: ${table}`, { error: String(e?.message || e) })
    }
  }

  for (const { table, columns } of diff.missingColumns) {
    const localCols = await getTableColumns(localConn, table)
    for (const colName of columns) {
      const col = localCols.find(c => c.name === colName)
      if (!col) continue
      try {
        const ddl = buildAddColumnDdl(prodConn, table, col)
        ctx.logger.info(`Schema: add column ${table}.${colName}`, { dryRun: ctx.dryRun })
        if (!ctx.dryRun) {
          await execDdl(prodConn, ddl)
          stats.columnsAdded++
        }
      } catch (e) {
        const msg = String(e?.message || e)
        if (msg.includes('duplicate column') || msg.includes('already exists')) continue
        stats.errors.push({ table, column: colName, op: 'add-column', error: msg })
        ctx.logger.error(`Schema add column failed: ${table}.${colName}`, { error: msg })
      }
    }
  }

  return { diff, stats }
}

async function buildCreateDdl(localConn, prodConn, table) {
  if (localConn.prepare) {
    const sql = getCreateTableSql(localConn, table)
    if (!sql) return null
    if (prodConn.prepare) return sql
    return buildPostgresCreateFromSqlite(sql, table)
  }
  return null
}

function buildAddColumnDdl(prodConn, table, col) {
  if (prodConn.prepare) {
    const type = col.type || 'TEXT'
    const nullable = col.notnull ? ' NOT NULL' : ''
    const def = col.dflt_value != null ? ` DEFAULT ${col.dflt_value}` : ''
    return `ALTER TABLE ${quoteIdent(table)} ADD COLUMN ${quoteIdent(col.name)} ${type}${nullable}${def}`
  }
  const pgType = sqliteTypeToPostgres(col.type)
  const nullable = col.notnull ? ' NOT NULL' : ''
  const def = col.dflt_value != null ? ` DEFAULT ${col.dflt_value}` : ''
  return `ALTER TABLE ${quoteIdent(table)} ADD COLUMN ${quoteIdent(col.name)} ${pgType}${nullable}${def}`
}

async function execDdl(conn, sql) {
  if (conn.prepare) {
    conn.exec(sql)
    return
  }
  await conn.query(sql)
}

export async function applyBackendSqliteMigrations(dbPath, migrationsDir, logger, dryRun) {
  if (!fs.existsSync(migrationsDir)) {
    logger.warn('Migrations directory missing', { migrationsDir })
    return { applied: [] }
  }
  if (dryRun) {
    const files = fs.readdirSync(migrationsDir).filter(f => /^\d+_.+\.sql$/i.test(f))
    logger.info('Dry-run: would apply backend migrations', { count: files.length })
    return { applied: files }
  }
  const mod = await import(path.join(path.dirname(migrationsDir), 'runSqliteMigrations.js'))
  const result = mod.runSqliteMigrations(dbPath)
  logger.info('Backend SQLite migrations applied', result)
  return result
}

export async function ensureSyncMetaTable(prodConn, metaTable, dryRun) {
  const sql = prodConn.prepare
    ? `CREATE TABLE IF NOT EXISTS ${quoteIdent(metaTable)} (
      table_name TEXT PRIMARY KEY,
      last_pk TEXT,
      last_updated_at TEXT,
      rows_inserted INTEGER NOT NULL DEFAULT 0,
      last_run_at TEXT NOT NULL
    )`
    : `CREATE TABLE IF NOT EXISTS ${quoteIdent(metaTable)} (
      table_name TEXT PRIMARY KEY,
      last_pk TEXT,
      last_updated_at TIMESTAMPTZ,
      rows_inserted BIGINT NOT NULL DEFAULT 0,
      last_run_at TIMESTAMPTZ NOT NULL
    )`
  if (!dryRun) await execDdl(prodConn, sql)
}
