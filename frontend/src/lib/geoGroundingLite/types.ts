/** Geo Explor AI Agent — Grounding Lite MCP tool surface (client types). */

export type GeoGroundingToolId =
  | 'geocode'
  | 'places_text_search'
  | 'compute_route'
  | 'elevation'

export type GeoGroundingPlace = {
  id?: string
  name?: string
  address?: string
  lat?: number
  lng?: number
  types?: string[]
  rating?: number
  mapsUri?: string
}

export type GeoGroundingGeocodeResult = {
  label?: string
  lat?: number
  lng?: number
  placeId?: string
  types?: string[]
}

export type GeoGroundingRouteResult = {
  distanceMeters?: number
  durationSeconds?: number
  duration?: string
  distance?: string
  polyline?: string
  geometry?: { type: 'LineString'; coordinates: number[][] }
  label?: string
}

export type GeoDatasetAoiSnapshot = {
  label?: string
  bbox?: [number, number, number, number]
  areaHa?: number
  ndviMean?: number
  ndviMin?: number
  ndviMax?: number
  timelineLabel?: string
  layerId?: string
}

export type GeoDatasetEngineInput = {
  userText: string
  pinLngLat?: [number, number] | null
  aoi?: GeoDatasetAoiSnapshot | null
  satelliteLayerSummary?: string
}

export type GeoGroundingPrefetchResult = {
  configured: boolean
  toolsUsed: GeoGroundingToolId[]
  contextBlock: string
  suggestedChips: string[]
  primaryCoords: [number, number] | null
  places: GeoGroundingPlace[]
  routePolyline?: string
}
