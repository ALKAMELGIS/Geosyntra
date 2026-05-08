import type { GeoExplorerMapLink } from './geoExplorerGemini'
import { geoAiFeatureCentroid } from './geoExplorerLayerContext'
import { computeStableGisFeatureKey } from './gisFeatureStableKey'

export type GeoAiCustomLayerLike = { id: string; geojson?: { type?: string; features?: unknown[] } }

/** Satellite / lightweight surfaces: resolve GIS-style feature link to WGS84 centroid from in-memory GeoJSON. */
export function lngLatFromGeoAiFeatureLink(
  link: Extract<GeoExplorerMapLink, { type: 'feature' }>,
  layers: GeoAiCustomLayerLike[],
): [number, number] | null {
  const layer = layers.find(l => String(l.id) === link.layerId)
  const feats = layer?.geojson?.features
  if (!Array.isArray(feats) || !feats.length) return null
  for (let i = 0; i < feats.length; i++) {
    const f = feats[i] as { properties?: Record<string, unknown>; geometry?: unknown; id?: unknown }
    if (computeStableGisFeatureKey(f, i) !== link.featureKey) continue
    const c = geoAiFeatureCentroid(f)
    if (c) return c
  }
  return null
}
