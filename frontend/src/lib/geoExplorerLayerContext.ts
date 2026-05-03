/**
 * Layer summaries + location lookup for Geo Explorer / Geo AI (Satellite Imagery).
 * Keeps MAP_QUERY and answers aligned with Added layers + GIS Content data.
 */

import type { ArcgisLayerDefLite } from './arcgisAttributeDisplay'
import { formatFeaturePropertiesForGeoAi } from './arcgisAttributeDisplay'

export type GeoAiMapLayer = {
  name: string
  visible?: boolean
  source?: string
  /** ArcGIS `?f=pjson` subset: fields, types, typeIdField — for coded-value / subtype labels in AI context */
  arcgisLayerDefinition?: ArcgisLayerDefLite | null
  /** GeoJSON FeatureCollection (Satellite custom layers) */
  geojson?: { type?: string; features?: GeoAiFeature[] } | null
  /** GIS Map / LayerData shape */
  data?: { type?: string; features?: GeoAiFeature[] } | null
}

type GeoAiFeature = {
  properties?: Record<string, unknown>
  geometry?: { type?: string; coordinates?: unknown }
}

function featureCollectionFromLayer(l: GeoAiMapLayer): { features: GeoAiFeature[] } | null {
  const g = l.geojson
  if (g && g.type === 'FeatureCollection' && Array.isArray(g.features)) return { features: g.features }
  const d = l.data as { type?: string; features?: GeoAiFeature[] } | undefined
  if (d && d.type === 'FeatureCollection' && Array.isArray(d.features)) return { features: d.features }
  return null
}

function walkCoords(coords: unknown, out: [number, number][]): void {
  if (!coords) return
  if (typeof coords === 'object' && coords !== null && 'length' in (coords as any)) {
    const c = coords as unknown[]
    if (c.length >= 2 && typeof c[0] === 'number' && typeof c[1] === 'number') {
      out.push([c[0], c[1]])
      return
    }
    for (const x of c) walkCoords(x, out)
  }
}

function bboxOfGeometry(geom: GeoAiFeature['geometry']): [number, number, number, number] | null {
  if (!geom) return null
  const pts: [number, number][] = []
  walkCoords((geom as { coordinates?: unknown }).coordinates, pts)
  if (pts.length === 0) return null
  let [minX, minY] = pts[0]
  let [maxX, maxY] = pts[0]
  for (let i = 1; i < pts.length; i++) {
    const [x, y] = pts[i]
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return [minX, minY, maxX, maxY]
}

function featureCentroid(f: GeoAiFeature): [number, number] | null {
  const g = f.geometry
  if (!g) return null
  if (g.type === 'Point' && Array.isArray(g.coordinates) && g.coordinates.length >= 2) {
    const [x, y] = g.coordinates as number[]
    if (Number.isFinite(x) && Number.isFinite(y)) return [x, y]
  }
  const b = bboxOfGeometry(g)
  if (!b) return null
  return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]
}

function normalizeLayerName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function propertyKeys(features: GeoAiFeature[], cap = 40): string[] {
  const keys = new Set<string>()
  for (const f of features.slice(0, 80)) {
    const p = f.properties
    if (p && typeof p === 'object') {
      for (const k of Object.keys(p)) keys.add(k)
      if (keys.size >= cap) break
    }
  }
  return [...keys].slice(0, cap)
}

/** One-line + sample for prompts (GIS-style). */
export function summarizeGeoAiMapLayer(l: GeoAiMapLayer, maxSampleChars = 400): string {
  const fc = featureCollectionFromLayer(l)
  const n = fc?.features?.length ?? 0
  const fields = fc?.features?.length ? propertyKeys(fc.features).join(', ') : '—'
  let sample = ''
  const first = fc?.features?.[0]
  const arcDef = l.arcgisLayerDefinition ?? null
  if (first?.properties && typeof first.properties === 'object') {
    const shown = arcDef
      ? formatFeaturePropertiesForGeoAi(first.properties as Record<string, unknown>, first, arcDef)
      : first.properties
    const label = arcDef ? 'example attributes (domain/subtype descriptions)' : 'example attributes'
    sample = ` | ${label}: ${JSON.stringify(shown).slice(0, maxSampleChars)}`
  }
  const vis = l.visible === false ? 'hidden' : 'visible'
  return `- ${l.name} (features=${n}, ${vis}, source=${l.source ?? 'n/a'}) fields=[${fields || '—'}]${sample}`
}

