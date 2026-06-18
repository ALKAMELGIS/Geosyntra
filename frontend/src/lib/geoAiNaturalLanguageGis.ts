/**
 * GeoAI Natural Language GIS — bilingual (AR/EN) intent normalization,
 * semantic layer resolution, and local spatial commands before LLM fallback.
 */

import type { GeoExplorerDataTablePayload, GeoExplorerDataTableRow } from './geoExplorerContracts'
import {
  extractGeoExplorerLayerHint,
  geoAiFeatureCentroid,
  normalizeLayerName,
  type GeoAiMapLayer,
} from './geoExplorerLayerContext'
import { haversineDistanceMeters } from './geoAiGeoJsonSpatial'
import type { GeoAiLayerRegistryEntry } from './geoAiLayerIntelligence'
import { runGeoAiStatsCommand, type GeoAiStatsResult } from './geoAiStatsEngine'
import { computeStableGisFeatureKey } from './gisFeatureStableKey'

function registryToGeoAiMapLayers(registry: GeoAiLayerRegistryEntry[]): GeoAiMapLayer[] {
  return registry.map(e => e.vector).filter((v): v is GeoAiMapLayer => Boolean(v))
}

export type GeoAiNlGisContext = {
  pinLngLat: [number, number] | null
  inspectLngLat?: [number, number] | null
}

export type GeoAiDataSource = 'map_layers' | 'gis_content' | 'hybrid' | 'general_knowledge'

type DomainTerm = {
  query: RegExp
  layerName: RegExp[]
}

const DOMAIN_TERMS: DomainTerm[] = [
  {
    query: /(?:آبار|الآبار|بئر|بئر|wells?|boreholes?)/iu,
    layerName: [/well/i, /borehole/i, /water/i, /آ/i, /abi/i],
  },
  {
    query: /(?:حقول|الحقول|حقل(?:\s+زراع)?|agricultural\s+fields?|farm\s+fields?|crop\s+fields?)/iu,
    layerName: [/field/i, /farm/i, /crop/i, /agri/i, /parcel/i, /plot/i, /structure/i],
  },
  {
    query: /(?:أراضي|الأراضي|اراض|أرض|lands?|parcels?|plots?)/iu,
    layerName: [/land/i, /parcel/i, /plot/i, /area/i, /zone/i, /polygon/i],
  },
  {
    query: /(?:المشروع|مشروع|project(?:\s+boundary|\s+area|\s+scope)?|site\s+boundary)/iu,
    layerName: [/project/i, /site/i, /boundary/i, /aoi/i, /scope/i, /limit/i],
  },
]

const TECHNICAL_FIELD_HIDE = /^shape|geometry|st_|globalid|objectid$|^fid$|^gid$/i

function mergedLayers(registry: GeoAiLayerRegistryEntry[], gisSaved: GeoAiMapLayer[]): GeoAiMapLayer[] {
  return [...registryToGeoAiMapLayers(registry), ...gisSaved]
}

/** Score how well a layer name matches domain keywords extracted from the query. */
export function resolveSemanticLayerHint(query: string, layers: GeoAiMapLayer[]): string | null {
  const explicit = extractGeoExplorerLayerHint(query, layers)
  if (explicit) return explicit

  let bestName: string | null = null
  let bestScore = 0

  for (const term of DOMAIN_TERMS) {
    if (!term.query.test(query)) continue
    for (const layer of layers) {
      const ln = layer.name
      let score = 0
      for (const kw of term.layerName) {
        if (kw.test(ln)) score += 10
      }
      const normLn = normalizeLayerName(ln)
      if (term.query.test(ln) || term.query.test(normLn)) score += 8
      if (score > bestScore) {
        bestScore = score
        bestName = ln
      }
    }
  }

  return bestScore >= 8 ? bestName : null
}

