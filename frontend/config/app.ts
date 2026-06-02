import { resolveProductionPublicUrl } from './viteAppConfig'

function normalizeBasePath(raw: string): string {
  const s = raw.trim()
  if (!s || s === '/') return '/'
  return s.endsWith('/') ? s : `${s}/`
}

function readBuildEnv(key: 'VITE_BASE_PATH' | 'VITE_PRODUCTION_PUBLIC_URL'): string {
  try {
    const viteEnv = import.meta.env as Record<string, string | undefined> | undefined
    const fromVite = viteEnv?.[key]
    if (typeof fromVite === 'string' && fromVite.trim()) return fromVite.trim()
    if (key === 'VITE_BASE_PATH') {
      const baseUrl = viteEnv?.BASE_URL
      if (typeof baseUrl === 'string' && baseUrl.trim()) return baseUrl.trim()
    }
  } catch {
    /* Node loads vite.config before import.meta.env exists */
  }
  if (typeof process !== 'undefined' && process.env) {
    const fromProcess = process.env[key]
    if (typeof fromProcess === 'string' && fromProcess.trim()) return fromProcess.trim()
  }
  return ''
}

const envBase = readBuildEnv('VITE_BASE_PATH')
const basePath = envBase ? normalizeBasePath(envBase) : '/Geosyntra/'

const envPublicUrl = readBuildEnv('VITE_PRODUCTION_PUBLIC_URL')
const productionPublicUrl = envPublicUrl
  ? envPublicUrl.endsWith('/')
    ? envPublicUrl
    : `${envPublicUrl}/`
  : typeof process !== 'undefined'
    ? resolveProductionPublicUrl(basePath)
    : typeof window !== 'undefined'
      ? `${window.location.origin}${basePath}`
      : 'https://www.geosyntra.org/'

export const appConfig = {
  appName: 'GeoSyntra',
  repoName: 'Geosyntra',
  basePath,
  /** Canonical public URL (no hash). Hash routes use `/#/…` in the browser. */
  productionPublicUrl,
} as const
