/**
 * Sentinel Hub OGC WMS instance UUID: build-time env and/or browser override
 * (System Settings → API Tokens). Used for Sentinel-2 WMS in Satellite Intelligence.
 */

export const SENTINEL_HUB_WMS_INSTANCE_LS_KEY = 'agri_sentinel_hub_wms_instance_id_v1'

const SENTINEL_HUB_WMS_INSTANCE_EVENT = 'agri-sentinel-hub-wms-instance-changed'

/** Default demo instance (public OGC WMS); replace in production via env or settings. */
export const SENTINEL_HUB_WMS_DEFAULT_INSTANCE_ID = '7b6554b7-76f2-483e-a06d-90053e49f462'

function envInstanceId(): string {
  const raw = import.meta.env.VITE_SENTINEL_HUB_WMS_INSTANCE_ID
  return typeof raw === 'string' ? raw.trim() : ''
}

export function getSentinelHubWmsInstanceIdBrowserOverride(): string {
  if (typeof window === 'undefined') return ''
  try {
    const raw = window.localStorage.getItem(SENTINEL_HUB_WMS_INSTANCE_LS_KEY)
    return typeof raw === 'string' ? raw.trim() : ''
  } catch {
    return ''
  }
}

/** Effective instance: env wins, then browser override, then built-in default. */
export function getSentinelHubWmsInstanceId(): string {
  const fromEnv = envInstanceId()
  if (fromEnv) return fromEnv
  const fromLs = getSentinelHubWmsInstanceIdBrowserOverride()
  if (fromLs) return fromLs
  return SENTINEL_HUB_WMS_DEFAULT_INSTANCE_ID
}

export function getSentinelHubWmsBaseUrl(): string {
  return `https://services.sentinel-hub.com/ogc/wms/${getSentinelHubWmsInstanceId()}`
}

export function persistSentinelHubWmsInstanceIdInBrowser(instanceId: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  const t = instanceId.trim()
  try {
    if (!t) window.localStorage.removeItem(SENTINEL_HUB_WMS_INSTANCE_LS_KEY)
    else window.localStorage.setItem(SENTINEL_HUB_WMS_INSTANCE_LS_KEY, t)
  } catch {
    console.warn('[sentinel-hub] Could not persist WMS instance id in localStorage')
  }
  window.dispatchEvent(new Event(SENTINEL_HUB_WMS_INSTANCE_EVENT))
}

export function subscribeSentinelHubWmsInstance(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const onStorage = (e: StorageEvent) => {
    if (e.key === SENTINEL_HUB_WMS_INSTANCE_LS_KEY || e.key === null) listener()
  }
  const onCustom = () => listener()
  window.addEventListener('storage', onStorage)
  window.addEventListener(SENTINEL_HUB_WMS_INSTANCE_EVENT, onCustom)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(SENTINEL_HUB_WMS_INSTANCE_EVENT, onCustom)
  }
}
