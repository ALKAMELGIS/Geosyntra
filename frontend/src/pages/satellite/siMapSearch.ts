/** Unified map search hits — map layers + geocoded places (UI unchanged). */

export type SiMapSearchLayerHit = {
  kind: 'layer'
  id: string
  title: string
  subtitle: string
  layerKind: 'custom' | 'wms'
  layerId: string
  wmsLayerName?: string
}

export type SiMapSearchPlaceHit = {
  kind: 'place'
  id: string
  title: string
  subtitle: string
  feature: Record<string, unknown>
}

export type SiMapSearchHit = SiMapSearchLayerHit | SiMapSearchPlaceHit

export type SiMapSearchCustomLayerLite = {
  id: string
  name: string
  source?: string
  sourceUrl?: string
  visible?: boolean
}

export type SiMapSearchWmsLayerLite = {
  name: string
  title: string
}

function norm(s: unknown): string {
  return String(s ?? '')
    .trim()
    .toLowerCase()
}

function matchesQuery(haystack: string, q: string): boolean {
  const h = norm(haystack)
  const needle = norm(q)
  if (!needle || !h) return false
  return h.includes(needle)
}

export function findMatchingCustomLayers(
  layers: SiMapSearchCustomLayerLite[],
  query: string,
  limit = 6,
): SiMapSearchLayerHit[] {
  const q = query.trim()
  if (!q) return []
  const out: SiMapSearchLayerHit[] = []
  for (const layer of layers) {
    const name = String(layer.name || '').trim()
    const id = String(layer.id || '').trim()
    const url = String(layer.sourceUrl || '').trim()
    if (!matchesQuery(name, q) && !matchesQuery(id, q) && !matchesQuery(url, q)) continue
    const sourceLabel = layer.source ? String(layer.source).toUpperCase() : 'LAYER'
    out.push({
      kind: 'layer',
      id: `custom:${id}`,
      title: name || id,
      subtitle: `Layer · ${sourceLabel}${layer.visible === false ? ' · hidden' : ''}`,
      layerKind: 'custom',
      layerId: id,
    })
    if (out.length >= limit) break
  }
  return out
}

export function findMatchingWmsLayers(
  layers: SiMapSearchWmsLayerLite[],
  query: string,
  limit = 4,
): SiMapSearchLayerHit[] {
  const q = query.trim()
  if (!q) return []
  const out: SiMapSearchLayerHit[] = []
  for (const layer of layers) {
    const name = String(layer.name || '').trim()
    const title = String(layer.title || '').trim()
    if (!matchesQuery(name, q) && !matchesQuery(title, q)) continue
    out.push({
      kind: 'layer',
      id: `wms:${name}`,
      title: title || name,
      subtitle: 'Layer · WMS imagery',
      layerKind: 'wms',
      layerId: name,
      wmsLayerName: name,
    })
    if (out.length >= limit) break
  }
  return out
}

export function findMatchingMapLayers(
  customLayers: SiMapSearchCustomLayerLite[],
  wmsLayers: SiMapSearchWmsLayerLite[],
  query: string,
): SiMapSearchLayerHit[] {
  return [...findMatchingCustomLayers(customLayers, query), ...findMatchingWmsLayers(wmsLayers, query)]
}

export function mapGeocodeFeaturesToPlaceHits(features: unknown[]): SiMapSearchPlaceHit[] {
  const out: SiMapSearchPlaceHit[] = []
  for (const raw of features) {
    if (!raw || typeof raw !== 'object') continue
    const feature = raw as Record<string, unknown>
    const props = (feature.properties && typeof feature.properties === 'object'
      ? feature.properties
      : {}) as Record<string, unknown>
    const title = String(
      feature.text || props.name || props.display_name || feature.place_name || 'Result',
    ).trim()
    const placeName = typeof feature.place_name === 'string' ? feature.place_name : ''
    const subtitle = placeName
      ? placeName.replace(String(feature.text || '') + ', ', '').trim() || 'Place'
      : props.display_name && String(props.display_name) !== title
        ? String(props.display_name)
        : 'Place'
    const key = String(
      feature.id || props.place_id || props.osm_id || `${title}-${String(feature.geometry || '')}`,
    )
    out.push({
      kind: 'place',
      id: `place:${key}`,
      title,
      subtitle: String(subtitle),
      feature,
    })
  }
  return out
}

export function mergeMapSearchHits(
  layers: SiMapSearchLayerHit[],
  places: SiMapSearchPlaceHit[],
  maxTotal = 12,
): SiMapSearchHit[] {
  return [...layers, ...places].slice(0, maxTotal)
}
