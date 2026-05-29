/**
 * GIS layer + symbology types shared by Satellite, GIS Map, and lib stores.
 * Lives under `lib/` so shared modules never import `pages/satellite/*` (chunk init order).
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

/** Per-category symbol (ArcGIS-style fill + outline + geometry extras). */
export type SymbologyCategoryStyle = {
  fill: string
  outline: string
  fillOpacity: number
  outlineOpacity: number
  outlineWidth: number
  /** Point markers — degrees 0–360 */
  rotation?: number
  /** Point markers — radius in px */
  markerSize?: number
  /** Line / polygon outline pattern */
  lineDash?: 'solid' | 'dashed' | 'dotted' | 'dashdot'
}

export interface SymbologyConfig {
  /** Set when the user saves symbology in the Style studio; bypasses global forced style. */
  userConfigured?: boolean
  useArcGisOnline?: boolean
  style?: SymbologyStyle
  field?: string
  classes?: number
  method?: SymbologyClassMethod
  colorRamp?: SymbologyColorRamp
  threshold?: number
  /** @deprecated Prefer `categoryStyles` — legacy fill-only overrides. */
  categoryColors?: Record<string, string>
  categoryStyles?: Record<string, SymbologyCategoryStyle>
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
