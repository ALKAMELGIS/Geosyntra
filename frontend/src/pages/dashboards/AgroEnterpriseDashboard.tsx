import { useCallback, useEffect, useMemo, useState } from 'react'
import Map, { Layer, NavigationControl, Source } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import { Bar, Line, Pie, Scatter } from 'react-chartjs-2'
import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  ArcElement,
  Filler,
} from 'chart.js'
import { useLanguage } from '../../lib/i18n'
import { useMapboxAccessToken } from '../../hooks/useMapboxAccessToken'
import { loadGisMapSavedLayers } from '../../lib/gisMapLayerStore'
import type { LayerData } from '../satellite/components/LayerManager'
import { parseFile, parseRemoteUrlAsFile } from '../../utils/FileLoader'
import { coerceNumber } from './agroDashboardCharts'
import {
  type AgroRegistrySource,
  type DiscoveredArcLayer,
  fetchArcGisFeatureCollection,
  gisLayerCanImportToDashboard,
  isFeatureCollection,
  newAgroSourceId,
  normalizeArcGisServiceUrl,
  sourceFromFeatureCollection,
  sourceFromTable,
} from './agroDashboardImport'
import './agro-dashboard-enterprise.css'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler)

const LS_KEY = 'agroEnterpriseDash_v1'
const SAT = 'mapbox://styles/mapbox/satellite-v9'
const LIGHT = 'mapbox://styles/mapbox/dark-v11'

export type ChartKind = 'bar' | 'line' | 'scatter' | 'pie' | 'heatmap'

export type DashWidget = {
  id: string
  kind: ChartKind
  title: string
  sourceId: string | null
  xField: string
  yField: string
  valueField: string
  trendline: boolean
  groupByField: string
  syncMap: boolean
  wide: boolean
}

