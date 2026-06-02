/**
 * Geo AI Layer Intelligence — unified registry, statistics, relationships,
 * and early natural-language layer commands for Satellite Intelligence.
 */

import type { ArcgisLayerDefLite } from './arcgisAttributeDisplay'
import type { GeoExplorerDataTablePayload } from './geoExplorerContracts'
import {
  extractGeoExplorerLayerHint,
  findLayerFeatureByUserQuery,
  findLngLatFromLayerQuery,
  geoAiFeatureCentroid,
  normalizeLayerName,
  pickGeoAiHumanPlaceFields,
  summarizeGeoAiMapLayer,
  type GeoAiMapLayer,
  type LayerQueryMatch,
} from './geoExplorerLayerContext'
import { listSiBimModels, summarizeSiBimModelForGeoAi } from '../pages/satellite/utils/siIfcBimModelStore'
import { runGeoAiStatsCommand, type GeoAiStatsResult } from './geoAiStatsEngine'
import { computeStableGisFeatureKey } from './gisFeatureStableKey'

export type GeoAiLayerKind = 'vector' | 'raster' | 'imagery' | 'wms' | 'bim' | 'empty'

export type GeoAiLayerRegistryEntry = {
  clientLayerId: string
  name: string
  kind: GeoAiLayerKind
  visible: boolean
  source?: string
  format?: string
  featureCount: number
  fields: string[]
  extent?: string
  loadStatus?: string
  statsSnippet?: string
  vector?: GeoAiMapLayer
}

export type SatelliteCustomLayerLite = {
  id: string
  name: string
  visible: boolean
  geojson?: unknown
  source?: string
  sourceUrl?: string
  arcgisLayerDefinition?: ArcgisLayerDefLite | null
  renderMode?: 'vector' | 'raster' | 'bim'
  bimModelId?: string
  bimDiscipline?: string
  bimCategory?: string
  raster?: { url: string }
  importMetadata?: { format?: string; crs?: string; bytes?: number }
  extentBounds?: [number, number, number, number] | null
  loadStatus?: string
}

export type WmsLayerLite = { name: string; title: string }

function fcFromGeoAiLayer(l: GeoAiMapLayer): { features: Array<{ properties?: Record<string, unknown>; geometry?: unknown }> } | null {
  const g = l.geojson
  if (g?.type === 'FeatureCollection' && Array.isArray(g.features)) return { features: g.features }
  const d = l.data as { type?: string; features?: unknown[] } | undefined
  if (d?.type === 'FeatureCollection' && Array.isArray(d.features)) {
    return { features: d.features as Array<{ properties?: Record<string, unknown>; geometry?: unknown }> }
  }
  return null
}

function inferLayerKind(l: SatelliteCustomLayerLite): GeoAiLayerKind {
  if (l.renderMode === 'bim' || l.bimModelId) return 'bim'
  if (l.renderMode === 'raster' || l.raster?.url) {
    const fmt = l.importMetadata?.format?.toLowerCase() ?? ''
    if (fmt.includes('tif') || fmt.includes('cog') || fmt.includes('geotiff')) return 'imagery'
    return 'raster'
  }
  const g = l.geojson as { features?: unknown[] } | null | undefined
  if (Array.isArray(g?.features) && g.features.length > 0) return 'vector'
  if (l.loadStatus === 'empty' || l.loadStatus === 'loading') return 'empty'
  return 'vector'
}

function formatExtent(b?: [number, number, number, number] | null): string | undefined {
  if (!b || b.length !== 4) return undefined
  return `[${b.map(n => n.toFixed(4)).join(', ')}]`
}

function propertyKeysFromFeatures(features: Array<{ properties?: Record<string, unknown> }>, cap = 48): string[] {
  const keys = new Set<string>()
  for (const f of features.slice(0, 100)) {
    const p = f.properties
    if (p && typeof p === 'object') {
      for (const k of Object.keys(p)) {
        keys.add(k)
        if (keys.size >= cap) break
      }
    }
    if (keys.size >= cap) break
  }
  return [...keys]
}

