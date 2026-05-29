export type AiExtentSource =
  | 'display'
  | 'drawn'
  | 'layer'
  | 'custom'
  | 'intersection'
  | 'union'

export type AiCellSizeMode = 'default' | 'min' | 'max' | 'value'

export type AiDetectionEnvironment = {
  extentSource: AiExtentSource
  extentLayerId: string
  customExtent: {
    top: number
    left: number
    right: number
    bottom: number
  }
  extentCrs: string
  parallelFactor: string
  cellSizeMode: AiCellSizeMode
  cellSizeValue: string
  maskLayerId: string
  tileSize: number
}

export const DEFAULT_AI_DETECTION_ENVIRONMENT: AiDetectionEnvironment = {
  extentSource: 'drawn',
  extentLayerId: '',
  customExtent: { top: 0, left: 0, right: 0, bottom: 0 },
  extentCrs: '',
  parallelFactor: '',
  cellSizeMode: 'default',
  cellSizeValue: '',
  maskLayerId: '',
  tileSize: 512,
}

const ENV_LS_KEY = 'geosyntra-ai-detection-environment-v1'

export function loadAiDetectionEnvironment(): AiDetectionEnvironment {
  try {
    const raw = localStorage.getItem(ENV_LS_KEY)
    if (!raw) return { ...DEFAULT_AI_DETECTION_ENVIRONMENT }
    return { ...DEFAULT_AI_DETECTION_ENVIRONMENT, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_AI_DETECTION_ENVIRONMENT }
  }
}

export function saveAiDetectionEnvironment(env: AiDetectionEnvironment): void {
  try {
    localStorage.setItem(ENV_LS_KEY, JSON.stringify(env))
  } catch {
    /* ignore */
  }
}

export type MapBounds = { west: number; south: number; east: number; north: number }

export function boundsToCustomExtent(b: MapBounds): AiDetectionEnvironment['customExtent'] {
  return {
    left: b.west,
    bottom: b.south,
    right: b.east,
    top: b.north,
  }
}

export function customExtentToBbox(
  ext: AiDetectionEnvironment['customExtent'],
): MapBounds | null {
  const { left, bottom, right, top } = ext
  if (![left, bottom, right, top].every(n => Number.isFinite(n))) return null
  if (right <= left || top <= bottom) return null
  return { west: left, south: bottom, east: right, north: top }
}

export function bboxToExtentFeature(
  b: MapBounds,
  name = 'Processing extent',
): GeoJSON.Feature<GeoJSON.Polygon> {
  return {
    type: 'Feature',
    properties: { name },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [b.west, b.south],
          [b.east, b.south],
          [b.east, b.north],
          [b.west, b.north],
          [b.west, b.south],
        ],
      ],
    },
  }
}

export type ResolveProcessingAoiInput = {
  environment: AiDetectionEnvironment
  drawnAoi: GeoJSON.GeoJSON | null
  getMapBounds: () => MapBounds | null
  /** Resolve extent from a selected imagery / vector layer id (`layer:…`, `wms:…`, etc.). */
  getLayerBounds?: (layerId: string) => MapBounds | null
}

export function resolveAoiGeometry(aoi: GeoJSON.GeoJSON | null): GeoJSON.Geometry | null {
  if (!aoi) return null
  if (aoi.type === 'Feature') return aoi.geometry
  if (aoi.type === 'FeatureCollection') {
    const g = aoi.features[0]?.geometry
    return g ?? null
  }
  if (
    aoi.type === 'Polygon' ||
    aoi.type === 'MultiPolygon' ||
    aoi.type === 'Point' ||
    aoi.type === 'LineString' ||
    aoi.type === 'MultiPoint' ||
    aoi.type === 'MultiLineString' ||
    aoi.type === 'GeometryCollection'
  ) {
    return aoi
  }
  return null
}

export function resolveProcessingAoiGeometry(input: ResolveProcessingAoiInput): GeoJSON.Geometry | null {
  const { environment, drawnAoi, getMapBounds, getLayerBounds } = input
  const drawn = resolveAoiGeometry(drawnAoi)

  if (environment.extentSource === 'layer' && environment.extentLayerId) {
    const b = getLayerBounds?.(environment.extentLayerId) ?? null
    if (b) return bboxToExtentFeature(b, 'Layer extent').geometry
    return drawn
  }

  if (environment.extentSource === 'custom') {
    const b = customExtentToBbox(environment.customExtent)
    return b ? bboxToExtentFeature(b).geometry : drawn
  }
  if (environment.extentSource === 'display') {
    const b = getMapBounds() ?? customExtentToBbox(environment.customExtent)
    return b ? bboxToExtentFeature(b).geometry : drawn
  }
  if (environment.extentSource === 'union') {
    const b = getMapBounds()
    if (drawn) return drawn
    return b ? bboxToExtentFeature(b).geometry : null
  }
  if (environment.extentSource === 'intersection') {
    const b = getMapBounds()
    if (drawn && b) return drawn
    return drawn ?? (b ? bboxToExtentFeature(b).geometry : null)
  }
  return drawn
}

export function resolveCellSizeMeters(env: AiDetectionEnvironment): number | null {
  if (env.cellSizeMode === 'default') return null
  if (env.cellSizeMode === 'value') {
    const n = Number(env.cellSizeValue)
    return Number.isFinite(n) && n > 0 ? n : null
  }
  return null
}
