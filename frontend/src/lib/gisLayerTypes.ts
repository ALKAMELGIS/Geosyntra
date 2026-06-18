/**
 * GIS layer + symbology types shared by Satellite, GIS Map, and lib stores.
 * Lives under `lib/` so shared modules never import `pages/satellite/*` (chunk init order).
 */

export type SymbologyStyle =
  | 'single'
  | 'location_only'
  | 'single_fill'
  | 'single_line'
  | 'unique'
  | 'color'
  | 'class_breaks'
  | 'choropleth'
  | 'size'
  | 'width_by_attribute'
  | 'color_size'
  | 'dot_density'
  | 'heatmap'
  | 'heat_surface'
  | 'predominance'
  | 'pie_chart'
  | 'donut_chart'
  | 'extrusion_3d'
  | 'line_3d'
  | 'flow_lines'
  | 'traffic_style'
  | 'gradient_line'
  | 'direction_arrows'
  | 'dashed_lines'
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

export type LayerLabelFontStyle = 'regular' | 'bold' | 'italic' | 'bold-italic'
export type LayerLabelAlign = 'left' | 'center' | 'right'

/** Per-vector-layer feature labels (Mapbox symbol layers; 2D + 3D). */
export interface LayerLabelConfig {
  userConfigured?: boolean
  enabled: boolean
  field: string
  fontSize: number
  color: string
  fontStyle?: LayerLabelFontStyle
  align?: LayerLabelAlign
  opacity?: number
  haloColor?: string
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
  /** Vary fill/line/point opacity by numeric attribute (Mapbox data-driven). */
  attributeTransparency?: SiSymbologyAttributeTransparency
  /** Rotate point symbols by numeric attribute (Mapbox circle-rotate). */
  attributeRotation?: SiSymbologyAttributeRotation
}

export type SiSymbologyAttributeRotationMode = 'geographic' | 'arithmetic'

export interface SiSymbologyAttributeTransparency {
  enabled: boolean
  field: string
  dividedByField: string
  valueMin: number
  valueMax: number
  /** Transparency % at high attribute values (0 = opaque). */
  highTransparency: number
  /** Transparency % at low attribute values (100 = fully transparent). */
  lowTransparency: number
  includeInLegend: boolean
}

export interface SiSymbologyAttributeRotation {
  enabled: boolean
  field: string
  mode: SiSymbologyAttributeRotationMode
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
