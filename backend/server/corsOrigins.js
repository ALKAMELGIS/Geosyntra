/** Allowed browser origins for credentialed API calls (GitHub Pages + local dev). */
export function resolveCorsOrigins() {
  const appOrigin = String(process.env.APP_ORIGIN || 'http://localhost:5173').trim()
  const extra = String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  const defaults = [
    appOrigin,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://www.geosyntra.org',
    'https://geosyntra.org',
    'http://www.geosyntra.org',
    'http://geosyntra.org',
    'https://alkamelgis.github.io',
  ]

  return [...new Set([...defaults, ...extra])]
}