function computeFieldStatsSnippet(
  features: Array<{ properties?: Record<string, unknown> }>,
  fields: string[],
  maxFields = 8,
): string {
  const parts: string[] = []
  let counted = 0
  for (const field of fields) {
    if (counted >= maxFields) break
    if (/^shape|geometry|st_/i.test(field)) continue
    const nums: number[] = []
    const cats = new Map<string, number>()
    for (const f of features) {
      const v = f.properties?.[field]
      if (v == null || v === '') continue
      const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''))
      if (Number.isFinite(n) && String(v).trim() !== '') nums.push(n)
      else {
        const s = String(v).trim().slice(0, 40)
        if (s) cats.set(s, (cats.get(s) ?? 0) + 1)
      }
    }
    if (nums.length >= 3) {
      const min = Math.min(...nums)
      const max = Math.max(...nums)
      const avg = nums.reduce((a, b) => a + b, 0) / nums.length
      parts.push(`${field}: n=${nums.length} min=${min.toFixed(2)} max=${max.toFixed(2)} avg=${avg.toFixed(2)}`)
      counted++
    } else if (cats.size >= 2) {
      const top = [...cats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
      parts.push(`${field}: ${cats.size} classes (top: ${top.map(([k, c]) => `${k}=${c}`).join(', ')})`)
      counted++
    }
  }
  return parts.join(' | ')
}

export function detectLayerRelationships(entries: GeoAiLayerRegistryEntry[]): string[] {
  const hints: string[] = []
  const vectors = entries.filter(e => e.kind === 'vector' && e.fields.length)
  for (let i = 0; i < vectors.length; i++) {
    for (let j = i + 1; j < vectors.length; j++) {
      const a = vectors[i]!
      const b = vectors[j]!
      const shared = a.fields.filter(f => b.fields.some(g => g.toLowerCase() === f.toLowerCase()))
      const joinCandidates = shared.filter(f => /objectid|fid|(^|_)id$|code|name|farm|parcel|plot|site|globalid/i.test(f))
      if (joinCandidates.length) {
        hints.push(`- ${a.name} ↔ ${b.name}: shared [${joinCandidates.slice(0, 6).join(', ')}]`)
      }
    }
  }
  return hints.slice(0, 12)
}

export function buildGeoAiLayerRegistry(
  customLayers: SatelliteCustomLayerLite[],
  wmsLayers: WmsLayerLite[] = [],
  activeWmsLayer?: string,
): GeoAiLayerRegistryEntry[] {
  const entries: GeoAiLayerRegistryEntry[] = []
  for (const l of customLayers) {
    const kind = inferLayerKind(l)
    const g = l.geojson as { type?: string; features?: Array<{ properties?: Record<string, unknown> }> } | null
    const features = kind === 'vector' && g?.features ? g.features : []
    const fields = features.length ? propertyKeysFromFeatures(features) : []
    const statsSnippet = features.length ? computeFieldStatsSnippet(features, fields) : undefined
    const vector: GeoAiMapLayer | undefined =
      features.length > 0
        ? {
            name: l.name,
            clientLayerId: l.id,
            visible: l.visible,
            source: l.source,
            geojson: g as GeoAiMapLayer['geojson'],
            data: g as GeoAiMapLayer['data'],
            arcgisLayerDefinition: l.arcgisLayerDefinition ?? null,
          }
        : undefined
    entries.push({
      clientLayerId: l.id,
      name: l.name,
      kind,
      visible: l.visible,
      source: l.source,
      format:
        l.importMetadata?.format ??
        (kind === 'bim'
          ? 'IFC/BIM'
          : kind === 'raster' || kind === 'imagery'
            ? 'GeoTIFF/raster'
            : l.source === 'arcgis'
              ? 'Feature Layer'
              : l.source),
      featureCount: features.length,
      fields,
      extent: formatExtent(l.extentBounds),
      loadStatus: l.loadStatus,
      statsSnippet,
      vector,
    })
  }
  for (const w of wmsLayers) {
    entries.push({
      clientLayerId: `wms:${w.name}`,
      name: w.title || w.name,
      kind: 'wms',
      visible: activeWmsLayer === w.name,
      source: 'wms',
      format: 'WMS/WMTS imagery tile',
      featureCount: 0,
      fields: [],
    })
  }
  return entries
}

