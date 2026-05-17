/**
 * GIS layer + symbology types shared by Satellite, GIS Map, and lib stores.
 * Kept free of React/components so `lib/*` never imports `LayerManager.tsx` (avoids chunk init cycles).
 */

export type SymbologyStyle =
  | 'single'
  | 'unique'
  | 'color'
  | 'size'
  | 'color_size'
  | 'dot_density'
  | 'threshold_markers'

export type SymbologyClassMethod =
  | 'jenks'
  | 'quantile'
  | 'equal_interval'
  | 'standard_deviation'
  | 'manual'

export type SymbologyColorRamp =
  | 'viridis'
  | 'blues'
  | 'greens'
  | 'plasma'
  | 'magma'
  | 'turbo'
  | 'inferno'
  | 'cividis'
  | 'spectral'
  | 'earth'
  | 'gray'

export interface SymbologyConfig {
  useArcGisOnline?: boolean
  style?: SymbologyStyle
  field?: string
  classes?: number
  method?: SymbologyClassMethod
  colorRamp?: SymbologyColorRamp
  threshold?: number
}

export interface LayerData {
  id: number | string
  name: string
  type: 'geojson' | 'wms' | 'tile' | 'image'
  source?: 'arcgis' | 'upload' | 'url'
  visible: boolean
  opacity: number
  data?: unknown
  url?: string
  authToken?: string
  arcgisLayerDefinition?: unknown
  arcgisRenderer?: unknown
  arcgisLabelingInfo?: unknown
  arcgisPortalItemId?: string
  arcgisStyleUrl?: string
  group?: string
  blendMode?: 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten'
  minZoom?: number
  maxZoom?: number
  bbox?: [number, number, number, number]
  color?: string
  fillColor?: string
  weight?: number
  strokeStyle?: 'solid' | 'dashed' | 'dotted' | 'dashdot'
  polygonFillAlpha?: number
  pointRadius?: number
  fillStyle?: 'solid' | 'pattern' | 'hatch' | 'gradient'
  symbology?: SymbologyConfig
  fields?: string[]
}
