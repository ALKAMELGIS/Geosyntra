/**
 * Admin user directory — SQLite or PostgreSQL via platformDb.
 */
import { createSqliteAdminDirectoryStore } from './sqliteAdminDirectoryStore.js'
import { createPostgresAdminDirectoryStore } from './postgresAdminDirectoryStore.js'
import { createSqlRunner } from './sqlRunner.js'
import { resolvePlatformStoreDb } from './platformDatabase.js'

function wrapSqliteAsAsync(sqliteStore) {
  const wrap = fn => (...args) => Promise.resolve(fn(...args))
  return {
    dialect: 'sqlite',
    db: sqliteStore.db,
    readDirectory: wrap(sqliteStore.readDirectory),
    readPublicDirectory: wrap(sqliteStore.readPublicDirectory),
    replaceFullDirectory: wrap(sqliteStore.replaceFullDirectory),
    writeDirectory: wrap(sqliteStore.writeDirectory),
    appendLoginEvent: wrap(sqliteStore.appendLoginEvent),
    getStats: wrap(sqliteStore.getStats),
    getLoginHistory: wrap(sqliteStore.getLoginHistory),
    createEncryptedBackup: wrap(sqliteStore.createEncryptedBackup),
    restoreFromEncryptedBackup: wrap(sqliteStore.restoreFromEncryptedBackup),
    importFromJsonFileIfEmpty: wrap(sqliteStore.importFromJsonFileIfEmpty),
    getUserRowByEmail: wrap(sqliteStore.getUserRowByEmail),
    getUserRowByVerificationToken: wrap(sqliteStore.getUserRowByVerificationToken),
    getMaxUserId: wrap(sqliteStore.getMaxUserId),
  }
}

/**
 * @param {import('./platformDatabase.js').resolvePlatformStoreDb extends Function ? ReturnType<typeof import('./platformDatabase.js').resolvePlatformStoreDb> : any} platformDb
 */
export async function createAdminDirectoryStore(platformDb) {
  const resolved = resolvePlatformStoreDb(platformDb)
  if (resolved.dialect === 'postgres' && resolved.pool) {
    const sql = createSqlRunner(resolved)
    if (!sql) return null
    return createPostgresAdminDirectoryStore(sql)
  }
  if (resolved.dialect === 'sqlite' && resolved.sqlitePath) {
    const sqlite = createSqliteAdminDirectoryStore(resolved.sqlitePath)
    return wrapSqliteAsAsync(sqlite)
  }
  return null
}