export function summarizeGeoAiLayerRegistry(registry: GeoAiLayerRegistryEntry[], maxChars = 32000): string {
  if (!registry.length) return '(No layers loaded on this map session.)'
  const lines: string[] = []
  lines.push(`Total loaded layers: ${registry.length}`)
  const byKind = registry.reduce(
    (acc, e) => {
      acc[e.kind] = (acc[e.kind] ?? 0) + 1
      return acc
    },
    {} as Record<string, number>,
  )
  lines.push(`By type: ${Object.entries(byKind).map(([k, v]) => `${k}=${v}`).join(', ')}`)
  lines.push('')
  for (const e of registry) {
    if ((e.kind === 'vector' || e.kind === 'bim') && e.vector) {
      lines.push(summarizeGeoAiMapLayer(e.vector))
      if (e.statsSnippet) lines.push(`  Field statistics: ${e.statsSnippet}`)
      if (e.kind === 'bim') lines.push('  (IFC/BIM category layer — query Name, Type, Category, Storey, GlobalId, and flattened IFC properties.)')
    } else {
      const vis = e.visible ? 'visible' : 'hidden'
      lines.push(
        `- ${e.name} (kind=${e.kind}, ${vis}, source=${e.source ?? 'n/a'}, format=${e.format ?? 'n/a'}${e.extent ? `, extent=${e.extent}` : ''}${e.loadStatus ? `, status=${e.loadStatus}` : ''}) — imagery/raster overlay; attribute queries apply to vector layers with loaded features.`,
      )
    }
  }
  const rel = detectLayerRelationships(registry)
  if (rel.length) {
    lines.push('')
    lines.push('### Layer relationships (potential join keys)')
    lines.push(...rel)
  }
  const bimModels = listSiBimModels()
  if (bimModels.length) {
    lines.push('')
    lines.push('### IFC / BIM models (GeoSyntra AI)')
    for (const m of bimModels) {
      const s = summarizeSiBimModelForGeoAi(m.modelId)
      if (s) lines.push(s)
    }
  }
  let out = lines.join('\n')
  if (out.length > maxChars) out = `${out.slice(0, maxChars)}\n[…registry truncated…]`
  return out
}

export function registryToGeoAiMapLayers(registry: GeoAiLayerRegistryEntry[]): GeoAiMapLayer[] {
  return registry.map(e => e.vector).filter((v): v is GeoAiMapLayer => Boolean(v))
}

function featureKeyForHit(layer: GeoAiMapLayer, hit: LayerQueryMatch): string | null {
  const fc = fcFromGeoAiLayer(layer)
  if (!fc?.features?.length) return null
  for (let i = 0; i < fc.features.length; i++) {
    const f = fc.features[i]!
    const p = f.properties
    if (hit.properties && p && typeof p === 'object') {
      const keys = Object.keys(hit.properties)
      if (keys.length && keys.every(k => JSON.stringify(p[k]) === JSON.stringify(hit.properties![k]))) {
        return computeStableGisFeatureKey(f, i)
      }
    }
    const c = geoAiFeatureCentroid(f as { geometry?: { type?: string; coordinates?: unknown } })
    if (c && Math.abs(c[0] - hit.lng) < 1e-5 && Math.abs(c[1] - hit.lat) < 1e-5) {
      return computeStableGisFeatureKey(f, i)
    }
  }
  return null
}

function registryEntriesMatchingHint(registry: GeoAiLayerRegistryEntry[], hint: string): GeoAiLayerRegistryEntry[] {
  const hn = normalizeLayerName(hint)
  return registry.filter(e => {
    const ln = normalizeLayerName(e.name)
    return ln === hn || ln.includes(hn) || hn.includes(ln)
  })
}

