/**
 * Sentinel Hub WMS instance — production: in-memory runtime from gateway session.
 */

import { readBuiltinBrowserOverride, readBuiltinEnvFallback, persistBuiltinBrowserOverride } from './builtinTokenBrowserPolicy'
import { mustUseApiGateway, usePlatformTokenRuntime } from './platformTokenRuntime'

export const SENTINEL_HUB_WMS_INSTANCE_LS_KEY = 'agri_sentinel_hub_wms_instance_id_v1'

const SENTINEL_HUB_WMS_INSTANCE_EVENT = 'agri-sentinel-hub-wms-instance-changed'

/** Sentinel Hub → Configurations → "Public Data (featured collections)". */
export const SENTINEL_HUB_PUBLIC_DATA_INSTANCE_ID = '60de79ca-16a7-4afd-bcbd-0261bf0156fa'

/** Default WMS instance when none is saved in API Manager. */
export const SENTINEL_HUB_WMS_DEFAULT_INSTANCE_ID = SENTINEL_HUB_PUBLIC_DATA_INSTANCE_ID

/** Former built-in default — GetCapabilities returns 403; migrate away automatically. */
const DEPRECATED_WMS_INSTANCE_IDS = new Set(['7b6554b7-76f2-483e-a06d-90053e49f462'])

function envInstanceId(): string {
  const raw = import.meta.env.VITE_SENTINEL_HUB_WMS_INSTANCE_ID
  return typeof raw === 'string' ? raw.trim() : ''
}

function readLsWmsInstanceId(): string {
  if (typeof window === 'undefined') return ''
  try {
    const raw = window.localStorage.getItem(SENTINEL_HUB_WMS_INSTANCE_LS_KEY)
    const id = typeof raw === 'string' ? raw.trim() : ''
    if (id && DEPRECATED_WMS_INSTANCE_IDS.has(id.toLowerCase())) {
      return SENTINEL_HUB_PUBLIC_DATA_INSTANCE_ID
    }
    return id
  } catch {
    return ''
  }
}

export function getSentinelHubWmsInstanceIdBrowserOverride(): string {
  return readBuiltinBrowserOverride(readLsWmsInstanceId)
}

/** Effective instance: gateway runtime → dev localStorage → env → default. */
export function getSentinelHubWmsInstanceId(): string {
  if (mustUseApiGateway()) {
    const runtime = usePlatformTokenRuntime.getState().sentinelWmsInstanceId
    if (typeof runtime === 'string' && runtime.trim()) return runtime.trim()
  }
  const fromLs = getSentinelHubWmsInstanceIdBrowserOverride()
  if (fromLs) return fromLs
  const fromEnv = readBuiltinEnvFallback(envInstanceId())
  if (fromEnv) return fromEnv
  return SENTINEL_HUB_WMS_DEFAULT_INSTANCE_ID
}

export function getSentinelHubWmsBaseUrl(): string {
  return `https://services.sentinel-hub.com/ogc/wms/${getSentinelHubWmsInstanceId()}`
}

export function persistSentinelHubWmsInstanceIdInBrowser(instanceId: string): void {
  persistBuiltinBrowserOverride((t) => {
    if (typeof window === 'undefined' || !window.localStorage) return
    try {
      if (!t) window.localStorage.removeItem(SENTINEL_HUB_WMS_INSTANCE_LS_KEY)
      else window.localStorage.setItem(SENTINEL_HUB_WMS_INSTANCE_LS_KEY, t)
    } catch {
      console.warn('[sentinel-hub] Could not persist WMS instance id in localStorage')
    }
    window.dispatchEvent(new Event(SENTINEL_HUB_WMS_INSTANCE_EVENT))
  }, instanceId.trim())
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
