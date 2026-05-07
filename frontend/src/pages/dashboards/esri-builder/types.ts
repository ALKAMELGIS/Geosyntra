export type EsriThemeMode = 'light' | 'dark'
export type EsriMode = 'edit' | 'view'

export type EsriDataSourceKind = 'arcgis-rest' | 'geojson-url' | 'geojson-file' | 'csv-url' | 'csv-file' | 'sql'

export type EsriWidgetType =
  | 'map'
  | 'serial-chart'
  | 'pie-chart'
  | 'indicator'
  | 'gauge'
  | 'list'
  | 'table'
  | 'rich-text'
  | 'embedded'

export type EsriLayoutItem = {
  id: string
  x: number
  y: number
  w: number
  h: number
}

export type EsriDataSource = {
  id: string
  name: string
  kind: EsriDataSourceKind
  url?: string
  sqlRef?: string
  refreshMs?: number
  enabled: boolean
  schemaVersion: number
  createdAt: string
}

export type EsriWidgetConfig = {
  id: string
  type: EsriWidgetType
  title: string
  sourceId?: string
  valueField?: string
  categoryField?: string
  description?: string
  content?: string
  url?: string
  filters?: Record<string, string[]>
}

export type EsriActionEvent = 'sliceSelected' | 'rowSelected' | 'mapExtentChanged'

export type EsriActionRule = {
  id: string
  sourceWidgetId: string
  event: EsriActionEvent
  targetWidgetIds: string[]
  field?: string
}

export type EsriViewSettings = {
  showHeader: boolean
  showSidebar: boolean
}

export type EsriDashboardSchema = {
  version: 1
  meta: {
    id: string
    title: string
    owner: string
    createdAt: string
    updatedAt: string
    modeDefault: EsriMode
  }
  theme: {
    mode: EsriThemeMode
    accentColor: string
  }
  sources: EsriDataSource[]
  layout: EsriLayoutItem[]
  widgets: EsriWidgetConfig[]
  actions: EsriActionRule[]
  viewSettings: EsriViewSettings
}

export type EsriDatasetRow = Record<string, unknown> & {
  __x?: number
  __y?: number
}

export type EsriDataset = {
  sourceId: string
  columns: string[]
  rows: EsriDatasetRow[]
}

export type EsriGlobalFilters = {
  byField: Record<string, string[]>
  viewportBbox?: [number, number, number, number] | null
}
