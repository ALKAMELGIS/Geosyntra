/**
 * Resolve map pin coordinates from model reply + user text + vector layers (Claude / DeepSeek Geo AI, etc.).
 * Mirrors the coordinate preference rules in runGeoExplorerGeminiTurn (layer hint vs MAP_QUERY).
 */

import { parseMapQueryLngLat } from './geoExplorerGemini'
import {
  extractGeoExplorerLayerHint,
  findLngLatFromLayerQuery,
  type GeoAiMapLayer,
  type LayerQueryMatch,
} from './geoExplorerLayerContext'

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371
  const dLat = ((b[1] - a[1]) * Math.PI) / 180
  const dLng = ((b[0] - a[0]) * Math.PI) / 180
  const lat1 = (a[1] * Math.PI) / 180
  const lat2 = (b[1] * Math.PI) / 180
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

export type GeoAiResolvedPin = {
  coords: [number, number]
  layerHit: LayerQueryMatch | null
  pinSource: 'map_query' | 'layer'
}

export function resolveGeoAiPinFromUserTextAndReply(
  userText: string,
  reply: string,
  combinedLayers: GeoAiMapLayer[],
): GeoAiResolvedPin | null {
  const mapQueryCoords = parseMapQueryLngLat(reply)
  const trimmed = userText.trim()
  const layerHit: LayerQueryMatch | null =
    trimmed.length > 0 ? findLngLatFromLayerQuery(trimmed, combinedLayers) : null

  const layerHintTrim = (trimmed ? extractGeoExplorerLayerHint(trimmed) : null)?.trim() ?? ''
  const preferLayerCoords =
    Boolean(layerHit) &&
    (Boolean(layerHintTrim) ||
      Boolean(
        mapQueryCoords &&
          layerHit &&
          haversineKm(mapQueryCoords, [layerHit.lng, layerHit.lat]) > 2 &&
          layerHit.score >= 22,
      ))

  if (preferLayerCoords && layerHit) {
    return { coords: [layerHit.lng, layerHit.lat], layerHit, pinSource: 'layer' }
  }
  if (mapQueryCoords) {
    return { coords: mapQueryCoords, layerHit, pinSource: 'map_query' }
  }
  if (layerHit) {
    return { coords: [layerHit.lng, layerHit.lat], layerHit, pinSource: 'layer' }
  }
  return null
}