/** Pick data source: map layers → GIS content → hybrid LLM → general knowledge. */
export function resolveGeoAiDataSource(
  query: string,
  registry: GeoAiLayerRegistryEntry[],
  gisSaved: GeoAiMapLayer[],
): GeoAiDataSource {
  const layers = mergedLayers(registry, gisSaved)
  const hasMapVector = layers.some(l => {
    const g = l.geojson ?? l.data
    return g && typeof g === 'object' && (g as { features?: unknown[] }).features?.length
  })
  const hasGisContent = gisSaved.some(l => {
    const g = l.data
    return g && typeof g === 'object' && (g as { features?: unknown[] }).features?.length
  })

  const semantic = resolveSemanticLayerHint(query, layers)
  const gisIntent =
    semantic != null ||
    /(?:طبقة|layer|features?|records?|count|sum|total|within|buffer|intersect|select|query|spatial|عدد|مجموع|داخل|ضمن|مساحة|هكتار|أقرب|اقرب)/iu.test(
      query,
    )

  if (gisIntent && hasMapVector) return hasGisContent ? 'hybrid' : 'map_layers'
  if (gisIntent && hasGisContent) return 'gis_content'
  if (gisIntent) return 'hybrid'
  return 'general_knowledge'
}

function referenceLngLat(query: string, ctx: GeoAiNlGisContext): [number, number] | null {
  if (/(?:this\s+(?:location|site|point|place)|here|selected|pin|هذا\s+الموقع|هنا|الموقع\s+المحدد|هذه\s+النقطة)/iu.test(query)) {
    return ctx.inspectLngLat ?? ctx.pinLngLat
  }
  return ctx.inspectLngLat ?? ctx.pinLngLat
}

function fcFromLayer(layer: GeoAiMapLayer): GeoJSON.Feature[] {
  const g = layer.geojson ?? layer.data
  if (g && typeof g === 'object' && (g as GeoJSON.FeatureCollection).type === 'FeatureCollection') {
    return (g as GeoJSON.FeatureCollection).features ?? []
  }
  return []
}

function findAreaField(fields: string[]): string | null {
  const prio = [
    /^area_ha$/i,
    /^hectares?$/i,
    /^area_h$/i,
    /^shape_area$/i,
    /^st_area/i,
    /^area$/i,
    /area/i,
    /hectare/i,
    /مساحة/i,
  ]
  for (const p of prio) {
    const hit = fields.find(f => p.test(f))
    if (hit) return hit
  }
  return null
}

function toAreaHectares(value: number, fieldName: string): number {
  const fl = fieldName.toLowerCase()
  if (/ha|hectare/i.test(fl)) return value
  if (/shape_area|st_area|area_m|sqm|m2/i.test(fl) || value > 5000) return value / 10000
  return value
}

function parseSemanticAreaThreshold(query: string): number | null {
  const m =
    query.match(
      /(?:مساح[ةت]|area).*?(?:ت(?:زيد|تجاوز)|(?:أكبر|اكبر)\s+من|>|more\s+than|greater\s+than|over|exceeds?|above|عن)\s*(\d+(?:\.\d+)?)\s*(?:هكتار|hectares?|ha\b)/iu,
    ) ??
    query.match(
      /(?:lands?|parcels?|plots?|أراضي|اراض|fields?).*?(?:>|more\s+than|over|exceeds?|above|ت(?:زيد|تجاوز)|(?:أكبر|اكبر)\s+من)\s*(\d+(?:\.\d+)?)\s*(?:هكتار|hectares?|ha\b)/iu,
    )
  return m?.[1] != null ? Number(m[1]) : null
}

