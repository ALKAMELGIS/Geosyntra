/**
 * Geosyntra · Fields Data — type model + storage layer.
 *
 * Inspired by OneSoil's "Field Data" workflow (every drawn AOI becomes a
 * named, persistable field with crop / area / last-update metadata that
 * can be revisited, analysed, and compared across visits to the GIS Map).
 *
 * Storage strategy
 * ----------------
 * v1 ships **localStorage-only** persistence so the feature is fully
 * functional without a backend round-trip. The shape (`SavedField`) is
 * intentionally a superset of what a future PostGIS table will need so a
 * server-backed migration can ship later without rewriting the UI:
 *
 *   id            — deterministic UUID (crypto.randomUUID with a soft fallback)
 *   name          — user-facing label, defaults to `Field N`
 *   crop          — free text, suggested from CROP_PRESETS
 *   notes         — optional user notes
 *   color         — hex string, picked from FIELD_COLORS round-robin
 *   geometry      — GeoJSON Polygon (lat/lng pairs in [lng, lat] order)
 *   areaHectares  — geodesic area in hectares, computed once on save
 *   createdAt     — ISO timestamp
 *   updatedAt     — ISO timestamp
 *   indices       — optional NDVI/NDWI/Moisture snapshot (placeholders
 *                   today; populated by the remote-sensing pipeline once
 *                   wired up)
 *
 * The "Multi AOI Management" + "Auto Field Detection" requirements from
 * the user spec land cleanly on top of this shape — `geometry` accepts a
 * MultiPolygon, and a future detector can call `addField()` with a batch.
 */

import L from 'leaflet'

/* ────────────────────────────────────────────────────────────────────────── *
 * Constants
 * ────────────────────────────────────────────────────────────────────────── */

export const FIELDS_STORAGE_KEY = 'geosyntra:fields:v1'

/**
 * Round-robin palette for new fields. Picked to read clearly on top of
 * dark satellite imagery (the GIS Map's dominant basemap) while staying
 * inside the Geosyntra Black-Glass identity (no pure greens or blues —
 * we lean on warm saffron, magenta, teal, amber so adjacent fields stay
 * distinguishable on the map).
 */
export const FIELD_COLORS = [
  '#22d3ee', // cyan
  '#f97316', // orange
  '#a855f7', // violet
  '#facc15', // amber
  '#10b981', // emerald
  '#ec4899', // pink
  '#6366f1', // indigo
  '#f43f5e', // rose
  '#84cc16', // lime
  '#06b6d4', // sky
] as const

export const CROP_PRESETS = [
  'Wheat',
  'Corn / Maize',
  'Barley',
  'Rice',
  'Soybean',
  'Cotton',
  'Sugar Beet',
  'Sugar Cane',
  'Alfalfa',
  'Sunflower',
  'Potato',
  'Tomato',
  'Olive',
  'Date Palm',
  'Vineyard',
  'Citrus',
  'Pasture',
  'Fallow',
  'Other',
] as const

/* ────────────────────────────────────────────────────────────────────────── *
 * Types
 * ────────────────────────────────────────────────────────────────────────── */

export interface FieldIndices {
  ndvi?: number
  ndwi?: number
  moisture?: number
  /** ISO timestamp of when the indices were last computed. */
  computedAt?: string
}

export interface SavedField {
  id: string
  name: string
  crop?: string
  notes?: string
  color: string
  /** GeoJSON Polygon or MultiPolygon (always wrapped in a Feature for round-trip). */
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
  areaHectares: number
  createdAt: string
  updatedAt: string
  indices?: FieldIndices
}

/* ────────────────────────────────────────────────────────────────────────── *
 * UUID helper — `crypto.randomUUID` exists in modern browsers; fall back
 * to a Math.random-based generator for ancient environments / tests.
 * ────────────────────────────────────────────────────────────────────────── */

export function uuid(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    /* fallthrough */
  }
  return 'fid-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36)
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Storage
 * ────────────────────────────────────────────────────────────────────────── */

export function loadSavedFields(): SavedField[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(FIELDS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    /* Soft schema validation — drop entries missing the geometry / id. A
     * stricter zod schema would be nice but it's overkill for v1 and pulls
     * in another runtime dep. */
    return parsed.filter(
      (f: any) =>
        f && typeof f === 'object' && typeof f.id === 'string' && f.geometry && typeof f.geometry === 'object',
    ) as SavedField[]
  } catch {
    return []
  }
}

