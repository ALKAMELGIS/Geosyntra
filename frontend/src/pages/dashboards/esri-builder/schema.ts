import type { EsriDashboardSchema, EsriWidgetType } from './types'

export function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`
}

export function createDefaultSchema(): EsriDashboardSchema {
  const now = new Date().toISOString()
  return {
    version: 1,
    meta: {
      id: newId('dashboard'),
      title: 'Untitled Esri App Dashboard',
      owner: 'local-user',
      createdAt: now,
      updatedAt: now,
      modeDefault: 'edit',
    },
    theme: {
      mode: 'light',
      accentColor: '#2563eb',
    },
    sources: [],
    layout: [],
    widgets: [],
    actions: [],
    viewSettings: {
      showHeader: true,
      showSidebar: true,
    },
  }
}

export function createWidgetTitle(type: EsriWidgetType): string {
  const map: Record<EsriWidgetType, string> = {
    map: 'Map',
    'serial-chart': 'Serial Chart',
    'pie-chart': 'Pie Chart',
    indicator: 'Indicator',
    gauge: 'Gauge',
    list: 'List',
    table: 'Table',
    'rich-text': 'Rich Text',
    embedded: 'Embedded Content',
  }
  return map[type]
}

export function migrateSchema(raw: unknown): EsriDashboardSchema {
  if (!raw || typeof raw !== 'object') return createDefaultSchema()
  const obj = raw as Partial<EsriDashboardSchema>
  if (obj.version !== 1) return createDefaultSchema()
  return {
    ...createDefaultSchema(),
    ...obj,
    meta: { ...createDefaultSchema().meta, ...(obj.meta || {}) },
    theme: { ...createDefaultSchema().theme, ...(obj.theme || {}) },
    viewSettings: { ...createDefaultSchema().viewSettings, ...(obj.viewSettings || {}) },
    sources: Array.isArray(obj.sources) ? obj.sources : [],
    layout: Array.isArray(obj.layout) ? obj.layout : [],
    widgets: Array.isArray(obj.widgets) ? obj.widgets : [],
    actions: Array.isArray(obj.actions) ? obj.actions : [],
  }
}

export function validateSchema(schema: EsriDashboardSchema): string[] {
  const errors: string[] = []
  if (!schema.meta.title.trim()) errors.push('Dashboard title is required.')
  for (const w of schema.widgets) {
    if (!w.title.trim()) errors.push(`Widget ${w.id} has no title.`)
  }
  return errors
}