function isCountOnlyQuestion(query: string): boolean {
  return /^(?:how\s+many|count|what(?:'s|\s+is)\s+the\s+count|كم\s+(?:عدد|عدد\s+ال)|ما\s+عدد)/iu.test(
    query.trim(),
  )
}

function isNearestQuestion(query: string): boolean {
  return /(?:nearest|closest|أقرب|اقرب)/iu.test(query)
}

function pickContextColumns(fields: string[], query: string, max = 6): string[] {
  const q = query.toLowerCase()
  const scored = fields
    .filter(f => !TECHNICAL_FIELD_HIDE.test(f))
    .map(f => {
      const fl = f.toLowerCase()
      let score = 0
      if (q.includes(fl)) score += 20
      if (/name|code|id|type|status|area|well|farm|project/i.test(f)) score += 5
      return { f, score }
    })
    .sort((a, b) => b.score - a.score)
  return scored.slice(0, max).map(x => x.f)
}

function buildFeatureTable(
  rows: Array<{ layerName: string; clientLayerId?: string; featureIndex: number; properties: Record<string, unknown>; rawFeature: GeoJSON.Feature }>,
  fields: string[],
  title: string,
  query: string,
): GeoExplorerDataTablePayload {
  const cols = pickContextColumns(fields, query, 7)
  const columns: GeoExplorerDataTablePayload['columns'] = [
    { key: 'layer', label: 'Layer', align: 'left', defaultVisible: true },
    ...cols.map(f => ({ key: f, label: f, align: 'left' as const, defaultVisible: true })),
  ]
  const tableRows: GeoExplorerDataTableRow[] = rows.slice(0, 250).map(r => {
    const values: Record<string, string | number | null> = { layer: r.layerName }
    for (const c of cols) {
      const v = r.properties[c]
      values[c] = v == null ? null : typeof v === 'number' ? v : String(v).slice(0, 120)
    }
    const mapLink =
      r.clientLayerId && computeStableGisFeatureKey(r.rawFeature, r.featureIndex)
        ? {
            type: 'feature' as const,
            layerId: r.clientLayerId,
            featureKey: computeStableGisFeatureKey(r.rawFeature, r.featureIndex)!,
          }
        : undefined
    return { values, mapLink }
  })
  return {
    kind: 'query',
    title,
    columns,
    rows: tableRows,
    foot: { Summary: `${rows.length} feature(s)` },
  }
}

/** Rewrite bilingual GIS questions into patterns the stats engine understands. */
export function normalizeGeoAiGisQuery(query: string, layers: GeoAiMapLayer[]): string {
  let q = query.trim()
  if (!q) return q

  const showWithin = q.match(
    /(?:اعرض|أظهر|اظهر|حدد|select|show|display|list|find)\s+(?:ال)?(.+?)\s+(?:داخل|ضمن|within|inside|in)\s+(?:ال)?(.+?)[\?\.]?$/iu,
  )
  if (showWithin?.[1] && showWithin[2]) {
    const targetTerm = showWithin[1].trim()
    const maskTerm = showWithin[2].trim()
    const targetLayer = resolveSemanticLayerHint(targetTerm, layers) ?? targetTerm
    const maskLayer = resolveSemanticLayerHint(maskTerm, layers) ?? maskTerm
    return `from "${targetLayer}" within layer "${maskLayer}"`
  }

  const semanticLayer = resolveSemanticLayerHint(q, layers)
  if (semanticLayer && !extractGeoExplorerLayerHint(q, layers)) {
    if (/^(?:كم\s+عدد|ما\s+عدد|how\s+many|count)/iu.test(q)) {
      return `how many records in layer "${semanticLayer}"`
    }
    if (/^(?:اعرض|أظهر|اظهر|show|display|list|find|highlight)/iu.test(q)) {
      return `from "${semanticLayer}" ${q}`
    }
    const areaThreshold = parseSemanticAreaThreshold(q)
    if (areaThreshold != null) {
      return `from "${semanticLayer}" area > ${areaThreshold} hectares`
    }
  }

  return q
}

function tryNearestFeature(
  query: string,
  layers: GeoAiMapLayer[],
  ctx: GeoAiNlGisContext,
): GeoAiStatsResult | null {
  if (!isNearestQuestion(query)) return null
  const ref = referenceLngLat(query, ctx)
  if (!ref) {
    return {
      handled: true,
      reply:
        'Nearest-feature analysis needs a map reference point. Click the map to set a pin, identify a feature, or say “near the selected location”.',
    }
  }

  const hint = resolveSemanticLayerHint(query, layers) ?? extractGeoExplorerLayerHint(query, layers)
  let scoped = layers
  if (hint) {
    const hn = normalizeLayerName(hint)
    scoped = layers.filter(l => {
      const ln = normalizeLayerName(l.name)
      return ln === hn || ln.includes(hn) || hn.includes(ln)
    })
  }

  type Candidate = {
    layer: GeoAiMapLayer
    featureIndex: number
    feature: GeoJSON.Feature
    distM: number
    properties: Record<string, unknown>
  }
  const candidates: Candidate[] = []

  for (const layer of scoped) {
    const features = fcFromLayer(layer)
    features.forEach((f, featureIndex) => {
      const cen = geoAiFeatureCentroid(f)
      if (!cen) return
      const distM = haversineDistanceMeters(ref[0], ref[1], cen[0], cen[1])
      candidates.push({
        layer,
        featureIndex,
        feature: f,
        distM,
        properties: (f.properties ?? {}) as Record<string, unknown>,
      })
    })
  }

  if (!candidates.length) {
    return {
      handled: true,
      reply: hint
        ? `No point/ polygon features found on layer **${hint}** for nearest analysis.`
        : 'No vector features are loaded for nearest-feature analysis.',
    }
  }

  candidates.sort((a, b) => a.distM - b.distM)
  const best = candidates[0]!
  const distKm = best.distM / 1000
  const distLabel = distKm >= 1 ? `${distKm.toFixed(2)} km` : `${Math.round(best.distM)} m`
  const label =
    String(best.properties.Name ?? best.properties.name ?? best.properties.Well_ID ?? best.properties.id ?? '').trim() ||
    best.layer.name
  const layerId = best.layer.clientLayerId
  const featureKey = computeStableGisFeatureKey(best.feature, best.featureIndex)
  const fields = Object.keys(best.properties)
  const table = buildFeatureTable(
    [
      {
        layerName: best.layer.name,
        clientLayerId: layerId,
        featureIndex: best.featureIndex,
        properties: best.properties,
        rawFeature: best.feature,
      },
    ],
    fields,
    `Nearest: ${label}`,
    query,
  )

  return {
    handled: true,
    reply: `**Nearest feature:** **${label}** on layer **${best.layer.name}** — **${distLabel}** from the reference point.\n\nMap zoomed and highlighted. See info table below.`,
    table,
    mapFirstSync:
      layerId && featureKey ? { selections: [{ layerId, featureKey }] } : undefined,
  }
}

function trySemanticAreaFilter(
  query: string,
  layers: GeoAiMapLayer[],
): GeoAiStatsResult | null {
  const thresholdHa = parseSemanticAreaThreshold(query)
  if (thresholdHa == null) return null

  const hint = resolveSemanticLayerHint(query, layers) ?? extractGeoExplorerLayerHint(query, layers)
  let scoped = layers
  if (hint) {
    const hn = normalizeLayerName(hint)
    scoped = layers.filter(l => {
      const ln = normalizeLayerName(l.name)
      return ln === hn || ln.includes(hn) || hn.includes(ln)
    })
  }

  type Row = {
    layerName: string
    clientLayerId?: string
    featureIndex: number
    properties: Record<string, unknown>
    rawFeature: GeoJSON.Feature
    areaHa: number
  }
  const matched: Row[] = []
  const allFields = new Set<string>()

  for (const layer of scoped) {
    const features = fcFromLayer(layer)
    if (!features.length) continue
    const sampleFields = Object.keys((features[0]?.properties ?? {}) as Record<string, unknown>)
    const areaField = findAreaField(sampleFields)
    if (!areaField) continue

    features.forEach((f, featureIndex) => {
      const props = (f.properties ?? {}) as Record<string, unknown>
      const raw = props[areaField]
      const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(/,/g, ''))
      if (!Number.isFinite(n)) return
      const areaHa = toAreaHectares(n, areaField)
      if (areaHa <= thresholdHa) return
      matched.push({
        layerName: layer.name,
        clientLayerId: layer.clientLayerId,
        featureIndex,
        properties: props,
        rawFeature: f,
        areaHa,
      })
      for (const k of Object.keys(props)) allFields.add(k)
    })
  }

  if (!matched.length) {
    return {
      handled: true,
      reply: `No features exceed **${thresholdHa} ha** on the matched layer(s). Check that an area/hectare field exists or adjust the threshold.`,
    }
  }

  const selections = matched
    .map(r =>
      r.clientLayerId && computeStableGisFeatureKey(r.rawFeature, r.featureIndex)
        ? { layerId: r.clientLayerId, featureKey: computeStableGisFeatureKey(r.rawFeature, r.featureIndex)! }
        : null,
    )
    .filter((x): x is { layerId: string; featureKey: string } => x != null)

  const totalHa = matched.reduce((a, r) => a + r.areaHa, 0)
  const table = buildFeatureTable(matched, [...allFields], `Area > ${thresholdHa} ha`, query)
  table.columns.splice(1, 0, { key: '_area_ha', label: 'Area (ha)', align: 'right', defaultVisible: true })
  table.rows = table.rows.map((row, i) => ({
    ...row,
    values: { ...row.values, _area_ha: Math.round(matched[i]!.areaHa * 100) / 100 },
  }))

  return {
    handled: true,
    reply: `**${matched.length}** feature(s) with area **> ${thresholdHa} ha** (combined ≈ **${Math.round(totalHa)} ha**).\n\nResults highlighted on the map — sort, filter, or export from the table.`,
    table,
    mapFirstSync: selections.length ? { selections } : undefined,
  }
}