export function persistSavedFields(fields: SavedField[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(FIELDS_STORAGE_KEY, JSON.stringify(fields))
  } catch {
    /* localStorage can fail in private mode / quota-exceeded — silent. */
  }
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Geometry helpers
 *
 * `L.GeometryUtil.geodesicArea` is shipped by `leaflet-draw` (already a
 * project dependency) and computes m² on a sphere from a `LatLng[]`. We
 * expose a `geodesicAreaHectares` shortcut that handles both Leaflet
 * layers and raw GeoJSON polygons so the panel can display areas for
 * imported / sketched / DB-loaded fields uniformly.
 * ────────────────────────────────────────────────────────────────────────── */

type LeafletGeometryUtil = {
  geodesicArea: (latLngs: L.LatLng[]) => number
}

function getGeometryUtil(): LeafletGeometryUtil | null {
  const util = (L as unknown as { GeometryUtil?: LeafletGeometryUtil }).GeometryUtil
  return util && typeof util.geodesicArea === 'function' ? util : null
}

/** Convert one Polygon ring (`[ [lng,lat], ... ]`) to LatLngs for L.GeometryUtil. */
function ringToLatLngs(ring: GeoJSON.Position[]): L.LatLng[] {
  return ring.map(([lng, lat]) => L.latLng(lat, lng))
}

export function geodesicAreaHectares(geometry: SavedField['geometry']): number {
  const util = getGeometryUtil()
  if (!util) return 0
  let m2 = 0
  try {
    if (geometry.type === 'Polygon') {
      const outer = geometry.coordinates[0]
      if (outer && outer.length >= 3) m2 = util.geodesicArea(ringToLatLngs(outer))
    } else if (geometry.type === 'MultiPolygon') {
      for (const poly of geometry.coordinates) {
        const outer = poly[0]
        if (outer && outer.length >= 3) m2 += util.geodesicArea(ringToLatLngs(outer))
      }
    }
  } catch {
    return 0
  }
  return Math.max(0, m2 / 10_000)
}

/**
 * Convert any leaflet-draw layer (polygon / rectangle / circle) into a
 * GeoJSON polygon suitable for `SavedField.geometry`. Circles are
 * polygonised at 64 segments — accurate enough for a field card preview.
 */
export function leafletLayerToPolygon(
  layer: L.Layer,
): { geometry: SavedField['geometry']; areaHectares: number } | null {
  /* Circle → polygonise. Standard 64 segments is the leaflet-draw export
   * default and matches what the rest of the app uses for AOI export. */
  if (layer instanceof L.Circle) {
    const center = layer.getLatLng()
    const radius = layer.getRadius()
    const segments = 64
    const earth = 6_378_137
    const lat = (center.lat * Math.PI) / 180
    const lng = (center.lng * Math.PI) / 180
    const ring: GeoJSON.Position[] = []
    for (let i = 0; i <= segments; i++) {
      const bearing = (i / segments) * 2 * Math.PI
      const angularDist = radius / earth
      const sinLat = Math.sin(lat) * Math.cos(angularDist) + Math.cos(lat) * Math.sin(angularDist) * Math.cos(bearing)
      const newLat = Math.asin(sinLat)
      const newLng =
        lng +
        Math.atan2(
          Math.sin(bearing) * Math.sin(angularDist) * Math.cos(lat),
          Math.cos(angularDist) - Math.sin(lat) * Math.sin(newLat),
        )
      ring.push([(newLng * 180) / Math.PI, (newLat * 180) / Math.PI])
    }
    const geometry: GeoJSON.Polygon = { type: 'Polygon', coordinates: [ring] }
    return { geometry, areaHectares: geodesicAreaHectares(geometry) }
  }

  /* Polygon / Rectangle export their own GeoJSON via Leaflet. We only
   * support outer rings here (no holes / multipolys from the sketch UI). */
  if (typeof (layer as L.Polygon).toGeoJSON === 'function') {
    try {
      const fc = (layer as L.Polygon).toGeoJSON() as GeoJSON.Feature
      if (fc.geometry?.type === 'Polygon' || fc.geometry?.type === 'MultiPolygon') {
        const geom = fc.geometry as SavedField['geometry']
        return { geometry: geom, areaHectares: geodesicAreaHectares(geom) }
      }
    } catch {
      /* fallthrough */
    }
  }
  return null
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Display helpers
 * ────────────────────────────────────────────────────────────────────────── */

/** Pick the next color in the palette (round-robin by current count). */
export function nextFieldColor(existingCount: number): string {
  return FIELD_COLORS[existingCount % FIELD_COLORS.length]
}

/** Compute the next default field name (`Field 1`, `Field 2`, …). */
export function nextFieldName(existing: SavedField[]): string {
  const used = new Set(existing.map(f => f.name.toLowerCase().trim()))
  for (let i = existing.length + 1; i < existing.length + 999; i++) {
    const candidate = `Field ${i}`
    if (!used.has(candidate.toLowerCase())) return candidate
  }
  return `Field ${Date.now()}`
}

/** Format hectares for display: `12.4 ha`, `0.42 ha`, `1.20 km²` for >100 ha. */
export function formatArea(ha: number): string {
  if (!Number.isFinite(ha) || ha <= 0) return '—'
  if (ha >= 100) return `${(ha / 100).toFixed(2)} km²`
  if (ha >= 10) return `${ha.toFixed(1)} ha`
  return `${ha.toFixed(2)} ha`
}

/** Format an ISO date as `Nov 6, 2026` (short, locale-independent). */
const SHORT_DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
export function formatShortDate(iso: string): string {
  try {
    return SHORT_DATE.format(new Date(iso))
  } catch {
    return iso
  }
}

/** Compute a Leaflet `LatLngBounds` for any saved field — used by Zoom-to-Field. */
export function geometryBounds(geometry: SavedField['geometry']): L.LatLngBounds | null {
  try {
    const fc: GeoJSON.Feature = { type: 'Feature', geometry, properties: {} }
    const layer = L.geoJSON(fc)
    const b = layer.getBounds()
    return b.isValid() ? b : null
  } catch {
    return null
  }
}
