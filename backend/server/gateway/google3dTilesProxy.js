/**
 * Google Map Tiles API (Photorealistic 3D) proxy — keeps API keys server-side.
 * @see https://developers.google.com/maps/documentation/tile/3d-tiles
 */
import { resolveCorsOrigins } from '../corsOrigins.js'

const GOOGLE_TILES_HOST = 'tile.googleapis.com'
const GOOGLE_ROOT_PATH = '/v1/3dtiles/root.json'

export function isAllowedGoogle3dTilesUrl(rawUrl) {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase()
    return host === GOOGLE_TILES_HOST
  } catch {
    return false
  }
}

export function google3dUrlWithApiKey(rawUrl, apiKey) {
  const u = new URL(rawUrl)
  if (!u.searchParams.has('key')) {
    u.searchParams.set('key', apiKey)
  }
  return u.toString()
}

function applyCors(req, res) {
  const origin = String(req.headers.origin || '').trim()
  const allowed = resolveCorsOrigins()
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  } else if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', '*')
  }
}

/** Rewrite tile.googleapis.com URIs in tileset JSON to same-origin proxy URLs. */
export function rewriteGoogle3dTilesetUrls(value, proxyBase) {
  if (typeof value === 'string') {
    if (!value.includes(GOOGLE_TILES_HOST)) return value
    return `${proxyBase}?url=${encodeURIComponent(value)}`
  }
  if (Array.isArray(value)) {
    return value.map(v => rewriteGoogle3dTilesetUrls(v, proxyBase))
  }
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = rewriteGoogle3dTilesetUrls(v, proxyBase)
    }
    return out
  }
  return value
}

function proxyBaseFromRequest(req) {
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim()
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim()
  if (!host) {
    const fallback = String(process.env.APP_ORIGIN || 'https://www.geosyntra.org').replace(/\/+$/, '')
    return `${fallback}/api/google-3d-tiles-proxy`
  }
  return `${proto}://${host}/api/google-3d-tiles-proxy`
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {string} apiKey
 */
export async function serveGoogle3dRootTileset(req, res, apiKey) {
  const upstreamUrl = google3dUrlWithApiKey(`https://${GOOGLE_TILES_HOST}${GOOGLE_ROOT_PATH}`, apiKey)
  try {
    const upstream = await fetch(upstreamUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
    const contentType = upstream.headers.get('content-type') || 'application/json'
    if (!upstream.ok) {
      const body = await upstream.text().catch(() => '')
      res.status(upstream.status)
      applyCors(req, res)
      res.setHeader('Content-Type', contentType)
      return res.send(body || JSON.stringify({ ok: false, error: 'google_3d_tiles_upstream_error' }))
    }
    const json = await upstream.json()
    const proxyBase = proxyBaseFromRequest(req)
    const rewritten = rewriteGoogle3dTilesetUrls(json, proxyBase)
    res.status(200)
    applyCors(req, res)
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'public, max-age=300')
    return res.json(rewritten)
  } catch (e) {
    return res.status(502).json({
      ok: false,
      error: 'google_3d_tiles_proxy_failed',
      message: e instanceof Error ? e.message : 'proxy_failed',
    })
  }
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {string} apiKey
 */
export async function proxyGoogle3dTilesRequest(req, res, apiKey) {
  const target = String(req.query.url || '').trim()
  if (!target || !isAllowedGoogle3dTilesUrl(target)) {
    return res.status(400).json({ ok: false, error: 'invalid_google_3d_tiles_url' })
  }

  const upstreamUrl = google3dUrlWithApiKey(target, apiKey)
  try {
    const upstream = await fetch(upstreamUrl, {
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: { Accept: req.headers.accept || '*/*' },
    })

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream'
    res.status(upstream.status)
    applyCors(req, res)
    res.setHeader('Content-Type', contentType)
    const isJson = contentType.includes('application/json')
    res.setHeader('Cache-Control', isJson ? 'public, max-age=300' : 'public, max-age=604800, immutable')

    if (req.method === 'HEAD') return res.end()

    if (isJson) {
      const json = await upstream.json().catch(() => ({}))
      const proxyBase = proxyBaseFromRequest(req)
      return res.json(rewriteGoogle3dTilesetUrls(json, proxyBase))
    }

    const buf = Buffer.from(await upstream.arrayBuffer())
    return res.send(buf)
  } catch (e) {
    return res.status(502).json({
      ok: false,
      error: 'google_3d_tiles_proxy_failed',
      message: e instanceof Error ? e.message : 'proxy_failed',
    })
  }
}