function tryTotalSelectedArea(query: string, layers: GeoAiMapLayer[]): GeoAiStatsResult | null {
  if (
    !/(?:إجمالي\s+مساحة|مجموع\s+المساحة|total\s+area|sum\s+of\s+area|combined\s+area|aggregate\s+area)/iu.test(
      query,
    )
  ) {
    return null
  }

  const hint = resolveSemanticLayerHint(query, layers) ?? extractGeoExplorerLayerHint(query, layers)
  let scoped = hint
    ? layers.filter(l => {
        const hn = normalizeLayerName(hint)
        const ln = normalizeLayerName(l.name)
        return ln === hn || ln.includes(hn) || hn.includes(ln)
      })
    : layers

  let totalHa = 0
  let count = 0
  for (const layer of scoped) {
    const features = fcFromLayer(layer)
    if (!features.length) continue
    const fields = Object.keys((features[0]?.properties ?? {}) as Record<string, unknown>)
    const areaField = findAreaField(fields)
    if (!areaField) continue
    for (const f of features) {
      const props = (f.properties ?? {}) as Record<string, unknown>
      const raw = props[areaField]
      const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(/,/g, ''))
      if (!Number.isFinite(n)) continue
      totalHa += toAreaHectares(n, areaField)
      count++
    }
  }

  if (!count) {
    return { handled: true, reply: 'No area field found on loaded layers for total area calculation.' }
  }

  return {
    handled: true,
    reply: `**Total area:** **${Math.round(totalHa * 100) / 100} ha** across **${count}** feature(s)${hint ? ` on **${hint}**` : ''}.`,
  }
}

