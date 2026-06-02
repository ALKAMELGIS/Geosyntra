/** Embedded ArcGIS Dashboard URL for Geosyntra Platform — stored in localStorage (browser-only). */

const LEGACY_EMBED_KEY = 'agroCloudDashboardEmbedUrl_v1'
const LEGACY_KEEP_KEY = 'agroCloudDashboardKeepAlive_v1'

export const GEOSYNTRA_DASHBOARD_EMBED_STORAGE_KEY = 'geosyntraDashboardEmbedUrl_v1'

export const DEFAULT_GEOSYNTRA_DASHBOARD_EMBED_URL =
  'https://eap.maps.arcgis.com/apps/dashboards/dc80932dd15e40bba4d5f3fcca829a98'

export const GEOSYNTRA_DASHBOARD_EMBED_CHANGED_EVENT = 'geosyntraDashboardEmbedChanged'

function migrateEmbedFromLegacy(): void {
  try {
    if (localStorage.getItem(GEOSYNTRA_DASHBOARD_EMBED_STORAGE_KEY)?.trim()) return
    const legacy = localStorage.getItem(LEGACY_EMBED_KEY)?.trim()
    if (!legacy) return
    localStorage.setItem(GEOSYNTRA_DASHBOARD_EMBED_STORAGE_KEY, legacy)
  } catch {
    //
  }
}

export function readGeosyntraDashboardUrl(): string {
  if (typeof window === 'undefined') return DEFAULT_GEOSYNTRA_DASHBOARD_EMBED_URL
  migrateEmbedFromLegacy()
  try {
    const raw = localStorage.getItem(GEOSYNTRA_DASHBOARD_EMBED_STORAGE_KEY)
    if (!raw?.trim()) return DEFAULT_GEOSYNTRA_DASHBOARD_EMBED_URL
    const u = new URL(raw.trim())
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return DEFAULT_GEOSYNTRA_DASHBOARD_EMBED_URL
    return raw.trim()
  } catch {
    return DEFAULT_GEOSYNTRA_DASHBOARD_EMBED_URL
  }
}

export function isValidEmbedUrl(s: string): boolean {
  try {
    const u = new URL(s.trim())
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

export function writeGeosyntraDashboardUrl(url: string): void {
  localStorage.setItem(GEOSYNTRA_DASHBOARD_EMBED_STORAGE_KEY, url.trim())
  try {
    localStorage.removeItem(LEGACY_EMBED_KEY)
  } catch {
    //
  }
  window.dispatchEvent(new CustomEvent(GEOSYNTRA_DASHBOARD_EMBED_CHANGED_EVENT))
}

export function resetGeosyntraDashboardUrl(): void {
  try {
    localStorage.removeItem(GEOSYNTRA_DASHBOARD_EMBED_STORAGE_KEY)
    localStorage.removeItem(LEGACY_EMBED_KEY)
  } catch {
    //
  }
  window.dispatchEvent(new CustomEvent(GEOSYNTRA_DASHBOARD_EMBED_CHANGED_EVENT))
}

/** When true (default), iframe stays mounted between navigations — no reload when returning. */
export const GEOSYNTRA_DASHBOARD_KEEP_ALIVE_KEY = 'geosyntraDashboardKeepAlive_v1'

export const GEOSYNTRA_DASHBOARD_KEEP_ALIVE_CHANGED_EVENT = 'geosyntraDashboardKeepAliveChanged'

function migrateKeepFromLegacy(): void {
  try {
    if (localStorage.getItem(GEOSYNTRA_DASHBOARD_KEEP_ALIVE_KEY) != null) return
    const legacy = localStorage.getItem(LEGACY_KEEP_KEY)
    if (legacy == null) return
    localStorage.setItem(GEOSYNTRA_DASHBOARD_KEEP_ALIVE_KEY, legacy)
  } catch {
    //
  }
}

export function readGeosyntraDashboardKeepAlive(): boolean {
  if (typeof window === 'undefined') return true
  migrateKeepFromLegacy()
  try {
    const raw = localStorage.getItem(GEOSYNTRA_DASHBOARD_KEEP_ALIVE_KEY)
    if (raw === null || raw === '') return true
    return raw === '1' || raw === 'true'
  } catch {
    return true
  }
}

export function writeGeosyntraDashboardKeepAlive(enabled: boolean): void {
  try {
    localStorage.setItem(GEOSYNTRA_DASHBOARD_KEEP_ALIVE_KEY, enabled ? '1' : '0')
    localStorage.removeItem(LEGACY_KEEP_KEY)
  } catch {
    //
  }
  window.dispatchEvent(new CustomEvent(GEOSYNTRA_DASHBOARD_KEEP_ALIVE_CHANGED_EVENT))
}
