/**
 * GeoAI API Gateway — authenticated proxy to external vendors.
 * Secrets resolve server-side only (SQLite system_tokens + env).
 */
import { createAuthMiddleware } from '../rbac/middleware.js'
import { buildPlatformCapabilities } from '../tokenManager/platformCapabilities.js'
import { getTokenRevision } from '../tokenManager/tokenRevision.js'
import { geminiGenerateContentServer } from './geminiProxy.js'
import { claudeMessagesServer } from './claudeProxy.js'
import { createGatewayRateLimitMiddleware } from './gatewayRateLimit.js'
import { proxyGoogle3dTilesRequest, serveGoogle3dRootTileset } from './google3dTilesProxy.js'
import { proxyMapboxRequest, proxyOpenWeatherRequest } from './mapboxProxy.js'

function isPublicMapboxToken(token) {
  const t = String(token || '').trim()
  return t.startsWith('pk.')
}

/**
 * @param {import('express').Express} app
 * @param {{
 *   store: ReturnType<import('../authDirectoryStore.js').createAuthDirectoryStore>
 *   systemTokenStore: ReturnType<import('../tokenManager/systemTokenStore.js').createSystemTokenStore>
 *   getSystemToken: (name: string) => Promise<string | null>
 * }} deps
 */
export function registerApiGatewayRoutes(app, deps) {
  const requireAuth = createAuthMiddleware(() => deps.store)
  const geminiLimit = createGatewayRateLimitMiddleware('gateway/gemini', { limit: 40, windowMs: 60_000 })
  const openaiLimit = createGatewayRateLimitMiddleware('gateway/openai', { limit: 40, windowMs: 60_000 })
  const claudeLimit = createGatewayRateLimitMiddleware('gateway/claude', { limit: 40, windowMs: 60_000 })
  const deepseekLimit = createGatewayRateLimitMiddleware('gateway/deepseek', { limit: 40, windowMs: 60_000 })

  app.get('/api/gateway/status', requireAuth, async (_req, res) => {
    const capabilities = buildPlatformCapabilities(deps.systemTokenStore)
    return res.json({
      ok: true,
      revision: getTokenRevision(),
      capabilities,
      gateway: {
        gemini: capabilities.gemini,
        openai: capabilities.openai,
        claude: capabilities.claude,
        deepseek: capabilities.deepseek,
        mapbox: capabilities.mapbox,
        arcgis: capabilities.arcgis,
        sentinelhub: capabilities.sentinelhub,
        openrouteservice: capabilities.openrouteservice,
        graphhopper: capabilities.graphhopper,
        openweathermap: capabilities.openweathermap,
      },
      encrypted: Boolean(process.env.AGRI_API_VAULT_MASTER_KEY?.trim()),
    })
  })

  /** Mapbox public (pk.*) token only — prefer `/api/config/mapbox` for session hydrate. */
  app.get('/api/gateway/mapbox/public-token', requireAuth, async (_req, res) => {
    const raw = await deps.getSystemToken('mapbox')
    if (!raw) {
      return res.status(503).json({ ok: false, error: 'mapbox_not_configured', configured: false })
    }
    const trimmed = raw.trim()
    if (!isPublicMapboxToken(trimmed)) {
      return res.json({
        ok: true,
        configured: true,
        token: null,
        proxyMode: true,
        publicOnly: false,
      })
    }
    return res.json({ ok: true, configured: true, token: trimmed, proxyMode: false, publicOnly: true })
  })

  app.post('/api/gateway/gemini/generate-content', requireAuth, geminiLimit, async (req, res) => {
    const apiKey = await deps.getSystemToken('gemini')
    if (!apiKey) {
      return res.status(503).json({
        ok: false,
        error: 'gemini_not_configured',
        message: 'Platform Gemini API key is not configured. Contact the platform Owner.',
      })
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const systemInstruction = String(body.systemInstruction || '').trim()
    const contents = Array.isArray(body.contents) ? body.contents : []
    if (!systemInstruction && contents.length === 0) {
      return res.status(400).json({ ok: false, error: 'contents_required' })
    }

    try {
      const result = await geminiGenerateContentServer({
        apiKey,
        systemInstruction: systemInstruction || 'You are a helpful GeoAI assistant.',
        contents,
      })
      return res.json({
        ok: true,
        text: result.text,
        model: result.model,
        apiVersion: result.apiVersion,
      })
    } catch (e) {
      const code = e?.code || 'gemini_error'
      const status = code === 'gemini_auth' ? 401 : code === 'rate_limit_exceeded' ? 429 : 502
      return res.status(status).json({
        ok: false,
        error: code,
        message: e instanceof Error ? e.message : 'Gemini request failed',
      })
    }
  })

  app.post('/api/gateway/openai/chat', requireAuth, openaiLimit, async (req, res) => {
    const apiKey = await deps.getSystemToken('openai')
    if (!apiKey) {
      return res.status(503).json({
        ok: false,
        error: 'openai_not_configured',
        message: 'Platform OpenAI key is not configured.',
      })
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const messages = Array.isArray(body.messages) ? body.messages : []
    const model = String(body.model || 'gpt-4o-mini').trim()
    const maxTokens = Math.min(Math.max(Number(body.max_tokens) || 1024, 64), 4096)

    if (messages.length === 0) {
      return res.status(400).json({ ok: false, error: 'messages_required' })
    }

    try {
      const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
      })
      const data = await upstream.json().catch(() => ({}))
      if (!upstream.ok) {
        return res.status(upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502).json({
          ok: false,
          error: 'openai_upstream',
          message: data?.error?.message || upstream.statusText,
        })
      }
      const text = data?.choices?.[0]?.message?.content ?? ''
      return res.json({ ok: true, text, model: data?.model || model })
    } catch (e) {
      return res.status(502).json({
        ok: false,
        error: 'openai_proxy_failed',
        message: e instanceof Error ? e.message : 'OpenAI request failed',
      })
    }
  })

  app.post('/api/gateway/claude/messages', requireAuth, claudeLimit, async (req, res) => {
    const apiKey = await deps.getSystemToken('claude')
    if (!apiKey) {
      return res.status(503).json({
        ok: false,
        error: 'claude_not_configured',
        message: 'Platform Claude API key is not configured. Contact the platform Owner.',
      })
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const system = String(body.system || '').trim()
    const userMessage = String(body.userMessage || '').trim()
    const turns = Array.isArray(body.turns) ? body.turns : []
    const messages = []
    for (const t of turns) {
      if (!t || typeof t !== 'object') continue
      const role = t.role === 'assistant' ? 'assistant' : 'user'
      const text = String(t.text || '').trim()
      if (!text) continue
      messages.push({ role, content: text })
    }
    if (userMessage) messages.push({ role: 'user', content: userMessage })
    if (messages.length === 0) {
      return res.status(400).json({ ok: false, error: 'messages_required' })
    }

    try {
      const result = await claudeMessagesServer({
        apiKey,
        system: system || 'You are a helpful GeoAI assistant.',
        messages,
        max_tokens: body.max_tokens,
      })
      return res.json({ ok: true, text: result.text, model: result.model })
    } catch (e) {
      const code = e?.code || 'claude_error'
      const status = code === 'claude_auth' ? 401 : 502
      return res.status(status).json({
        ok: false,
        error: code,
        message: e instanceof Error ? e.message : 'Claude request failed',
      })
    }
  })

  const orsLimit = createGatewayRateLimitMiddleware('gateway/ors', { limit: 60, windowMs: 60_000 })
  const graphhopperLimit = createGatewayRateLimitMiddleware('gateway/graphhopper', { limit: 60, windowMs: 60_000 })
  const mapboxLimit = createGatewayRateLimitMiddleware('gateway/mapbox', { limit: 120, windowMs: 60_000 })
  const openWeatherLimit = createGatewayRateLimitMiddleware('gateway/openweather', { limit: 60, windowMs: 60_000 })

  /** Mapbox — public proxy; MAPBOX_TOKEN injected server-side only (no session / JWT). */
  const mapboxProxyHandler = async (req, res) => {
    const token = await deps.getSystemToken('mapbox')
    if (!token) {
      return res.status(503).json({ ok: false, error: 'mapbox_not_configured' })
    }
    return proxyMapboxRequest(req, res, token)
  }

  app.get('/api/mapbox-proxy', mapboxLimit, mapboxProxyHandler)
  app.get('/api/gateway/mapbox/proxy', mapboxLimit, mapboxProxyHandler)

  const google3dLimit = createGatewayRateLimitMiddleware('gateway/google-3d-tiles', {
    limit: 120,
    windowMs: 60_000,
  })
  const google3dProxyHandler = async (req, res) => {
    const apiKey = await deps.getSystemToken('google_maps')
    if (!apiKey) {
      return res.status(503).json({ ok: false, error: 'google_maps_not_configured' })
    }
    return proxyGoogle3dTilesRequest(req, res, apiKey)
  }
  const google3dRootHandler = async (req, res) => {
    const apiKey = await deps.getSystemToken('google_maps')
    if (!apiKey) {
      return res.status(503).json({ ok: false, error: 'google_maps_not_configured' })
    }
    return serveGoogle3dRootTileset(req, res, apiKey)
  }
  app.get('/api/google-3d-tiles/root.json', google3dLimit, google3dRootHandler)
  app.get('/api/google-3d-tiles-proxy', google3dLimit, google3dProxyHandler)

  /** Mapbox geocoding — public; token stays on server. */
  app.get('/api/gateway/mapbox/geocoding', mapboxLimit, async (req, res) => {
    const token = await deps.getSystemToken('mapbox')
    if (!token) {
      return res.status(503).json({ ok: false, error: 'mapbox_not_configured' })
    }
    const q = String(req.query.q || req.query.query || '').trim()
    if (!q) return res.status(400).json({ ok: false, error: 'query_required' })
    const limit = Math.min(Math.max(Number(req.query.limit) || 5, 1), 10)
    const proximity = String(req.query.proximity || '').trim()
    const language = String(req.query.language || '').trim()
    const params = new URLSearchParams({ limit: String(limit), access_token: token })
    // Worldwide search: places, addresses, POIs, regions, districts, etc.
    params.set('types', 'country,region,postcode,district,place,locality,neighborhood,address,poi')
    params.set('autocomplete', 'true')
    if (proximity) params.set('proximity', proximity)
    if (language) params.set('language', language)
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?${params.toString()}`
    // URL-restricted public tokens require a Referer matching the allowed app origin.
    const referer = `${String(process.env.APP_ORIGIN || 'https://www.geosyntra.org').replace(/\/+$/, '')}/`
    try {
      const upstream = await fetch(url, { headers: { Accept: 'application/json', Referer: referer } })
      const data = await upstream.json().catch(() => ({}))
      return res.status(upstream.status).json(data)
    } catch (e) {
      return res.status(502).json({
        ok: false,
        error: 'mapbox_geocoding_failed',
        message: e instanceof Error ? e.message : 'Geocoding failed',
      })
    }
  })

  /** OpenWeatherMap — authenticated proxy; appid never sent to browser build. */
  app.get(/^\/api\/gateway\/openweathermap\/(.+)$/, requireAuth, openWeatherLimit, async (req, res) => {
    const apiKey = await deps.getSystemToken('openweathermap')
    if (!apiKey) {
      return res.status(503).json({ ok: false, error: 'openweathermap_not_configured' })
    }
    return proxyOpenWeatherRequest(req, res, apiKey)
  })

  /** OpenRouteService — authenticated proxy; API key never sent to the browser. */
  app.post(/^\/api\/gateway\/openrouteservice\/(.+)$/, requireAuth, orsLimit, async (req, res) => {
    const apiKey = await deps.getSystemToken('openrouteservice')
    if (!apiKey) {
      return res.status(503).json({
        ok: false,
        error: 'ors_not_configured',
        message: 'OpenRouteService is not configured on the platform.',
      })
    }
    const pathSuffix = String(req.params[0] || '').replace(/^\//, '')
    const upstreamUrl = `https://api.openrouteservice.org/${pathSuffix}`
    try {
      const upstream = await fetch(upstreamUrl, {
        method: 'POST',
        headers: {
          Authorization: apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json, application/geo+json',
        },
        body: JSON.stringify(req.body ?? {}),
      })
      const data = await upstream.json().catch(() => ({}))
      return res.status(upstream.status).json(data)
    } catch (e) {
      return res.status(502).json({
        ok: false,
        error: 'ors_proxy_failed',
        message: e instanceof Error ? e.message : 'OpenRouteService request failed',
      })
    }
  })

  /** GraphHopper — authenticated GET proxy (directions / isochrones). */
  app.get(/^\/api\/gateway\/graphhopper\/(.+)$/, requireAuth, graphhopperLimit, async (req, res) => {
    const apiKey = await deps.getSystemToken('graphhopper')
    if (!apiKey) {
      return res.status(503).json({
        ok: false,
        error: 'graphhopper_not_configured',
        message: 'GraphHopper is not configured on the platform.',
      })
    }
    const pathSuffix = String(req.params[0] || '').replace(/^\//, '')
    const qs = new URLSearchParams(req.query)
    qs.set('key', apiKey)
    const upstreamUrl = `https://graphhopper.com/api/1/${pathSuffix}?${qs.toString()}`
    try {
      const upstream = await fetch(upstreamUrl, { method: 'GET' })
      const data = await upstream.json().catch(() => ({}))
      return res.status(upstream.status).json(data)
    } catch (e) {
      return res.status(502).json({
        ok: false,
        error: 'graphhopper_proxy_failed',
        message: e instanceof Error ? e.message : 'GraphHopper request failed',
      })
    }
  })

  /**
   * Sentinel Hub — configured flag only; use /api/gateway/sentinel/credentials after auth
   * (session in-memory on client — never localStorage).
   */
  app.get('/api/gateway/sentinel/credentials', requireAuth, async (_req, res) => {
    const accessToken = await deps.getSystemToken('sentinelhub')
    const wmsInstanceId = await deps.getSystemToken('sentinelhub_wms')
    if (!accessToken && !wmsInstanceId) {
      return res.status(503).json({ ok: false, error: 'sentinel_not_configured' })
    }
    return res.json({
      ok: true,
      accessToken: accessToken || null,
      wmsInstanceId: wmsInstanceId || null,
    })
  })

  app.post('/api/gateway/deepseek/chat', requireAuth, deepseekLimit, async (req, res) => {
    const apiKey = await deps.getSystemToken('deepseek')
    if (!apiKey) {
      return res.status(503).json({
        ok: false,
        error: 'deepseek_not_configured',
        message: 'Platform DeepSeek API key is not configured.',
      })
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const system = String(body.system || '').trim()
    const userMessage = String(body.userMessage || '').trim()
    const turns = Array.isArray(body.turns) ? body.turns : []
    const messages = []
    if (system) messages.push({ role: 'system', content: system })
    for (const t of turns) {
      if (!t || typeof t !== 'object') continue
      const role = t.role === 'assistant' ? 'assistant' : 'user'
      const text = String(t.text || '').trim()
      if (!text) continue
      messages.push({ role, content: text })
    }
    if (userMessage) messages.push({ role: 'user', content: userMessage })
    if (messages.length === 0) {
      return res.status(400).json({ ok: false, error: 'messages_required' })
    }

    const model = String(body.model || 'deepseek-chat').trim()
    const maxTokens = Math.min(Math.max(Number(body.max_tokens) || 4096, 64), 8192)

    try {
      const upstream = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
      })
      const data = await upstream.json().catch(() => ({}))
      if (!upstream.ok) {
        return res.status(upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502).json({
          ok: false,
          error: 'deepseek_upstream',
          message: data?.error?.message || upstream.statusText,
        })
      }
      const text = data?.choices?.[0]?.message?.content?.trim() ?? ''
      if (!text) {
        return res.status(502).json({ ok: false, error: 'deepseek_empty', message: 'Empty DeepSeek response' })
      }
      return res.json({ ok: true, text, model: data?.model || model })
    } catch (e) {
      return res.status(502).json({
        ok: false,
        error: 'deepseek_proxy_failed',
        message: e instanceof Error ? e.message : 'DeepSeek request failed',
      })
    }
  })
}
