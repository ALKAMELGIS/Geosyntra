import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import Chart from 'chart.js/auto'
import { loadGisMapSavedLayers } from '../../lib/gisMapLayerStore'
import { DEVELOP_DATA_CONTEXT_LS_KEY } from '../../lib/geoAiChatClaude'
import type { LayerData } from '../satellite/components/LayerManager'
import { parseFile, parseRemoteUrlAsFile } from '../../utils/FileLoader'
import './develop-dashboard.css'

const STRUCTURES_URL =
  'https://services1.arcgis.com/jz3ndhbYV5K9NwI8/ArcGIS/rest/services/Agro_Structures/FeatureServer/21'
const CROPS_URL =
  'https://services1.arcgis.com/jz3ndhbYV5K9NwI8/ArcGIS/rest/services/Agro_Structures/FeatureServer/32'

type LayerOrigin = 'sample' | 'user'

/** Tabular CSV (no lat/lon) — Power BI “Data” pane style. */
type CsvDataset = {
  id: string
  name: string
  columns: string[]
  rows: Record<string, unknown>[]
  origin: LayerOrigin
}

type RightPowerBiPanel = 'none' | 'filters' | 'visualizations' | 'data'

type LayerState = {
  name: string
  type: 'feature' | 'table'
  url: string
  data: GeoJSON.FeatureCollection
  fields: string[]
  visible: boolean
  /** `sample` = bundled demo layers; `user` = added via Add Source Data / GIS Content / etc. */
  origin: LayerOrigin
}

type StatCardRow = {
  id: string
  layerKey: string
  field: string
  agg: string
  result: number
  layerName: string
}

const CHART_TOOLS: Array<{ chart: string; icon: string; label: string }> = [
  { chart: 'table', icon: 'fa-solid fa-table', label: 'Table' },
  { chart: 'matrix', icon: 'fa-solid fa-th', label: 'Matrix' },
  { chart: 'stackedBar', icon: 'fa-solid fa-chart-bar', label: 'Stacked Bar' },
  { chart: 'clusteredBar', icon: 'fa-solid fa-chart-simple', label: 'Clustered Bar' },
  { chart: 'stackedColumn', icon: 'fa-solid fa-chart-column', label: 'Stacked Column' },
  { chart: 'clusteredColumn', icon: 'fa-solid fa-chart-column', label: 'Clustered Col' },
  { chart: '100stackedBar', icon: 'fa-solid fa-percent', label: '100% Stacked Bar' },
  { chart: '100stackedColumn', icon: 'fa-solid fa-percent', label: '100% Stacked Col' },
  { chart: 'line', icon: 'fa-solid fa-chart-line', label: 'Line Chart' },
  { chart: 'area', icon: 'fa-solid fa-chart-area', label: 'Area Chart' },
  { chart: 'stackedArea', icon: 'fa-solid fa-layer-group', label: 'Stacked Area' },
  { chart: 'lineClusteredColumn', icon: 'fa-solid fa-chart-line', label: 'Line+Clustered Col' },
  { chart: 'lineStackedColumn', icon: 'fa-solid fa-chart-line', label: 'Line+Stacked Col' },
  { chart: 'ribbon', icon: 'fa-solid fa-bars-staggered', label: 'Ribbon Chart' },
  { chart: 'waterfall', icon: 'fa-solid fa-water', label: 'Waterfall' },
  { chart: 'funnel', icon: 'fa-solid fa-filter', label: 'Funnel' },
  { chart: 'scatter', icon: 'fa-solid fa-braille', label: 'Scatter' },
  { chart: 'pie', icon: 'fa-solid fa-chart-pie', label: 'Pie Chart' },
  { chart: 'donut', icon: 'fa-solid fa-chart-pie', label: 'Donut' },
  { chart: 'treemap', icon: 'fa-solid fa-tree', label: 'Treemap' },
  { chart: 'map', icon: 'fa-solid fa-map', label: 'Map' },
  { chart: 'filledMap', icon: 'fa-solid fa-map-location-dot', label: 'Filled Map' },
  { chart: 'azureMaps', icon: 'fa-brands fa-microsoft', label: 'Azure Maps' },
  { chart: 'gauge', icon: 'fa-solid fa-gauge-high', label: 'Gauge' },
  { chart: 'card', icon: 'fa-solid fa-id-card', label: 'Card' },
  { chart: 'multiRowCard', icon: 'fa-solid fa-address-card', label: 'Multi-row Card' },
  { chart: 'kpi', icon: 'fa-solid fa-chart-simple', label: 'KPI' },
  { chart: 'slicer', icon: 'fa-solid fa-scissors', label: 'Slicer' },
  { chart: 'dataTable', icon: 'fa-solid fa-database', label: 'Data Table' },
  { chart: 'rScript', icon: 'fa-brands fa-r-project', label: 'R Script' },
  { chart: 'pythonVisual', icon: 'fa-brands fa-python', label: 'Python Visual' },
  { chart: 'keyInfluencers', icon: 'fa-solid fa-chart-line', label: 'Key Influencers' },
  { chart: 'decompositionTree', icon: 'fa-solid fa-diagram-project', label: 'Decomposition Tree' },
  { chart: 'qa', icon: 'fa-solid fa-circle-question', label: 'Q&A' },
  { chart: 'smartNarrative', icon: 'fa-solid fa-comment-dots', label: 'Smart Narrative' },
]

async function fetchGeoJSON(url: string, isTable: boolean): Promise<GeoJSON.FeatureCollection> {
  const query = isTable
    ? `${url}/query?where=1%3D1&outFields=*&returnGeometry=false&f=geojson`
    : `${url}/query?where=1%3D1&outFields=*&returnGeometry=true&f=geojson`
  const resp = await fetch(query)
  if (!resp.ok) throw new Error(`GeoJSON request failed (${resp.status})`)
  return (await resp.json()) as GeoJSON.FeatureCollection
}

function computeAgg(values: number[], agg: string): number {
  if (!values.length) return 0
  if (agg === 'sum') return values.reduce((a, b) => a + b, 0)
  if (agg === 'avg') return values.reduce((a, b) => a + b, 0) / values.length
  if (agg === 'count') return values.length
  if (agg === 'max') return Math.max(...values)
  if (agg === 'min') return Math.min(...values)
  return 0
}

