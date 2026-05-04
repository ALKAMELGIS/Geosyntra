import { useCallback, useEffect, useMemo, useState } from 'react'
import Map, { Layer, NavigationControl, Source } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import { Bar, Doughnut, Line, Pie, Scatter } from 'react-chartjs-2'
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
import { appPrompt } from '../../lib/appDialog'
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
const THEME_LS_KEY = 'agroEnterprise_theme_v1'

export type AgroEntTheme = 'dark' | 'light' | 'green' | 'blue' | 'amber'

const SAT = 'mapbox://styles/mapbox/satellite-v9'
const LIGHT = 'mapbox://styles/mapbox/dark-v11'

function isAgroEntTheme(s: string): s is AgroEntTheme {
  return s === 'dark' || s === 'light' || s === 'green' || s === 'blue' || s === 'amber'
}

const MAP_LAYER_BY_THEME: Record<
  AgroEntTheme,
  { fill: string; line: string; pt: string; path: string }
> = {
  dark: { fill: '#635bff', line: '#a78bfa', pt: '#2dd4bf', path: '#fbbf24' },
  light: { fill: '#4f46e5', line: '#818cf8', pt: '#0d9488', path: '#d97706' },
  green: { fill: '#059669', line: '#34d399', pt: '#a7f3d0', path: '#fbbf24' },
  blue: { fill: '#2563eb', line: '#60a5fa', pt: '#22d3ee', path: '#f97316' },
  amber: { fill: '#d97706', line: '#fbbf24', pt: '#fcd34d', path: '#ea580c' },
}

export type ChartKind = 'bar' | 'line' | 'scatter' | 'pie' | 'heatmap'

/** Refines how Chart.js renders a widget when chosen from the visual gallery. */
export type VisualChartPreset =
  | 'default'
  | 'donut'
  | 'area'
  | 'horizontalBar'
  | 'bubble'
  | 'stackedBar'
  | 'stackedColumn'

