/**
 * Build-time paths for Vite + GitHub Pages (project URL vs custom domain).
 * CI sets VITE_BASE_PATH=/ and VITE_PRODUCTION_PUBLIC_URL=https://www.geosyntra.org/
 */

export function normalizeBasePath(raw: string): string {
  const s = raw.trim()
  if (!s || s === '/') return '/'
  return s.endsWith('/') ? s : `${s}/`
}

function nodeEnv(key: string, fallback = ''): string {
  if (typeof process === 'undefined' || !process.env) return fallback
  const v = process.env[key]
  return typeof v === 'string' ? v.trim() : fallback
}

export function resolveViteBasePath(): string {
  const raw = nodeEnv('VITE_BASE_PATH')
  if (raw) return normalizeBasePath(raw)
  return '/Geosyntra/'
}

export function resolveProductionPublicUrl(basePath: string): string {
  const custom = nodeEnv('VITE_PRODUCTION_PUBLIC_URL')
  if (custom) return custom.endsWith('/') ? custom : `${custom}/`
  if (basePath === '/') return 'https://www.geosyntra.org/'
  return 'https://alkamelgis.github.io/Geosyntra/'
}

export const pagesCustomDomain = nodeEnv('PAGES_CNAME', 'www.geosyntra.org') || 'www.geosyntra.org'

export const CUSTOM_DOMAIN_HOSTS = ['geosyntra.org', 'www.geosyntra.org'] as const
