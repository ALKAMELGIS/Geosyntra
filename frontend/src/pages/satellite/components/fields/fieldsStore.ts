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
export const FIELD_GROUPS_STORAGE_KEY = 'geosyntra:field-groups:v1'

/** How saved fields are tinted on the map from per-field spectral snapshots. */
export type FieldSurfaceVizMetric =
  | 'none'
  | 'ndvi'
  | 'ndwi'
  | 'savi'
  | 'evi'
  | 'moisture'
  | 'temperature'

export interface FieldGroup {
  id: string
  name: string
  createdAt: string
}

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
  savi?: number
  evi?: number
  moisture?: number
  /** Degrees Celsius — LST-style proxy until a thermal service is wired. */
  temperature?: number
  /** ISO timestamp of when the indices were last computed. */
  computedAt?: string
}

/**
 * Snapshot of which Satellite layer / spectral index was active at
 * the moment the field was drawn or last edited. Lets the UI show
 * "this field was captured under the NDVI scene from May 2026" and
 * lets a future analytics worker re-fetch the same WMS tile to
 * compute zonal stats for the field's geometry.
 */
export interface FieldSatelliteContext {
  /** Raw WMS layer name picked from the Layer dropdown
   *  (e.g. `NDVI`, `Sentinel Hub WMS`, `False color`). */
  layerName: string
  /** Resolved environmental index id when the layer maps to one
   *  of the platform's known indices (NDVI / NDWI / MOISTURE / SWIR
   *  / etc.). */
  indexId?: string
  /** Optional human-friendly date for the satellite scene (when
   *  the host knows it — e.g. acquisition date of a Sentinel pass). */
  sceneDate?: string
  /** ISO timestamp of when the snapshot was taken (server time). */
  capturedAt: string
}

/** Best-effort map a visible layer / WMS title to a known spectral index id. */
export function guessSpectralIndexIdFromLayerName(layerName: string): string | undefined {
  const n = layerName.toLowerCase()
  if (n.includes('ndvi')) return 'NDVI'
  if (n.includes('ndwi')) return 'NDWI'
  if (n.includes('ndmi') || (n.includes('moisture') && !n.includes('false color'))) return 'MOISTURE'
  if (n.includes('swir')) return 'SWIR'
  if (n.includes('evi')) return 'EVI'
  if (n.includes('savi')) return 'SAVI'
  return undefined
}

/**
 * GIS Map (Leaflet) — capture which imagery layer was on top when the user
 * saved a field, so `SavedField.satelliteContext` matches Satellite Intelligence.
 */
export function snapshotFieldSatelliteFromGisContext(
  topVisibleLayerName: string | undefined,
  basemapFallbackLabel: string,
  capturedAt: string,
): FieldSatelliteContext | undefined {
  const raw =
    (topVisibleLayerName && topVisibleLayerName.trim()) ||
    (basemapFallbackLabel && basemapFallbackLabel.trim())
  if (!raw) return undefined
  return {
    layerName: raw,
    indexId: guessSpectralIndexIdFromLayerName(raw),
    capturedAt,
  }
}

export interface SavedField {
  id: string
  name: string
  crop?: string
  notes?: string
  color: string
  /** Optional workspace folder for the Field Data library tab. */
  groupId?: string
  /** GeoJSON Polygon or MultiPolygon (always wrapped in a Feature for round-trip). */
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
  areaHectares: number
  createdAt: string
  updatedAt: string
  indices?: FieldIndices
  /** Active Satellite layer / index at the time of save. Optional
   *  so older persisted fields stay backwards-compatible. */
  satelliteContext?: FieldSatelliteContext
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

export function loadFieldGroups(): FieldGroup[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(FIELD_GROUPS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (g: any) => g && typeof g === 'object' && typeof g.id === 'string' && typeof g.name === 'string',
    ) as FieldGroup[]
  } catch {
    return []
  }
}

export function persistFieldGroups(groups: FieldGroup[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(FIELD_GROUPS_STORAGE_KEY, JSON.stringify(groups))
  } catch {
    /* ignore */
  }
}

function hashStringToUint32(input: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Rough centroid in WGS84 [lng, lat] for zonal-style seeding (not survey-grade). */
export function polygonGeometryCentroid(geometry: SavedField['geometry']): [number, number] | null {
  try {
    const rings: GeoJSON.Position[][] = []
    if (geometry.type === 'Polygon') {
      const outer = geometry.coordinates[0]
      if (outer?.length) rings.push(outer)
    } else {
      const first = geometry.coordinates[0]?.[0]
      if (first?.length) rings.push(first)
    }
    const ring = rings[0]
    if (!ring || ring.length < 2) return null
    let sx = 0
    let sy = 0
    let n = 0
    for (const p of ring) {
      const lng = p[0]
      const lat = p[1]
      if (typeof lng !== 'number' || typeof lat !== 'number') continue
      sx += lng
      sy += lat
      n += 1
    }
    if (!n) return null
    return [sx / n, sy / n]
  } catch {
    return null
  }
}

export type FieldSpectralContextInput = {
  layerKey: string
  indexKey?: string
  /** Any string that changes when the scene / timeline window changes. */
  sceneKey: string
}

/**
 * Deterministic per-field spectral snapshot from geometry + scene context.
 * Values are plausible stand-ins until real zonal stats are wired to WMS/STAC.
 */
export function computeFieldSpectralIndices(
  field: Pick<SavedField, 'id' | 'geometry'>,
  ctx: FieldSpectralContextInput,
): FieldIndices {
  const c = polygonGeometryCentroid(field.geometry)
  const cx = c?.[0] ?? 0
  const cy = c?.[1] ?? 0
  const seedBase = hashStringToUint32(
    `${field.id}|${ctx.layerKey}|${ctx.indexKey ?? ''}|${ctx.sceneKey}|${cx.toFixed(5)}|${cy.toFixed(5)}`,
  )
  const rnd = mulberry32(seedBase)
  const ndvi = -0.15 + rnd() * 1.05
  const ndwi = -0.4 + rnd() * 0.9
  const savi = -0.1 + rnd() * 0.85
  const evi = -0.05 + rnd() * 0.75
  const moisture = 0.08 + rnd() * 0.62
  const temperature = 18 + rnd() * 16
  return {
    ndvi,
    ndwi,
    savi,
    evi,
    moisture,
    temperature,
    computedAt: new Date().toISOString(),
  }
}

/** 0–1 ramp for Mapbox `interpolate` paint (NDVI-style metrics). */
export function indexToVizUnit(metric: FieldSurfaceVizMetric, indices: FieldIndices | undefined): number {
  if (!indices) return 0.45
  if (metric === 'ndvi' && typeof indices.ndvi === 'number') return Math.max(0, Math.min(1, (indices.ndvi + 1) / 2))
  if (metric === 'ndwi' && typeof indices.ndwi === 'number') return Math.max(0, Math.min(1, (indices.ndwi + 1) / 2))
  if (metric === 'savi' && typeof indices.savi === 'number') return Math.max(0, Math.min(1, (indices.savi + 0.2) / 1.1))
  if (metric === 'evi' && typeof indices.evi === 'number') return Math.max(0, Math.min(1, (indices.evi + 0.2) / 1))
  if (metric === 'moisture' && typeof indices.moisture === 'number')
    return Math.max(0, Math.min(1, indices.moisture))
  if (metric === 'temperature' && typeof indices.temperature === 'number')
    return Math.max(0, Math.min(1, (indices.temperature - 10) / 35))
  return 0.45
}


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
