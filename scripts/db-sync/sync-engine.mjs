import {
  filterTables,
  ensureSyncMetaTable,
} from './schema.mjs'
import {
  getPrimaryKeyColumns,
  getTableColumns,
  listTables,
  quoteIdent,
} from './adapters.mjs'

const UPDATED_COL_CANDIDATES = ['updated_at', 'updatedAt', 'modified_at', 'last_modified']

/**
 * @param {object} cfg
 * @param {any} localConn
 * @param {any} prodConn
 * @param {{ dryRun: boolean, logger: ReturnType<import('./logger.mjs').createSyncLogger> }} ctx
 */
export async function syncData(cfg, localConn, prodConn, ctx) {
  const strategy = cfg.flags.schemaOnly ? 'schema-only' : cfg.migration.strategy
  if (strategy === 'schema-only') {
    return { skipped: true, reason: 'schema-only' }
  }

  if (!ctx.dryRun) {
    await ensureSyncMetaTable(prodConn, cfg.tables.metaTable, false)
  }

  const tables = filterTables(cfg, await listTables(localConn))
  const stats = {
    tables: 0,
    rowsScanned: 0,
    rowsInserted: 0,
    rowsSkipped: 0,
    rowsConflict: 0,
    errors: [],
  }

  for (const table of tables) {
    if (table === cfg.tables.metaTable) continue
    try {
      const tableStats = await syncTable(cfg, localConn, prodConn, table, ctx)
      stats.tables++
      stats.rowsScanned += tableStats.scanned
      stats.rowsInserted += tableStats.inserted
      stats.rowsSkipped += tableStats.skipped
      stats.rowsConflict += tableStats.conflict
    } catch (e) {
      stats.errors.push({ table, error: String(e?.message || e) })
      ctx.logger.error(`Data sync failed: ${table}`, { error: String(e?.message || e) })
    }
  }

  return stats
}

async function syncTable(cfg, localConn, prodConn, table, ctx) {
  const pkCols = await getPrimaryKeyColumns(localConn, table)
  const columns = (await getTableColumns(localConn, table)).map(c => c.name)
  if (!columns.length) return { scanned: 0, inserted: 0, skipped: 0, conflict: 0 }

  const updatedCol = columns.find(c => UPDATED_COL_CANDIDATES.includes(c))
  const watermark =
    cfg.migration.strategy === 'incremental' && !ctx.dryRun
      ? await readWatermark(prodConn, cfg.tables.metaTable, table)
      : null

  const stats = { scanned: 0, inserted: 0, skipped: 0, conflict: 0 }
  const batchSize = cfg.migration.batchSize
  let offset = 0

  for (;;) {
    const rows = fetchLocalBatch(localConn, table, columns, updatedCol, watermark, batchSize, offset)
    if (!rows.length) break
    offset += rows.length
    stats.scanned += rows.length

    if (ctx.dryRun) {
      const newRows = rows.filter(r => !rowExists(prodConn, table, pkCols, r))
      stats.inserted += newRows.length
      stats.skipped += rows.length - newRows.length
      continue
    }

    const tx = beginTransaction(prodConn)
    try {
      for (const row of rows) {
        const exists = rowExists(prodConn, table, pkCols, row)
        if (exists) {
          if (cfg.migration.conflictPolicy === 'local-wins' && pkCols.length) {
            try {
              updateRow(prodConn, table, pkCols, columns, row)
              stats.conflict++
            } catch {
              stats.skipped++
            }
          } else {
            stats.skipped++
          }
          continue
        }
        insertRow(prodConn, table, columns, row, cfg.migration.conflictPolicy)
        stats.inserted++
      }
      commitTransaction(prodConn, tx)
    } catch (e) {
      rollbackTransaction(prodConn, tx)
      throw e
    }
  }

  if (!ctx.dryRun && cfg.migration.strategy === 'incremental') {
    await writeWatermark(prodConn, cfg.tables.metaTable, table, {
      last_run_at: new Date().toISOString(),
      rows_inserted: stats.inserted,
    })
  }

  ctx.logger.info(`Table sync ${table}`, stats)
  return stats
}

