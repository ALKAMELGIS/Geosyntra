/**
 * Layer summaries + location lookup for Geo Explorer / Geo AI (Satellite Imagery).
 * Keeps MAP_QUERY and answers aligned with Added layers + GIS Content data.
 */

import type { ArcgisLayerDefLite } from './arcgisAttributeDisplay'
import { formatFeaturePropertiesForGeoAi } from './arcgisAttributeDisplay'
import { forEachLngLatPairInCoords } from './geoJsonCoordIterWalk'

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

function bboxOfGeometry(geom: GeoAiFeature['geometry']): [number, number, number, number] | null {
  if (!geom) return null
  const pts: [number, number][] = []
  forEachLngLatPairInCoords((geom as { coordinates?: unknown }).coordinates, (lng, lat) => {
    pts.push([lng, lat])
  })
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

const LAYER_HINT_FROM = /(?:from|in|on)\s+['"]?([\w\s\-_]{2,64})['"]?\s*(?:layer)?/i
const LAYER_HINT_TAIL = /\b['"]?([\w][\w\s\-_]{1,62})['"]?\s+layer\b/i
const LAYER_HINT_AR = /طبقة\s+['"]?([\w\s\-_\u0600-\u06FF]{2,64})['"]?/i

/** Exported for Geo AI map pin: when set, layer-derived coordinates should win over model MAP_QUERY. */
export function extractGeoExplorerLayerHint(userText: string): string | null {
  const m1 = userText.match(LAYER_HINT_FROM)
  if (m1?.[1]) return m1[1].trim()
  const m2 = userText.match(LAYER_HINT_TAIL)
  if (m2?.[1]) {
    const w = m2[1].trim().toLowerCase()
    if (!/^(the|a|an|this|that|my|your|our)$/i.test(w)) return m2[1].trim()
  }
  const m3 = userText.match(LAYER_HINT_AR)
  if (m3?.[1]) return m3[1].trim()
  return null
}

function layersWhoseNameAppearsInQuery(userText: string, layers: GeoAiMapLayer[]): GeoAiMapLayer[] | null {
  const normBlob = normalizeLayerName(userText).replace(/_/g, ' ')
  const hits: GeoAiMapLayer[] = []
  for (const layer of layers) {
    const ln = normalizeLayerName(layer.name).replace(/_/g, ' ')
    if (ln.length < 3) continue
    if (normBlob.includes(ln)) hits.push(layer)
  }
  if (hits.length === 0) return null
  if (hits.length === 1) return hits
  hits.sort((a, b) => normalizeLayerName(b.name).length - normalizeLayerName(a.name).length)
  return [hits[0]]
}

function extractLayerHint(userText: string): string | null {
  return extractGeoExplorerLayerHint(userText)
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function tokenAppearsAsWordInBlob(blob: string, tok: string): boolean {
  if (!tok || tok.length < 2) return false
  try {
    return new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(tok)}(?:[^a-z0-9]|$)`, 'i').test(blob)
  } catch {
    return false
  }
}

function tokenizeForSearch(userText: string): string[] {
  let s = userText
  s = s.replace(LAYER_HINT_FROM, ' ').replace(LAYER_HINT_TAIL, ' ').replace(LAYER_HINT_AR, ' ')
  const fillers =
    /\b(show|me|in|map|location|locaion|the|a|an|on|at|for|from|to|of|layer|layers|please|find|where|is|are|point|pin|fly|zoom|center|goto|go)\b/gi
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
  /** Raw feature properties for map popup / UI. */
  properties: Record<string, unknown> | null
  arcgisLayerDefinition: ArcgisLayerDefLite | null
}

/** Table rows for Geo AI map popup (domain-aware labels when ArcGIS def is present). */
export function buildGeoAiLayerPopupAttributeRows(
  hit: Pick<LayerQueryMatch, 'properties' | 'arcgisLayerDefinition'>,
  maxRows = 26,
): { label: string; value: string }[] {
  const p = hit.properties
  if (!p || typeof p !== 'object') return []
  const arc = hit.arcgisLayerDefinition
  const ft = { properties: p as Record<string, unknown> }
  const displayed =
    arc && Object.keys(p).length
      ? formatFeaturePropertiesForGeoAi(p as Record<string, unknown>, ft, arc)
      : Object.fromEntries(
          Object.entries(p).map(([k, v]) => [k, v === null || v === undefined ? '—' : String(v)]),
        )
  return Object.keys(displayed)
    .sort((a, b) => a.localeCompare(b))
    .slice(0, maxRows)
    .map(label => {
      const raw = displayed[label]
      const v = typeof raw === 'string' ? raw.trim() : raw == null ? '' : String(raw)
      return { label, value: v || '—' }
    })
}

/** Human-readable area / country hints from feature attributes (Geo AI map card header). */
export function pickGeoAiHumanPlaceFields(
  props: Record<string, unknown> | null | undefined,
): { areaName?: string; country?: string } {
  if (!props || typeof props !== 'object') return {}
  const str = (k: string) => {
    const v = props[k]
    if (v == null) return ''
    const s = String(v).trim()
    if (!s || /^null$/i.test(s)) return ''
    return s
  }
  const areaName =
    str('Farm_Name') ||
    str('AREA_NAME') ||
    str('Area_Name') ||
    str('area_name') ||
    str('NAME') ||
    str('Name') ||
    str('Site_Name') ||
    str('site_name') ||
    str('Location') ||
    str('location') ||
    str('Farm_Code') ||
    undefined
  let country =
    str('Country_Name') ||
    str('country_name') ||
    str('COUNTRY_NAME') ||
    str('Nation') ||
    str('Country') ||
    str('country') ||
    undefined
  if (country && /^\d+$/.test(country)) country = undefined
  return {
    ...(areaName ? { areaName } : {}),
    ...(country ? { country } : {}),
  }
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

  const nameScoped = !hintNorm ? layersWhoseNameAppearsInQuery(userText, layers) : null

  for (const layer of layers) {
    const fc = featureCollectionFromLayer(layer)
    if (!fc?.features?.length) continue
    const lname = normalizeLayerName(layer.name)
    if (!hintNorm && nameScoped?.length && !nameScoped.some(sl => sl.name === layer.name)) continue
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
        if (!blob.includes(t)) continue
        let pts = t.length * 4
        if (tokenAppearsAsWordInBlob(blob, t)) pts += 28
        if (/^[a-z]{0,4}\d{2,8}[-_]?[a-z0-9]*$/i.test(tok) && tokenAppearsAsWordInBlob(blob, t)) pts += 36
        score += pts
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
        best = {
          lng,
          lat,
          layerName: layer.name,
          matchSummary: summary,
          score,
          properties:
            f.properties && typeof f.properties === 'object'
              ? { ...(f.properties as Record<string, unknown>) }
              : null,
          arcgisLayerDefinition: arcDef,
        }
      }
    }
  }

  return best
}
