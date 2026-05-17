export type GeoExplorerGeminiPinSource = 'map_query' | 'layer' | 'geocode'

export function geoExplorerTargetZoomForPinSource(pinSource: GeoExplorerGeminiPinSource): number {
  if (pinSource === 'layer') return 17
  if (pinSource === 'map_query') return 15.75
  return 13.65
}
