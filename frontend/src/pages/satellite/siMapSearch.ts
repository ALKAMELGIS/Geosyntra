/** Unified map search hits — layer features + map layers + geocoded places. */

import { findAllLayerAttributeSearchMatches } from '../../lib/geoExplorerLayerContext'
import { satelliteCustomLayersToGeoAiLayers } from '../../lib/geoAiMapLayerSources'

export type SiMapSearchFeatureHit = {
  kind: 'feature'
  id: string
  title: string
  subtitle: string
  layerId: string
  layerName: string
  featureKey: string
  lng: number
  lat: number
  properties: Record<string, unknown> | null
}

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

export type SiMapSearchHit = SiMapSearchFeatureHit | SiMapSearchLayerHit | SiMapSearchPlaceHit

export type SiMapSearchCustomLayerLite = {
  id: string
  name: string
  source?: string
  sourceUrl?: string
  visible?: boolean
  geojson?: unknown
  arcgisLayerDefinition?: unknown
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

export function findMatchingLayerFeatures(
  customLayers: SiMapSearchCustomLayerLite[],
  query: string,
  limit = 8,
): SiMapSearchFeatureHit[] {
  const q = query.trim()
  if (!q) return []
  const layers = satelliteCustomLayersToGeoAiLayers(
    customLayers.filter(l => l.visible !== false),
  )
  if (!layers.length) return []
  const matches = findAllLayerAttributeSearchMatches(q, layers, { limit })
  return matches.map(m => ({
    kind: 'feature' as const,
    id: `feature:${m.layerId}:${m.featureKey}`,
    title: m.label,
    subtitle: `Feature · ${m.layerName}`,
    layerId: m.layerId,
    layerName: m.layerName,
    featureKey: m.featureKey,
    lng: m.lng,
    lat: m.lat,
    properties: m.properties,
  }))
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
  features: SiMapSearchFeatureHit[],
  layers: SiMapSearchLayerHit[],
  places: SiMapSearchPlaceHit[],
  maxTotal = 12,
): SiMapSearchHit[] {
  return [...features, ...layers, ...places].slice(0, maxTotal)
}

/** Parse "lat,lng" or "lat lng" queries (Google Maps–style coordinates). */
export function parseLatLngQuery(q: string): { lat: number; lng: number } | null {
  const trimmed = q.trim();
  const m = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return { lat: a, lng: b };
  if (Math.abs(b) <= 90 && Math.abs(a) <= 180) return { lat: b, lng: a };
  return null;
}
