/**
 * Mapbox API proxy — injects server-side token; browser never sees sk.* or raw keys in URLs.
 */

/** Mapbox GL may request api, tiles, events, and other *.mapbox.com hosts. */
export function isAllowedMapboxUrl(rawUrl) {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase()
    return host === 'mapbox.com' || host.endsWith('.mapbox.com')
  } catch {
    return false
  }
}

/**
 * @param {string} rawUrl
 * @param {string} accessToken
 */
export function mapboxUrlWithToken(rawUrl, accessToken) {
  const u = new URL(rawUrl)
  if (!u.searchParams.has('access_token')) {
    u.searchParams.set('access_token', accessToken)
  }
  return u.toString()
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {string} accessToken
 */
export async function proxyMapboxRequest(req, res, accessToken) {
  const target = String(req.query.url || '').trim()
  if (!target || !isAllowedMapboxUrl(target)) {
    return res.status(400).json({ ok: false, error: 'invalid_mapbox_url' })
  }

  const upstreamUrl = mapboxUrlWithToken(target, accessToken)
  // URL-restricted public tokens require a Referer matching the allowed app origin.
  // The browser never reaches Mapbox directly (we proxy), so we forward it server-side.
  const referer = `${String(process.env.APP_ORIGIN || 'https://www.geosyntra.org').replace(/\/+$/, '')}/`
  try {
    const upstream = await fetch(upstreamUrl, {
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: { Accept: req.headers.accept || '*/*', Referer: referer },
    })

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream'
    res.status(upstream.status)
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'private, max-age=60')
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
    res.setHeader('Vary', 'Origin')

    if (req.method === 'HEAD') return res.end()

    if (contentType.includes('application/json')) {
      const data = await upstream.json().catch(() => ({}))
      return res.json(data)
    }

    const buf = Buffer.from(await upstream.arrayBuffer())
    return res.send(buf)
  } catch (e) {
    return res.status(502).json({
      ok: false,
      error: 'mapbox_proxy_failed',
      message: e instanceof Error ? e.message : 'Mapbox proxy failed',
    })
  }
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {string} apiKey
 */
export async function proxyOpenWeatherRequest(req, res, apiKey) {
  const pathSuffix = String(req.params[0] || '').replace(/^\//, '')
  if (!pathSuffix) {
    return res.status(400).json({ ok: false, error: 'path_required' })
  }
  const qs = new URLSearchParams(req.query)
  if (!qs.has('appid')) qs.set('appid', apiKey)
  const upstreamUrl = `https://api.openweathermap.org/${pathSuffix}?${qs.toString()}`
  try {
    const upstream = await fetch(upstreamUrl)
    const data = await upstream.json().catch(() => ({}))
    return res.status(upstream.status).json(data)
  } catch (e) {
    return res.status(502).json({
      ok: false,
      error: 'openweather_proxy_failed',
      message: e instanceof Error ? e.message : 'OpenWeatherMap proxy failed',
    })
  }
}
