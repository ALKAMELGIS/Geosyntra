/**
 * Platform environment health — safe status for authenticated clients (no secret values).
 */
import { createAuthMiddleware } from '../rbac/middleware.js'
import { auditEnvironmentBindings, auditRequiredProductionEnv } from '../env.js'
import { auditRuntimeTokenResolution } from '../envRecoveryMonitor.js'
import { buildPlatformCapabilities } from '../tokenManager/platformCapabilities.js'
import { getTokenRevision } from '../tokenManager/tokenRevision.js'

/**
 * @param {import('express').Express} app
 * @param {{
 *   store: ReturnType<import('../authDirectoryStore.js').createAuthDirectoryStore>
 *   systemTokenStore: ReturnType<import('../tokenManager/systemTokenStore.js').createSystemTokenStore>
 *   getSystemToken: (name: string) => Promise<string | null>
 * }} deps
 */
export function registerPlatformEnvRoutes(app, deps) {
  const requireAuth = createAuthMiddleware(() => deps.store)

  app.get('/api/platform/env-health', requireAuth, async (_req, res) => {
    const required = auditRequiredProductionEnv()
    const runtime = await auditRuntimeTokenResolution(name => deps.getSystemToken(name))
    const capabilities = buildPlatformCapabilities(deps.systemTokenStore)

    return res.json({
      ok: runtime.healthy,
      revision: getTokenRevision(),
      gatewayMode: true,
      source: 'hostinger_process_env',
      requiredMissing: required.missing,
      requiredPresent: required.present.map(r => r.canonical),
      unresolvedTokens: runtime.unresolved,
      resolvedTokens: runtime.resolved,
      capabilities,
      bindings: auditEnvironmentBindings().map(({ name, configured, requiredInProduction, envKey }) => ({
        name,
        configured,
        requiredInProduction,
        envKey,
      })),
    })
  })
}