function uid() {
  return `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function mergeSourcesGeoJson(sources: AgroRegistrySource[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  for (const s of sources) {
    if (s.geojson?.features?.length) features.push(...s.geojson.features)
  }
  return { type: 'FeatureCollection', features }
}

function chartPalette() {
  return {
    text: '#cbd5f5',
    grid: 'rgba(148,163,184,0.15)',
    accent: '#635bff',
    teal: '#2dd4bf',
  }
}

function buildChartJsConfig(
  w: DashWidget,
  sources: AgroRegistrySource[],
): { ok: true; type: 'bar' | 'line' | 'scatter' | 'pie'; data: any; options: any } | { ok: false } {
  const src = sources.find(s => s.id === w.sourceId)
  if (!src || !w.yField) return { ok: false }
  const pal = chartPalette()
  const labels = src.rows.map((r, i) => {
    if (w.xField && r[w.xField] != null) return String(r[w.xField])
    return String(i + 1)
  })
  const dataY = src.rows.map(r => coerceNumber(r[w.yField]) ?? 0)
  const commonOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: pal.text, font: { size: 11 } } },
      tooltip: { titleColor: '#0f172a', bodyColor: '#0f172a' },
    },
    scales:
      w.kind === 'pie'
        ? undefined
        : {
            x: {
              ticks: { color: pal.text, maxRotation: 45 },
              grid: { color: pal.grid },
            },
            y: {
              ticks: { color: pal.text },
              grid: { color: pal.grid },
            },
          },
  }

  if (w.kind === 'pie') {
    const slice = src.rows.slice(0, 12)
    return {
      ok: true,
      type: 'pie',
      data: {
        labels: slice.map((r, i) => (w.xField && r[w.xField] != null ? String(r[w.xField]) : `R${i + 1}`)),
        datasets: [
          {
            data: slice.map(r => coerceNumber(r[w.yField]) ?? 0),
            backgroundColor: ['#635bff', '#2dd4bf', '#f472b6', '#fbbf24', '#38bdf8', '#a78bfa', '#fb7185', '#4ade80'],
            borderWidth: 0,
          },
        ],
      },
      options: { ...commonOpts, plugins: { ...commonOpts.plugins, legend: { position: 'bottom' as const } } },
    }
  }

  if (w.kind === 'scatter' || w.kind === 'heatmap') {
    const pts = src.rows
      .map(r => {
        const x = coerceNumber(w.xField ? r[w.xField] : null)
        const y = coerceNumber(r[w.yField])
        if (x === null || y === null) return null
        return { x, y }
      })
      .filter(Boolean) as { x: number; y: number }[]
    return {
      ok: true,
      type: 'scatter',
      data: {
        datasets: [
          {
            label: w.title,
            data: pts,
            backgroundColor: w.kind === 'heatmap' ? 'rgba(99,91,255,0.55)' : pal.accent,
            pointRadius: w.kind === 'heatmap' ? 10 : 5,
            showLine: w.trendline,
            tension: 0.25,
          },
        ],
      },
      options: commonOpts,
    }
  }

  if (w.kind === 'line') {
    return {
      ok: true,
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: w.yField,
            data: dataY,
            borderColor: pal.teal,
            backgroundColor: 'rgba(45,212,191,0.12)',
            fill: w.trendline,
            tension: 0.35,
            spanGaps: true,
          },
        ],
      },
      options: commonOpts,
    }
  }

  return {
    ok: true,
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: w.yField, data: dataY, backgroundColor: 'rgba(99,91,255,0.55)', borderRadius: 6 }],
    },
    options: commonOpts,
  }
}

async function discoverArcGisLayers(serviceUrl: string, token: string): Promise<DiscoveredArcLayer[]> {
  const base = normalizeArcGisServiceUrl(serviceUrl)
  if (!base) return []
  const tk = token.trim()
  const url = tk ? `${base}?f=json&token=${encodeURIComponent(tk)}` : `${base}?f=json`
  const res = await fetch(url)
  const json = await res.json()
  if (json?.error?.message) throw new Error(String(json.error.message))
  const layersArr = Array.isArray(json?.layers) ? json.layers : []
  const tablesArr = Array.isArray(json?.tables) ? json.tables : []
  return [
    ...layersArr.map((l: { id: number; name: string; geometryType?: string }) => ({ ...l, kind: 'layer' as const })),
    ...tablesArr.map((t: { id: number; name: string }) => ({ ...t, kind: 'table' as const })),
  ]
    .filter((l: { id?: unknown; name?: unknown }) => typeof l?.id === 'number' && typeof l?.name === 'string')
    .map((l: { id: number; name: string; kind: 'layer' | 'table'; geometryType?: string }) => ({
      id: l.id,
      name: l.name,
      kind: l.kind,
      url: `${base.replace(/\/+$/, '')}/${l.id}`,
      geometryType: typeof l?.geometryType === 'string' ? l.geometryType : undefined,
    }))
}

export default function AgroEnterpriseDashboard() {
  const { language, direction } = useLanguage()
  const ar = language === 'ar'
  const mapToken = useMapboxAccessToken()

  const t = useMemo(
    () =>
      ar
        ? {
            title: 'لوحة GeoDash المؤسسية',
            subtitle: 'مراقبة، تحليلات مكانية، وإدارة مصادر البيانات.',
            overview: 'نظرة عامة',
            map: 'الخريطة',
            analytics: 'التحليلات',
            sources: 'المصادر',
            add: 'إضافة مصدر',
            gallery: 'معرض مرئي',
            collapse: 'طي القائمة',
            expand: 'توسيع القائمة',
            measure: 'قياس مساحة',
            buffer: 'منطقة عازلة',
            monitor: 'مراقبة الحقول',
            modalTitle: 'إضافة مصدر إلى السجل',
            gis: 'من محتوى GIS',
            arc: 'رابط ArcGIS',
            upload: 'رفع ملف',
            url: 'من رابط',
            close: 'إغلاق',
            noMapToken: 'أضف رمز Mapbox من الإعدادات لتفعيل الخريطة.',
          }
        : {
            title: 'GeoDash Enterprise',
            subtitle: 'Monitoring, spatial visualization, and multi-source analytics.',
            overview: 'Overview',
            map: 'Map',
            analytics: 'Analytics',
            sources: 'Sources',
            add: 'Add source',
            gallery: 'Visual gallery',
            collapse: 'Collapse',
            expand: 'Expand',
            measure: 'Area measure',
            buffer: 'Buffer',
            monitor: 'Field monitor',
            modalTitle: 'Add layer to registry',
            gis: 'From GIS Content',
            arc: 'ArcGIS URL',
            upload: 'Upload file',
            url: 'From URL',
            close: 'Close',
            noMapToken: 'Add a Mapbox token in System Settings to enable the map.',
          },
    [ar],
  )

  const [sideCollapsed, setSideCollapsed] = useState(false)
  const [nav, setNav] = useState(0)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [widgets, setWidgets] = useState<DashWidget[]>([])
  const [sources, setSources] = useState<AgroRegistrySource[]>([])
  const [basemap, setBasemap] = useState<'sat' | 'streets'>('sat')
  const [showVectors, setShowVectors] = useState(true)
  const [pathways, setPathways] = useState(true)

  const [modal, setModal] = useState(false)
  const [gisLayers, setGisLayers] = useState<LayerData[]>([])
  const [gisLoading, setGisLoading] = useState(false)
  const [arcUrl, setArcUrl] = useState('')
  const [arcToken, setArcToken] = useState('')
  const [discovered, setDiscovered] = useState<DiscoveredArcLayer[]>([])
  const [discSel, setDiscSel] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (!raw) return
      const j = JSON.parse(raw) as { widgets?: DashWidget[]; sources?: AgroRegistrySource[] }
      if (Array.isArray(j.widgets)) setWidgets(j.widgets)
      if (Array.isArray(j.sources)) setSources(j.sources)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ widgets, sources }))
    } catch {
      /* quota */
    }
  }, [widgets, sources])

  useEffect(() => {
    if (!modal) return
    setGisLoading(true)
    void loadGisMapSavedLayers()
      .then(setGisLayers)
      .finally(() => setGisLoading(false))
  }, [modal])

  const merged = useMemo(() => mergeSourcesGeoJson(sources), [sources])

  const addWidget = useCallback((kind: ChartKind) => {
    const first = sources[0]
    const fields = first?.fields ?? []
    setWidgets(prev => [
      ...prev,
      {
        id: uid(),
        kind,
        title: `${kind} ${prev.length + 1}`,
        sourceId: first?.id ?? null,
        xField: fields[0] ?? '',
        yField: fields[1] ?? fields[0] ?? '',
        valueField: fields[2] ?? '',
        trendline: false,
        groupByField: '',
        syncMap: false,
        wide: kind === 'heatmap' || kind === 'line',
      },
    ])
    setGalleryOpen(false)
    setNav(2)
  }, [sources])

  const pushBinding = useCallback(async (widgetId: string) => {
    const base = (import.meta as any).env?.VITE_GEODASH_API_URL as string | undefined
    if (!base?.trim()) return
    try {
      await fetch(`${base.replace(/\/+$/, '')}/dashboard/bindings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          map_entity_key: `dashboard:default`,
          chart_widget_ids: [widgetId],
        }),
      })
    } catch {
      /* non-fatal */
    }
  }, [])

  const register = useCallback((s: AgroRegistrySource) => {
    setSources(prev => [...prev, s])
    setModal(false)
    setErr(null)
    void pushBinding(s.id)
  }, [pushBinding])

  const importGis = useCallback(
    async (layer: LayerData) => {
      if (!gisLayerCanImportToDashboard(layer)) return
      setBusy(`gis:${layer.id}`)
      setErr(null)
      try {
        let fc: GeoJSON.FeatureCollection
        let kind: 'feature' | 'table' = 'feature'
        if (isFeatureCollection(layer.data)) {
          fc = layer.data
          if (!fc.features.length) throw new Error('Empty layer')
        } else if (layer.url && layer.source === 'arcgis') {
          const def = layer.arcgisLayerDefinition
          const isTable = def?.type === 'table' || String(def?.type || '').toLowerCase() === 'table'
          kind = isTable ? 'table' : 'feature'
          fc = await fetchArcGisFeatureCollection(layer.url, layer.authToken || '', isTable ? 'table' : 'layer')
        } else throw new Error('Unsupported')
        register(sourceFromFeatureCollection(newAgroSourceId(), layer.name?.trim() || 'Layer', fc, kind))
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Import failed')
      } finally {
        setBusy(null)
      }
    },
    [register],
  )

  const runArcDiscover = useCallback(async () => {
    setBusy('discover')
    setErr(null)
    setDiscovered([])
    try {
      const d = await discoverArcGisLayers(arcUrl, arcToken)
      if (!d.length) throw new Error('No layers found')
      setDiscovered(d)
      setDiscSel(d[0]!.url)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Discover failed')
    } finally {
      setBusy(null)
    }
  }, [arcUrl, arcToken])

  const addArcLayer = useCallback(
    async (l: DiscoveredArcLayer) => {
      setBusy(l.url)
      setErr(null)
      try {
        const fc = await fetchArcGisFeatureCollection(l.url, arcToken, l.kind)
        register(sourceFromFeatureCollection(newAgroSourceId(), l.name, fc, l.kind === 'table' ? 'table' : 'feature'))
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'ArcGIS import failed')
      } finally {
        setBusy(null)
      }
    },
    [arcToken, register],
  )

  const onUpload = useCallback(
    async (file: File) => {
      setBusy(file.name)
      setErr(null)
      try {
        const parsed = await parseFile(file)
        if (parsed.type === 'table') {
          const rows = parsed.data as Record<string, unknown>[]
          const cols = Object.keys(rows[0] ?? {})
          register(sourceFromTable(newAgroSourceId(), file.name.replace(/\.[^.]+$/, ''), rows, cols))
          return
        }
        if (parsed.type !== 'geojson') throw new Error('Expected GeoJSON / vector file')
        let g: unknown = parsed.data
        if (Array.isArray(g)) g = g[0]
        const fc = g as GeoJSON.FeatureCollection
        if (fc?.type !== 'FeatureCollection') throw new Error('Invalid GeoJSON')
        register(sourceFromFeatureCollection(newAgroSourceId(), file.name.replace(/\.[^.]+$/, ''), fc, 'feature'))
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Upload failed')
      } finally {
        setBusy(null)
      }
    },
    [register],
  )

  const onUrl = useCallback(
    async (u: string) => {
      setBusy('url')
      setErr(null)
      try {
        const file = await parseRemoteUrlAsFile(u.trim())
        const parsed = await parseFile(file)
        if (parsed.type !== 'geojson') throw new Error('URL must resolve to vector GeoJSON')
        let g: unknown = parsed.data
        if (Array.isArray(g)) g = g[0]
        const fc = g as GeoJSON.FeatureCollection
        register(sourceFromFeatureCollection(newAgroSourceId(), file.name.replace(/\.[^.]+$/, '') || 'Layer', fc, 'feature'))
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'URL import failed')
      } finally {
        setBusy(null)
      }
    },
    [register],
  )

  const updateWidget = useCallback((id: string, patch: Partial<DashWidget>) => {
    setWidgets(prev => prev.map(w => (w.id === id ? { ...w, ...patch } : w)))
  }, [])

  const mapStyle = basemap === 'sat' ? SAT : LIGHT

  return (
    <div className="page agro-ent-root" dir={direction}>
      <h1 className="agro-ent-sr">GeoDash Enterprise</h1>
      <div className="agro-ent-shell">
        <aside className={`agro-ent-side${sideCollapsed ? ' agro-ent-side--collapsed' : ''}`}>
          <div className="agro-ent-brand">
            <div className="agro-ent-mark" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="8" width="3.5" height="7" rx="1" fill="white" />
                <rect x="6.25" y="5" width="3.5" height="10" rx="1" fill="white" opacity="0.85" />
                <rect x="11.5" y="1" width="3.5" height="14" rx="1" fill="white" opacity="0.7" />
              </svg>
            </div>
            {!sideCollapsed ? (
              <div className="agro-ent-brand-text">
                <span>Geo</span>
                <b>Dash</b>
              </div>
            ) : null}
            <button
              type="button"
              className="agro-ent-collapse"
              title={sideCollapsed ? t.expand : t.collapse}
              onClick={() => setSideCollapsed(c => !c)}
            >
              <i className={`fa-solid ${sideCollapsed ? 'fa-angles-right' : 'fa-angles-left'}`} />
            </button>
          </div>
          <nav className="agro-ent-nav">
            {[
              { i: 0, icon: 'fa-gauge-high', lab: t.overview },
              { i: 1, icon: 'fa-map-location-dot', lab: t.map },
              { i: 2, icon: 'fa-chart-line', lab: t.analytics },
              { i: 3, icon: 'fa-database', lab: t.sources },
            ].map(x => (
              <button key={x.i} type="button" className={nav === x.i ? 'agro-ent-nav--on' : ''} onClick={() => setNav(x.i)}>
                <i className={`fa-solid ${x.icon}`} />
                <span className="agro-ent-nav-label">{x.lab}</span>
              </button>
            ))}
          </nav>
          <div className="agro-ent-gallery-wrap">
            <button type="button" className="agro-ent-gallery-btn" onClick={() => setGalleryOpen(o => !o)}>
              <i className="fa-solid fa-border-all" />
              {!sideCollapsed ? t.gallery : null}
            </button>
            {galleryOpen ? (
              <div className="agro-ent-gallery-menu" role="menu">
                {(
                  [
                    ['bar', 'fa-chart-column', 'Bar'],
                    ['line', 'fa-chart-line', 'Line'],
                    ['scatter', 'fa-braille', 'Scatter'],
                    ['pie', 'fa-chart-pie', 'Pie'],
                    ['heatmap', 'fa-fire', 'Heatmap'],
                  ] as const
                ).map(([k, ic, lab]) => (
                  <button key={k} type="button" role="menuitem" onClick={() => addWidget(k)}>
                    <i className={`fa-solid ${ic}`} style={{ fontSize: 18 }} />
                    {lab}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </aside>

        <main className="agro-ent-main">
          <header className="agro-ent-topbar">
            <div>
              <h1>{t.title}</h1>
              <p>{t.subtitle}</p>
            </div>
            <button type="button" className="agro-ent-add" onClick={() => setModal(true)}>
              <i className="fa-solid fa-plus" style={{ marginInlineEnd: 6 }} /> {t.add}
            </button>
          </header>

          <div className="agro-ent-work" style={nav === 1 ? { gridTemplateColumns: '1fr' } : undefined}>
            <div className="agro-ent-grid" style={{ display: nav === 1 ? 'none' : undefined }}>
              {nav === 3 ? (
                <section className="agro-ent-widget agro-ent-widget--wide">
                  <div className="agro-ent-w-head">
                    <span className="agro-ent-w-title">{t.sources}</span>
                  </div>
                  <div className="agro-ent-w-body" style={{ color: '#cbd5f5', fontSize: 13 }}>
                    {sources.length === 0 ? <p style={{ margin: 0, color: 'var(--ae-muted)' }}>No registry layers yet.</p> : null}
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {sources.map(s => (
                        <li key={s.id}>
                          <strong>{s.name}</strong> — {s.kind} — {s.fields.length} fields — {s.rows.length} rows
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>
              ) : null}
              {widgets.map(w => (
                <section key={w.id} className={`agro-ent-widget${w.wide ? ' agro-ent-widget--wide' : ' agro-ent-widget--half'}`}>
                  <div className="agro-ent-w-head">
                    <span className="agro-ent-w-title">{w.title}</span>
                    <div className="agro-ent-w-actions">
                      <WidgetSettingsPopover w={w} sources={sources} onChange={patch => updateWidget(w.id, patch)} />
                    </div>
                  </div>
                  <div className="agro-ent-w-body">
                    <WidgetChart w={w} sources={sources} />
                  </div>
                </section>
              ))}
            </div>

            <div className="agro-ent-map-col" style={{ display: nav === 3 ? 'none' : undefined }}>
              <div className="agro-ent-map-tools">
                <button type="button" className={`agro-ent-chip${basemap === 'sat' ? ' agro-ent-chip--on' : ''}`} onClick={() => setBasemap('sat')}>
                  Satellite
                </button>
                <button type="button" className={`agro-ent-chip${basemap === 'streets' ? ' agro-ent-chip--on' : ''}`} onClick={() => setBasemap('streets')}>
                  Basemap
                </button>
                <button type="button" className={`agro-ent-chip${showVectors ? ' agro-ent-chip--on' : ''}`} onClick={() => setShowVectors(v => !v)}>
                  Registry layers
                </button>
                <button type="button" className={`agro-ent-chip${pathways ? ' agro-ent-chip--on' : ''}`} onClick={() => setPathways(v => !v)}>
                  Pathways
                </button>
              </div>
              <div className="agro-ent-map-frame">
                {!mapToken ? (
                  <div style={{ padding: 24, color: 'var(--ae-muted)' }}>{t.noMapToken}</div>
                ) : (
                  <Map
                    mapboxAccessToken={mapToken}
                    initialViewState={{ longitude: 55.27, latitude: 25.2, zoom: 9 }}
                    mapStyle={mapStyle}
                    style={{ width: '100%', height: '100%', minHeight: 300 }}
                    reuseMaps
                  >
                    <NavigationControl position="top-right" showCompass visualizePitch />
                    {showVectors && merged.features.length ? (
                      <Source id="agro-merged" type="geojson" data={merged as any}>
                        <Layer
                          id="agro-fill"
                          type="fill"
                          paint={{ 'fill-color': '#635bff', 'fill-opacity': 0.28 }}
                          filter={['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]]}
                        />
                        <Layer
                          id="agro-line"
                          type="line"
                          paint={{ 'line-color': '#a78bfa', 'line-width': 2 }}
                          filter={['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]]}
                        />
                        <Layer
                          id="agro-pt"
                          type="circle"
                          paint={{ 'circle-radius': 6, 'circle-color': '#2dd4bf', 'circle-stroke-width': 1, 'circle-stroke-color': '#fff' }}
                          filter={['in', ['geometry-type'], ['literal', ['Point', 'MultiPoint']]]}
                        />
                      </Source>
                    ) : null}
                    {pathways ? (
                      <Source
                        id="agro-path"
                        type="geojson"
                        data={
                          {
                            type: 'FeatureCollection',
                            features: [
                              {
                                type: 'Feature',
                                properties: {},
                                geometry: { type: 'LineString', coordinates: [[55.18, 25.12], [55.42, 25.22], [55.5, 25.08]] },
                              },
                            ],
                          } as any
                        }
                      >
                        <Layer id="agro-path-line" type="line" paint={{ 'line-color': '#fbbf24', 'line-width': 3 }} />
                      </Source>
                    ) : null}
                  </Map>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>

      <div className="agro-ent-float-tools" role="toolbar" aria-label="Spatial tools">
        <button type="button">
          <i className="fa-solid fa-ruler-combined" style={{ marginInlineEnd: 6 }} />
          {t.measure}
        </button>
        <button type="button">
          <i className="fa-solid fa-circle-notch" style={{ marginInlineEnd: 6 }} />
          {t.buffer}
        </button>
        <button type="button">
          <i className="fa-solid fa-seedling" style={{ marginInlineEnd: 6 }} />
          {t.monitor}
        </button>
      </div>

      {modal ? (
        <div className="agro-ent-modal-back" role="dialog" aria-modal onMouseDown={e => e.target === e.currentTarget && setModal(false)}>
          <div className="agro-ent-modal" dir={direction}>
            <h2>{t.modalTitle}</h2>
            {err ? <p style={{ color: '#fb7185' }}>{err}</p> : null}
            <div className="agro-ent-opt-grid">
              <button type="button" className="agro-ent-opt" onClick={() => {}}>
                <b>{t.gis}</b>
                <span>IndexedDB layers from GIS Map</span>
              </button>
              <button type="button" className="agro-ent-opt" onClick={() => {}}>
                <b>{t.arc}</b>
                <span>FeatureServer / MapServer</span>
              </button>
              <label className="agro-ent-opt" style={{ cursor: 'pointer' }}>
                <b>{t.upload}</b>
                <span>GeoJSON, KML, CSV, …</span>
                <input type="file" hidden onChange={e => e.target.files?.[0] && void onUpload(e.target.files[0])} />
              </label>
              <button type="button" className="agro-ent-opt" onClick={() => {
                const u = window.prompt('URL')
                if (u) void onUrl(u)
              }}>
                <b>{t.url}</b>
                <span>Remote GeoJSON / zip</span>
              </button>
            </div>
            <div style={{ marginTop: 16 }}>
              <h3 style={{ fontSize: 14 }}>{t.gis}</h3>
              {gisLoading ? <p>…</p> : null}
              <ul style={{ maxHeight: 200, overflow: 'auto' }}>
                {gisLayers.map(l => (
                  <li key={String(l.id)}>
                    <button type="button" disabled={Boolean(busy) || !gisLayerCanImportToDashboard(l)} onClick={() => void importGis(l)}>
                      {l.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div style={{ marginTop: 16 }}>
              <h3 style={{ fontSize: 14 }}>{t.arc}</h3>
              <input
                style={{ width: '100%', marginBottom: 8, padding: 8, borderRadius: 8 }}
                placeholder="Feature service URL"
                value={arcUrl}
                onChange={e => setArcUrl(e.target.value)}
              />
              <input
                style={{ width: '100%', marginBottom: 8, padding: 8, borderRadius: 8 }}
                placeholder="token"
                value={arcToken}
                onChange={e => setArcToken(e.target.value)}
              />
              <button type="button" className="agro-ent-add" disabled={Boolean(busy)} onClick={() => void runArcDiscover()}>
                Discover
              </button>
              <ul>
                {discovered.map(l => (
                  <li key={l.url}>
                    <button type="button" disabled={Boolean(busy)} onClick={() => void addArcLayer(l)}>
                      {l.name} ({l.kind})
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <button type="button" className="agro-ent-chip" style={{ marginTop: 16 }} onClick={() => setModal(false)}>
              {t.close}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function WidgetSettingsPopover({ w, sources, onChange }: { w: DashWidget; sources: AgroRegistrySource[]; onChange: (p: Partial<DashWidget>) => void }) {
  const [open, setOpen] = useState(false)
  const flds = sources.find(s => s.id === w.sourceId)?.fields ?? []
  return (
    <>
      <button type="button" className="agro-ent-icon-btn" title="Settings" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <i className="fa-solid fa-ellipsis-vertical" />
      </button>
      {open ? (
        <div className="agro-ent-pop" onMouseLeave={() => setOpen(false)}>
          <label>Source</label>
          <select value={w.sourceId ?? ''} onChange={e => onChange({ sourceId: e.target.value || null })}>
            <option value="">—</option>
            {sources.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <label>X (category / time)</label>
          <select value={w.xField} onChange={e => onChange({ xField: e.target.value })}>
            {flds.map(f => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <label>Y (metric)</label>
          <select value={w.yField} onChange={e => onChange({ yField: e.target.value })}>
            {flds.map(f => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <label>Value / weight (spatial)</label>
          <select value={w.valueField} onChange={e => onChange({ valueField: e.target.value })}>
            <option value="">—</option>
            {flds.map(f => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <label>Group by</label>
          <select value={w.groupByField} onChange={e => onChange({ groupByField: e.target.value })}>
            <option value="">—</option>
            {flds.map(f => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <div className="agro-ent-toggle-row">
            <span>Trendline</span>
            <input type="checkbox" checked={w.trendline} onChange={e => onChange({ trendline: e.target.checked })} />
          </div>
          <div className="agro-ent-toggle-row">
            <span>Sync to map</span>
            <input type="checkbox" checked={w.syncMap} onChange={e => onChange({ syncMap: e.target.checked })} />
          </div>
        </div>
      ) : null}
    </>
  )
}

function WidgetChart({ w, sources }: { w: DashWidget; sources: AgroRegistrySource[] }) {
  const cfg = buildChartJsConfig(w, sources)
  if (!cfg.ok) return <div style={{ color: 'var(--ae-muted)', fontSize: 13 }}>Add a source and pick Y axis.</div>
  if (cfg.type === 'bar') return <Bar data={cfg.data} options={cfg.options} />
  if (cfg.type === 'line') return <Line data={cfg.data} options={cfg.options} />
  if (cfg.type === 'scatter') return <Scatter data={cfg.data} options={cfg.options} />
  return <Pie data={cfg.data} options={cfg.options} />
}