export function summarizeGeoAiMapLayers(layers: GeoAiMapLayer[], maxChars = 28000): string {
  const lines: string[] = []
  for (const l of layers) {
    const fc = featureCollectionFromLayer(l)
    if (!fc?.features?.length) continue
    const base = summarizeGeoAiMapLayer(l)
    lines.push(l.visible === false ? `${base} [layer toggled off on map — data still listed for AI]` : base)
  }
  if (lines.length === 0) return '(no vector features in visible layers for this session.)'
  let out = lines.join('\n')
  if (out.length > maxChars) out = `${out.slice(0, maxChars)}\n[…truncated…]`
  return out
}

const LAYER_HINT = /(?:from|in)\s+['"]?([\w\s\-]{2,64})['"]?\s*(?:layer)?/i

function extractLayerHint(userText: string): string | null {
  const m = userText.match(LAYER_HINT)
  if (!m?.[1]) return null
  return m[1].trim()
}

function tokenizeForSearch(userText: string): string[] {
  let s = userText
  s = s.replace(LAYER_HINT, ' ')
  const fillers =
    /\b(show|me|in|map|location|the|a|an|on|at|for|from|to|of|layer|layers|please|find|where|is|are|point|pin|fly|zoom|center|goto|go)\b/gi
  s = s.replace(fillers, ' ')
  const raw = s
    .split(/[^\w\-./]+/)
    .map(x => x.trim())
    .filter(Boolean)
  const tokens = new Set<string>()
  for (const t of raw) {
    if (t.length >= 2) tokens.add(t)
    const compact = t.replace(/\s+/g, '')
    if (compact.length >= 2) tokens.add(compact)
  }
  return [...tokens].sort((a, b) => b.length - a.length)
}

function propsSearchBlob(f: GeoAiFeature): string {
  try {
    return JSON.stringify(f.properties ?? {}).toLowerCase()
  } catch {
    return ''
  }
}

export type LayerQueryMatch = {
  lng: number
  lat: number
  layerName: string
  matchSummary: string
  score: number
}

/**
 * Best-effort: find a feature whose attributes match the user's text (e.g. NH-101 in Agro_Structures).
 */
export function findLngLatFromLayerQuery(userText: string, layers: GeoAiMapLayer[]): LayerQueryMatch | null {
  const hint = extractLayerHint(userText)
  const hintNorm = hint ? normalizeLayerName(hint) : ''
  const tokens = tokenizeForSearch(userText)
  if (tokens.length === 0 && !hintNorm) return null

  let best: LayerQueryMatch | null = null

  for (const layer of layers) {
    const fc = featureCollectionFromLayer(layer)
    if (!fc?.features?.length) continue
    const lname = normalizeLayerName(layer.name)
    if (hintNorm) {
      const hinted =
        lname.includes(hintNorm) ||
        hintNorm.includes(lname) ||
        normalizeLayerName(layer.name.replace(/_/g, ' ')).includes(hintNorm)
      if (!hinted) continue
    }

    for (const f of fc.features) {
      const blob = propsSearchBlob(f)
      if (!blob) continue
      let score = 0
      for (const tok of tokens) {
        const t = tok.toLowerCase()
        if (t.length < 2) continue
        if (blob.includes(t)) score += t.length * 4
      }
      if (hintNorm) score += 12
      if (score <= 0) continue
      const c = featureCentroid(f)
      if (!c) continue
      const [lng, lat] = c
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
      const arcDef = layer.arcgisLayerDefinition ?? null
      const summary =
        f.properties && typeof f.properties === 'object' && Object.keys(f.properties).length
          ? JSON.stringify(
              arcDef
                ? formatFeaturePropertiesForGeoAi(f.properties as Record<string, unknown>, f, arcDef)
                : f.properties,
            ).slice(0, 220)
          : 'geometry match'
      if (!best || score > best.score) {
        best = { lng, lat, layerName: layer.name, matchSummary: summary, score }
      }
    }
  }

  return best
}
