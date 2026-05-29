import type { GeoAiRouteSession } from './geoAiRoutePlan'
import type { CachedRouteEntry } from './siNavigationTypes'

const LS_KEY = 'si-route-cache-v1'
const MAX_ENTRIES = 12

export function loadRouteCache(): CachedRouteEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as CachedRouteEntry[]
    return Array.isArray(parsed) ? parsed.slice(0, MAX_ENTRIES) : []
  } catch {
    return []
  }
}

export function saveRouteToCache(key: string, session: GeoAiRouteSession): void {
  if (typeof window === 'undefined') return
  try {
    const list = loadRouteCache().filter(e => e.key !== key)
    list.unshift({ key, savedAt: new Date().toISOString(), session })
    localStorage.setItem(LS_KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)))
  } catch {
    /* quota */
  }
}

export function findCachedRoute(key: string): GeoAiRouteSession | null {
  const hit = loadRouteCache().find(e => e.key === key)
  return hit?.session ?? null
}
