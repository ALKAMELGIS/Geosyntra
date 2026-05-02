import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import Chart from 'chart.js/auto'
import './develop-dashboard.css'

const STRUCTURES_URL =
  'https://services1.arcgis.com/jz3ndhbYV5K9NwI8/ArcGIS/rest/services/Agro_Structures/FeatureServer/21'
const CROPS_URL =
  'https://services1.arcgis.com/jz3ndhbYV5K9NwI8/ArcGIS/rest/services/Agro_Structures/FeatureServer/32'

type LayerState = {
  name: string
  type: 'feature' | 'table'
  url: string
  data: GeoJSON.FeatureCollection
  fields: string[]
  visible: boolean
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
  const [newLayerOpen, setNewLayerOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [newType, setNewType] = useState<'feature' | 'table'>('feature')
  const [linkFrom, setLinkFrom] = useState('')
  const [linkTo, setLinkTo] = useState('')
  const [linkFieldFrom, setLinkFieldFrom] = useState('')
  const [linkFieldTo, setLinkFieldTo] = useState('')
  const [initError, setInitError] = useState<string | null>(null)

  const layerKeys = useMemo(() => Object.keys(layers), [layers])

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
          },
          crops_planted: {
            name: 'Planted Crops',
            type: 'table',
            url: CROPS_URL,
            data: cropsData,
            fields: cropFields,
            visible: true,
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
      } else if (layer.type === 'table' && layer.data?.features?.length) {
        const points: L.CircleMarker[] = []
        layer.data.features.forEach((f, idx) => {
          const props = (f.properties ?? {}) as Record<string, unknown>
          const lat = 28.5 + (idx % 10) * 0.2
          const lng = 34.5 + (idx % 8) * 0.3
          points.push(
            L.circleMarker([lat, lng], { radius: 5, fillColor: '#ffaa66', color: '#fff', weight: 1 }).bindPopup(
              `${String(props.Farm_Name ?? 'Record')}<br>Crop: ${String(props.Crop_Type ?? '')}`,
            ),
          )
        })
        const group = L.layerGroup(points)
        group.addTo(map)
        leafletRef.current[key] = group
      }
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

  const confirmNewLayer = async () => {
    const name = newName.trim()
    const url = newUrl.trim()
    if (!name || !url) return
    try {
      const data = await fetchGeoJSON(url, newType === 'table')
      const fields = Object.keys(data.features[0]?.properties ?? {})
      setLayers(prev => ({
        ...prev,
        [name]: { name, type: newType, url, data, fields, visible: true },
      }))
      setNewLayerOpen(false)
      setNewName('')
      setNewUrl('')
    } catch {
      setInitError('Failed to add layer from URL.')
    }
  }

  const linkFieldsFrom = linkFrom ? layers[linkFrom]?.fields ?? [] : []
  const linkFieldsTo = linkTo ? layers[linkTo]?.fields ?? [] : []

  return (
    <div className="page page-tight develop-dashboard-root">
      {initError ? (
        <div className="ddb-hint" style={{ color: '#b91c1c', padding: 12 }}>
          {initError}
        </div>
      ) : null}

      <div className="ddb-dashboard">
        <div className="ddb-topbar">
          <div className="ddb-brand">
            <h1>
              <i className="fa-solid fa-chart-line" aria-hidden /> AgriAnalytics | Power BI Static Toolkit
            </h1>
          </div>
          <div>
            <i className="fa-solid fa-map-location-dot" aria-hidden /> Unified Panel | Multi-Select Grid | Smart Analytics
          </div>
        </div>

        <div className="ddb-sidebar">
          <div className="ddb-panel-section">
            <div className="ddb-section-title">
              <i className="fa-solid fa-layer-group" aria-hidden /> Layer Registry
            </div>
            <div className="ddb-layers-scroll">
              {layerKeys.map(key => {
                const Lr = layers[key]
                return (
                  <div key={key} className="ddb-layer-card">
                    <div className="ddb-layer-header">
                      <label>
                        <input
                          type="checkbox"
                          checked={Lr.visible}
                          onChange={e => toggleLayerVisible(key, e.target.checked)}
                        />{' '}
                        <span className="ddb-layer-name">{Lr.name}</span>
                      </label>
                      <span className="ddb-layer-badge">{Lr.type}</span>
                    </div>
                    <div className="ddb-layer-actions">
                      <button type="button" className="ddb-btn ddb-small-btn" onClick={() => window.alert(`Fields: ${Lr.fields.join(', ')}`)}>
                        Fields
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
            <button type="button" className="ddb-btn" style={{ width: '100%', marginTop: 8 }} onClick={() => setNewLayerOpen(o => !o)}>
              <i className="fa-solid fa-plus" aria-hidden /> Add Source Data
            </button>
            {newLayerOpen ? (
              <div className="ddb-new-layer-form">
                <input className="ddb-input" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name (e.g. Irrigation_Logs)" />
                <input className="ddb-input" value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="URL (GeoJSON or FeatureServer)" />
                <select className="ddb-select" value={newType} onChange={e => setNewType(e.target.value as 'feature' | 'table')}>
                  <option value="feature">Spatial Layer (Polygon/Point)</option>
                  <option value="table">Table Data Only</option>
                </select>
                <button type="button" className="ddb-btn" onClick={() => void confirmNewLayer()}>
                  Add Layer
                </button>
              </div>
            ) : null}
          </div>

          <div className="ddb-panel-section">
            <div className="ddb-section-title">
              <i className="fa-solid fa-chart-simple" aria-hidden /> Custom Stat Cards
            </div>
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

          <div className="ddb-panel-section">
            <div className="ddb-section-title">
              <i className="fa-solid fa-link" aria-hidden /> Link Layers (Relation)
            </div>
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

          <div className="ddb-panel-section">
            <div className="ddb-section-title">
              <i className="fa-brands fa-microsoft" aria-hidden /> Power BI Static Tools (Multi-Select)
            </div>
            <div className="ddb-powerbi-grid">
              {CHART_TOOLS.map(t => (
                <button
                  key={t.chart}
                  type="button"
                  className={`ddb-chart-tool-item${selectedCharts.has(t.chart) ? ' is-selected' : ''}`}
                  onClick={() => toggleChartTool(t.chart)}
                >
                  <i className={t.icon} aria-hidden />
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
            <button type="button" className="ddb-btn" style={{ width: '100%', marginTop: 12 }} onClick={() => setChartGen(g => g + 1)}>
              <i className="fa-solid fa-rotate" aria-hidden /> Generate Selected Visuals
            </button>
            <div className="ddb-hint">Click any tool to select/deselect, then generate.</div>
          </div>
        </div>

        <div className="ddb-main">
          <div className="ddb-map-container">
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
      </div>
    </div>
  )
}
