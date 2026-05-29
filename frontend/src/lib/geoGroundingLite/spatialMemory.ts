import type { GeoGroundingPlace } from './types'

const LS_KEY = 'geosyntra_geo_grounding_memory_v1'

export type GeoSpatialMemory = {
  lastPlaces: GeoGroundingPlace[]
  lastCoords: [number, number] | null
  lastQuery: string
  updatedAt: string
}

export function readGeoSpatialMemory(): GeoSpatialMemory | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    return JSON.parse(raw) as GeoSpatialMemory
  } catch {
    return null
  }
}

export function writeGeoSpatialMemory(patch: Partial<GeoSpatialMemory>): void {
  try {
    const prev = readGeoSpatialMemory()
    const next: GeoSpatialMemory = {
      lastPlaces: patch.lastPlaces ?? prev?.lastPlaces ?? [],
      lastCoords: patch.lastCoords ?? prev?.lastCoords ?? null,
      lastQuery: patch.lastQuery ?? prev?.lastQuery ?? '',
      updatedAt: new Date().toISOString(),
    }
    localStorage.setItem(LS_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}

export function groundingSuggestionChipsFromMemory(memory: GeoSpatialMemory | null): string[] {
  const chips: string[] = []
  if (memory?.lastQuery) chips.push(`More about: ${memory.lastQuery.slice(0, 48)}`)
  for (const p of (memory?.lastPlaces ?? []).slice(0, 3)) {
    if (p.name) chips.push(String(p.name).slice(0, 40))
  }
  chips.push('Nearby restaurants', 'Route from map pin', 'Elevation at pin')
  return [...new Set(chips)].slice(0, 6)
}