/** Show a specific feature on the map from natural language (layer + id/code). */
export function tryGeoAiLayerBrowseCommand(
  query: string,
  registry: GeoAiLayerRegistryEntry[],
): GeoAiStatsResult | null {
  const q = query.trim()
  if (!q) return null
  const layers = registryToGeoAiMapLayers(registry)
  if (!layers.length) return null

  const layerHint = extractGeoExplorerLayerHint(q, layers)
  const looksLikeLayerQuery =
    Boolean(layerHint) ||
    /\b(?:from|in|on)\s+[\w.-]+\s+layer\b/i.test(q) ||
    /\blayer\s+[\w.-]+\b/i.test(q) ||
    (/\b(show|find|locate|display|highlight|where\s+is|search\s+for)\b/i.test(q) &&
      /\b[A-Za-z]{1,5}\d{2,}[A-Za-z0-9_-]*/.test(q))

  if (!looksLikeLayerQuery) return null

  const hit =
    findLayerFeatureByUserQuery(q, layers, layerHint) ?? findLngLatFromLayerQuery(q, layers)
  if (!hit || hit.score < 32) return null

  const layerEntry = registry.find(e => e.name === hit.layerName)
  const layerId = layerEntry?.clientLayerId ?? layers.find(l => l.name === hit.layerName)?.clientLayerId
  if (!layerId) return null

  const layer = layers.find(l => l.clientLayerId === layerId)
  const featureKey = layer ? featureKeyForHit(layer, hit) : null
  const place = pickGeoAiHumanPlaceFields(hit.properties ?? {})
  const label =
    place.areaName?.trim() ||
    String(hit.properties?.Name ?? hit.properties?.name ?? hit.properties?.Farm_Code ?? '').trim() ||
    hit.layerName

  const coords = `${hit.lat.toFixed(4)}°, ${hit.lng.toFixed(4)}°`
  const countrySuffix =
    place.country && !/^\d+$/.test(String(place.country).trim()) ? `, ${place.country}` : ''

  return {
    handled: true,
    reply: `**Map:** Showing **${label}**${countrySuffix ? ` — ${countrySuffix.trim().replace(/^,\s*/, '')}` : ''} (${coords}) from layer **${hit.layerName}**.\n\nThe map is centered on this feature. Ask about its attributes, generate statistics, open the attribute table, or draw an AOI for satellite analysis.`,
    mapFirstSync: featureKey ? { selections: [{ layerId, featureKey }] } : undefined,
  }
}

