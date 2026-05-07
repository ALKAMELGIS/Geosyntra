import { useMemo, useState } from 'react'
import { Bar, Pie } from 'react-chartjs-2'
import 'chart.js/auto'
import { CircleMarker, Popup } from 'react-leaflet'
import MapView from '../../components/MapView'
import './EsriApp.css'
import { listDashboards, loadDashboard, probeSource, saveDashboard } from './esri-builder/api'
import { applyFilters, applyViewport, loadDataset } from './esri-builder/data'
import { createDefaultSchema, createWidgetTitle, migrateSchema, newId, validateSchema } from './esri-builder/schema'
import type { EsriDashboardSchema, EsriDataSource, EsriDataset, EsriWidgetConfig, EsriWidgetType } from './esri-builder/types'

const WIDGETS: Array<{ type: EsriWidgetType; label: string; icon: string }> = [
  { type: 'map', label: 'Map', icon: 'fa-solid fa-map' },
  { type: 'serial-chart', label: 'Serial chart', icon: 'fa-solid fa-chart-column' },
  { type: 'pie-chart', label: 'Pie chart', icon: 'fa-solid fa-chart-pie' },
  { type: 'indicator', label: 'Indicator', icon: 'fa-solid fa-square-poll-vertical' },
  { type: 'gauge', label: 'Gauge', icon: 'fa-solid fa-gauge-high' },
  { type: 'list', label: 'List', icon: 'fa-solid fa-list' },
  { type: 'table', label: 'Table', icon: 'fa-solid fa-table' },
  { type: 'rich-text', label: 'Rich text', icon: 'fa-solid fa-font' },
  { type: 'embedded', label: 'Embedded content', icon: 'fa-solid fa-link' },
]

type SidebarTab = 'add' | 'view' | 'sources' | 'theme' | 'save'

function widgetDefaultConfig(type: EsriWidgetType): EsriWidgetConfig {
  return {
    id: newId('widget'),
    type,
    title: createWidgetTitle(type),
    content: type === 'rich-text' ? 'Write dashboard notes here...' : '',
    url: type === 'embedded' ? 'https://eap.maps.arcgis.com/apps/dashboards/home' : '',
  }
}

function aggregateValue(dataset: EsriDataset | undefined, field?: string): number {
  if (!dataset) return 0
  if (!field) return dataset.rows.length
  return dataset.rows.reduce((sum, row) => sum + Number(row[field] ?? 0), 0)
}