function trySemanticCount(query: string, layers: GeoAiMapLayer[]): GeoAiStatsResult | null {
  if (!isCountOnlyQuestion(query)) return null
  const hint = resolveSemanticLayerHint(query, layers) ?? extractGeoExplorerLayerHint(query, layers)
  let scoped = layers
  if (hint) {
    const hn = normalizeLayerName(hint)
    scoped = layers.filter(l => {
      const ln = normalizeLayerName(l.name)
      return ln === hn || ln.includes(hn) || hn.includes(ln)
    })
  }
  let count = 0
  const layerNames: string[] = []
  for (const layer of scoped) {
    const n = fcFromLayer(layer).length
    if (n > 0) {
      count += n
      layerNames.push(layer.name)
    }
  }
  if (!count) {
    return {
      handled: true,
      reply: hint
        ? `No records found on layer **${hint}**.`
        : 'No loaded layer records are available to count.',
    }
  }
  return {
    handled: true,
    reply: `**${count}** record(s)${hint ? ` on **${hint}**` : layerNames.length === 1 ? ` on **${layerNames[0]}**` : ''}.`,
  }
}

/** Bilingual NL GIS commands — runs before generic stats / LLM. */
export function runGeoAiNlGisCommand(
  query: string,
  registry: GeoAiLayerRegistryEntry[],
  gisSaved: GeoAiMapLayer[],
  ctx: GeoAiNlGisContext = { pinLngLat: null },
): GeoAiStatsResult | null {
  const layers = mergedLayers(registry, gisSaved)

  const countResult = trySemanticCount(query, layers)
  if (countResult?.handled) return countResult

  const normalized = normalizeGeoAiGisQuery(query, layers)

  const nearest = tryNearestFeature(query, layers, ctx)
  if (nearest?.handled) return nearest

  const areaFilter = trySemanticAreaFilter(query, layers)
  if (areaFilter?.handled) return areaFilter

  const totalArea = tryTotalSelectedArea(query, layers)
  if (totalArea?.handled) return totalArea

  const stats = runGeoAiStatsCommand(normalized, layers)
  if (!stats?.handled) return null

  if (isCountOnlyQuestion(query) && stats.table && !stats.mapFirstSync) {
    return {
      ...stats,
      table: undefined,
    }
  }

  return stats
}
