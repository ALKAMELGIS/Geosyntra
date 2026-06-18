export type GeoExplorerGeminiPinSource = 'map_query' | 'layer' | 'geocode' | 'grounding'

export function geoExplorerTargetZoomForPinSource(pinSource: GeoExplorerGeminiPinSource): number {
  if (pinSource === 'layer') return 17
  if (pinSource === 'map_query') return 15.75
  if (pinSource === 'grounding') return 14.5
  return 13.65
}
