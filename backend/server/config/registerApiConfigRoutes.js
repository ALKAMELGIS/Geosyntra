/**
 * Platform config API — capabilities and gateway paths only (no vendor secrets in JSON).
 * Mapbox: public GET /api/config/mapbox — token from Hostinger MAPBOX env only.
 */
import { createAuthMiddleware } from '../rbac/middleware.js'
import { auditEnvironmentBindings, resolveMapboxPublicTokenEnv, resolveTokenEnvValue } from '../env.js'
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
export function registerApiConfigRoutes(app, deps) {
  const requireAuth = createAuthMiddleware(() => deps.store)

  const configStatusHandler = async (_req, res) => {
    const capabilities = buildPlatformCapabilities(deps.systemTokenStore)
    return res.json({
      ok: true,
      revision: getTokenRevision(),
      capabilities,
      environment: auditEnvironmentBindings().map(({ name, configured, envKey, requiredInProduction }) => ({
        name,
        configured,
        envKey,
        requiredInProduction,
      })),
      gatewayMode: true,
    })
  }

  /** Public — Hostinger MAPBOX / MAPBOX_PUBLIC_TOKEN env. Returns pk.* for GL init + proxy paths. */
  const mapboxConfigHandler = async (_req, res) => {
    res.setHeader('Cache-Control', 'private, no-store')
    const serverToken = resolveTokenEnvValue('mapbox')
    const publicToken = resolveMapboxPublicTokenEnv()
    const configured = Boolean(serverToken || publicToken)
    if (!configured) {
      return res.json({
        ok: true,
        configured: false,
        publicToken: null,
        error: 'MAPBOX_TOKEN missing from backend environment',
        publicOnly: false,
        proxyMode: false,
        source: 'environment',
        gatewayPath: '/api/mapbox-proxy',
        geocodingPath: '/api/gateway/mapbox/geocoding',
      })
    }
    return res.json({
      ok: true,
      configured: true,
      publicToken,
      publicOnly: Boolean(publicToken),
      proxyMode: true,
      source: 'environment',
      gatewayPath: '/api/mapbox-proxy',
      geocodingPath: '/api/gateway/mapbox/geocoding',
    })
  }

  const providerConfiguredHandler =
    (tokenName, gatewayPath) => async (_req, res) => {
      const value = await deps.getSystemToken(tokenName)
      return res.json({
        ok: true,
        configured: Boolean(value?.trim()),
        gatewayPath,
      })
    }

  const sentinelConfigHandler = async (_req, res) => {
    const accessToken = await deps.getSystemToken('sentinelhub')
    const wmsInstanceId = await deps.getSystemToken('sentinelhub_wms')
    const configured = Boolean(accessToken?.trim() || wmsInstanceId?.trim())
    if (!configured) {
      return res.json({
        ok: true,
        configured: false,
        gatewayPath: '/api/gateway/sentinel/credentials',
      })
    }
    return res.json({
      ok: true,
      configured: true,
      gatewayPath: '/api/gateway/sentinel/credentials',
    })
  }

  app.get('/api/config/status', requireAuth, configStatusHandler)
  app.get('/api/config/mapbox', mapboxConfigHandler)
  app.get('/api/config/gemini', requireAuth, providerConfiguredHandler('gemini', '/api/gateway/gemini/generate-content'))
  app.get('/api/config/openai', requireAuth, providerConfiguredHandler('openai', '/api/gateway/openai/chat'))
  app.get('/api/config/claude', requireAuth, providerConfiguredHandler('claude', '/api/gateway/claude/messages'))
  app.get('/api/config/deepseek', requireAuth, providerConfiguredHandler('deepseek', '/api/gateway/deepseek/chat'))
  app.get(
    '/api/config/openrouteservice',
    requireAuth,
    providerConfiguredHandler('openrouteservice', '/api/gateway/openrouteservice'),
  )
  app.get('/api/config/graphhopper', requireAuth, providerConfiguredHandler('graphhopper', '/api/gateway/graphhopper'))
  app.get(
    '/api/config/openweathermap',
    requireAuth,
    providerConfiguredHandler('openweathermap', '/api/gateway/openweathermap'),
  )
  app.get('/api/config/sentinel', requireAuth, sentinelConfigHandler)

  /** Legacy alias — same public handler */
  app.get('/api/config/mapbox/public-token', mapboxConfigHandler)
}
