/**
 * Platform store factories — SQLite or PostgreSQL from platformDb.
 */
import { resolvePlatformStoreDb } from './platformDatabase.js'
import { createSqlRunner } from './sqlRunner.js'
import { createSystemTokenStore } from './tokenManager/systemTokenStore.js'
import { createUserApiTokenStore } from './tokenManager/userApiTokenStore.js'
import { createSubscriptionStore } from './billing/subscriptionStore.js'
import { createInviteStore } from './rbac/inviteStore.js'
import { createRefreshTokenStore } from './rbac/refreshTokens.js'

/**
 * @param {import('./platformDatabase.js').resolvePlatformStoreDb extends Function ? Parameters<typeof import('./platformDatabase.js').resolvePlatformStoreDb>[0] : any} platformDb
 */
export function createPlatformStores(platformDb) {
  const resolved = resolvePlatformStoreDb(platformDb)
  const sql = createSqlRunner(resolved)
  return {
    platformDb: resolved,
    sql,
    systemTokenStore: createSystemTokenStore(resolved),
    userApiTokenStore: createUserApiTokenStore(resolved),
    subscriptionStore: createSubscriptionStore(resolved),
    inviteStore: createInviteStore(resolved),
    refreshTokenStore: createRefreshTokenStore(resolved),
  }
}