/** Layer catalog / describe / field list without LLM. */
export function tryGeoAiLayerIntelCommand(
  query: string,
  registry: GeoAiLayerRegistryEntry[],
): GeoAiStatsResult | null {
  const q = query.trim()
  if (!q) return null
  const layers = registryToGeoAiMapLayers(registry)

  if (
    /\b(list|show|what\s+are)\s+(?:all\s+)?(?:the\s+)?layers\b/i.test(q) ||
    /\bloaded\s+layers\b/i.test(q) ||
    /(?:ما|اذكر|اعرض)\s+(?:ال)?طبقات/i.test(q)
  ) {
    const lines = registry.map(
      e =>
        `- **${e.name}** (${e.kind}, ${e.featureCount} features, ${e.visible ? 'visible' : 'hidden'}${e.format ? `, ${e.format}` : ''})`,
    )
    return {
      handled: true,
      reply: `**Loaded map layers (${registry.length}):**\n${lines.join('\n')}\n\nAsk about fields, counts, statistics, or search for a specific record in any vector layer.`,
    }
  }

  const hint = extractGeoExplorerLayerHint(q, layers)
  const scoped = hint ? registryEntriesMatchingHint(registry, hint) : registry.filter(e => e.kind === 'vector')

  if (/\bhow\s+many\s+(?:features?|records?|rows?)\b/i.test(q) || /\b(?:عدد|كم)\s+(?:عنصر|ميزة|سجل)/i.test(q)) {
    if (!scoped.length) {
      return { handled: true, reply: 'No matching layer found for that count question.' }
    }
    if (scoped.length === 1) {
      const e = scoped[0]!
      return {
        handled: true,
        reply: `Layer **${e.name}** has **${e.featureCount}** loaded feature(s) (${e.kind}, ${e.visible ? 'visible' : 'hidden'}).`,
      }
    }
    const lines = scoped.map(e => `- **${e.name}**: ${e.featureCount}`)
    return { handled: true, reply: `Feature counts:\n${lines.join('\n')}` }
  }

  if (
    /\b(?:what|which)\s+fields?\b/i.test(q) ||
    /\bfield\s+names?\b/i.test(q) ||
    /\battributes?\s+(?:in|of|for)\b/i.test(q) ||
    /(?:حقول|سمات)\s+(?:طبقة|layer)/i.test(q)
  ) {
    const targets = scoped.filter(e => e.fields.length)
    if (!targets.length) {
      return { handled: true, reply: 'No attribute fields found on the matching layer(s). Raster/WMS layers do not expose feature attributes in memory.' }
    }
    const e = targets[0]!
    return {
      handled: true,
      reply: `Layer **${e.name}** fields (${e.fields.length}): ${e.fields.join(', ')}`,
    }
  }

  if (
    (/\b(summarize|summary|describe|overview|statistics|stats|report|analyze|analysis)\b/i.test(q) ||
      /\b(distribution|breakdown|histogram)\b/i.test(q)) &&
    (hint || scoped.length === 1)
  ) {
    const e = scoped.find(x => x.kind === 'vector' && x.featureCount > 0)
    if (!e?.vector) {
      return { handled: true, reply: 'No vector features loaded for an analytical summary on that layer.' }
    }
    const fc = fcFromGeoAiLayer(e.vector)
    if (!fc?.features.length) return null

    const groupField =
      q.match(/\b(?:by|group\s+by|per)\s+([A-Za-z_][A-Za-z0-9_]*)\b/i)?.[1] ??
      e.fields.find(f => /type|class|category|crop|status|name|code/i.test(f) && !/^objectid$|^fid$/i.test(f))

    if (groupField && e.fields.some(f => f.toLowerCase() === groupField.toLowerCase())) {
      const gb = e.fields.find(f => f.toLowerCase() === groupField.toLowerCase())!
      const buckets = new Map<string, number>()
      for (const f of fc.features) {
        const v = f.properties?.[gb]
        const k = v == null || v === '' ? 'NULL' : String(v).trim().slice(0, 64)
        buckets.set(k, (buckets.get(k) ?? 0) + 1)
      }
      const sorted = [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 48)
      const table: GeoExplorerDataTablePayload = {
        kind: 'groupBy',
        title: `${e.name} — ${gb} distribution`,
        columns: [
          { key: gb, label: gb, align: 'left' },
          { key: 'count', label: 'Count', align: 'right' },
        ],
        rows: sorted.map(([value, count]) => ({ values: { [gb]: value, count } })),
        foot: { Summary: `${e.featureCount} features · ${buckets.size} groups` },
        showChartByDefault: true,
      }
      return {
        handled: true,
        reply: `**Layer report — ${e.name}**\n- Features: **${e.featureCount}**\n- Fields: ${e.fields.length}\n${e.statsSnippet ? `- Quick stats: ${e.statsSnippet}\n` : ''}- Distribution by **${gb}** (${buckets.size} groups). Chart and table below.`,
        table,
      }
    }

    return {
      handled: true,
      reply: `**Layer report — ${e.name}**\n- Features: **${e.featureCount}**\n- Fields (${e.fields.length}): ${e.fields.slice(0, 24).join(', ')}${e.fields.length > 24 ? '…' : ''}\n${e.statsSnippet ? `- Field statistics: ${e.statsSnippet}` : ''}\n\nAsk for \`group by <field>\`, \`count\`, \`sum\`, or \`WHERE field = value\` for deeper analysis.`,
    }
  }

  return null
}

/** Local layer pipeline: browse → intel → stats (no LLM). */
export function runGeoAiLayerCommandPipeline(
  query: string,
  registry: GeoAiLayerRegistryEntry[],
  gisSavedLayers: GeoAiMapLayer[] = [],
): GeoAiStatsResult | null {
  const browse = tryGeoAiLayerBrowseCommand(query, registry)
  if (browse?.handled) return browse
  const intel = tryGeoAiLayerIntelCommand(query, registry)
  if (intel?.handled) return intel
  const merged = [...registryToGeoAiMapLayers(registry), ...gisSavedLayers]
  return runGeoAiStatsCommand(query, merged)
}