function fetchLocalBatch(localConn, table, columns, updatedCol, watermark, limit, offset) {
  const colList = columns.map(c => quoteIdent(c)).join(', ')
  let sql = `SELECT ${colList} FROM ${quoteIdent(table)}`
  const params = []
  if (watermark?.last_updated_at && updatedCol) {
    sql += ` WHERE ${quoteIdent(updatedCol)} > ?`
    params.push(watermark.last_updated_at)
  }
  sql += ` ORDER BY ${quoteIdent(columns[0])} LIMIT ? OFFSET ?`
  params.push(limit, offset)
  return localConn.prepare(sql).all(...params)
}

function rowExists(conn, table, pkCols, row) {
  if (!pkCols.length) {
    return false
  }
  const where = pkCols.map(c => `${quoteIdent(c)} = ?`).join(' AND ')
  const params = pkCols.map(c => row[c])
  const hit = conn.prepare(`SELECT 1 AS ok FROM ${quoteIdent(table)} WHERE ${where} LIMIT 1`).get(...params)
  return Boolean(hit)
}

function insertRow(conn, table, columns, row, conflictPolicy) {
  const colList = columns.map(c => quoteIdent(c)).join(', ')
  const placeholders = columns.map(() => '?').join(', ')
  const values = columns.map(c => row[c])
  let sql = `INSERT INTO ${quoteIdent(table)} (${colList}) VALUES (${placeholders})`
  if (conflictPolicy === 'skip-duplicate') {
    sql = `INSERT OR IGNORE INTO ${quoteIdent(table)} (${colList}) VALUES (${placeholders})`
  }
  conn.prepare(sql).run(...values)
}

function updateRow(conn, table, pkCols, columns, row) {
  const setCols = columns.filter(c => !pkCols.includes(c))
  const setSql = setCols.map(c => `${quoteIdent(c)} = ?`).join(', ')
  const where = pkCols.map(c => `${quoteIdent(c)} = ?`).join(' AND ')
  const params = [...setCols.map(c => row[c]), ...pkCols.map(c => row[c])]
  conn.prepare(`UPDATE ${quoteIdent(table)} SET ${setSql} WHERE ${where}`).run(...params)
}

function beginTransaction(conn) {
  if (conn.prepare) {
    conn.exec('BEGIN IMMEDIATE')
    return 'sqlite'
  }
  return conn.query('BEGIN')
}

function commitTransaction(conn, token) {
  if (token === 'sqlite') {
    conn.exec('COMMIT')
    return
  }
  return token
}

function rollbackTransaction(conn, token) {
  if (token === 'sqlite') {
    try {
      conn.exec('ROLLBACK')
    } catch {
      /* ignore */
    }
    return
  }
}

async function readWatermark(conn, metaTable, table) {
  if (conn.prepare) {
    return conn
      .prepare(`SELECT * FROM ${quoteIdent(metaTable)} WHERE table_name = ?`)
      .get(table)
  }
  const res = await conn.query(
    `SELECT * FROM ${quoteIdent(metaTable)} WHERE table_name = $1`,
    [table],
  )
  return res.rows[0] || null
}

async function writeWatermark(conn, metaTable, table, data) {
  const sql = conn.prepare
    ? `INSERT INTO ${quoteIdent(metaTable)} (table_name, last_run_at, rows_inserted)
       VALUES (?, ?, ?)
       ON CONFLICT(table_name) DO UPDATE SET
         last_run_at = excluded.last_run_at,
         rows_inserted = COALESCE(${quoteIdent(metaTable)}.rows_inserted, 0) + excluded.rows_inserted`
    : null
  if (sql && conn.prepare) {
    conn.prepare(sql).run(table, data.last_run_at, data.rows_inserted)
    return
  }
  await conn.query(
    `INSERT INTO ${quoteIdent(metaTable)} (table_name, last_run_at, rows_inserted)
     VALUES ($1, $2, $3)
     ON CONFLICT (table_name) DO UPDATE SET
       last_run_at = EXCLUDED.last_run_at,
       rows_inserted = COALESCE(${quoteIdent(metaTable)}.rows_inserted, 0) + EXCLUDED.rows_inserted`,
    [table, data.last_run_at, data.rows_inserted],
  )
}