function newId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`
}

type AddGisLayerTab = 'arcgis' | 'database' | 'upload' | 'url'

type AddSourceWizard = 'home' | 'get-data' | 'gis-list' | 'tabs'

const GET_DATA_COMMON_SOURCES: Array<{
  id: string
  label: string
  icon: string
  iconColor?: string
}> = [
  { id: 'excel', label: 'Excel workbook', icon: 'fa-solid fa-file-excel', iconColor: '#217346' },
  { id: 'semantic', label: 'Power BI semantic models', icon: 'fa-solid fa-cubes', iconColor: '#f2c811' },
  { id: 'dataflows', label: 'Dataflows', icon: 'fa-solid fa-diagram-project', iconColor: '#742774' },
  { id: 'dataverse', label: 'Dataverse', icon: 'fa-solid fa-cloud', iconColor: '#742774' },
  { id: 'sql', label: 'SQL Server', icon: 'fa-solid fa-database', iconColor: '#cc2927' },
  { id: 'analysis', label: 'Analysis Services', icon: 'fa-solid fa-cube', iconColor: '#5c2d91' },
  { id: 'textcsv', label: 'Text/CSV', icon: 'fa-solid fa-file-lines', iconColor: '#107c10' },
  { id: 'web', label: 'Web', icon: 'fa-solid fa-globe', iconColor: '#0078d4' },
  { id: 'odata', label: 'OData feed', icon: 'fa-solid fa-table-cells', iconColor: '#e98300' },
  { id: 'blank', label: 'Blank query', icon: 'fa-solid fa-scroll', iconColor: '#c50f1f' },
]

type DiscoveredArcLayer = {
  id: number
  name: string
  kind: 'layer' | 'table'
  url: string
  geometryType?: string
}

function buildArcGisUrl(baseUrl: string, params: Record<string, string>) {
  const normalized = baseUrl.trim().replace(/#.*$/, '').replace(/\?.*$/, '').replace(/\/+$/, '')
  const u = new URL(normalized, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
  const search = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== '') search.set(k, v)
  })
  u.search = search.toString()
  return u.toString()
}

function normalizeArcGisServiceUrl(raw: string) {
  const trimmed = raw.trim().replace(/#.*$/, '').replace(/\?.*$/, '').replace(/\/+$/, '')
  const parts = trimmed.split('/')
  const last = parts[parts.length - 1]
  const prev = parts[parts.length - 2]
  if (/^\d+$/.test(last) && (prev === 'FeatureServer' || prev === 'MapServer')) {
    return parts.slice(0, -1).join('/')
  }
  return trimmed
}

async function fetchArcGisFeatureCollection(
  layerUrl: string,
  token: string,
  kind: 'layer' | 'table',
): Promise<GeoJSON.FeatureCollection> {
  let returnGeometry = kind !== 'table'
  try {
    const defUrl = buildArcGisUrl(layerUrl.replace(/\/+$/, ''), { f: 'json', token: token.trim() })
    const defRes = await fetch(defUrl)
    const json = await defRes.json()
    if (json?.error?.message) {
      const details = Array.isArray(json?.error?.details) ? json.error.details.join(' ') : ''
      throw new Error([json.error.message, details].filter(Boolean).join(' '))
    }
    if (json?.type && String(json.type).toLowerCase() === 'table') returnGeometry = false
    else if (typeof json?.geometryType === 'string') returnGeometry = true
  } catch {
    returnGeometry = kind !== 'table'
  }
  const url = buildArcGisUrl(`${layerUrl.replace(/\/+$/, '')}/query`, {
    where: '1=1',
    outFields: '*',
    returnGeometry: returnGeometry ? 'true' : 'false',
    outSR: '4326',
    f: 'geojson',
    resultRecordCount: '2000',
    token: token.trim(),
  })
  const res = await fetch(url)
  const geojson = await res.json()
  if (geojson?.error?.message) {
    const details = Array.isArray(geojson?.error?.details) ? geojson.error.details.join(' ') : ''
    throw new Error([geojson.error.message, details].filter(Boolean).join(' '))
  }
  if (!geojson || geojson.type !== 'FeatureCollection') throw new Error('Service did not return GeoJSON.')
  return geojson as GeoJSON.FeatureCollection
}

function isFeatureCollection(x: unknown): x is GeoJSON.FeatureCollection {
  return Boolean(x && typeof x === 'object' && (x as GeoJSON.FeatureCollection).type === 'FeatureCollection' && Array.isArray((x as GeoJSON.FeatureCollection).features))
}

function gisLayerCanImportToDashboard(layer: LayerData): boolean {
  if (isFeatureCollection(layer.data)) return true
  if (layer.url && layer.source === 'arcgis') return true
  return false
}

function uniqueRegistryKey(existingKeys: string[], displayName: string): string {
  const stem = (displayName.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '') || 'layer').toLowerCase()
  let key = stem
  let i = 0
  while (existingKeys.includes(key)) {
    i += 1
    key = `${stem}_${i}`
  }
  return key
}

export default function DevelopDashboard() {
  const mapElRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const leafletRef = useRef<Record<string, L.Layer>>({})
  const chartsHostRef = useRef<HTMLDivElement | null>(null)
  const chartInstancesRef = useRef<Chart[]>([])
  const [chartGen, setChartGen] = useState(0)

  const [layers, setLayers] = useState<Record<string, LayerState>>({})
  const [activeStatsLayer, setActiveStatsLayer] = useState('')
  const [statsField, setStatsField] = useState('')
  const [statsAgg, setStatsAgg] = useState('sum')
  const [selectedCharts, setSelectedCharts] = useState<Set<string>>(() => new Set(['table', 'line', 'kpi']))
  const [statCards, setStatCards] = useState<StatCardRow[]>([])
  const [linkStatus, setLinkStatus] = useState('')
  const [addGisOpen, setAddGisOpen] = useState(false)
  const [addWizard, setAddWizard] = useState<AddSourceWizard>('home')
  const [gisContentLayers, setGisContentLayers] = useState<LayerData[]>([])
  const [gisContentLoading, setGisContentLoading] = useState(false)
  const [getDataNotice, setGetDataNotice] = useState<string | null>(null)
  const [addTab, setAddTab] = useState<AddGisLayerTab>('arcgis')
  const [serviceUrl, setServiceUrl] = useState('')
  const [arcgisToken, setArcgisToken] = useState('')
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [discoverError, setDiscoverError] = useState<string | null>(null)
  const [discoveredLayers, setDiscoveredLayers] = useState<DiscoveredArcLayer[]>([])
  const [selectedDiscoveredUrl, setSelectedDiscoveredUrl] = useState('')
  const [layerModalName, setLayerModalName] = useState('')
  const [addingLayerKey, setAddingLayerKey] = useState<string | null>(null)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [remoteDataUrl, setRemoteDataUrl] = useState('')
  const addLayerFileInputRef = useRef<HTMLInputElement | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [rightSheet, setRightSheet] = useState<RightPowerBiPanel>('none')
  const [dataPaneSearch, setDataPaneSearch] = useState('')
  const [dataTreeOpen, setDataTreeOpen] = useState<Record<string, boolean>>({})
  const [csvDatasets, setCsvDatasets] = useState<CsvDataset[]>([])
  const [linkFrom, setLinkFrom] = useState('')
  const [linkTo, setLinkTo] = useState('')
  const [linkFieldFrom, setLinkFieldFrom] = useState('')
  const [linkFieldTo, setLinkFieldTo] = useState('')
  const [initError, setInitError] = useState<string | null>(null)

  const layerKeys = useMemo(() => Object.keys(layers), [layers])
  const sampleLayerKeys = useMemo(() => layerKeys.filter(k => layers[k]?.origin === 'sample'), [layerKeys, layers])
  const userLayerKeys = useMemo(() => layerKeys.filter(k => layers[k]?.origin === 'user'), [layerKeys, layers])

  const activeFields = useMemo(() => {
    if (!activeStatsLayer || !layers[activeStatsLayer]) return []
    return layers[activeStatsLayer].fields
  }, [activeStatsLayer, layers])

  useEffect(() => {
    if (activeFields.length && !activeFields.includes(statsField)) {
      setStatsField(activeFields[0] ?? '')
    }
  }, [activeFields, statsField])

  useEffect(() => {
    if (!addGisOpen) return
    let cancelled = false
    setGisContentLoading(true)
    void loadGisMapSavedLayers().then(rows => {
      if (!cancelled) setGisContentLayers(rows)
    }).finally(() => {
      if (!cancelled) setGisContentLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [addGisOpen])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1100px)')
    const sync = () => {
      if (mq.matches) setSidebarCollapsed(false)
    }
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    setDataTreeOpen(prev => {
      const next = { ...prev }
      for (const k of layerKeys) {
        const nk = `layer:${k}`
        if (next[nk] === undefined) next[nk] = true
      }
      return next
    })
  }, [layerKeys])

  /** Snapshot for Satellite Intelligence → Geo AI Chat (Claude); no full row payloads. */
  useEffect(() => {
    try {
      const snapshot = {
        updatedAt: new Date().toISOString(),
        layers: layerKeys.map(key => {
          const L = layers[key]
          const fc = L?.data
          const nFeat = Array.isArray(fc?.features) ? fc.features.length : 0
          return {
            key,
            name: L?.name,
            type: L?.type,
            origin: L?.origin,
            url: typeof L?.url === 'string' ? L.url.slice(0, 800) : '',
            fields: L?.fields ?? [],
            featureCount: nFeat,
            visible: L?.visible,
          }
        }),
        csvTables: csvDatasets.map(ds => ({
          id: ds.id,
          name: ds.name,
          origin: ds.origin,
          columns: ds.columns,
          rowCount: ds.rows.length,
        })),
      }
      localStorage.setItem(DEVELOP_DATA_CONTEXT_LS_KEY, JSON.stringify(snapshot))
    } catch {
      /* ignore quota / private mode */
    }
  }, [layerKeys, layers, csvDatasets])

  useEffect(() => {
    const el = mapElRef.current
    if (!el) return
    const map = L.map(el).setView([28.5, 34.5], 6)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© CartoDB',
    }).addTo(map)
    mapRef.current = map
    return () => {
      Object.values(leafletRef.current).forEach(layer => {
        try {
          map.removeLayer(layer)
        } catch {
          /* ignore */
        }
      })
      leafletRef.current = {}
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const structData = await fetchGeoJSON(STRUCTURES_URL, false)
        const cropsData = await fetchGeoJSON(CROPS_URL, true)
        if (cancelled) return
        const structFields = Object.keys(structData.features[0]?.properties ?? {})
        const cropFields = Object.keys(cropsData.features[0]?.properties ?? {})
        setLayers({
          agro_structures: {
            name: 'Agricultural Structures',
            type: 'feature',
            url: STRUCTURES_URL,
            data: structData,
            fields: structFields,
            visible: true,
            origin: 'sample',
          },
          crops_planted: {
            name: 'Planted Crops',
            type: 'table',
            url: CROPS_URL,
            data: cropsData,
            fields: cropFields,
            visible: true,
            origin: 'sample',
          },
        })
        setActiveStatsLayer('agro_structures')
        setStatsField(structFields[0] ?? '')
      } catch (e) {
        if (!cancelled) setInitError(e instanceof Error ? e.message : 'Failed to load default layers.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !Object.keys(layers).length) return
    for (const layer of Object.values(leafletRef.current)) {
      try {
        map.removeLayer(layer)
      } catch {
        /* ignore */
      }
    }
    leafletRef.current = {}
    for (const [key, layer] of Object.entries(layers)) {
      if (!layer.visible) continue
      if (layer.type === 'feature' && layer.data?.features?.length) {
        const gj = L.geoJSON(layer.data as any, {
          pointToLayer: (_f, latlng) =>
            L.circleMarker(latlng, { radius: 6, fillColor: '#2c7a4a', color: '#fff', weight: 1, opacity: 1, fillOpacity: 0.85 }),
          style: { color: '#3cac6e', weight: 2 },
          onEachFeature: (f, l) => {
            const props = (f.properties ?? {}) as Record<string, unknown>
            l.bindPopup(String(props.Farm_Name ?? props.Crop_Type ?? 'Feature'))
          },
        })
        gj.addTo(map)
        leafletRef.current[key] = gj
      }
      /* Table layers have no geometry: do not plot synthetic markers on the map. */
    }
  }, [layers])

  const destroyCharts = useCallback(() => {
    chartInstancesRef.current.forEach(c => c.destroy())
    chartInstancesRef.current = []
    const host = chartsHostRef.current
    if (host) host.innerHTML = ''
  }, [])

  const renderCharts = useCallback(() => {
    destroyCharts()
    const host = chartsHostRef.current
    if (!host) return
    const layer = layers[activeStatsLayer]
    if (!layer?.data?.features?.length) {
      host.innerHTML = '<div class="ddb-hint" style="padding:20px;">Select a data layer and click “Generate selected visuals”.</div>'
      return
    }
    const features = layer.data.features
    const numericFields = layer.fields.filter(f => features.some(feat => typeof (feat.properties as any)?.[f] === 'number'))
    const primaryNum = numericFields[0] || layer.fields[0]
    const labels = features.slice(0, 8).map((f, i) => String((f.properties as any)?.Farm_Name ?? `Item ${i + 1}`))
    const values = features.slice(0, 8).map(f => parseFloat(String((f.properties as any)?.[primaryNum] ?? 0)) || 0)

    const addChartCard = (title: string, type: string, dataConfig: any) => {
      const card = document.createElement('div')
      card.className = 'ddb-visual-card'
      const canvas = document.createElement('canvas')
      const titleEl = document.createElement('div')
      titleEl.className = 'ddb-visual-title'
      titleEl.innerHTML = `<i class="fa-solid fa-chart-simple" aria-hidden="true"></i> ${title}`
      card.appendChild(titleEl)
      card.appendChild(canvas)
      host.appendChild(card)
      const ch = new Chart(canvas.getContext('2d')!, { type: type as any, data: dataConfig.data, options: { responsive: true, maintainAspectRatio: true } })
      chartInstancesRef.current.push(ch)
    }

    for (const tool of selectedCharts) {
      if (tool === 'table' || tool === 'dataTable') {
        const tbl = document.createElement('div')
        tbl.className = 'ddb-visual-card'
        const headers = layer.fields.slice(0, 5)
        const rows = features.slice(0, 5)
        tbl.innerHTML = `<div class="ddb-visual-title"><i class="fa-solid fa-table"></i> ${tool === 'dataTable' ? 'Data Table' : 'Table'}</div>
          <div class="ddb-table-responsive"><table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>
          ${rows.map(r => `<tr>${headers.map(h => `<td>${String((r.properties as any)?.[h] ?? '-')}</td>`).join('')}</tr>`).join('')}
          </tbody></table></div>`
        host.appendChild(tbl)
      } else if (tool === 'matrix') {
        const matrix = document.createElement('div')
        matrix.className = 'ddb-visual-card'
        matrix.innerHTML = `<div class="ddb-visual-title"><i class="fa-solid fa-th"></i> Matrix</div><div class="ddb-table-responsive"><table><tr><th>Farm</th><th>${primaryNum}</th></tr>${labels
          .slice(0, 4)
          .map((l, i) => `<tr><td>${l}</td><td>${values[i]}</td></tr>`)
          .join('')}</table></div>`
        host.appendChild(matrix)
      } else if (tool === 'stackedBar' || tool === 'clusteredBar') {
        addChartCard(tool === 'stackedBar' ? 'Stacked Bar' : 'Clustered Bar', 'bar', {
          data: { labels, datasets: [{ label: primaryNum, data: values, backgroundColor: '#4c9a6e' }] },
        })
      } else if (tool === 'stackedColumn' || tool === 'clusteredColumn') {
        addChartCard(`${tool} chart`, 'bar', { data: { labels, datasets: [{ label: primaryNum, data: values }] } })
      } else if (tool === '100stackedBar') {
        const total = values.reduce((a, b) => a + b, 0) || 1
        const perc = values.map(v => (v / total) * 100)
        addChartCard('100% Stacked Bar', 'bar', {
          data: { labels, datasets: [{ label: 'Percentage', data: perc, backgroundColor: '#2b8c5e' }] },
        })
      } else if (tool === '100stackedColumn') {
        const t = values.reduce((a, b) => a + b, 0) || 1
        addChartCard('100% Stacked Column', 'bar', {
          data: { labels, datasets: [{ label: '% Share', data: values.map(v => (v / t) * 100) }] },
        })
      } else if (tool === 'line') {
        addChartCard('Line Chart', 'line', {
          data: { labels, datasets: [{ label: primaryNum, data: values, borderColor: '#2c7a4a' }] },
        })
      } else if (tool === 'area') {
        addChartCard('Area Chart', 'line', {
          data: { labels, datasets: [{ label: primaryNum, data: values, fill: true, backgroundColor: '#8fc9a3' }] },
        })
      } else if (tool === 'stackedArea') {
        addChartCard('Stacked Area', 'line', {
          data: { labels, datasets: [{ label: primaryNum, data: values, fill: true }] },
        })
      } else if (tool === 'lineClusteredColumn') {
        const card = document.createElement('div')
        card.className = 'ddb-visual-card'
        const canvas = document.createElement('canvas')
        const titleEl = document.createElement('div')
        titleEl.className = 'ddb-visual-title'
        titleEl.innerHTML = `<i class="fa-solid fa-chart-simple" aria-hidden="true"></i> Line + Clustered Column`
        card.appendChild(titleEl)
        card.appendChild(canvas)
        host.appendChild(card)
        const ch = new Chart(canvas.getContext('2d')!, {
          type: 'bar',
          data: {
            labels,
            datasets: [
              { type: 'bar', label: primaryNum, data: values },
              { type: 'line', label: 'Trend', data: values.map(v => v * 0.9), borderColor: '#1f5e3a' },
            ],
          },
          options: { responsive: true, maintainAspectRatio: true },
        } as any)
        chartInstancesRef.current.push(ch)
      } else if (tool === 'pie') {
        addChartCard('Pie Chart', 'pie', {
          data: {
            labels: labels.slice(0, 5),
            datasets: [{ data: values.slice(0, 5), backgroundColor: ['#2c7a4a', '#5a9e7a', '#8bc0a4', '#b1d4be', '#cfe8d8'] }],
          },
        })
      } else if (tool === 'donut') {
        addChartCard('Donut Chart', 'doughnut', {
          data: { labels: labels.slice(0, 4), datasets: [{ data: values.slice(0, 4), backgroundColor: ['#3cac6e', '#5a9e7a', '#8bc0a4', '#b1d4be'] }] },
        })
      } else if (tool === 'scatter') {
        addChartCard('Scatter Plot', 'scatter', {
          data: {
            datasets: [
              {
                label: primaryNum,
                data: features.slice(0, 12).map((f, i) => ({
                  x: i,
                  y: parseFloat(String((f.properties as any)?.[primaryNum] ?? 0)) || 0,
                })),
                backgroundColor: '#2c7a4a',
              },
            ],
          },
        })
      } else if (tool === 'waterfall') {
        addChartCard('Waterfall', 'bar', {
          data: { labels: ['Start', 'Step1', 'Step2', 'End'], datasets: [{ label: 'Delta', data: [100, 40, -30, 110] }] },
        })
      } else if (tool === 'funnel') {
        addChartCard('Funnel', 'bar', {
          data: { labels: ['Lead', 'Qualify', 'Proposal', 'Win'], datasets: [{ data: [120, 85, 42, 18] }] },
        })
      } else if (tool === 'gauge') {
        const avgVal = values.reduce((a, b) => a + b, 0) / (values.length || 1)
        const gauge = document.createElement('div')
        gauge.className = 'ddb-visual-card'
        gauge.innerHTML = `<div class="ddb-visual-title"><i class="fa-solid fa-gauge-high"></i> Gauge</div><div style="background:#e2e8f0; border-radius:40px; height:20px;"><div style="background:#2c7a4a; width:${Math.min(100, (avgVal / 200) * 100)}%; height:20px; border-radius:40px;"></div></div><div>Value: ${avgVal.toFixed(1)} / 200</div>`
        host.appendChild(gauge)
      } else if (tool === 'card') {
        const total = values.reduce((a, b) => a + b, 0)
        const card = document.createElement('div')
        card.className = 'ddb-visual-card'
        card.innerHTML = `<div class="ddb-visual-title"><i class="fa-solid fa-id-card"></i> Card</div><div style="font-size:2rem; font-weight:800;">${total.toFixed(0)}</div><div>Total ${primaryNum}</div>`
        host.appendChild(card)
      } else if (tool === 'kpi') {
        const kpi = document.createElement('div')
        kpi.className = 'ddb-visual-card'
        kpi.innerHTML = `<div class="ddb-visual-title"><i class="fa-solid fa-chart-simple"></i> KPI</div><div style="font-size:2rem;">${values[0] ?? 0}</div><div>Target: 150 | ${((((values[0] ?? 0) / 150) * 100) || 0).toFixed(0)}%</div>`
        host.appendChild(kpi)
      } else {
        const fb = document.createElement('div')
        fb.className = 'ddb-visual-card'
        fb.innerHTML = `<div class="ddb-visual-title"><i class="fa-solid fa-chart-simple"></i> ${tool.replace(/([A-Z])/g, ' $1')}</div><div>Static simulation for ${tool} based on ${layer.name}</div>`
        host.appendChild(fb)
      }
    }
  }, [activeStatsLayer, destroyCharts, layers, selectedCharts])

  useEffect(() => {
    if (!Object.keys(layers).length || !activeStatsLayer) return
    renderCharts()
    return () => destroyCharts()
  }, [layers, activeStatsLayer, selectedCharts, chartGen, renderCharts, destroyCharts])

  const toggleLayerVisible = (key: string, visible: boolean) => {
    setLayers(prev => {
      const cur = prev[key]
      if (!cur) return prev
      return { ...prev, [key]: { ...cur, visible } }
    })
  }

  const deleteUserLayer = useCallback(
    (key: string) => {
      const layer = layers[key]
      if (!layer || layer.origin !== 'user') return
      if (!window.confirm(`Delete layer "${layer.name}" from the registry? This cannot be undone.`)) return
      const nextKeys = layerKeys.filter(k => k !== key)
      setLayers(prev => {
        const { [key]: _removed, ...rest } = prev
        return rest
      })
      if (activeStatsLayer === key) setActiveStatsLayer(nextKeys[0] ?? '')
      if (linkFrom === key) {
        setLinkFrom('')
        setLinkFieldFrom('')
      }
      if (linkTo === key) {
        setLinkTo('')
        setLinkFieldTo('')
      }
      setStatCards(prev => prev.filter(c => c.layerKey !== key))
    },
    [layers, layerKeys, activeStatsLayer, linkFrom, linkTo],
  )

  const renderLayerCard = (key: string) => {
    const Lr = layers[key]
    if (!Lr) return null
    return (
      <div className="ddb-layer-card">
        <div className="ddb-layer-header">
          <label className="ddb-layer-check-label">
            <input
              type="checkbox"
              checked={Lr.visible}
              onChange={e => toggleLayerVisible(key, e.target.checked)}
            />{' '}
            <span className="ddb-layer-name">{Lr.name}</span>
          </label>
          <div className="ddb-layer-header-badges">
            <span className={`ddb-layer-origin-badge${Lr.origin === 'user' ? ' ddb-layer-origin-badge--user' : ''}`}>
              {Lr.origin === 'user' ? 'Yours' : 'Sample'}
            </span>
            <span className="ddb-layer-badge">{Lr.type}</span>
          </div>
        </div>
        <div className="ddb-layer-actions">
          <button type="button" className="ddb-btn ddb-small-btn" onClick={() => window.alert(`Fields: ${Lr.fields.join(', ')}`)}>
            Fields
          </button>
          {Lr.origin === 'user' ? (
            <button
              type="button"
              className="ddb-layer-delete-btn"
              title="Delete layer"
              aria-label={`Delete layer ${Lr.name}`}
              onClick={() => deleteUserLayer(key)}
            >
              <i className="fa-solid fa-trash" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  const resetAddGisForm = useCallback(() => {
    setAddWizard('home')
    setAddTab('arcgis')
    setServiceUrl('')
    setArcgisToken('')
    setIsDiscovering(false)
    setDiscoverError(null)
    setDiscoveredLayers([])
    setSelectedDiscoveredUrl('')
    setLayerModalName('')
    setAddingLayerKey(null)
    setUploadFile(null)
    setRemoteDataUrl('')
    setGetDataNotice(null)
  }, [])

  const openAddGisModal = useCallback(() => {
    resetAddGisForm()
    setAddGisOpen(true)
  }, [resetAddGisForm])

  const closeAddGisModal = useCallback(() => {
    setAddGisOpen(false)
    resetAddGisForm()
  }, [resetAddGisForm])

  const switchAddTab = useCallback((t: AddGisLayerTab) => {
    setDiscoverError(null)
    setAddTab(t)
  }, [])

  const goAddWizardHome = useCallback(() => {
    setDiscoverError(null)
    setGetDataNotice(null)
    setAddWizard('home')
  }, [])

  const expandToPanel = useCallback((panelId: string) => {
    setSidebarCollapsed(false)
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document.getElementById(panelId)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      })
    })
  }, [])

  const toggleRightSheet = useCallback((panel: Exclude<RightPowerBiPanel, 'none'>) => {
    setRightSheet(prev => (prev === panel ? 'none' : panel))
  }, [])

  const toggleDataTreeNode = useCallback((key: string) => {
    setDataTreeOpen(prev => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const pickGetDataSource = useCallback((id: string) => {
    setDiscoverError(null)
    setGetDataNotice(null)
    if (id === 'excel' || id === 'textcsv') {
      setAddWizard('tabs')
      setAddTab('upload')
      return
    }
    if (id === 'web' || id === 'odata') {
      setAddWizard('tabs')
      setAddTab('url')
      return
    }
    if (id === 'sql' || id === 'analysis') {
      setAddWizard('tabs')
      setAddTab('database')
      return
    }
    const notices: Record<string, string> = {
      semantic:
        'Semantic models are not connected in this toolkit. Export data or use GIS Content / ArcGIS instead.',
      dataflows: 'Dataflows are not available here. Use GIS Map dataflows or upload a file.',
      dataverse: 'Dataverse is not wired in this view. Use GIS Content or Web to reach your data.',
      blank: 'Blank query is not available in Develop Dashboard. Use GIS Map for advanced queries.',
    }
    setGetDataNotice(notices[id] ?? 'This source is not available in this screen yet.')
  }, [])

  const importGisContentLayer = useCallback(
    async (layer: LayerData) => {
      if (!gisLayerCanImportToDashboard(layer)) return
      const opKey = `gis:${String(layer.id)}`
      setAddingLayerKey(opKey)
      setDiscoverError(null)
      try {
        let data: GeoJSON.FeatureCollection
        let layerType: 'feature' | 'table' = 'feature'
        const url = layer.url?.trim() || `gis-content:${String(layer.id)}`

        if (isFeatureCollection(layer.data)) {
          data = layer.data
          if (data.features.length === 0) throw new Error('Layer has no features.')
        } else if (layer.url && layer.source === 'arcgis') {
          const def = layer.arcgisLayerDefinition
          const isTable = def?.type === 'table' || String(def?.type || '').toLowerCase() === 'table'
          const kind: 'layer' | 'table' = isTable ? 'table' : 'layer'
          layerType = kind === 'table' ? 'table' : 'feature'
          const token = layer.authToken || ''
          data = await fetchArcGisFeatureCollection(layer.url, token, kind)
        } else {
          throw new Error('Unsupported layer format for this dashboard.')
        }

        const fields = Object.keys(data.features[0]?.properties ?? {})
        const displayName = layer.name?.trim() || 'Layer'
        setLayers(prev => {
          const key = uniqueRegistryKey(Object.keys(prev), displayName)
          return {
            ...prev,
            [key]: {
              name: displayName,
              type: layerType,
              url,
              data,
              fields,
              visible: true,
              origin: 'user',
            },
          }
        })
        closeAddGisModal()
      } catch (e: unknown) {
        setDiscoverError(e instanceof Error ? e.message : 'Failed to add layer from GIS Content.')
      } finally {
        setAddingLayerKey(null)
      }
    },
    [closeAddGisModal],
  )

  const discoverArcGisLayers = useCallback(async () => {
    const base = normalizeArcGisServiceUrl(serviceUrl)
    if (!base) return
    setIsDiscovering(true)
    setDiscoverError(null)
    setDiscoveredLayers([])
    setSelectedDiscoveredUrl('')
    try {
      const url = buildArcGisUrl(base, { f: 'json', token: arcgisToken.trim() })
      const res = await fetch(url, { method: 'GET' })
      const json = await res.json()
      if (json?.error?.message) {
        const details = Array.isArray(json?.error?.details) ? json.error.details.join(' ') : ''
        throw new Error([json.error.message, details].filter(Boolean).join(' '))
      }
      const layersArr = Array.isArray(json?.layers) ? json.layers : []
      const tablesArr = Array.isArray(json?.tables) ? json.tables : []
      const discovered: DiscoveredArcLayer[] = [...layersArr.map((l: any) => ({ ...l, kind: 'layer' as const })), ...tablesArr.map((t: any) => ({ ...t, kind: 'table' as const }))]
        .filter((l: any) => typeof l?.id === 'number' && typeof l?.name === 'string')
        .map((l: any) => ({
          id: l.id as number,
          name: l.name as string,
          kind: l.kind as 'layer' | 'table',
          url: `${base.replace(/\/+$/, '')}/${l.id}`,
          geometryType: typeof l?.geometryType === 'string' ? (l.geometryType as string) : undefined,
        }))
      if (discovered.length === 0) throw new Error('No layers/tables found in this service URL.')
      setDiscoveredLayers(discovered)
      setSelectedDiscoveredUrl(discovered[0]!.url)
      setLayerModalName(prev => (prev.trim() ? prev : discovered[0]!.name))
    } catch (e: unknown) {
      setDiscoverError(e instanceof Error ? e.message : 'Failed to connect to service.')
    } finally {
      setIsDiscovering(false)
    }
  }, [serviceUrl, arcgisToken])

  const addArcGisLayerToRegistry = useCallback(
    async (l: DiscoveredArcLayer) => {
      const opKey = `arcgis:${l.url}`
      setAddingLayerKey(opKey)
      setDiscoverError(null)
      try {
        const data = await fetchArcGisFeatureCollection(l.url, arcgisToken, l.kind)
        const displayName = layerModalName.trim() || l.name
        const fields = Object.keys(data.features[0]?.properties ?? {})
        setLayers(prev => {
          const key = uniqueRegistryKey(Object.keys(prev), displayName)
          return {
            ...prev,
            [key]: {
              name: displayName,
              type: l.kind === 'table' ? 'table' : 'feature',
              url: l.url,
              data,
              fields,
              visible: true,
              origin: 'user',
            },
          }
        })
        closeAddGisModal()
      } catch (e: unknown) {
        setDiscoverError(e instanceof Error ? e.message : 'Failed to add layer.')
      } finally {
        setAddingLayerKey(null)
      }
    },
    [arcgisToken, layerModalName, closeAddGisModal],
  )

  const addUploadLayerToRegistry = useCallback(async () => {
    if (!uploadFile) return
    const opKey = `upload:${uploadFile.name}`
    setAddingLayerKey(opKey)
    setDiscoverError(null)
    try {
      const parsed = await parseFile(uploadFile)
      if (parsed.type === 'table') {
        const rows = parsed.data as Record<string, unknown>[]
        if (!Array.isArray(rows) || rows.length === 0) throw new Error('CSV has no data rows.')
        const columns = Object.keys(rows[0] ?? {})
        if (!columns.length) throw new Error('CSV has no columns.')
        const displayName = layerModalName.trim() || uploadFile.name.replace(/\.[^.]+$/, '').trim() || 'Table'
        const id = newId()
        setCsvDatasets(prev => [
          ...prev,
          { id, name: displayName, columns, rows, origin: 'user' },
        ])
        setDataTreeOpen(prev => ({ ...prev, [`csv:${id}`]: true }))
        setRightSheet('data')
        closeAddGisModal()
        return
      }
      if (parsed.type !== 'geojson') throw new Error('File must contain GIS features (GeoJSON/KML/KMZ/Shapefile zip).')
      let geojson: unknown = parsed.data
      if (Array.isArray(geojson)) geojson = geojson[0]
      const fc = geojson as GeoJSON.FeatureCollection
      if (!fc || fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
        throw new Error('File must be a GeoJSON FeatureCollection.')
      }
      const displayName = layerModalName.trim() || uploadFile.name.replace(/\.[^.]+$/, '').trim() || 'Layer'
      const fields = Object.keys(fc.features[0]?.properties ?? {})
      setLayers(prev => {
        const key = uniqueRegistryKey(Object.keys(prev), displayName)
        return {
          ...prev,
          [key]: {
            name: displayName,
            type: 'feature',
            url: `upload://${uploadFile.name}`,
            data: fc,
            fields,
            visible: true,
            origin: 'user',
          },
        }
      })
      closeAddGisModal()
    } catch (e: unknown) {
      setDiscoverError(e instanceof Error ? e.message : 'Failed to import file.')
    } finally {
      setAddingLayerKey(null)
    }
  }, [uploadFile, layerModalName, closeAddGisModal])

  const addUrlLayerToRegistry = useCallback(async () => {
    const trimmed = remoteDataUrl.trim()
    if (!trimmed) return
    const opKey = `url:${trimmed}`
    setAddingLayerKey(opKey)
    setDiscoverError(null)
    try {
      const file = await parseRemoteUrlAsFile(trimmed)
      const parsed = await parseFile(file)
      if (parsed.type !== 'geojson') {
        throw new Error('URL must resolve to GIS features (GeoJSON/KML/KMZ/Shapefile zip/CSV with coordinates).')
      }
      let geojson: unknown = parsed.data
      if (Array.isArray(geojson)) geojson = geojson[0]
      const fc = geojson as GeoJSON.FeatureCollection
      if (!fc || fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
        throw new Error('URL must resolve to a GeoJSON FeatureCollection.')
      }
      const stem = file.name.replace(/\.[^.]+$/, '').trim()
      const displayName = layerModalName.trim() || stem || 'Layer'
      const fields = Object.keys(fc.features[0]?.properties ?? {})
      setLayers(prev => {
        const key = uniqueRegistryKey(Object.keys(prev), displayName)
        return {
          ...prev,
          [key]: {
            name: displayName,
            type: 'feature',
            url: trimmed,
            data: fc,
            fields,
            visible: true,
            origin: 'user',
          },
        }
      })
      closeAddGisModal()
    } catch (e: unknown) {
      setDiscoverError(e instanceof Error ? e.message : 'Failed to import from URL.')
    } finally {
      setAddingLayerKey(null)
    }
  }, [remoteDataUrl, layerModalName, closeAddGisModal])

  const toggleChartTool = (chart: string) => {
    setSelectedCharts(prev => {
      const next = new Set(prev)
      if (next.has(chart)) next.delete(chart)
      else next.add(chart)
      return next
    })
  }

  const addStatCard = () => {
    if (!activeStatsLayer || !statsField) return
    const layer = layers[activeStatsLayer]
    if (!layer) return
    const data = layer.data.features || []
    const values = data.map(f => parseFloat(String((f.properties as any)?.[statsField]))).filter(v => !Number.isNaN(v))
    const result = computeAgg(values, statsAgg)
    setStatCards(prev => [
      ...prev,
      {
        id: newId(),
        layerKey: activeStatsLayer,
        field: statsField,
        agg: statsAgg,
        result,
        layerName: layer.name,
      },
    ])
  }

  const linkFieldsFrom = linkFrom ? layers[linkFrom]?.fields ?? [] : []
  const linkFieldsTo = linkTo ? layers[linkTo]?.fields ?? [] : []

  return (
    <>
    <div className="page page-tight develop-dashboard-root">
      {initError ? (
        <div className="ddb-hint" style={{ color: '#b91c1c', padding: 12 }}>
          {initError}
        </div>
      ) : null}

      <div className={`ddb-dashboard${sidebarCollapsed ? ' ddb-dashboard--sidebar-collapsed' : ''}`}>
        <div className="ddb-topbar">
          <div className="ddb-brand">
            <h1>
              <i className="fa-solid fa-chart-line" aria-hidden /> Agro Cloud Analytics
            </h1>
          </div>
          <div>
            <i className="fa-solid fa-map-location-dot" aria-hidden /> Unified Panel | Multi-Select Grid | Smart Analytics
          </div>
        </div>

        <div className="ddb-dashboard-body">
        <div className={`ddb-sidebar${sidebarCollapsed ? ' is-collapsed' : ''}`}>
          {sidebarCollapsed ? (
            <nav className="ddb-sidebar-panels ddb-sidebar-panels--rail" aria-label="Sidebar panels (collapsed)">
              <button
                type="button"
                className="ddb-sidebar-rail-expand"
                onClick={() => setSidebarCollapsed(false)}
                aria-expanded={false}
                aria-controls="ddb-sidebar-panels"
                title="Expand sidebar"
              >
                <i className="fa-solid fa-angles-right" aria-hidden />
                <span className="ddb-sidebar-rail-sr">Expand sidebar</span>
              </button>
              <div className="ddb-sidebar-rail-stack" role="group">
                <button
                  type="button"
                  className="ddb-sidebar-rail-panel-btn"
                  title="Data — map layers & fields"
                  aria-label="Open Data panel"
                  onClick={() => {
                    setSidebarCollapsed(false)
                    setRightSheet('data')
                  }}
                >
                  <span className="ddb-sidebar-rail-panel-icon">
                    <i className="fa-solid fa-database" aria-hidden />
                  </span>
                </button>
                <button
                  type="button"
                  className="ddb-sidebar-rail-panel-btn"
                  title="Visualizations — Custom Stat Cards"
                  aria-label="Visualizations, Custom Stat Cards"
                  onClick={() => expandToPanel('ddb-sidebar-panel-stats')}
                >
                  <span className="ddb-sidebar-rail-panel-icon">
                    <i className="fa-solid fa-chart-simple" aria-hidden />
                  </span>
                </button>
                <button
                  type="button"
                  className="ddb-sidebar-rail-panel-btn"
                  title="Link layers"
                  aria-label="Link layers"
                  onClick={() => expandToPanel('ddb-sidebar-panel-link')}
                >
                  <span className="ddb-sidebar-rail-panel-icon">
                    <i className="fa-solid fa-link" aria-hidden />
                  </span>
                </button>
                <button
                  type="button"
                  className="ddb-sidebar-rail-panel-btn"
                  title="Chart types — opens Visualizations panel"
                  aria-label="Open Visualizations panel for chart types"
                  onClick={() => {
                    setSidebarCollapsed(false)
                    setRightSheet('visualizations')
                  }}
                >
                  <span className="ddb-sidebar-rail-panel-icon">
                    <i className="fa-solid fa-table-cells" aria-hidden />
                  </span>
                </button>
              </div>
            </nav>
          ) : (
            <>
          <div className="ddb-sidebar-header">
              <button
                type="button"
                className="ddb-sidebar-toggle"
                onClick={() => setSidebarCollapsed(true)}
                aria-expanded={true}
                aria-controls="ddb-sidebar-panels"
                title="Collapse sidebar"
              >
                <i className="fa-solid fa-angles-left" aria-hidden />
              </button>
          </div>
          <div id="ddb-sidebar-panels" className="ddb-sidebar-panels">
          <div id="ddb-sidebar-panel-stats" className="ddb-panel-section">
            <div
              className="ddb-section-title"
              data-tooltip="Custom Stat Cards"
              role="group"
              aria-label="Custom Stat Cards"
              tabIndex={0}
            >
              <i className="fa-solid fa-chart-simple" aria-hidden />
              <span className="ddb-section-title-sr">Custom Stat Cards</span>
            </div>
            <div className="ddb-panel-body">
            <div className="ddb-stats-config-row">
              <select className="ddb-select" value={activeStatsLayer} onChange={e => setActiveStatsLayer(e.target.value)}>
                {layerKeys.map(k => (
                  <option key={k} value={k}>
                    {layers[k].name}
                  </option>
                ))}
              </select>
              <select className="ddb-select" value={statsField} onChange={e => setStatsField(e.target.value)}>
                {activeFields.map(f => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <select className="ddb-select" value={statsAgg} onChange={e => setStatsAgg(e.target.value)}>
                <option value="sum">Sum</option>
                <option value="avg">Average</option>
                <option value="count">Count</option>
                <option value="max">Max</option>
                <option value="min">Min</option>
              </select>
              <button type="button" className="ddb-btn" onClick={addStatCard}>
                <i className="fa-solid fa-plus-circle" aria-hidden /> Add Card
              </button>
            </div>
            <div className="ddb-stats-cards-container">
              {statCards.map(c => (
                <div key={c.id} className="ddb-stat-card-custom">
                  <button
                    type="button"
                    aria-label="Remove"
                    className="ddb-small-btn"
                    style={{ float: 'left', fontSize: 11, padding: '4px 8px' }}
                    onClick={() => setStatCards(prev => prev.filter(x => x.id !== c.id))}
                  >
                    <i className="fa-solid fa-trash" />
                  </button>
                  <div className="ddb-stat-number">{c.result.toFixed(2)}</div>
                  <div className="ddb-stat-label">
                    {c.agg} / {c.field}
                  </div>
                  <div style={{ fontSize: 9 }}>{c.layerName}</div>
                </div>
              ))}
            </div>
            </div>
          </div>

          <div id="ddb-sidebar-panel-link" className="ddb-panel-section">
            <div
              className="ddb-section-title"
              data-tooltip="Link Layers (Relation)"
              role="group"
              aria-label="Link Layers (Relation)"
              tabIndex={0}
            >
              <i className="fa-solid fa-link" aria-hidden />
              <span className="ddb-section-title-sr">Link Layers (Relation)</span>
            </div>
            <div className="ddb-panel-body">
            <div className="ddb-link-row">
              <select className="ddb-select" value={linkFrom} onChange={e => { setLinkFrom(e.target.value); setLinkFieldFrom('') }}>
                <option value="">-- Source Layer --</option>
                {layerKeys.map(k => (
                  <option key={k} value={k}>
                    {layers[k].name}
                  </option>
                ))}
              </select>
              <span>→</span>
              <select className="ddb-select" value={linkTo} onChange={e => { setLinkTo(e.target.value); setLinkFieldTo('') }}>
                <option value="">-- Target Layer --</option>
                {layerKeys.map(k => (
                  <option key={k} value={k}>
                    {layers[k].name}
                  </option>
                ))}
              </select>
            </div>
            <div className="ddb-link-row">
              <select className="ddb-select" value={linkFieldFrom} onChange={e => setLinkFieldFrom(e.target.value)}>
                {linkFieldsFrom.map(f => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <span>↔</span>
              <select className="ddb-select" value={linkFieldTo} onChange={e => setLinkFieldTo(e.target.value)}>
                {linkFieldsTo.map(f => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="ddb-btn"
              style={{ width: '100%', marginTop: 4 }}
              onClick={() => setLinkStatus('Layers linked successfully (conceptual relation set).')}
            >
              Apply Relation &amp; Link Map
            </button>
            {linkStatus ? <div className="ddb-hint" style={{ color: '#2c6e49' }}>{linkStatus}</div> : null}
            </div>
          </div>
          </div>
            </>
          )}
        </div>

        <div className="ddb-main">
          <div className="ddb-map-container si-map-container">
            <div ref={mapElRef} className="ddb-map-inner" />
            <div className="ddb-map-tools">
              <button type="button" className="ddb-btn" onClick={() => mapRef.current?.zoomIn()}>
                <i className="fa-solid fa-magnifying-glass-plus" />
              </button>
              <button type="button" className="ddb-btn" onClick={() => mapRef.current?.zoomOut()}>
                <i className="fa-solid fa-magnifying-glass-minus" />
              </button>
              <button type="button" className="ddb-btn" onClick={() => mapRef.current?.fitWorld()}>
                <i className="fa-solid fa-expand" />
              </button>
            </div>
          </div>
          <div className="ddb-visuals">
            <div ref={chartsHostRef} id="develop-dashboard-charts" />
          </div>
        </div>

        <div className={`ddb-right-wrap${rightSheet !== 'none' ? ' is-open' : ''}`} aria-label="Power BI style panels">
          {rightSheet !== 'none' ? (
            <aside className={`ddb-right-sheet ddb-right-sheet--${rightSheet}`} aria-labelledby={`ddb-right-sheet-${rightSheet}`}>
              <div className="ddb-right-sheet-head">
                <h2 className="ddb-right-sheet-title" id={`ddb-right-sheet-${rightSheet}`}>
                  {rightSheet === 'filters' ? 'Filters' : rightSheet === 'visualizations' ? 'Visualizations' : 'Data'}
                </h2>
                <button
                  type="button"
                  className="ddb-right-sheet-collapse"
                  onClick={() => setRightSheet('none')}
                  title="Collapse panel"
                  aria-label="Collapse panel"
                >
                  <i className="fa-solid fa-angles-left" aria-hidden />
                </button>
              </div>
              {rightSheet === 'filters' ? (
                <div className="ddb-right-sheet-body">
                  <p className="ddb-right-sheet-lead">Slicers and filters (static preview).</p>
                  <label className="ddb-right-filter-field">
                    <span className="ddb-right-filter-label">Date range</span>
                    <input type="date" className="ddb-right-filter-input" disabled aria-disabled />
                  </label>
                  <label className="ddb-right-filter-field">
                    <span className="ddb-right-filter-label">Region</span>
                    <select className="ddb-right-filter-input" disabled aria-disabled>
                      <option>All regions</option>
                    </select>
                  </label>
                </div>
              ) : null}
              {rightSheet === 'visualizations' ? (
                <div className="ddb-right-sheet-body">
                  <p className="ddb-right-sheet-lead">
                    Multi-select chart types (same grid as the former sidebar tools). Hover an icon for its name, then generate below.
                  </p>
                  <div className="ddb-powerbi-grid ddb-powerbi-grid--in-right-sheet" role="group" aria-label="Visualization types">
                    {CHART_TOOLS.map(t => (
                      <button
                        key={t.chart}
                        type="button"
                        className={`ddb-chart-tool-item${selectedCharts.has(t.chart) ? ' is-selected' : ''}`}
                        title={t.label}
                        aria-pressed={selectedCharts.has(t.chart)}
                        onClick={() => toggleChartTool(t.chart)}
                      >
                        <i className={t.icon} aria-hidden />
                        <span className="ddb-chart-tool-label-sr">{t.label}</span>
                      </button>
                    ))}
                  </div>
                  <button type="button" className="ddb-btn ddb-right-sheet-primary" onClick={() => setChartGen(g => g + 1)}>
                    <i className="fa-solid fa-rotate" aria-hidden /> Generate selected visuals
                  </button>
                </div>
              ) : null}
              {rightSheet === 'data' ? (
                <div className="ddb-right-sheet-body ddb-data-pane">
                  <section className="ddb-data-map-layers" aria-label="Map layers on dashboard">
                    <div className="ddb-data-map-layers-head">
                      <span className="ddb-data-map-layers-title">Map layers</span>
                      <button type="button" className="ddb-data-add-source-btn" onClick={openAddGisModal} title="Add Source Data">
                        <i className="fa-solid fa-circle-plus" aria-hidden />
                        <span>Add source</span>
                      </button>
                    </div>
                    <div className="ddb-data-map-layers-scroll">
                      {sampleLayerKeys.length > 0 ? (
                        <div className="ddb-layer-group">
                          <div className="ddb-layer-group-label">Sample data</div>
                          {sampleLayerKeys.map(key => (
                            <div key={key}>{renderLayerCard(key)}</div>
                          ))}
                        </div>
                      ) : null}
                      {userLayerKeys.length > 0 ? (
                        <div className="ddb-layer-group">
                          <div className="ddb-layer-group-label">Your layers</div>
                          {userLayerKeys.map(key => (
                            <div key={key}>{renderLayerCard(key)}</div>
                          ))}
                        </div>
                      ) : null}
                      {sampleLayerKeys.length === 0 && userLayerKeys.length === 0 ? (
                        <p className="ddb-data-map-layers-empty">No layers yet. Use Add source or open Visualizations after adding data.</p>
                      ) : null}
                    </div>
                  </section>
                  <div className="ddb-data-search-wrap">
                    <i className="fa-solid fa-magnifying-glass" aria-hidden />
                    <input
                      type="search"
                      className="ddb-data-search"
                      placeholder="Search"
                      value={dataPaneSearch}
                      onChange={e => setDataPaneSearch(e.target.value)}
                      aria-label="Search fields and tables"
                    />
                  </div>
                  <div className="ddb-data-tree">
                    <div className="ddb-data-tree-section-label">Fields</div>
                    {layerKeys
                      .filter(k => {
                        if (!dataPaneSearch.trim()) return true
                        const q = dataPaneSearch.toLowerCase()
                        if (layers[k]?.name.toLowerCase().includes(q)) return true
                        return layers[k]?.fields.some(f => f.toLowerCase().includes(q))
                      })
                      .map(key => {
                        const Lr = layers[key]
                        if (!Lr) return null
                        const nodeKey = `layer:${key}`
                        const open = dataTreeOpen[nodeKey] ?? false
                        return (
                          <div key={key} className="ddb-data-table-block">
                            <button
                              type="button"
                              className="ddb-data-table-toggle"
                              onClick={() => toggleDataTreeNode(nodeKey)}
                              aria-expanded={open}
                            >
                              <i className={`fa-solid fa-chevron-${open ? 'down' : 'right'}`} aria-hidden />
                              <span className="ddb-data-table-icon">
                                <i className="fa-solid fa-table" aria-hidden />
                              </span>
                              <span className="ddb-data-table-name">{Lr.name}</span>
                              <span className="ddb-data-table-meta">{Lr.type}</span>
                            </button>
                            {open ? (
                              <ul className="ddb-data-field-list">
                                {Lr.fields
                                  .filter(f => !dataPaneSearch.trim() || f.toLowerCase().includes(dataPaneSearch.toLowerCase()))
                                  .map(f => (
                                    <li key={f} className="ddb-data-field-row">
                                      <span className="ddb-data-field-type">∑</span>
                                      <span className="ddb-data-field-name">{f}</span>
                                    </li>
                                  ))}
                              </ul>
                            ) : null}
                          </div>
                        )
                      })}
                    {csvDatasets
                      .filter(ds => {
                        if (!dataPaneSearch.trim()) return true
                        const q = dataPaneSearch.toLowerCase()
                        if (ds.name.toLowerCase().includes(q)) return true
                        return ds.columns.some(c => c.toLowerCase().includes(q))
                      })
                      .map(ds => {
                        const nodeKey = `csv:${ds.id}`
                        const open = dataTreeOpen[nodeKey] ?? true
                        return (
                          <div key={ds.id} className="ddb-data-table-block">
                            <button
                              type="button"
                              className="ddb-data-table-toggle"
                              onClick={() => toggleDataTreeNode(nodeKey)}
                              aria-expanded={open}
                            >
                              <i className={`fa-solid fa-chevron-${open ? 'down' : 'right'}`} aria-hidden />
                              <span className="ddb-data-table-icon ddb-data-table-icon--csv">
                                <i className="fa-solid fa-file-csv" aria-hidden />
                              </span>
                              <span className="ddb-data-table-name">{ds.name}</span>
                              <span className="ddb-data-table-meta">{ds.rows.length} rows</span>
                            </button>
                            {open ? (
                              <ul className="ddb-data-field-list">
                                {ds.columns
                                  .filter(c => !dataPaneSearch.trim() || c.toLowerCase().includes(dataPaneSearch.toLowerCase()))
                                  .map(c => (
                                    <li key={c} className="ddb-data-field-row">
                                      <span className="ddb-data-field-type">abc</span>
                                      <span className="ddb-data-field-name">{c}</span>
                                    </li>
                                  ))}
                              </ul>
                            ) : null}
                            <button
                              type="button"
                              className="ddb-data-remove-csv"
                              onClick={() => setCsvDatasets(prev => prev.filter(x => x.id !== ds.id))}
                            >
                              Remove table
                            </button>
                          </div>
                        )
                      })}
                    {layerKeys.length === 0 && csvDatasets.length === 0 ? (
                      <p className="ddb-data-empty">Add a CSV table (Text/CSV) via Add source above, or add map layers first.</p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </aside>
          ) : null}
          <nav className="ddb-right-rail" aria-label="Power BI style panels">
            <button
              type="button"
              className={`ddb-right-rail-tab${rightSheet === 'filters' ? ' is-active' : ''}`}
              onClick={() => toggleRightSheet('filters')}
              title="Filters"
              aria-label="Filters"
            >
              <span className="ddb-right-rail-icon-wrap" aria-hidden>
                <i className="fa-solid fa-filter ddb-right-rail-icon" />
              </span>
              <span className="ddb-right-rail-label">Filters</span>
            </button>
            <button
              type="button"
              className={`ddb-right-rail-tab${rightSheet === 'visualizations' ? ' is-active' : ''}`}
              onClick={() => toggleRightSheet('visualizations')}
              title="Visualizations — chart types"
              aria-label="Visualizations"
            >
              <span className="ddb-right-rail-icon-wrap" aria-hidden>
                <i className="fa-solid fa-chart-column ddb-right-rail-icon" />
              </span>
              <span className="ddb-right-rail-label">Charts</span>
            </button>
            <button
              type="button"
              className={`ddb-right-rail-tab${rightSheet === 'data' ? ' is-active' : ''}`}
              onClick={() => toggleRightSheet('data')}
              title="Data"
              aria-label="Data"
            >
              <span className="ddb-right-rail-icon-wrap" aria-hidden>
                <i className="fa-solid fa-database ddb-right-rail-icon" />
              </span>
              <span className="ddb-right-rail-label">Data</span>
            </button>
          </nav>
        </div>
        </div>
      </div>
    </div>

    {addGisOpen ? (
      <div className="gis-modal-overlay" role="presentation" onClick={closeAddGisModal}>
        <div
          className="gis-modal gis-modal-compact ddb-add-source-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ddb-add-source-title"
          onClick={e => e.stopPropagation()}
        >
          <div className="ddb-add-source-modal__head">
            <div className="gis-modal-compact-title" id="ddb-add-source-title">
              Add Source Data
            </div>
            {addWizard !== 'home' ? (
              <button type="button" className="ddb-add-source-back" onClick={goAddWizardHome}>
                <i className="fa-solid fa-arrow-left" aria-hidden /> All options
              </button>
            ) : null}
          </div>

          {addWizard === 'home' ? (
            <div className="ddb-add-source-home">
              <p className="ddb-add-source-lead">Choose how you want to add layers to the registry for analytics and maps.</p>
              <div className="ddb-source-option-grid" role="list">
                <button
                  type="button"
                  className="ddb-source-option-card"
                  role="listitem"
                  onClick={() => {
                    setDiscoverError(null)
                    setAddWizard('gis-list')
                  }}
                >
                  <span className="ddb-source-option-indicator" aria-hidden />
                  <div className="ddb-source-option-icon-wrap">
                    <i className="fa-solid fa-layer-group" aria-hidden />
                  </div>
                  <div className="ddb-source-option-text">
                    <span className="ddb-source-option-title">Select from GIS Content</span>
                    <span className="ddb-source-option-desc">Use layers and fields already saved in GIS Map in this browser.</span>
                  </div>
                </button>
                <button
                  type="button"
                  className="ddb-source-option-card"
                  role="listitem"
                  onClick={() => {
                    setDiscoverError(null)
                    setAddWizard('tabs')
                    setAddTab('arcgis')
                  }}
                >
                  <span className="ddb-source-option-indicator" aria-hidden />
                  <div className="ddb-source-option-icon-wrap">
                    <i className="fa-solid fa-link" aria-hidden />
                  </div>
                  <div className="ddb-source-option-text">
                    <span className="ddb-source-option-title">Provide an ArcGIS Server layer URL</span>
                    <span className="ddb-source-option-desc">Connect to a feature service and pick a layer or table.</span>
                  </div>
                </button>
                <button
                  type="button"
                  className="ddb-source-option-card"
                  role="listitem"
                  onClick={() => {
                    setDiscoverError(null)
                    setAddWizard('tabs')
                    setAddTab('upload')
                  }}
                >
                  <span className="ddb-source-option-indicator" aria-hidden />
                  <div className="ddb-source-option-icon-wrap">
                    <i className="fa-solid fa-file-arrow-up" aria-hidden />
                  </div>
                  <div className="ddb-source-option-text">
                    <span className="ddb-source-option-title">Upload a file</span>
                    <span className="ddb-source-option-desc">GeoJSON, KML, KMZ, Shapefile (zip), CSV with coordinates, and more.</span>
                  </div>
                </button>
                <button
                  type="button"
                  className="ddb-source-option-card"
                  role="listitem"
                  onClick={() => {
                    setDiscoverError(null)
                    setGetDataNotice(null)
                    setAddWizard('get-data')
                  }}
                >
                  <span className="ddb-source-option-indicator" aria-hidden />
                  <div className="ddb-source-option-icon-wrap ddb-source-option-icon-wrap--getdata">
                    <i className="fa-solid fa-database" aria-hidden />
                    <i className="fa-solid fa-table-cells" aria-hidden />
                  </div>
                  <div className="ddb-source-option-text">
                    <span className="ddb-source-option-title">Get Data</span>
                    <span className="ddb-source-option-desc">
                      Open the same “Common data sources” list as Power BI (Excel, CSV, SQL, Web, OData, …).
                    </span>
                  </div>
                </button>
              </div>
              <button
                type="button"
                className="ddb-add-source-more"
                onClick={() => {
                  setDiscoverError(null)
                  setAddWizard('tabs')
                  setAddTab('url')
                }}
              >
                <i className="fa-solid fa-ellipsis" aria-hidden /> Database, web URL &amp; advanced…
              </button>
            </div>
          ) : addWizard === 'get-data' ? (
            <div className="ddb-add-source-get-data-page gis-modal-body" role="region" aria-label="Get data — common sources">
              <div className="ddb-get-data-menu ddb-get-data-menu--page" role="navigation" aria-label="Common data sources">
                <div className="ddb-get-data-toolbar-mimic">
                  <span className="ddb-get-data-toolbar-icon" aria-hidden>
                    <i className="fa-solid fa-database" />
                    <i className="fa-solid fa-table" />
                  </span>
                  <span className="ddb-get-data-toolbar-label">Get data</span>
                  <i className="fa-solid fa-chevron-down ddb-get-data-toolbar-chev" aria-hidden />
                </div>
                <div className="ddb-get-data-section-title">Common data sources</div>
                <ul className="ddb-get-data-list">
                  {GET_DATA_COMMON_SOURCES.map(row => (
                    <li key={row.id}>
                      <button type="button" className="ddb-get-data-row" onClick={() => pickGetDataSource(row.id)}>
                        <span className="ddb-get-data-row-icon" style={row.iconColor ? { color: row.iconColor } : undefined}>
                          <i className={row.icon} aria-hidden />
                        </span>
                        <span className="ddb-get-data-row-label">{row.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="ddb-get-data-divider" role="separator" />
                <button
                  type="button"
                  className="ddb-get-data-row ddb-get-data-row--footer"
                  onClick={() =>
                    setGetDataNotice(
                      'Template Apps open in the Power BI service. Here, use the list above or GIS Map for curated agriculture layers.',
                    )
                  }
                >
                  <span className="ddb-get-data-row-icon ddb-get-data-row-icon--muted">
                    <i className="fa-solid fa-table-columns" aria-hidden />
                  </span>
                  <span className="ddb-get-data-row-label">Power BI Template Apps</span>
                  <i className="fa-solid fa-arrow-up-right-from-square ddb-get-data-external" aria-hidden />
                </button>
                <div className="ddb-get-data-divider" role="separator" />
                <button
                  type="button"
                  className="ddb-get-data-more"
                  onClick={() => {
                    setDiscoverError(null)
                    setGetDataNotice(null)
                    setAddWizard('tabs')
                    setAddTab('arcgis')
                  }}
                >
                  More…
                </button>
              </div>
              {getDataNotice ? (
                <div className="ddb-get-data-notice" role="status">
                  <i className="fa-solid fa-circle-info" aria-hidden /> {getDataNotice}
                </div>
              ) : null}
            </div>
          ) : addWizard === 'gis-list' ? (
            <div className="ddb-add-source-gis-list gis-modal-body">
              <p className="ddb-add-source-gis-hint">
                Layers below come from your <strong>GIS Map</strong> session (IndexedDB). Import copies feature data into this dashboard.
              </p>
              {gisContentLoading ? (
                <div className="ddb-add-source-loading">
                  <i className="fa-solid fa-spinner fa-spin" aria-hidden /> Loading GIS Content…
                </div>
              ) : gisContentLayers.length === 0 ? (
                <div className="ddb-add-source-empty">
                  <i className="fa-regular fa-folder-open" aria-hidden />
                  <p>No saved layers yet. Open GIS Map, add a layer, then return here.</p>
                </div>
              ) : (
                <ul className="ddb-gis-content-list">
                  {gisContentLayers.map(layer => {
                    const ok = gisLayerCanImportToDashboard(layer)
                    const busy = addingLayerKey === `gis:${String(layer.id)}`
                    return (
                      <li key={String(layer.id)} className="ddb-gis-content-row">
                        <div className="ddb-gis-content-meta">
                          <span className="ddb-gis-content-name">{layer.name}</span>
                          <span className="ddb-gis-content-badges">
                            <span className="ddb-gis-badge">{layer.type}</span>
                            {layer.source ? <span className="ddb-gis-badge ddb-gis-badge--muted">{layer.source}</span> : null}
                          </span>
                          {!ok ? (
                            <span className="ddb-gis-content-note">WMS / tiles only — not importable here</span>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className="ddb-gis-content-add-btn"
                          disabled={!ok || busy}
                          onClick={() => void importGisContentLayer(layer)}
                        >
                          {busy ? 'Adding…' : 'Add'}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
              {discoverError ? (
                <div className="gis-inline-error" role="alert" style={{ marginTop: 12 }}>
                  <i className="fa-solid fa-triangle-exclamation" aria-hidden />
                  <span>{discoverError}</span>
                </div>
              ) : null}
            </div>
          ) : (
            <>
          <div className="gis-modal-compact-tabs" role="tablist" aria-label="Add GIS layer source">
            <button
              type="button"
              role="tab"
              aria-selected={addTab === 'arcgis'}
              className={(addTab === 'arcgis' ? 'gis-compact-tab active' : 'gis-compact-tab') + ' gis-compact-tab--icon'}
              title="ArcGIS Feature Service"
              onClick={() => switchAddTab('arcgis')}
            >
              <i className="fa-solid fa-cloud" aria-hidden />
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={addTab === 'database'}
              className={(addTab === 'database' ? 'gis-compact-tab active' : 'gis-compact-tab') + ' gis-compact-tab--icon'}
              title="Database connection"
              onClick={() => switchAddTab('database')}
            >
              <i className="fa-solid fa-database" aria-hidden />
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={addTab === 'upload'}
              className={(addTab === 'upload' ? 'gis-compact-tab active' : 'gis-compact-tab') + ' gis-compact-tab--icon'}
              title="Upload file"
              onClick={() => switchAddTab('upload')}
            >
              <i className="fa-solid fa-file-arrow-up" aria-hidden />
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={addTab === 'url'}
              className={(addTab === 'url' ? 'gis-compact-tab active' : 'gis-compact-tab') + ' gis-compact-tab--icon'}
              title="URL or web data"
              onClick={() => switchAddTab('url')}
            >
              <i className="fa-solid fa-globe" aria-hidden />
            </button>
          </div>

          <div className="gis-modal-body">
            {addTab === 'arcgis' ? (
              <div role="tabpanel" aria-label="ArcGIS Feature Service">
                <input
                  className="gis-input"
                  type="text"
                  value={serviceUrl}
                  onChange={e => setServiceUrl(e.target.value)}
                  placeholder="Feature Service URL"
                  autoComplete="off"
                  inputMode="url"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void discoverArcGisLayers()
                    }
                  }}
                />
                <input
                  className="gis-input"
                  type="text"
                  value={arcgisToken}
                  onChange={e => setArcgisToken(e.target.value)}
                  placeholder="Token / API Key (optional)"
                  autoComplete="off"
                />
                <button
                  className="gis-btn-outline"
                  type="button"
                  onClick={() => void discoverArcGisLayers()}
                  disabled={isDiscovering || serviceUrl.trim() === ''}
                >
                  <i className="fa-solid fa-link" aria-hidden />
                  {isDiscovering ? ' Connecting…' : ' Connect & Discover Layers'}
                </button>
                {discoverError ? (
                  <div className="gis-inline-error" role="alert">
                    <i className="fa-solid fa-triangle-exclamation" aria-hidden />
                    <span>{discoverError}</span>
                  </div>
                ) : null}
                {discoveredLayers.length > 0 ? (
                  <div className="gis-discover-panel" aria-label="Discovered layers">
                    <div className="gis-discover-meta">FOUND {discoveredLayers.length} LAYER/TABLE(S):</div>
                    <div className="gis-form-field">
                      <div className="gis-form-label">Select layer</div>
                      <div className="gis-select-wrap">
                        <select
                          className="gis-input gis-select"
                          value={selectedDiscoveredUrl}
                          onChange={e => {
                            const next = e.target.value
                            setSelectedDiscoveredUrl(next)
                            const found = discoveredLayers.find(d => d.url === next)
                            if (found && !layerModalName.trim()) setLayerModalName(found.name)
                          }}
                        >
                          {discoveredLayers.map(l => (
                            <option key={l.url} value={l.url}>
                              {l.kind === 'table' ? `${l.name} (Table)` : l.geometryType ? `${l.name} (${l.geometryType})` : l.name}
                            </option>
                          ))}
                        </select>
                        <i className="fa-solid fa-chevron-down" aria-hidden />
                      </div>
                    </div>
                    <input
                      className="gis-input"
                      type="text"
                      value={layerModalName}
                      onChange={e => setLayerModalName(e.target.value)}
                      placeholder="Layer display name"
                    />
                    <div className="gis-discovered-row">
                      <button
                        className="gis-discovered-add"
                        type="button"
                        onClick={() => {
                          const found = discoveredLayers.find(d => d.url === selectedDiscoveredUrl)
                          if (found) void addArcGisLayerToRegistry(found)
                        }}
                        disabled={!selectedDiscoveredUrl || addingLayerKey === `arcgis:${selectedDiscoveredUrl}`}
                      >
                        {addingLayerKey === `arcgis:${selectedDiscoveredUrl}` ? 'Adding…' : 'Add'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : addTab === 'database' ? (
              <div role="tabpanel" aria-label="Database connection" className="ddb-hint" style={{ padding: '8px 0', lineHeight: 1.5 }}>
                Full database connection and validation (same as GIS Map) is available on the <strong>GIS Map</strong> page. Here you can
                add layers via ArcGIS, file upload, or URL.
              </div>
            ) : addTab === 'upload' ? (
              <div role="tabpanel" aria-label="Upload file">
                <input
                  ref={addLayerFileInputRef}
                  type="file"
                  accept=".kml,.kmz,.zip,.geojson,.json,.csv"
                  hidden
                  onChange={e => setUploadFile(e.target.files?.[0] ?? null)}
                />
                <button type="button" className="gis-btn-outline" onClick={() => addLayerFileInputRef.current?.click()}>
                  <i className="fa-solid fa-folder-open" aria-hidden /> Choose file
                </button>
                {uploadFile ? <div className="ddb-hint" style={{ marginTop: 8 }}>{uploadFile.name}</div> : null}
                <p className="ddb-hint" style={{ marginTop: 6, textAlign: 'left' }}>
                  CSV without latitude/longitude columns is added as a <strong>Data</strong> table (right pane → Data) like Power BI Fields.
                </p>
                <input
                  className="gis-input"
                  style={{ marginTop: 10 }}
                  type="text"
                  value={layerModalName}
                  onChange={e => setLayerModalName(e.target.value)}
                  placeholder="Layer display name"
                />
                <button className="gis-btn-outline" type="button" style={{ marginTop: 10 }} disabled={!uploadFile || !!addingLayerKey} onClick={() => void addUploadLayerToRegistry()}>
                  <i className="fa-solid fa-plus" aria-hidden /> Add to registry
                </button>
                {discoverError ? (
                  <div className="gis-inline-error" role="alert" style={{ marginTop: 10 }}>
                    <i className="fa-solid fa-triangle-exclamation" aria-hidden />
                    <span>{discoverError}</span>
                  </div>
                ) : null}
              </div>
            ) : (
              <div role="tabpanel" aria-label="URL">
                <input
                  className="gis-input"
                  type="url"
                  value={remoteDataUrl}
                  onChange={e => setRemoteDataUrl(e.target.value)}
                  placeholder="https://… (GeoJSON, KML, KMZ, zip, …)"
                  autoComplete="off"
                />
                <input
                  className="gis-input"
                  type="text"
                  value={layerModalName}
                  onChange={e => setLayerModalName(e.target.value)}
                  placeholder="Layer display name"
                />
                <button
                  className="gis-btn-outline"
                  type="button"
                  disabled={!remoteDataUrl.trim() || !!addingLayerKey}
                  onClick={() => void addUrlLayerToRegistry()}
                >
                  <i className="fa-solid fa-link" aria-hidden /> Add from URL
                </button>
                {discoverError ? (
                  <div className="gis-inline-error" role="alert" style={{ marginTop: 10 }}>
                    <i className="fa-solid fa-triangle-exclamation" aria-hidden />
                    <span>{discoverError}</span>
                  </div>
                ) : null}
              </div>
            )}
          </div>
            </>
          )}

          <div className="gis-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 16px', borderTop: '1px solid rgba(226,232,240,0.9)' }}>
            <button type="button" className="gis-btn" onClick={closeAddGisModal}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    ) : null}
    </>
  )
}