export type DashWidget = {
  id: string
  kind: ChartKind
  /** Optional gallery preset (older saved dashboards omit this). */
  visualPreset?: VisualChartPreset
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

/** Full visual gallery: icon + label; maps to Chart.js via kind + visualPreset. */
const ENTERPRISE_VISUAL_GALLERY: ReadonlyArray<{
  id: string
  label: string
  icon: string
  kind: ChartKind
  visualPreset?: VisualChartPreset
}> = [
  { id: 'bar', label: 'Bar Chart', icon: 'fa-chart-bar', kind: 'bar', visualPreset: 'horizontalBar' },
  { id: 'column', label: 'Column Chart', icon: 'fa-chart-column', kind: 'bar' },
  { id: 'line', label: 'Line Chart', icon: 'fa-chart-line', kind: 'line' },
  { id: 'area', label: 'Area Chart', icon: 'fa-chart-area', kind: 'line', visualPreset: 'area' },
  { id: 'pie', label: 'Pie Chart', icon: 'fa-chart-pie', kind: 'pie' },
  { id: 'donut', label: 'Donut Chart', icon: 'fa-chart-pie', kind: 'pie', visualPreset: 'donut' },
  { id: 'scatter', label: 'Scatter Plot', icon: 'fa-braille', kind: 'scatter' },
  { id: 'bubble', label: 'Bubble Chart', icon: 'fa-circle-nodes', kind: 'scatter', visualPreset: 'bubble' },
  { id: 'histogram', label: 'Histogram', icon: 'fa-chart-column', kind: 'bar' },
  { id: 'box', label: 'Box Plot', icon: 'fa-table-cells', kind: 'bar' },
  { id: 'radar', label: 'Radar Chart', icon: 'fa-bullseye', kind: 'line' },
  { id: 'heatmap', label: 'Heatmap', icon: 'fa-fire', kind: 'heatmap' },
  { id: 'treemap', label: 'Treemap', icon: 'fa-border-all', kind: 'bar' },
  { id: 'waterfall', label: 'Waterfall Chart', icon: 'fa-arrow-down-wide-short', kind: 'bar' },
  { id: 'funnel', label: 'Funnel Chart', icon: 'fa-filter', kind: 'bar' },
  { id: 'pyramid', label: 'Pyramid Chart', icon: 'fa-layer-group', kind: 'bar' },
  { id: 'stackedBar', label: 'Stacked Bar Chart', icon: 'fa-chart-bar', kind: 'bar', visualPreset: 'stackedBar' },
  { id: 'stackedColumn', label: 'Stacked Column Chart', icon: 'fa-chart-column', kind: 'bar', visualPreset: 'stackedColumn' },
  { id: 'combo', label: 'Combo Chart (Mixed Chart)', icon: 'fa-shapes', kind: 'line' },
  { id: 'gantt', label: 'Gantt Chart', icon: 'fa-bars-progress', kind: 'bar', visualPreset: 'horizontalBar' },
  { id: 'lollipop', label: 'Lollipop Chart', icon: 'fa-grip-lines-vertical', kind: 'line' },
  { id: 'dot', label: 'Dot Plot', icon: 'fa-ellipsis', kind: 'scatter' },
  { id: 'polar', label: 'Polar Area Chart', icon: 'fa-compass', kind: 'pie' },
  { id: 'candle', label: 'Candlestick Chart', icon: 'fa-chart-line', kind: 'line' },
  { id: 'ohlc', label: 'OHLC Chart', icon: 'fa-left-right', kind: 'bar' },
]

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

function chartPalette(theme: AgroEntTheme) {
  const palettes: Record<
    AgroEntTheme,
    { text: string; grid: string; accent: string; teal: string; pie: string[]; heatmap: string; bar: string }
  > = {
    dark: {
      text: '#cbd5f5',
      grid: 'rgba(148,163,184,0.15)',
      accent: '#635bff',
      teal: '#2dd4bf',
      pie: ['#635bff', '#2dd4bf', '#f472b6', '#fbbf24', '#38bdf8', '#a78bfa', '#fb7185', '#4ade80'],
      heatmap: 'rgba(99,91,255,0.55)',
      bar: 'rgba(99,91,255,0.55)',
    },
    light: {
      text: '#334155',
      grid: 'rgba(100,116,139,0.22)',
      accent: '#4f46e5',
      teal: '#0d9488',
      pie: ['#4f46e5', '#0d9488', '#db2777', '#d97706', '#0284c7', '#7c3aed', '#e11d48', '#16a34a'],
      heatmap: 'rgba(79,70,229,0.55)',
      bar: 'rgba(79,70,229,0.55)',
    },
    green: {
      text: '#d1fae5',
      grid: 'rgba(52,211,153,0.18)',
      accent: '#059669',
      teal: '#34d399',
      pie: ['#059669', '#34d399', '#6ee7b7', '#fbbf24', '#38bdf8', '#a7f3d0', '#047857', '#10b981'],
      heatmap: 'rgba(5,150,105,0.55)',
      bar: 'rgba(5,150,105,0.55)',
    },
    blue: {
      text: '#dbeafe',
      grid: 'rgba(96,165,250,0.18)',
      accent: '#2563eb',
      teal: '#38bdf8',
      pie: ['#2563eb', '#38bdf8', '#22d3ee', '#f472b6', '#fbbf24', '#818cf8', '#60a5fa', '#93c5fd'],
      heatmap: 'rgba(37,99,235,0.55)',
      bar: 'rgba(37,99,235,0.55)',
    },
    amber: {
      text: '#fef3c7',
      grid: 'rgba(251,191,36,0.2)',
      accent: '#d97706',
      teal: '#fbbf24',
      pie: ['#d97706', '#fbbf24', '#fcd34d', '#ea580c', '#fb923c', '#f59e0b', '#fdba74', '#fef08a'],
      heatmap: 'rgba(217,119,6,0.55)',
      bar: 'rgba(217,119,6,0.55)',
    },
  }
  return palettes[theme]
}

function buildChartJsConfig(
  w: DashWidget,
  sources: AgroRegistrySource[],
  theme: AgroEntTheme,
):
  | { ok: true; type: 'bar' | 'line' | 'scatter' | 'pie' | 'doughnut'; data: any; options: any }
  | { ok: false } {
  const src = sources.find(s => s.id === w.sourceId)
  if (!src || !w.yField) return { ok: false }
  const preset = w.visualPreset ?? 'default'
  const pal = chartPalette(theme)
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
    const pieData = {
      labels: slice.map((r, i) => (w.xField && r[w.xField] != null ? String(r[w.xField]) : `R${i + 1}`)),
      datasets: [
        {
          data: slice.map(r => coerceNumber(r[w.yField]) ?? 0),
          backgroundColor: pal.pie,
          borderWidth: 0,
        },
      ],
    }
    const pieLegend = { ...commonOpts.plugins.legend, position: 'bottom' as const }
    if (preset === 'donut') {
      return {
        ok: true,
        type: 'doughnut',
        data: pieData,
        options: {
          ...commonOpts,
          cutout: '58%',
          plugins: { ...commonOpts.plugins, legend: pieLegend },
        },
      }
    }
    return {
      ok: true,
      type: 'pie',
      data: pieData,
      options: { ...commonOpts, plugins: { ...commonOpts.plugins, legend: pieLegend } },
    }
  }

  if (w.kind === 'scatter' || w.kind === 'heatmap') {
    const isBubble = preset === 'bubble'
    const rowPts = src.rows
      .map(r => {
        const x = coerceNumber(w.xField ? r[w.xField] : null)
        const y = coerceNumber(r[w.yField])
        if (x === null || y === null) return null
        let rPix = 5
        if (isBubble) {
          const wv = w.valueField ? coerceNumber(r[w.valueField]) : null
          if (wv != null && !Number.isNaN(wv)) rPix = Math.min(24, Math.max(4, Math.abs(wv) / 2 + 4))
          else rPix = Math.min(20, Math.max(4, Math.abs(y) / 4 + 4))
        }
        return { x, y, rPix }
      })
      .filter(Boolean) as { x: number; y: number; rPix: number }[]
    const pts = rowPts.map(p => ({ x: p.x, y: p.y }))
    const pointRadius = isBubble ? rowPts.map(p => p.rPix) : w.kind === 'heatmap' ? 10 : 5
    return {
      ok: true,
      type: 'scatter',
      data: {
        datasets: [
          {
            label: w.title,
            data: pts,
            backgroundColor: w.kind === 'heatmap' ? pal.heatmap : pal.accent,
            pointRadius,
            showLine: w.trendline,
            tension: 0.25,
          },
        ],
      },
      options: commonOpts,
    }
  }

  if (w.kind === 'line') {
    const fillArea = preset === 'area' || w.trendline
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
            backgroundColor: `${pal.teal}22`,
            fill: fillArea,
            tension: 0.35,
            spanGaps: true,
          },
        ],
      },
      options: commonOpts,
    }
  }

  const isH = preset === 'horizontalBar' || preset === 'stackedBar'
  const isStack = preset === 'stackedBar' || preset === 'stackedColumn'
  const barScales =
    commonOpts.scales && isStack
      ? {
          x: { ...commonOpts.scales.x, stacked: true },
          y: { ...commonOpts.scales.y, stacked: true },
        }
      : commonOpts.scales

  return {
    ok: true,
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: w.yField, data: dataY, backgroundColor: pal.bar, borderRadius: 6 }],
    },
    options: {
      ...commonOpts,
      ...(isH ? { indexAxis: 'y' as const } : {}),
      scales: barScales,
    },
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
            title: 'لوحة المؤسسية',
            subtitle: 'مراقبة، تحليلات مكانية، وإدارة مصادر البيانات.',
            theme: 'المظهر',
            themeLight: 'فاتح',
            themeDark: 'داكن',
            themeGreen: 'أخضر',
            themeBlue: 'أزرق',
            themeOther: 'آخر (كهرماني)',
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
            cardResizeFull: 'عرض كامل (صف)',
            cardResizeHalf: 'نصف العرض (عمودين)',
          }
        : {
            title: 'Agro Enterprise',
            subtitle: 'Monitoring, spatial visualization, and multi-source analytics.',
            theme: 'Theme',
            themeLight: 'Light',
            themeDark: 'Dark',
            themeGreen: 'Green',
            themeBlue: 'Blue',
            themeOther: 'Other (amber)',
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
            cardResizeFull: 'Full width (row)',
            cardResizeHalf: 'Half width (2 columns)',
          },
    [ar],
  )

  const [sideCollapsed, setSideCollapsed] = useState(false)
  const [nav, setNav] = useState(0)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [themeMenuOpen, setThemeMenuOpen] = useState(false)
  const [entTheme, setEntTheme] = useState<AgroEntTheme>('dark')
  const [widgets, setWidgets] = useState<DashWidget[]>([])
  const [sources, setSources] = useState<AgroRegistrySource[]>([])
  const [sourcesCardWide, setSourcesCardWide] = useState(true)
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
      const j = JSON.parse(raw) as {
        widgets?: DashWidget[]
        sources?: AgroRegistrySource[]
        sourcesCardWide?: boolean
      }
      if (Array.isArray(j.widgets)) setWidgets(j.widgets)
      if (Array.isArray(j.sources)) setSources(j.sources)
      if (typeof j.sourcesCardWide === 'boolean') setSourcesCardWide(j.sourcesCardWide)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    try {
      const r = localStorage.getItem(THEME_LS_KEY)
      if (r && isAgroEntTheme(r)) setEntTheme(r)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(THEME_LS_KEY, entTheme)
    } catch {
      /* quota */
    }
  }, [entTheme])

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ widgets, sources, sourcesCardWide }))
    } catch {
      /* quota */
    }
  }, [widgets, sources, sourcesCardWide])

  useEffect(() => {
    if (!modal) return
    setGisLoading(true)
    void loadGisMapSavedLayers()
      .then(setGisLayers)
      .finally(() => setGisLoading(false))
  }, [modal])

  const merged = useMemo(() => mergeSourcesGeoJson(sources), [sources])

  const addWidgetFromGallery = useCallback((entry: (typeof ENTERPRISE_VISUAL_GALLERY)[number]) => {
    const first = sources[0]
    const fields = first?.fields ?? []
    const preset = entry.visualPreset
    setWidgets(prev => [
      ...prev,
      {
        id: uid(),
        kind: entry.kind,
        ...(preset ? { visualPreset: preset } : {}),
        title: `${entry.label} ${prev.length + 1}`,
        sourceId: first?.id ?? null,
        xField: fields[0] ?? '',
        yField: fields[1] ?? fields[0] ?? '',
        valueField: fields[2] ?? '',
        trendline: false,
        groupByField: '',
        syncMap: false,
        wide: entry.kind === 'heatmap' || (entry.kind === 'line' && preset === 'area'),
      },
    ])
    setGalleryOpen(false)
    setThemeMenuOpen(false)
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
  const mapColors = MAP_LAYER_BY_THEME[entTheme]

  return (
    <div className={`page agro-ent-root agro-ent-theme--${entTheme}`} dir={direction}>
      <h1 className="agro-ent-sr">{t.title}</h1>
      <div className="agro-ent-shell">
        <aside className={`agro-ent-side${sideCollapsed ? ' agro-ent-side--collapsed' : ''}`}>
          <div className="agro-ent-side-head">
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
          <div className="agro-ent-theme-wrap">
            <button
              type="button"
              className="agro-ent-theme-btn"
              aria-expanded={themeMenuOpen}
              title={t.theme}
              onClick={() => {
                setThemeMenuOpen(o => !o)
                setGalleryOpen(false)
              }}
            >
              <i className="fa-solid fa-palette" />
              {!sideCollapsed ? <span className="agro-ent-theme-btn-label">{t.theme}</span> : null}
            </button>
            {themeMenuOpen ? (
              <div className="agro-ent-theme-menu" role="menu" aria-label={t.theme}>
                {(
                  [
                    ['dark', t.themeDark],
                    ['light', t.themeLight],
                    ['green', t.themeGreen],
                    ['blue', t.themeBlue],
                    ['amber', t.themeOther],
                  ] as const
                ).map(([id, lab]) => (
                  <button
                    key={id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={entTheme === id}
                    className={entTheme === id ? 'agro-ent-theme-opt agro-ent-theme-opt--on' : 'agro-ent-theme-opt'}
                    onClick={() => {
                      setEntTheme(id)
                      setThemeMenuOpen(false)
                    }}
                  >
                    <span className={`agro-ent-theme-swatch agro-ent-theme-swatch--${id}`} aria-hidden />
                    {lab}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="agro-ent-gallery-wrap">
            <button
              type="button"
              className="agro-ent-gallery-btn"
              onClick={() => {
                setGalleryOpen(o => !o)
                setThemeMenuOpen(false)
              }}
            >
              <i className="fa-solid fa-border-all" />
              {!sideCollapsed ? t.gallery : null}
            </button>
            {galleryOpen ? (
              <div className="agro-ent-gallery-menu" role="menu" aria-label={t.gallery}>
                {ENTERPRISE_VISUAL_GALLERY.map(entry => (
                  <button
                    key={entry.id}
                    type="button"
                    role="menuitem"
                    className="agro-ent-gallery-tile"
                    title={entry.label}
                    onClick={() => addWidgetFromGallery(entry)}
                  >
                    <i className={`fa-solid ${entry.icon}`} aria-hidden />
                    <span className="agro-ent-gallery-tile__label">{entry.label}</span>
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
                <section
                  className={`agro-ent-widget${sourcesCardWide ? ' agro-ent-widget--wide' : ' agro-ent-widget--half'}`}
                >
                  <div className="agro-ent-w-head">
                    <span className="agro-ent-w-title">{t.sources}</span>
                    <div className="agro-ent-w-actions">
                      <button
                        type="button"
                        className="agro-ent-icon-btn agro-ent-icon-btn--resize"
                        title={sourcesCardWide ? t.cardResizeHalf : t.cardResizeFull}
                        aria-label={sourcesCardWide ? t.cardResizeHalf : t.cardResizeFull}
                        onClick={() => setSourcesCardWide(w => !w)}
                      >
                        <i
                          className={`fa-solid ${sourcesCardWide ? 'fa-down-left-and-up-right-to-center' : 'fa-up-right-and-down-left-from-center'}`}
                          aria-hidden
                        />
                      </button>
                    </div>
                  </div>
                  <div className="agro-ent-w-body agro-ent-sources-list">
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
                      <button
                        type="button"
                        className="agro-ent-icon-btn agro-ent-icon-btn--resize"
                        title={w.wide ? t.cardResizeHalf : t.cardResizeFull}
                        aria-label={w.wide ? t.cardResizeHalf : t.cardResizeFull}
                        onClick={() => updateWidget(w.id, { wide: !w.wide })}
                      >
                        <i
                          className={`fa-solid ${w.wide ? 'fa-down-left-and-up-right-to-center' : 'fa-up-right-and-down-left-from-center'}`}
                          aria-hidden
                        />
                      </button>
                      <WidgetSettingsPopover w={w} sources={sources} onChange={patch => updateWidget(w.id, patch)} />
                    </div>
                  </div>
                  <div className="agro-ent-w-body">
                    <WidgetChart w={w} sources={sources} theme={entTheme} />
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
                          paint={{ 'fill-color': mapColors.fill, 'fill-opacity': 0.28 }}
                          filter={['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]]}
                        />
                        <Layer
                          id="agro-line"
                          type="line"
                          paint={{ 'line-color': mapColors.line, 'line-width': 2 }}
                          filter={['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]]}
                        />
                        <Layer
                          id="agro-pt"
                          type="circle"
                          paint={{
                            'circle-radius': 6,
                            'circle-color': mapColors.pt,
                            'circle-stroke-width': 1,
                            'circle-stroke-color': entTheme === 'light' ? '#1e293b' : '#fff',
                          }}
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
                        <Layer id="agro-path-line" type="line" paint={{ 'line-color': mapColors.path, 'line-width': 3 }} />
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
              <button
                type="button"
                className="agro-ent-opt"
                onClick={() => {
                  void (async () => {
                    const u = await appPrompt('Enter a URL for remote GeoJSON or zip.', '', { title: 'URL' })
                    if (u?.trim()) void onUrl(u.trim())
                  })()
                }}
              >
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

function WidgetChart({ w, sources, theme }: { w: DashWidget; sources: AgroRegistrySource[]; theme: AgroEntTheme }) {
  const cfg = buildChartJsConfig(w, sources, theme)
  if (!cfg.ok) return <div style={{ color: 'var(--ae-muted)', fontSize: 13 }}>Add a source and pick Y axis.</div>
  if (cfg.type === 'bar') return <Bar data={cfg.data} options={cfg.options} />
  if (cfg.type === 'line') return <Line data={cfg.data} options={cfg.options} />
  if (cfg.type === 'scatter') return <Scatter data={cfg.data} options={cfg.options} />
  if (cfg.type === 'doughnut') return <Doughnut data={cfg.data} options={cfg.options} />
  return <Pie data={cfg.data} options={cfg.options} />
}