export default function EsriApp() {
  const [schema, setSchema] = useState<EsriDashboardSchema>(() => createDefaultSchema())
  const [mode, setMode] = useState<'edit' | 'view'>('edit')
  const [activeTab, setActiveTab] = useState<SidebarTab>('add')
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [datasets, setDatasets] = useState<Record<string, EsriDataset>>({})
  const [filesBySource, setFilesBySource] = useState<Record<string, File | null>>({})
  const [globalFilters, setGlobalFilters] = useState<Record<string, string[]>>({})
  const [viewportBbox, setViewportBbox] = useState<[number, number, number, number] | null>(null)
  const [loadableDashboards, setLoadableDashboards] = useState<Array<{ id: string; title: string; updatedAt: string; revision: number }>>([])
  const [status, setStatus] = useState<string>('Ready')
  const [newSource, setNewSource] = useState<Partial<EsriDataSource>>({
    kind: 'arcgis-rest',
    name: '',
    url: '',
    sqlRef: '',
  })

  const selectedWidget = useMemo(
    () => schema.widgets.find((w) => w.id === selectedWidgetId) ?? null,
    [schema.widgets, selectedWidgetId],
  )

  const filteredDatasets = useMemo(() => {
    const out: Record<string, EsriDataset> = {}
    for (const [sourceId, dataset] of Object.entries(datasets)) {
      out[sourceId] = applyViewport(applyFilters(dataset, globalFilters), viewportBbox)
    }
    return out
  }, [datasets, globalFilters, viewportBbox])

  async function reloadSource(source: EsriDataSource) {
    try {
      const dataset = await loadDataset(source, filesBySource[source.id] ?? null)
      setDatasets((prev) => ({ ...prev, [source.id]: dataset }))
    } catch (err) {
      setStatus(`Failed loading source "${source.name}": ${String((err as Error).message || err)}`)
    }
  }

  async function addSource() {
    if (!newSource.name?.trim()) return
    const source: EsriDataSource = {
      id: newId('source'),
      name: newSource.name.trim(),
      kind: (newSource.kind as EsriDataSource['kind']) || 'arcgis-rest',
      url: newSource.url?.trim(),
      sqlRef: newSource.sqlRef?.trim(),
      refreshMs: 30000,
      enabled: true,
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
    }
    try {
      await probeSource(source)
      setSchema((prev) => ({ ...prev, sources: [...prev.sources, source] }))
      setStatus(`Source "${source.name}" connected.`)
      await reloadSource(source)
    } catch (err) {
      setStatus(`Source probe failed: ${String((err as Error).message || err)}`)
    }
  }

  function addWidget(type: EsriWidgetType) {
    const widget = widgetDefaultConfig(type)
    const y = schema.layout.length * 3
    setSchema((prev) => ({
      ...prev,
      widgets: [...prev.widgets, widget],
      layout: [...prev.layout, { id: widget.id, x: 0, y, w: 6, h: 4 }],
      meta: { ...prev.meta, updatedAt: new Date().toISOString() },
    }))
    setSelectedWidgetId(widget.id)
    setShowPicker(false)
  }

  function updateWidget(patch: Partial<EsriWidgetConfig>) {
    if (!selectedWidgetId) return
    setSchema((prev) => ({
      ...prev,
      widgets: prev.widgets.map((w) => (w.id === selectedWidgetId ? { ...w, ...patch } : w)),
      meta: { ...prev.meta, updatedAt: new Date().toISOString() },
    }))
  }

  function updateLayout(id: string, patch: Partial<{ x: number; y: number; w: number; h: number }>) {
    setSchema((prev) => ({
      ...prev,
      layout: prev.layout.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      meta: { ...prev.meta, updatedAt: new Date().toISOString() },
    }))
  }

  function emitWidgetEvent(widget: EsriWidgetConfig, field: string, value: string) {
    const rules = schema.actions.filter((a) => a.sourceWidgetId === widget.id)
    if (!rules.length) {
      setGlobalFilters((prev) => ({ ...prev, [field]: [value] }))
      return
    }
    for (const rule of rules) {
      if (!rule.field) continue
      setGlobalFilters((prev) => ({ ...prev, [rule.field as string]: [value] }))
    }
  }

  async function saveCurrentDashboard() {
    const errors = validateSchema(schema)
    if (errors.length) {
      setStatus(errors[0])
      return
    }
    const saved = await saveDashboard(schema)
    setStatus(`Saved dashboard ${saved.id} rev ${saved.revision}.`)
  }

  async function refreshSavedList() {
    const list = await listDashboards()
    setLoadableDashboards(list)
  }

  async function openDashboard(id: string) {
    const loaded = await loadDashboard(id)
    const migrated = migrateSchema(loaded)
    setSchema(migrated)
    setStatus(`Loaded dashboard "${migrated.meta.title}".`)
    for (const source of migrated.sources) await reloadSource(source)
  }

  return (
    <div className={`esri-app ${schema.theme.mode === 'dark' ? 'esri-app--dark' : ''}`}>
      {schema.viewSettings.showHeader ? (
        <header className="esri-app__header">
          <input
            value={schema.meta.title}
            onChange={(e) => setSchema((prev) => ({ ...prev, meta: { ...prev.meta, title: e.target.value } }))}
          />
          <div className="esri-app__header-actions">
            <button onClick={() => setMode((m) => (m === 'edit' ? 'view' : 'edit'))}>{mode === 'edit' ? 'View mode' : 'Edit mode'}</button>
            <button onClick={saveCurrentDashboard}>Save</button>
          </div>
        </header>
      ) : null}
      <div className="esri-app__body">
        {schema.viewSettings.showSidebar && mode === 'edit' ? (
          <aside className="esri-app__sidebar">
            <button className={activeTab === 'add' ? 'active' : ''} onClick={() => setActiveTab('add')}>Add element</button>
            <button className={activeTab === 'view' ? 'active' : ''} onClick={() => setActiveTab('view')}>View settings</button>
            <button className={activeTab === 'sources' ? 'active' : ''} onClick={() => setActiveTab('sources')}>Data sources</button>
            <button className={activeTab === 'theme' ? 'active' : ''} onClick={() => setActiveTab('theme')}>Theme</button>
            <button className={activeTab === 'save' ? 'active' : ''} onClick={() => setActiveTab('save')}>Save</button>
            <div className="esri-app__panel">
              {activeTab === 'add' ? (
                <>
                  <button onClick={() => setShowPicker(true)}>+ Add element</button>
                  <small>Use drag-and-resize on the canvas.</small>
                </>
              ) : null}
              {activeTab === 'view' ? (
                <>
                  <label><input type="checkbox" checked={schema.viewSettings.showHeader} onChange={(e) => setSchema((prev) => ({ ...prev, viewSettings: { ...prev.viewSettings, showHeader: e.target.checked } }))} /> Header</label>
                  <label><input type="checkbox" checked={schema.viewSettings.showSidebar} onChange={(e) => setSchema((prev) => ({ ...prev, viewSettings: { ...prev.viewSettings, showSidebar: e.target.checked } }))} /> Sidebar</label>
                </>
              ) : null}
              {activeTab === 'theme' ? (
                <>
                  <label>Mode</label>
                  <select value={schema.theme.mode} onChange={(e) => setSchema((prev) => ({ ...prev, theme: { ...prev.theme, mode: e.target.value as 'light' | 'dark' } }))}>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                  <label>Accent</label>
                  <input type="color" value={schema.theme.accentColor} onChange={(e) => setSchema((prev) => ({ ...prev, theme: { ...prev.theme, accentColor: e.target.value } }))} />
                </>
              ) : null}
              {activeTab === 'sources' ? (
                <>
                  <input placeholder="Source name" value={newSource.name || ''} onChange={(e) => setNewSource((p) => ({ ...p, name: e.target.value }))} />
                  <select value={newSource.kind} onChange={(e) => setNewSource((p) => ({ ...p, kind: e.target.value as EsriDataSource['kind'] }))}>
                    <option value="arcgis-rest">ArcGIS REST</option>
                    <option value="geojson-url">GeoJSON URL</option>
                    <option value="csv-url">CSV URL</option>
                    <option value="geojson-file">GeoJSON file</option>
                    <option value="csv-file">CSV file</option>
                    <option value="sql">SQL reference</option>
                  </select>
                  <input placeholder="URL" value={newSource.url || ''} onChange={(e) => setNewSource((p) => ({ ...p, url: e.target.value }))} />
                  <input placeholder="SQL reference" value={newSource.sqlRef || ''} onChange={(e) => setNewSource((p) => ({ ...p, sqlRef: e.target.value }))} />
                  <button onClick={addSource}>Register source</button>
                  {schema.sources.map((s) => (
                    <div key={s.id} className="esri-app__source-row">
                      <strong>{s.name}</strong>
                      <small>{s.kind}</small>
                      {s.kind.endsWith('file') ? (
                        <input type="file" accept={s.kind === 'csv-file' ? '.csv' : '.json,.geojson'} onChange={(e) => setFilesBySource((prev) => ({ ...prev, [s.id]: e.target.files?.[0] || null }))} />
                      ) : null}
                      <button onClick={() => reloadSource(s)}>Refresh</button>
                    </div>
                  ))}
                </>
              ) : null}
              {activeTab === 'save' ? (
                <>
                  <button onClick={saveCurrentDashboard}>Save dashboard</button>
                  <button onClick={refreshSavedList}>Refresh list</button>
                  {loadableDashboards.map((d) => (
                    <button key={d.id} onClick={() => openDashboard(d.id)}>
                      {d.title} (r{d.revision})
                    </button>
                  ))}
                </>
              ) : null}
            </div>
          </aside>
        ) : null}
        <main className="esri-app__canvas">
          {schema.layout.map((item) => {
            const widget = schema.widgets.find((w) => w.id === item.id)
            if (!widget) return null
            const dataset = widget.sourceId ? filteredDatasets[widget.sourceId] : undefined
            return (
              <section
                key={item.id}
                className={`esri-widget ${selectedWidgetId === item.id ? 'selected' : ''}`}
                style={{ left: `${item.x * 8}%`, top: `${item.y * 28}px`, width: `${item.w * 8}%`, height: `${item.h * 58}px` }}
                onClick={() => setSelectedWidgetId(item.id)}
              >
                <header>
                  <strong>{widget.title}</strong>
                  {mode === 'edit' ? (
                    <div className="esri-widget__tools">
                      <button onClick={(e) => { e.stopPropagation(); updateLayout(item.id, { x: Math.max(0, item.x - 1) }) }}>◀</button>
                      <button onClick={(e) => { e.stopPropagation(); updateLayout(item.id, { x: item.x + 1 }) }}>▶</button>
                      <button onClick={(e) => { e.stopPropagation(); updateLayout(item.id, { y: Math.max(0, item.y - 1) }) }}>▲</button>
                      <button onClick={(e) => { e.stopPropagation(); updateLayout(item.id, { y: item.y + 1 }) }}>▼</button>
                    </div>
                  ) : null}
                </header>
                <div className="esri-widget__body">
                  {widget.type === 'indicator' ? <h2>{aggregateValue(dataset, widget.valueField).toLocaleString()}</h2> : null}
                  {widget.type === 'gauge' ? (
                    <div className="esri-gauge">
                      <div className="esri-gauge__bar" style={{ width: `${Math.min(100, aggregateValue(dataset, widget.valueField))}%` }} />
                    </div>
                  ) : null}
                  {widget.type === 'serial-chart' && dataset ? (
                    <Bar
                      data={{
                        labels: dataset.rows.slice(0, 12).map((r) => String(r[widget.categoryField || dataset.columns[0]] ?? '')),
                        datasets: [{ label: widget.title, data: dataset.rows.slice(0, 12).map((r) => Number(r[widget.valueField || dataset.columns[1]] ?? 0)), backgroundColor: '#3b82f6' }],
                      }}
                    />
                  ) : null}
                  {widget.type === 'pie-chart' && dataset ? (
                    <Pie
                      data={{
                        labels: dataset.rows.slice(0, 8).map((r) => String(r[widget.categoryField || dataset.columns[0]] ?? '')),
                        datasets: [{ data: dataset.rows.slice(0, 8).map((r) => Number(r[widget.valueField || dataset.columns[1]] ?? 1)) }],
                      }}
                      options={{
                        onClick: (_evt, els, chart) => {
                          const idx = els?.[0]?.index
                          if (idx === undefined) return
                          const label = String(chart.data.labels?.[idx] ?? '')
                          if (!label) return
                          emitWidgetEvent(widget, widget.categoryField || dataset.columns[0], label)
                        },
                      }}
                    />
                  ) : null}
                  {widget.type === 'list' && dataset ? (
                    <ul className="esri-list">
                      {dataset.rows.slice(0, 40).map((row, idx) => (
                        <li key={idx} onClick={() => emitWidgetEvent(widget, widget.categoryField || dataset.columns[0], String(row[widget.categoryField || dataset.columns[0]] ?? ''))}>
                          {String(row[widget.categoryField || dataset.columns[0]] ?? '—')}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {widget.type === 'table' && dataset ? (
                    <table>
                      <thead><tr>{dataset.columns.slice(0, 6).map((c) => <th key={c}>{c}</th>)}</tr></thead>
                      <tbody>
                        {dataset.rows.slice(0, 20).map((r, idx) => (
                          <tr key={idx}>{dataset.columns.slice(0, 6).map((c) => <td key={c}>{String(r[c] ?? '')}</td>)}</tr>
                        ))}
                      </tbody>
                    </table>
                  ) : null}
                  {widget.type === 'rich-text' ? <div dangerouslySetInnerHTML={{ __html: widget.content || '' }} /> : null}
                  {widget.type === 'embedded' ? <iframe title={widget.title} src={widget.url || ''} /> : null}
                  {widget.type === 'map' ? (
                    <MapView
                      center={[24.45, 54.38]}
                      zoom={7}
                      onMapReady={(map) => {
                        map.on('moveend', () => {
                          const b = map.getBounds()
                          setViewportBbox([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()])
                        })
                      }}
                    >
                      {(dataset?.rows || []).slice(0, 150).map((row, idx) =>
                        Number.isFinite(Number(row.__x)) && Number.isFinite(Number(row.__y)) ? (
                          <CircleMarker key={idx} center={[Number(row.__y), Number(row.__x)]} radius={5} pathOptions={{ color: '#16a34a' }}>
                            <Popup>{Object.entries(row).slice(0, 4).map(([k, v]) => `${k}: ${String(v)}`).join(', ')}</Popup>
                          </CircleMarker>
                        ) : null,
                      )}
                    </MapView>
                  ) : null}
                </div>
                {mode === 'edit' ? (
                  <button className="esri-widget__resize" onClick={(e) => { e.stopPropagation(); updateLayout(item.id, { w: Math.min(12, item.w + 1), h: Math.min(8, item.h + 1) }) }}>
                    resize
                  </button>
                ) : null}
              </section>
            )
          })}
        </main>
        {mode === 'edit' ? (
          <aside className="esri-app__config">
            <h3>Widget settings</h3>
            {selectedWidget ? (
              <>
                <input value={selectedWidget.title} onChange={(e) => updateWidget({ title: e.target.value })} />
                <select value={selectedWidget.sourceId || ''} onChange={(e) => updateWidget({ sourceId: e.target.value || undefined })}>
                  <option value="">No source</option>
                  {schema.sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <input placeholder="Category field" value={selectedWidget.categoryField || ''} onChange={(e) => updateWidget({ categoryField: e.target.value || undefined })} />
                <input placeholder="Value field" value={selectedWidget.valueField || ''} onChange={(e) => updateWidget({ valueField: e.target.value || undefined })} />
                {selectedWidget.type === 'rich-text' ? (
                  <textarea value={selectedWidget.content || ''} onChange={(e) => updateWidget({ content: e.target.value })} />
                ) : null}
                {selectedWidget.type === 'embedded' ? (
                  <input value={selectedWidget.url || ''} onChange={(e) => updateWidget({ url: e.target.value })} />
                ) : null}
                <button
                  onClick={() =>
                    setSchema((prev) => ({
                      ...prev,
                      actions: [
                        ...prev.actions,
                        {
                          id: newId('action'),
                          sourceWidgetId: selectedWidget.id,
                          event: selectedWidget.type === 'map' ? 'mapExtentChanged' : selectedWidget.type === 'list' ? 'rowSelected' : 'sliceSelected',
                          targetWidgetIds: prev.widgets.filter((w) => w.id !== selectedWidget.id).map((w) => w.id),
                          field: selectedWidget.categoryField || selectedWidget.valueField,
                        },
                      ],
                    }))
                  }
                >
                  Add action
                </button>
              </>
            ) : (
              <p>Select a widget to configure.</p>
            )}
            <h4>Actions</h4>
            <ul className="esri-actions">
              {schema.actions.map((a) => (
                <li key={a.id}>
                  {a.event} from {a.sourceWidgetId} {'->'} {a.targetWidgetIds.length} targets ({a.field || 'n/a'})
                </li>
              ))}
            </ul>
          </aside>
        ) : null}
      </div>
      <footer className="esri-app__footer">
        <span>{status}</span>
        <button onClick={() => setGlobalFilters({})}>Clear filters</button>
      </footer>
      {showPicker ? (
        <div className="esri-picker">
          <div className="esri-picker__card">
            <h3>Add element</h3>
            <div className="esri-picker__grid">
              {WIDGETS.map((w) => (
                <button key={w.type} onClick={() => addWidget(w.type)}>
                  <i className={w.icon} />
                  {w.label}
                </button>
              ))}
            </div>
            <button onClick={() => setShowPicker(false)}>Close</button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
