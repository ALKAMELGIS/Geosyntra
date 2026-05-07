import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import Chart from 'chart.js/auto'
import zoomPlugin from 'chartjs-plugin-zoom'
import { appAlert, appConfirm } from '../../lib/appDialog'
import { loadGisMapSavedLayers } from '../../lib/gisMapLayerStore'
import { DEVELOP_DATA_CONTEXT_LS_KEY } from '../../lib/geoAiChatClaude'
import type { LayerData } from '../satellite/components/LayerManager'
import { parseFile, parseRemoteUrlAsFile } from '../../utils/FileLoader'
import './develop-dashboard.css'

Chart.register(zoomPlugin)

type LayerOrigin = 'sample' | 'user'

/** Tabular CSV (no lat/lon) — Power BI “Data” pane style. */
type CsvDataset = {
  id: string
  name: string
  columns: string[]
  rows: Record<string, unknown>[]
  origin: LayerOrigin
}

type CartesianWellKey = 'xAxis' | 'yAxis' | 'legend' | 'smallMultiples' | 'tooltips'

type RightPowerBiPanel = 'none' | 'filters' | 'visualizations' | 'buildVisual' | 'data' | 'link'

type LayerState = {
  name: string
  type: 'feature' | 'table'
  url: string
  data: GeoJSON.FeatureCollection
  fields: string[]
  visible: boolean
  /** `sample` reserved; `user` = added via Add Source Data / GIS Content / etc. */
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

/** Map ↔ canvas charts cross-filter (same join field as stats / X axis when possible). */
type CanvasFeatureFocus = {
  layerKey: string
  joinField: string
  joinValue: string
}

/** Develop canvas chart axis tick/grid/border colors (matches ddbChartOptionsFor defaults). */
type DdbAxisColors = {
  xTick: string
  yTick: string
  xGrid: string
  yGrid: string
  xBorder: string
  yBorder: string
}

/** One placed visual on the canvas (same chart type may appear many times — Power BI style). */
type CanvasVisualSlot = {
  instanceId: string
  chart: string
}

/** Visualization types picker (Visualizations sheet only; 6 columns). */
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
  { chart: 'fieldMap', icon: 'fa-solid fa-map-pin', label: 'Field Map' },
  { chart: 'azureMaps', icon: 'fa-brands fa-microsoft', label: 'Azure Maps' },
  { chart: 'gauge', icon: 'fa-solid fa-gauge-high', label: 'Gauge' },
  { chart: 'card', icon: 'fa-solid fa-id-card', label: 'Card' },
  { chart: 'multiRowCard', icon: 'fa-solid fa-address-card', label: 'Multi-row Card' },
  { chart: 'kpi', icon: 'fa-solid fa-chart-simple', label: 'KPI' },
  { chart: 'customStatCard', icon: 'fa-solid fa-chart-column', label: 'Custom stat card' },
  { chart: 'slicer', icon: 'fa-solid fa-scissors', label: 'Slicer' },
  { chart: 'dataTable', icon: 'fa-solid fa-database', label: 'Data Table' },
  { chart: 'rScript', icon: 'fa-brands fa-r-project', label: 'R Script' },
  { chart: 'pythonVisual', icon: 'fa-brands fa-python', label: 'Python Visual' },
  { chart: 'keyInfluencers', icon: 'fa-solid fa-chart-line', label: 'Key Influencers' },
  { chart: 'decompositionTree', icon: 'fa-solid fa-diagram-project', label: 'Decomposition Tree' },
  { chart: 'qa', icon: 'fa-solid fa-circle-question', label: 'Q&A' },
  { chart: 'smartNarrative', icon: 'fa-solid fa-comment-dots', label: 'Smart Narrative' },
]

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

function ddbStrHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** Shared ID / axis field to link map features ↔ chart categories (OBJECTID preferred). */
function ddbResolveCrossfilterJoinField(layer: LayerState | undefined, xAxisWell: string): string {
  if (!layer?.fields?.length) return 'OBJECTID'
  if (layer.fields.includes('OBJECTID')) return 'OBJECTID'
  if (layer.fields.includes('objectid')) return 'objectid'
  if (layer.fields.includes('FID')) return 'FID'
  if (layer.fields.includes('fid')) return 'fid'
  if (xAxisWell && layer.fields.includes(xAxisWell)) return xAxisWell
  return layer.fields[0] ?? 'OBJECTID'
}

/** Dim non-selected rows/slices/points after palette (map selection ↔ charts). */
function ddbApplyChartRowHighlight(chart: Chart, rowIdx: number | null) {
  if (rowIdx === null) return
  const dim = 'rgba(148, 163, 184, 0.42)'
  const type = String((chart.config as { type?: string }).type ?? '')
  const labels = (chart.data.labels ?? []) as unknown[]
  const nLab = labels.length
  const datasets = chart.data.datasets as any[]

  const applyBarDataset = (ds: any, len: number) => {
    const bc = ds.backgroundColor
    const border = ds.borderColor
    if (Array.isArray(bc)) {
      ds.backgroundColor = bc.map((c: string, i: number) => (i === rowIdx ? c : dim))
    } else if (typeof bc === 'string') {
      ds.backgroundColor = Array.from({ length: len }, (_, i) => (i === rowIdx ? bc : dim))
    }
    if (typeof border === 'string') {
      ds.borderColor = Array.from({ length: len }, (_, i) => (i === rowIdx ? border : dim))
    } else if (Array.isArray(border)) {
      ds.borderColor = border.map((c: string, i: number) => (i === rowIdx ? c : dim))
    }
  }

  if (type === 'pie' || type === 'doughnut' || type === 'polarArea') {
    const ds = datasets[0]
    const n = Array.isArray(ds?.data) ? ds.data.length : nLab
    if (rowIdx < 0 || rowIdx >= n) return
    if (ds?.backgroundColor && Array.isArray(ds.backgroundColor)) {
      ds.backgroundColor = ds.backgroundColor.map((c: string, i: number) => (i === rowIdx ? c : dim))
      if (Array.isArray(ds.hoverBackgroundColor)) {
        ds.hoverBackgroundColor = ds.hoverBackgroundColor.map((c: string, i: number) => (i === rowIdx ? c : dim))
      }
    }
    chart.update('none')
    return
  }

  if (type === 'radar') {
    const ds = datasets[0]
    const n = Array.isArray(ds?.data) ? ds.data.length : nLab
    if (rowIdx < 0 || rowIdx >= n) return
    const solid = typeof ds.borderColor === 'string' ? ds.borderColor : '#15803d'
    ds.pointBackgroundColor = Array.from({ length: n }, (_, i) => (i === rowIdx ? solid : dim))
    ds.pointBorderColor = '#ffffff'
    chart.update('none')
    return
  }

  datasets.forEach(ds => {
    const lt = String(ds.type || type || '')
    const len = Array.isArray(ds.data) ? ds.data.length : nLab
    if (!len || rowIdx < 0 || rowIdx >= len) return
    if (lt === 'line') {
      const border = typeof ds.borderColor === 'string' ? ds.borderColor : '#15803d'
      ds.pointRadius = Array.from({ length: len }, (_, i) => (i === rowIdx ? 9 : 3.2))
      ds.pointHoverRadius = Array.from({ length: len }, (_, i) => (i === rowIdx ? 11 : 5))
      ds.pointBackgroundColor = Array.from({ length: len }, (_, i) => (i === rowIdx ? border : dim))
      ds.pointBorderColor = Array.from({ length: len }, (_, i) => (i === rowIdx ? '#ffffff' : dim))
      return
    }
    if (lt === 'scatter' || lt === 'bubble') {
      const border = typeof ds.borderColor === 'string' ? ds.borderColor : '#15803d'
      ds.pointRadius = Array.from({ length: len }, (_, i) => (i === rowIdx ? 8 : 4))
      ds.backgroundColor = Array.from({ length: len }, (_, i) => (i === rowIdx ? border : dim))
      return
    }
    if (lt === 'bar') {
      applyBarDataset(ds, len)
    }
  })

  chart.update('none')
}

/** Visualization grid → which “Build visual” wells to show (Power BI style). */
const DDB_MAP_VIS_CHARTS = new Set(['map', 'fieldMap', 'filledMap'])
const DDB_TABLE_VIS_CHARTS = new Set(['table', 'matrix', 'dataTable'])
const DDB_CARTESIAN_VIS_CHARTS = new Set([
  'stackedBar',
  'clusteredBar',
  'stackedColumn',
  'clusteredColumn',
  '100stackedBar',
  '100stackedColumn',
  'line',
  'area',
  'stackedArea',
  'lineClusteredColumn',
  'lineStackedColumn',
  'ribbon',
  'waterfall',
  'funnel',
  'scatter',
  'pie',
  'donut',
  'treemap',
  'gauge',
  'card',
  'kpi',
  'multiRowCard',
  'azureMaps',
  'keyInfluencers',
  'decompositionTree',
  'slicer',
  'rScript',
  'pythonVisual',
  'qa',
  'smartNarrative',
  'customStatCard',
])

type DdbMiniChartKind =
  | 'bar'
  | 'stackedColumn'
  | 'clusteredColumn'
  | 'horizontalBar'
  | 'line'
  | 'smoothLine'
  | 'area'
  | 'pie'
  | 'doughnut'
  | 'scatter'
  | 'bubble'
  | 'radar'
  | 'polarArea'

const DDB_PALETTE = ['#2c7a4a', '#5a9e7a', '#8bc0a4', '#b1d4be', '#cfe8d8', '#e2f0e8', '#f0faf4', '#dceee2']

const DDB_MINI_CHART_TOOLS: Array<{ kind: DdbMiniChartKind; icon: string; label: string }> = [
  { kind: 'bar', icon: 'fa-chart-column', label: 'Column' },
  { kind: 'stackedColumn', icon: 'fa-layer-group', label: 'Stacked columns' },
  { kind: 'clusteredColumn', icon: 'fa-chart-simple', label: 'Clustered columns' },
  { kind: 'horizontalBar', icon: 'fa-chart-bar', label: 'Bar horizontal' },
  { kind: 'line', icon: 'fa-chart-line', label: 'Line' },
  { kind: 'smoothLine', icon: 'fa-arrow-trend-up', label: 'Smooth line' },
  { kind: 'area', icon: 'fa-chart-area', label: 'Area' },
  { kind: 'pie', icon: 'fa-chart-pie', label: 'Pie' },
  { kind: 'doughnut', icon: 'fa-chart-pie', label: 'Donut' },
  { kind: 'scatter', icon: 'fa-braille', label: 'Scatter' },
  { kind: 'bubble', icon: 'fa-circle-dot', label: 'Bubble' },
  { kind: 'radar', icon: 'fa-bullseye', label: 'Radar' },
  { kind: 'polarArea', icon: 'fa-chart-pie', label: 'Polar area' },
]

const DDB_CHART_AXIS_COLORS_LS = 'ddb-develop-chart-axis-colors-v1'

const DDB_AXIS_COLORS_DEFAULT: DdbAxisColors = {
  xTick: '#475569',
  yTick: '#475569',
  xGrid: 'rgba(148, 163, 184, 0.22)',
  yGrid: 'rgba(148, 163, 184, 0.22)',
  xBorder: 'rgba(148, 163, 184, 0.28)',
  yBorder: 'rgba(148, 163, 184, 0.28)',
}

function ddbHexToRgba(hex: string, alpha: number): string {
  let h = hex.replace('#', '').trim()
  if (h.length === 3) {
    h = h
      .split('')
      .map(ch => ch + ch)
      .join('')
  }
  if (h.length !== 6) return `rgba(71, 85, 105, ${alpha})`
  const n = parseInt(h, 16)
  if (Number.isNaN(n)) return `rgba(71, 85, 105, ${alpha})`
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function ddbAxisColorsFromXYHex(xHex: string, yHex: string): DdbAxisColors {
  const nx = xHex.startsWith('#') ? xHex : `#${xHex}`
  const ny = yHex.startsWith('#') ? yHex : `#${yHex}`
  return {
    xTick: nx,
    yTick: ny,
    xGrid: ddbHexToRgba(nx, 0.22),
    yGrid: ddbHexToRgba(ny, 0.22),
    xBorder: ddbHexToRgba(nx, 0.28),
    yBorder: ddbHexToRgba(ny, 0.28),
  }
}

function ddbTickColorToColorInputValue(tick: string): string {
  if (typeof tick !== 'string') return '#475569'
  const t = tick.trim()
  if (t.startsWith('#')) {
    if (t.length === 7) return t
    if (t.length === 4) {
      const r = t[1]!
      const g = t[2]!
      const b = t[3]!
      return `#${r}${r}${g}${g}${b}${b}`
    }
  }
  const m = t.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (m) {
    const r = Number(m[1])
    const g = Number(m[2])
    const b = Number(m[3])
    const hx = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')
    return `#${hx(r)}${hx(g)}${hx(b)}`
  }
  return '#475569'
}

function loadDdbAxisColors(): DdbAxisColors {
  if (typeof window === 'undefined') return { ...DDB_AXIS_COLORS_DEFAULT }
  try {
    const raw = localStorage.getItem(DDB_CHART_AXIS_COLORS_LS)
    if (!raw) return { ...DDB_AXIS_COLORS_DEFAULT }
    const o = JSON.parse(raw) as Partial<DdbAxisColors>
    return { ...DDB_AXIS_COLORS_DEFAULT, ...o }
  } catch {
    return { ...DDB_AXIS_COLORS_DEFAULT }
  }
}

function persistDdbAxisColors(c: DdbAxisColors) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(DDB_CHART_AXIS_COLORS_LS, JSON.stringify(c))
  } catch {
    /* ignore */
  }
}

function ddbApplyAxisColorsToChartOptions(
  options: Record<string, unknown>,
  colors: DdbAxisColors,
): Record<string, unknown> {
  const opt = { ...options }
  const scales = opt.scales as Record<string, Record<string, unknown>> | undefined
  if (!scales?.x || !scales?.y) return opt
  const x = { ...scales.x }
  const y = { ...scales.y }
  const xTicks = { ...(x.ticks as Record<string, unknown> | undefined) }
  const yTicks = { ...(y.ticks as Record<string, unknown> | undefined) }
  const xGrid = { ...(x.grid as Record<string, unknown> | undefined) }
  const yGrid = { ...(y.grid as Record<string, unknown> | undefined) }
  const xBorder = { ...(x.border as Record<string, unknown> | undefined) }
  const yBorder = { ...(y.border as Record<string, unknown> | undefined) }
  xTicks.color = colors.xTick
  yTicks.color = colors.yTick
  xGrid.color = colors.xGrid
  yGrid.color = colors.yGrid
  xBorder.color = colors.xBorder
  yBorder.color = colors.yBorder
  x.ticks = xTicks
  y.ticks = yTicks
  x.grid = xGrid
  y.grid = yGrid
  x.border = xBorder
  y.border = yBorder
  opt.scales = { ...scales, x, y }
  return opt
}

function ddbApplyAxisColorsToChart(chart: Chart, colors: DdbAxisColors) {
  const opt = chart.options as { scales?: { x?: { ticks?: { color?: string }; grid?: { color?: string }; border?: { color?: string } }; y?: { ticks?: { color?: string }; grid?: { color?: string }; border?: { color?: string } } } }
  if (!opt?.scales?.x || !opt?.scales?.y) return
  const sx = opt.scales.x
  const sy = opt.scales.y
  if (sx.ticks) sx.ticks.color = colors.xTick
  if (sx.grid) sx.grid.color = colors.xGrid
  if (sx.border) sx.border.color = colors.xBorder
  if (sy.ticks) sy.ticks.color = colors.yTick
  if (sy.grid) sy.grid.color = colors.yGrid
  if (sy.border) sy.border.color = colors.yBorder
  chart.update('none')
}

function ddbFlyMapToFeature(map: L.Map | null, feat: GeoJSON.Feature | undefined) {
  if (!map || !feat?.geometry) return
  const g = feat.geometry
  if (g.type === 'Point') {
    const c = g.coordinates as number[]
    const lng = c[0]!
    const lat = c[1]!
    map.flyTo([lat, lng], Math.min(16, Math.max(map.getZoom(), 13)), { duration: 0.45 })
    return
  }
  try {
    const layer = L.geoJSON(feat as GeoJSON.GeoJsonObject)
    const b = layer.getBounds()
    if (b.isValid()) map.fitBounds(b, { padding: [40, 40], maxZoom: 16 })
  } catch {
    /* ignore */
  }
}

function ddbChartZoomPluginConfig(): Record<string, unknown> {
  return {
    limits: {
      x: { min: 'original', max: 'original' },
      y: { min: 'original', max: 'original' },
    },
    pan: {
      enabled: true,
      mode: 'xy',
      modifierKey: null,
    },
    zoom: {
      wheel: { enabled: true, speed: 0.11 },
      pinch: { enabled: true },
      drag: {
        enabled: true,
        backgroundColor: 'rgba(44, 122, 74, 0.12)',
        borderColor: 'rgba(31, 94, 58, 0.45)',
        borderWidth: 1,
      },
      mode: 'xy',
    },
  }
}

function ddbChartOptionsFor(
  chartJsType: string,
  modifiers?: { stacked?: boolean; indexAxis?: 'x' | 'y' },
  axisOverrides?: Partial<DdbAxisColors>,
): Record<string, unknown> {
  const radial = chartJsType === 'pie' || chartJsType === 'doughnut' || chartJsType === 'polarArea' || chartJsType === 'radar'
  const dpr =
    typeof window !== 'undefined' ? Math.min(3, Math.max(1.5, window.devicePixelRatio || 1)) : 2
  const ax: DdbAxisColors = {
    ...DDB_AXIS_COLORS_DEFAULT,
    ...axisOverrides,
  }
  const base: Record<string, unknown> = {
    responsive: true,
    maintainAspectRatio: false,
    devicePixelRatio: dpr,
    animation: { duration: 240, easing: 'easeOutCubic' },
    normalized: true,
    interaction: { mode: radial ? 'nearest' : 'index', intersect: false },
    plugins: {
      legend: {
        display: false,
      },
    },
  }
  if (!radial) {
    ;(base.plugins as Record<string, unknown>).zoom = ddbChartZoomPluginConfig()
    const xScale: Record<string, unknown> = {
      stacked: Boolean(modifiers?.stacked),
      ticks: { maxRotation: 0, font: { size: 10, weight: '600' }, color: ax.xTick },
      grid: { color: ax.xGrid, lineWidth: 1 },
      border: { color: ax.xBorder },
    }
    const yScale: Record<string, unknown> = {
      stacked: Boolean(modifiers?.stacked),
      ticks: { font: { size: 10, weight: '600' }, color: ax.yTick },
      grid: { color: ax.yGrid, lineWidth: 1 },
      border: { color: ax.yBorder },
    }
    base.scales = { x: xScale, y: yScale }
    if (modifiers?.indexAxis === 'y') {
      ;(base as Record<string, unknown>).indexAxis = 'y'
    }
  }
  ;(base as Record<string, unknown>).elements = {
    line: { borderWidth: 2.6, tension: 0.25 },
    point: { radius: 3.2, hoverRadius: 5, borderWidth: 1.4 },
    bar: { borderRadius: 4, borderSkipped: false, borderWidth: 1 },
    arc: { borderWidth: 1.2, borderColor: '#ffffff' },
  }
  return base
}

function ddbLinePointStyle() {
  return {
    pointRadius: 5,
    pointHoverRadius: 7,
    pointBackgroundColor: '#ffffff',
    pointBorderColor: '#2c7a4a',
    pointBorderWidth: 2,
    pointHoverBackgroundColor: '#f0faf4',
    pointHoverBorderColor: '#1f5e3a',
    borderWidth: 2.5,
  }
}

function ddbBuildChartFromMiniKind(
  kind: DdbMiniChartKind,
  base: { labels: string[]; values: number[]; datasetLabel: string },
): { type: string; data: Record<string, unknown>; modifiers?: { stacked?: boolean; indexAxis?: 'x' | 'y' } } {
  const n = Math.min(base.labels.length, base.values.length)
  const labels = base.labels.slice(0, n)
  const values = base.values.slice(0, n)
  const { datasetLabel } = base
  const lineExtras = ddbLinePointStyle()

  if (kind === 'scatter') {
    return {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: datasetLabel,
            data: labels.map((_, i) => ({ x: i, y: values[i] ?? 0 })),
            backgroundColor: 'rgba(44, 122, 74, 0.85)',
            borderColor: '#1f5e3a',
            borderWidth: 1,
          },
        ],
      },
    }
  }
  if (kind === 'bubble') {
    const maxV = Math.max(...values.map(v => Math.abs(v)), 1)
    return {
      type: 'bubble',
      data: {
        datasets: [
          {
            label: datasetLabel,
            data: labels.map((_, i) => {
              const y = values[i] ?? 0
              const r = 6 + Math.round((Math.abs(y) / maxV) * 14)
              return { x: i, y, r }
            }),
            backgroundColor: 'rgba(44, 122, 74, 0.55)',
            borderColor: '#2c7a4a',
            borderWidth: 1,
          },
        ],
      },
    }
  }
  if (kind === 'pie') {
    return {
      type: 'pie',
      data: { labels, datasets: [{ data: values, backgroundColor: DDB_PALETTE }] },
    }
  }
  if (kind === 'doughnut') {
    return {
      type: 'doughnut',
      data: { labels, datasets: [{ data: values, backgroundColor: DDB_PALETTE }] },
    }
  }
  if (kind === 'polarArea') {
    return {
      type: 'polarArea',
      data: { labels, datasets: [{ data: values, backgroundColor: DDB_PALETTE }] },
    }
  }
  if (kind === 'radar') {
    return {
      type: 'radar',
      data: {
        labels,
        datasets: [
          {
            label: datasetLabel,
            data: values,
            borderColor: '#2c7a4a',
            backgroundColor: 'rgba(44, 122, 74, 0.22)',
            borderWidth: 2,
            pointBackgroundColor: '#fff',
            pointBorderColor: '#2c7a4a',
            pointHoverBackgroundColor: '#f0faf4',
          },
        ],
      },
    }
  }
  if (kind === 'area') {
    return {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: datasetLabel,
            data: values,
            fill: true,
            backgroundColor: 'rgba(143, 201, 163, 0.35)',
            borderColor: '#2c7a4a',
            tension: 0.3,
            ...lineExtras,
          },
        ],
      },
    }
  }
  if (kind === 'smoothLine') {
    return {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: datasetLabel,
            data: values,
            borderColor: '#2c7a4a',
            tension: 0.42,
            fill: false,
            ...lineExtras,
          },
        ],
      },
    }
  }
  if (kind === 'line') {
    return {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: datasetLabel,
            data: values,
            borderColor: '#2c7a4a',
            tension: 0.15,
            fill: false,
            ...lineExtras,
          },
        ],
      },
    }
  }
  if (kind === 'stackedColumn') {
    return {
      type: 'bar',
      modifiers: { stacked: true },
      data: {
        labels,
        datasets: [
          { label: datasetLabel, data: values, backgroundColor: '#4c9a6e' },
          {
            label: `${datasetLabel} · share`,
            data: values.map(v => Math.max(0, v * 0.38)),
            backgroundColor: '#8bc0a4',
          },
        ],
      },
    }
  }
  if (kind === 'clusteredColumn') {
    return {
      type: 'bar',
      modifiers: { stacked: false },
      data: {
        labels,
        datasets: [
          { label: datasetLabel, data: values, backgroundColor: '#4c9a6e' },
          {
            label: `${datasetLabel} · series B`,
            data: values.map(v => Math.max(0, v * 0.72)),
            backgroundColor: '#94c3a8',
          },
        ],
      },
    }
  }
  if (kind === 'horizontalBar') {
    return {
      type: 'bar',
      modifiers: { indexAxis: 'y' },
      data: { labels, datasets: [{ label: datasetLabel, data: values, backgroundColor: '#5a9e7a' }] },
    }
  }
  return {
    type: 'bar',
    data: { labels, datasets: [{ label: datasetLabel, data: values, backgroundColor: '#4c9a6e' }] },
  }
}

function ddbMiniKindFromChartType(chartType: string, dataConfig: { data?: { datasets?: Array<{ fill?: boolean }> } }): DdbMiniChartKind {
  if (chartType === 'pie') return 'pie'
  if (chartType === 'doughnut') return 'doughnut'
  if (chartType === 'scatter') return 'scatter'
  if (chartType === 'line' && dataConfig?.data?.datasets?.[0]?.fill) return 'area'
  if (chartType === 'line') return 'line'
  return 'bar'
}

function ddbTitleForMiniKind(titleBase: string, kind: DdbMiniChartKind): string {
  const map: Record<DdbMiniChartKind, string> = {
    bar: 'Column chart',
    stackedColumn: 'Stacked column chart',
    clusteredColumn: 'Clustered column chart',
    horizontalBar: 'Horizontal bar chart',
    line: 'Line chart',
    smoothLine: 'Smooth line chart',
    area: 'Area chart',
    pie: 'Pie chart',
    doughnut: 'Donut chart',
    scatter: 'Scatter plot',
    bubble: 'Bubble chart',
    radar: 'Radar chart',
    polarArea: 'Polar area chart',
  }
  return map[kind] ?? titleBase
}

function ddbIconClassForMiniKind(kind: DdbMiniChartKind): string {
  const row = DDB_MINI_CHART_TOOLS.find(t => t.kind === kind)
  return row ? `fa-solid ${row.icon}` : 'fa-solid fa-chart-simple'
}

const DDB_CHART_PALETTE_LS = 'ddb-develop-chart-palette-v1'

/** Chart.js color ramps — one selection applies to every chart on the Develop canvas. */
const DDB_CHART_PALETTE_MAP: Record<string, string[]> = {
  emerald: ['#10b981', '#22c55e', '#34d399', '#059669', '#6ee7b7', '#14b8a6'],
  azure: ['#2563eb', '#3b82f6', '#60a5fa', '#0ea5e9', '#38bdf8', '#1d4ed8'],
  sunset: ['#f97316', '#f59e0b', '#ef4444', '#fb7185', '#f43f5e', '#ea580c'],
  violet: ['#7c3aed', '#8b5cf6', '#a78bfa', '#6366f1', '#c084fc', '#6d28d9'],
  mono: ['#0f172a', '#334155', '#475569', '#64748b', '#94a3b8', '#cbd5e1'],
  rose: ['#f43f5e', '#fb7185', '#fda4af', '#be123c', '#e11d48', '#fecdd3'],
  gold: ['#ca8a04', '#eab308', '#facc15', '#fde047', '#f59e0b', '#d97706'],
  teal: ['#0d9488', '#14b8a6', '#2dd4bf', '#5eead4', '#0f766e', '#115e59'],
  indigo: ['#312e81', '#4338ca', '#4f46e5', '#6366f1', '#818cf8', '#3730a3'],
  crimson: ['#991b1b', '#dc2626', '#ef4444', '#f87171', '#b91c1c', '#7f1d1d'],
  forest: ['#14532d', '#15803d', '#22c55e', '#4ade80', '#166534', '#052e16'],
  magma: ['#7f1d1d', '#ea580c', '#f97316', '#fbbf24', '#fde047', '#c2410c'],
}

const DDB_CHART_PALETTE_MENU_ORDER = [
  'emerald',
  'azure',
  'sunset',
  'violet',
  'mono',
  'rose',
  'gold',
  'teal',
  'indigo',
  'crimson',
  'forest',
  'magma',
] as const satisfies readonly (keyof typeof DDB_CHART_PALETTE_MAP)[]

const DDB_CHART_PALETTE_LABELS: Record<string, string> = {
  emerald: 'Emerald',
  azure: 'Azure',
  sunset: 'Sunset',
  violet: 'Violet',
  mono: 'Mono',
  rose: 'Rose',
  gold: 'Gold',
  teal: 'Teal',
  indigo: 'Indigo',
  crimson: 'Crimson',
  forest: 'Forest',
  magma: 'Magma',
}

function ddbBuildChartPaletteMenuHtml(activeKey: string): string {
  return DDB_CHART_PALETTE_MENU_ORDER.map(key => {
    const cols = DDB_CHART_PALETTE_MAP[key] ?? []
    const sw = cols.slice(0, 3)
    const label = DDB_CHART_PALETTE_LABELS[key] ?? key
    const active = key === activeKey ? ' is-active' : ''
    return `<button type="button" class="ddb-visual-card__palette-item${active}" data-palette="${key}">
      <span class="ddb-visual-card__palette-swatch">${sw.map(c => `<i style="background:${c}"></i>`).join('')}</span>
      <span>${label}</span>
    </button>`
  }).join('')
}

/** Solid color for SVG legend swatches (canvas legend disabled for crisp vector labels). */
function ddbPickLegendSwatchColor(ds: any, segmentIndex: number, chartType: string): string {
  const bc = ds?.borderColor
  const bg = ds?.backgroundColor
  const radial = chartType === 'pie' || chartType === 'doughnut' || chartType === 'polarArea'
  if (radial) {
    const arr = Array.isArray(bg) ? bg : Array.isArray(bc) ? bc : []
    if (arr.length) {
      const c = arr[segmentIndex % arr.length]
      return typeof c === 'string' ? c : '#64748b'
    }
  }
  if (typeof bc === 'string' && bc.length > 0 && bc !== '#ffffff') return bc
  if (Array.isArray(bc) && bc[segmentIndex]) return String(bc[segmentIndex])
  if (typeof bg === 'string' && bg.length > 0) return bg
  if (Array.isArray(bg) && bg[segmentIndex]) return String(bg[segmentIndex])
  return '#475569'
}

/** DOM + SVG legend so labels stay sharp (not rasterized like Chart.js canvas legend). */
function ddbSyncSvgLegend(chart: Chart) {
  const canvas = chart.canvas
  const host = canvas.parentElement as HTMLElement | null
  if (!host) return
  const chartType = String((chart.config as any).type ?? '')
  const datasets = chart.data.datasets as any[]
  if (!datasets?.length) {
    host.querySelector('.ddb-chart-svg-legend')?.remove()
    return
  }

  let leg = host.querySelector('.ddb-chart-svg-legend') as HTMLDivElement | null
  if (!leg) {
    leg = document.createElement('div')
    leg.className = 'ddb-chart-svg-legend'
    leg.setAttribute('role', 'legend')
    canvas.insertAdjacentElement('afterend', leg)
  }
  leg.replaceChildren()

  const svgNS = 'http://www.w3.org/2000/svg'
  const appendRow = (label: string, fill: string) => {
    const row = document.createElement('div')
    row.className = 'ddb-chart-svg-legend__row'
    const svg = document.createElementNS(svgNS, 'svg')
    svg.setAttribute('width', '12')
    svg.setAttribute('height', '12')
    svg.setAttribute('viewBox', '0 0 12 12')
    svg.setAttribute('aria-hidden', 'true')
    svg.classList.add('ddb-chart-svg-legend__swatch')
    const circle = document.createElementNS(svgNS, 'circle')
    circle.setAttribute('cx', '6')
    circle.setAttribute('cy', '6')
    circle.setAttribute('r', '4.5')
    circle.setAttribute('fill', fill)
    circle.setAttribute('stroke', 'rgba(255,255,255,0.92)')
    circle.setAttribute('stroke-width', '1')
    svg.appendChild(circle)
    const span = document.createElement('span')
    span.className = 'ddb-chart-svg-legend__label'
    span.textContent = label
    row.appendChild(svg)
    row.appendChild(span)
    leg!.appendChild(row)
  }

  if (chartType === 'pie' || chartType === 'doughnut' || chartType === 'polarArea') {
    const ds = datasets[0]
    const labels = (chart.data.labels ?? []) as unknown[]
    const dataLen = Array.isArray(ds?.data) ? ds.data.length : 0
    const n = Math.max(labels.length, dataLen, 1)
    for (let i = 0; i < n; i++) {
      const lab = labels[i] != null && String(labels[i]).length ? String(labels[i]) : `Item ${i + 1}`
      appendRow(lab, ddbPickLegendSwatchColor(ds, i, chartType))
    }
    return
  }

  datasets.forEach((ds: any, i: number) => {
    const lab = ds.label != null && String(ds.label).length ? String(ds.label) : `Series ${i + 1}`
    appendRow(lab, ddbPickLegendSwatchColor(ds, 0, chartType))
  })
}

function ddbFormatDevelopLegendNumber(n: number): string {
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 1e12 || (abs > 0 && abs < 1e-6)) return n.toExponential(2)
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

/** Legend rows for Table / Matrix on Develop canvas — aligns with global chart palette and Legend field binding. */
function ddbLegendItemsFromLayerField(
  features: GeoJSON.Feature[],
  field: string,
  paletteColors: string[],
  opts?: { maxCategories?: number; numericBins?: number; sampleCap?: number },
): Array<{ label: string; color: string }> {
  const maxCats = opts?.maxCategories ?? 12
  const numBins = opts?.numericBins ?? 5
  const cap = opts?.sampleCap ?? 2500
  const subset = features.slice(0, Math.min(features.length, cap))
  const vals: unknown[] = []
  for (const f of subset) {
    const v = (f.properties as Record<string, unknown>)?.[field]
    if (v !== undefined && v !== null && String(v).length > 0) vals.push(v)
  }
  if (!vals.length || !paletteColors.length) return []

  const nums = vals.map(v => parseFloat(String(v))).filter(n => Number.isFinite(n))
  const numericRatio = vals.length ? nums.length / vals.length : 0

  if (numericRatio >= 0.88 && nums.length >= 3) {
    const sorted = [...nums].sort((a, b) => a - b)
    const min = sorted[0]!
    const max = sorted[sorted.length - 1]!
    const col = (i: number) => paletteColors[i % paletteColors.length] ?? '#64748b'
    if (min === max) return [{ label: ddbFormatDevelopLegendNumber(min), color: col(0) }]
    const k = Math.min(numBins, maxCats, sorted.length)
    const items: Array<{ label: string; color: string }> = []
    for (let i = 0; i < k; i++) {
      const lo = min + ((max - min) * i) / k
      const hi = min + ((max - min) * (i + 1)) / k
      items.push({
        label: `${ddbFormatDevelopLegendNumber(lo)} – ${ddbFormatDevelopLegendNumber(hi)}`,
        color: col(i),
      })
    }
    return items
  }

  const uniq = new Map<string, number>()
  for (const v of vals) uniq.set(String(v), (uniq.get(String(v)) ?? 0) + 1)
  const sortedKeys = [...uniq.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
  return sortedKeys.slice(0, maxCats).map((key, i) => ({
    label: key.length > 56 ? `${key.slice(0, 53)}…` : key,
    color: paletteColors[i % paletteColors.length] ?? '#64748b',
  }))
}

/** DOM legend under Develop canvas tables — mirrors map/chart palette (symbology field = Legend well). */
function ddbAttachDevelopTableLegend(
  card: HTMLElement,
  legendTitle: string,
  items: Array<{ label: string; color: string }>,
  hint?: string,
) {
  card.querySelector('.ddb-table-visual-legend')?.remove()
  const wrap = document.createElement('div')
  wrap.className = 'ddb-table-visual-legend'
  wrap.setAttribute('role', 'legend')
  const titleEl = document.createElement('div')
  titleEl.className = 'ddb-table-visual-legend__title'
  titleEl.textContent = legendTitle
  wrap.appendChild(titleEl)
  if (hint) {
    const p = document.createElement('p')
    p.className = 'ddb-table-visual-legend__hint'
    p.textContent = hint
    wrap.appendChild(p)
  }
  if (items.length) {
    const list = document.createElement('div')
    list.className = 'ddb-table-visual-legend__list'
    for (const it of items) {
      const row = document.createElement('div')
      row.className = 'ddb-table-visual-legend__row'
      const line = document.createElement('span')
      line.className = 'ddb-table-visual-legend__line'
      line.setAttribute('aria-hidden', 'true')
      line.style.background = it.color
      const lab = document.createElement('span')
      lab.className = 'ddb-table-visual-legend__label'
      lab.textContent = it.label
      row.appendChild(line)
      row.appendChild(lab)
      list.appendChild(row)
    }
    wrap.appendChild(list)
  }

  const responsive = card.querySelector('.ddb-table-responsive')
  const bodyPad = card.querySelector('.ddb-visual-card__body-pad')
  if (responsive) responsive.insertAdjacentElement('afterend', wrap)
  else if (bodyPad) bodyPad.appendChild(wrap)
  else card.appendChild(wrap)
}

function ddbApplyChartPalette(target: Chart, paletteKey: string) {
  const colors = DDB_CHART_PALETTE_MAP[paletteKey] ?? DDB_CHART_PALETTE_MAP.emerald
  target.data.datasets.forEach((dataset: any, idx) => {
    const color = colors[idx % colors.length]
    const soft = `${color}33`
    const lineType = (dataset.type || ((target as any)?.config?.type as string | undefined) || '').toString()
    dataset.borderColor = color
    if (lineType === 'line' || lineType === 'radar' || lineType === 'scatter' || lineType === 'bubble') {
      dataset.backgroundColor = soft
      dataset.pointBackgroundColor = color
      dataset.pointBorderColor = '#ffffff'
    } else if (lineType === 'pie' || lineType === 'doughnut' || lineType === 'polarArea') {
      dataset.backgroundColor = colors
      dataset.borderColor = '#ffffff'
      dataset.hoverBackgroundColor = colors.map((c: string) => `${c}dd`)
    } else {
      dataset.backgroundColor = `${color}cc`
      dataset.hoverBackgroundColor = color
    }
  })
  target.update('none')
  ddbSyncSvgLegend(target)
}

function ddbSyncPaletteMenusInHost(host: HTMLElement | null, activeKey: string) {
  if (!host) return
  host.querySelectorAll('.ddb-visual-card__palette-menu .ddb-visual-card__palette-item').forEach(item => {
    const el = item as HTMLElement
    el.classList.toggle('is-active', el.dataset.palette === activeKey)
  })
  host.querySelectorAll('.ddb-visual-card__icon-btn--palette').forEach(btn => {
    const b = btn as HTMLButtonElement
    b.title = `Color schemes (${activeKey})`
    b.setAttribute('aria-label', `Color schemes (${activeKey})`)
  })
}

function loadDdbChartPalette(): string {
  if (typeof window === 'undefined') return 'violet'
  try {
    const k = localStorage.getItem(DDB_CHART_PALETTE_LS)
    if (k && DDB_CHART_PALETTE_MAP[k]) return k
  } catch {
    /* ignore */
  }
  return 'violet'
}

function persistDdbChartPalette(key: string) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(DDB_CHART_PALETTE_LS, key)
  } catch {
    /* ignore quota */
  }
}

function ddbPromoteVisualCardChrome(
  card: HTMLElement,
  opts: {
    showStatStrip: boolean
    initialMini?: DdbMiniChartKind
    onClose?: () => void
    /** Highlights the active scheme in the palette dropdown (global canvas palette). */
    activePaletteKey?: string
    /** Axis tick colors (global): paired with `onAxisColorsChange` for palette menu controls. */
    getAxisColors?: () => DdbAxisColors
    onAxisColorsChange?: (next: DdbAxisColors) => void
  },
): {
  header: HTMLDivElement
  titleEl: HTMLElement
  actions: HTMLDivElement
  chartTypeMenu: HTMLDivElement | null
  paletteMenu: HTMLDivElement | null
  menu: HTMLDivElement
  filterPanel: HTMLDivElement
  chip: HTMLDivElement
} | null {
  card.classList.add('ddb-visual-card--enhanced')
  const first = card.firstElementChild as HTMLElement | null
  if (!first || !first.classList.contains('ddb-visual-title')) return null
  const titleEl = first
  titleEl.remove()
  const header = document.createElement('div')
  header.className = 'ddb-visual-card__header'
  const actions = document.createElement('div')
  actions.className = 'ddb-visual-card__actions'
  actions.innerHTML = `
    <button type="button" class="ddb-visual-card__icon-btn ddb-visual-card__icon-btn--chart-type" data-ddb-card-act="chartType" title="Chart types" aria-label="Chart types" aria-expanded="false"><i class="fa-solid fa-shapes"></i></button>
    <button type="button" class="ddb-visual-card__icon-btn ddb-visual-card__icon-btn--palette" data-ddb-card-act="palette" title="Color schemes" aria-label="Color schemes" aria-expanded="false"><i class="fa-solid fa-palette"></i></button>
    <button type="button" class="ddb-visual-card__icon-btn" data-ddb-card-act="filter" title="Filter" aria-label="Filter"><i class="fa-solid fa-filter"></i></button>
    <button type="button" class="ddb-visual-card__icon-btn" data-ddb-card-act="focus" title="Focus mode" aria-label="Focus mode"><i class="fa-solid fa-expand"></i></button>
    <button type="button" class="ddb-visual-card__icon-btn" data-ddb-card-act="more" title="More options" aria-label="More options"><i class="fa-solid fa-ellipsis"></i></button>
    <button type="button" class="ddb-visual-card__icon-btn ddb-visual-card__icon-btn--close" data-ddb-card-act="close" title="Close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
  `
  header.appendChild(titleEl)
  header.appendChild(actions)
  card.insertBefore(header, card.firstChild)

  const filterPanel = document.createElement('div')
  filterPanel.className = 'ddb-visual-card__filter-panel'
  filterPanel.hidden = true
  filterPanel.innerHTML = `<p class="ddb-visual-card__filter-title">Show categories</p><div class="ddb-visual-card__filter-list" data-ddb-filter-list></div>
    <button type="button" class="ddb-btn ddb-visual-card__filter-apply">Apply</button>`
  card.insertBefore(filterPanel, header.nextSibling)

  const menu = document.createElement('div')
  menu.className = 'ddb-visual-card__dropdown'
  menu.hidden = true
  menu.innerHTML = `
    <button type="button" class="ddb-visual-card__menu-item" data-action="bringFront"><i class="fa-solid fa-layer-group" aria-hidden="true"></i><span>Bring to front</span></button>
    <button type="button" class="ddb-visual-card__menu-item" data-action="export"><i class="fa-solid fa-file-export" aria-hidden="true"></i><span>Export data</span></button>
    <button type="button" class="ddb-visual-card__menu-item" data-action="showTable"><i class="fa-regular fa-table-list" aria-hidden="true"></i><span>Show as a table</span></button>
    <button type="button" class="ddb-visual-card__menu-item" data-action="spotlight"><i class="fa-regular fa-rectangle-history" aria-hidden="true"></i><span>Spotlight</span></button>
    <div class="ddb-visual-card__menu-group">
      <button type="button" class="ddb-visual-card__menu-item ddb-visual-card__menu-item--has-sub"><i class="fa-solid fa-arrow-down-wide-short" aria-hidden="true"></i><span>Sort axis</span><i class="fa-solid fa-chevron-right ddb-visual-card__menu-chevron" aria-hidden="true"></i></button>
      <div class="ddb-visual-card__submenu">
        <button type="button" class="ddb-visual-card__menu-item ddb-visual-card__sort-item" data-sort-key="label">
          <i class="fa-solid fa-check ddb-visual-card__check" aria-hidden="true"></i>
          <span>Field ID</span>
        </button>
        <button type="button" class="ddb-visual-card__menu-item ddb-visual-card__sort-item" data-sort-key="value">
          <i class="fa-solid fa-check ddb-visual-card__check" aria-hidden="true"></i>
          <span data-sort-metric-label>Metric value</span>
        </button>
        <div class="ddb-visual-card__menu-sep" aria-hidden="true"></div>
        <button type="button" class="ddb-visual-card__menu-item ddb-visual-card__sort-item" data-sort-dir="desc">
          <i class="fa-solid fa-check ddb-visual-card__check" aria-hidden="true"></i>
          <span>Sort descending</span>
        </button>
        <button type="button" class="ddb-visual-card__menu-item ddb-visual-card__sort-item" data-sort-dir="asc">
          <i class="fa-solid fa-check ddb-visual-card__check" aria-hidden="true"></i>
          <span>Sort ascending</span>
        </button>
      </div>
    </div>
    <div class="ddb-visual-card__menu-group">
      <button type="button" class="ddb-visual-card__menu-item ddb-visual-card__menu-item--has-sub"><i class="fa-solid fa-square-root-variable" aria-hidden="true"></i><span>New visual calculation (preview)</span><i class="fa-solid fa-chevron-right ddb-visual-card__menu-chevron" aria-hidden="true"></i></button>
      <div class="ddb-visual-card__submenu">
        <button type="button" class="ddb-visual-card__menu-item ddb-visual-card__calc-item" data-calc="custom">Custom</button>
        <button type="button" class="ddb-visual-card__menu-item ddb-visual-card__calc-item" data-calc="running_sum">Running sum</button>
        <button type="button" class="ddb-visual-card__menu-item ddb-visual-card__calc-item" data-calc="moving_average">Moving average</button>
        <button type="button" class="ddb-visual-card__menu-item ddb-visual-card__calc-item" data-calc="percent_parent">Percent of parent</button>
        <button type="button" class="ddb-visual-card__menu-item ddb-visual-card__calc-item" data-calc="percent_grand_total">Percent of grand total</button>
        <button type="button" class="ddb-visual-card__menu-item ddb-visual-card__calc-item" data-calc="average_children">Average of children</button>
        <button type="button" class="ddb-visual-card__menu-item ddb-visual-card__calc-item" data-calc="versus_previous">Versus previous</button>
        <button type="button" class="ddb-visual-card__menu-item ddb-visual-card__calc-item" data-calc="versus_next">Versus next</button>
        <button type="button" class="ddb-visual-card__menu-item ddb-visual-card__calc-item" data-calc="versus_first">Versus first</button>
        <button type="button" class="ddb-visual-card__menu-item ddb-visual-card__calc-item" data-calc="versus_last">Versus last</button>
        <button type="button" class="ddb-visual-card__menu-item ddb-visual-card__calc-item" data-calc="lookup_context">Look up a value with context</button>
        <button type="button" class="ddb-visual-card__menu-item ddb-visual-card__calc-item" data-calc="lookup_totals">Look up a value with totals</button>
      </div>
    </div>
    <button type="button" class="ddb-visual-card__menu-item" data-action="verified"><i class="fa-regular fa-badge-check" aria-hidden="true"></i><span>Set up a verified answer</span></button>
    <button type="button" class="ddb-visual-card__menu-item" data-action="remove"><i class="fa-solid fa-xmark" aria-hidden="true"></i><span>Remove</span></button>
    <div class="ddb-visual-card__menu-sep" aria-hidden="true"></div>
    <div class="ddb-visual-card__menu-group">
      <button type="button" class="ddb-visual-card__menu-item ddb-visual-card__menu-item--has-sub"><i class="fa-solid fa-chart-pie" aria-hidden="true"></i><span>Aggregate</span><i class="fa-solid fa-chevron-right ddb-visual-card__menu-chevron" aria-hidden="true"></i></button>
      <div class="ddb-visual-card__submenu">
        <button type="button" class="ddb-visual-card__menu-item is-active" data-stat="sum">Aggregate: Sum</button>
        <button type="button" class="ddb-visual-card__menu-item" data-stat="avg">Aggregate: Average (mean)</button>
        <button type="button" class="ddb-visual-card__menu-item" data-stat="median">Aggregate: Median</button>
        <button type="button" class="ddb-visual-card__menu-item" data-stat="min">Aggregate: Minimum</button>
        <button type="button" class="ddb-visual-card__menu-item" data-stat="max">Aggregate: Maximum</button>
        <button type="button" class="ddb-visual-card__menu-item" data-stat="range">Aggregate: Range (max − min)</button>
        <button type="button" class="ddb-visual-card__menu-item" data-stat="std">Aggregate: Std dev (sample)</button>
        <button type="button" class="ddb-visual-card__menu-item" data-stat="count">Aggregate: Count</button>
        <button type="button" class="ddb-visual-card__menu-item" data-stat="reset">Reset aggregate chip</button>
      </div>
    </div>
  `
  card.appendChild(menu)

  const paletteMenu = document.createElement('div')
  paletteMenu.className = 'ddb-visual-card__palette-menu'
  paletteMenu.hidden = true
  let paletteHtml = ddbBuildChartPaletteMenuHtml(opts.activePaletteKey ?? 'violet')
  if (opts.getAxisColors && opts.onAxisColorsChange) {
    const ax = opts.getAxisColors()
    const xv = ddbTickColorToColorInputValue(ax.xTick)
    const yv = ddbTickColorToColorInputValue(ax.yTick)
    paletteHtml += `<div class="ddb-visual-card__palette-axis" role="group" aria-label="Axis colors">
      <div class="ddb-visual-card__palette-axis-title">Axis colors</div>
      <label class="ddb-visual-card__palette-axis-row"><span>X axis</span><input type="color" data-ddb-axis-x value="${xv}" title="X axis tick color" /></label>
      <label class="ddb-visual-card__palette-axis-row"><span>Y axis</span><input type="color" data-ddb-axis-y value="${yv}" title="Y axis tick color" /></label>
      <button type="button" class="ddb-btn ddb-small-btn ddb-visual-card__palette-axis-reset" data-ddb-axis-reset>Reset axis colors</button>
    </div>`
  }
  paletteMenu.innerHTML = paletteHtml
  header.appendChild(paletteMenu)

  const syncAxisColorInputs = () => {
    if (!opts.getAxisColors) return
    const ax = opts.getAxisColors()
    const xIn = paletteMenu.querySelector('[data-ddb-axis-x]') as HTMLInputElement | null
    const yIn = paletteMenu.querySelector('[data-ddb-axis-y]') as HTMLInputElement | null
    if (xIn) xIn.value = ddbTickColorToColorInputValue(ax.xTick)
    if (yIn) yIn.value = ddbTickColorToColorInputValue(ax.yTick)
  }

  if (opts.getAxisColors && opts.onAxisColorsChange) {
    const xIn = paletteMenu.querySelector('[data-ddb-axis-x]') as HTMLInputElement | null
    const yIn = paletteMenu.querySelector('[data-ddb-axis-y]') as HTMLInputElement | null
    const commitAxis = () => {
      if (!xIn || !yIn) return
      opts.onAxisColorsChange!(ddbAxisColorsFromXYHex(xIn.value, yIn.value))
    }
    xIn?.addEventListener('input', commitAxis)
    yIn?.addEventListener('input', commitAxis)
    paletteMenu.querySelector('[data-ddb-axis-reset]')?.addEventListener('click', e => {
      e.preventDefault()
      e.stopPropagation()
      const d = { ...DDB_AXIS_COLORS_DEFAULT }
      if (xIn) xIn.value = ddbTickColorToColorInputValue(d.xTick)
      if (yIn) yIn.value = ddbTickColorToColorInputValue(d.yTick)
      opts.onAxisColorsChange!(d)
    })
  }

  const anchorMenuToButton = (menuEl: HTMLDivElement, btnEl: HTMLButtonElement | null) => {
    if (!btnEl || menuEl.hidden) return
    const headerRect = header.getBoundingClientRect()
    const btnRect = btnEl.getBoundingClientRect()
    const menuRect = menuEl.getBoundingClientRect()
    const top = Math.round(btnRect.bottom - headerRect.top + 6)
    let left = Math.round(btnRect.right - headerRect.left - menuRect.width)
    left = Math.max(8, Math.min(left, Math.max(8, Math.round(headerRect.width - menuRect.width - 8))))
    menuEl.style.top = `${top}px`
    menuEl.style.left = `${left}px`
    menuEl.style.right = 'auto'
  }

  const chip = document.createElement('div')
  chip.className = 'ddb-visual-card__stat-chip'
  chip.hidden = true
  card.insertBefore(chip, filterPanel.nextSibling)

  let chartTypeMenu: HTMLDivElement | null = null
  if (opts.showStatStrip) {
    chartTypeMenu = document.createElement('div')
    chartTypeMenu.className = 'ddb-visual-card__chart-type-menu'
    chartTypeMenu.setAttribute('role', 'menu')
    chartTypeMenu.setAttribute('aria-label', 'Visualization types')
    chartTypeMenu.hidden = true
    for (const t of DDB_MINI_CHART_TOOLS) {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'ddb-visual-card__chart-type-item'
      b.title = t.label
      b.setAttribute('aria-label', t.label)
      b.setAttribute('role', 'menuitem')
      b.setAttribute('data-mini-kind', t.kind)
      b.innerHTML = `<i class="fa-solid ${t.icon}" aria-hidden></i>`
      if (opts.initialMini === t.kind) b.classList.add('is-active')
      chartTypeMenu.appendChild(b)
    }
    header.appendChild(chartTypeMenu)
  }

  actions.querySelector('[data-ddb-card-act="focus"]')?.addEventListener('click', () => {
    card.classList.toggle('ddb-visual-card--focus')
  })
  actions.querySelector('[data-ddb-card-act="chartType"]')?.addEventListener('click', e => {
    e.stopPropagation()
    if (!chartTypeMenu) return
    const willOpen = chartTypeMenu.hidden
    chartTypeMenu.hidden = !willOpen
    const btn = actions.querySelector('[data-ddb-card-act="chartType"]') as HTMLButtonElement | null
    if (btn) {
      const open = willOpen
      btn.setAttribute('aria-expanded', open ? 'true' : 'false')
      btn.classList.toggle('is-active', open)
      if (open) requestAnimationFrame(() => anchorMenuToButton(chartTypeMenu!, btn))
    }
    filterPanel.hidden = true
    menu.hidden = true
    paletteMenu.hidden = true
    const paletteBtn = actions.querySelector('[data-ddb-card-act="palette"]') as HTMLButtonElement | null
    if (paletteBtn) {
      paletteBtn.setAttribute('aria-expanded', 'false')
      paletteBtn.classList.remove('is-active')
    }
  })
  actions.querySelector('[data-ddb-card-act="palette"]')?.addEventListener('click', e => {
    e.stopPropagation()
    const willOpen = paletteMenu.hidden
    paletteMenu.hidden = !willOpen
    const btn = actions.querySelector('[data-ddb-card-act="palette"]') as HTMLButtonElement | null
    if (btn) {
      const open = willOpen
      btn.setAttribute('aria-expanded', open ? 'true' : 'false')
      btn.classList.toggle('is-active', open)
      if (open) {
        syncAxisColorInputs()
        requestAnimationFrame(() => anchorMenuToButton(paletteMenu, btn))
      }
    }
    menu.hidden = true
    filterPanel.hidden = true
    if (chartTypeMenu) {
      chartTypeMenu.hidden = true
      const chartTypeBtn = actions.querySelector('[data-ddb-card-act="chartType"]') as HTMLButtonElement | null
      if (chartTypeBtn) {
        chartTypeBtn.setAttribute('aria-expanded', 'false')
        chartTypeBtn.classList.remove('is-active')
      }
    }
  })
  actions.querySelector('[data-ddb-card-act="filter"]')?.addEventListener('click', () => {
    filterPanel.hidden = !filterPanel.hidden
    menu.hidden = true
    if (chartTypeMenu) {
      chartTypeMenu.hidden = true
      const btn = actions.querySelector('[data-ddb-card-act="chartType"]') as HTMLButtonElement | null
      if (btn) btn.setAttribute('aria-expanded', 'false')
      if (btn) btn.classList.remove('is-active')
    }
    paletteMenu.hidden = true
    const paletteBtn = actions.querySelector('[data-ddb-card-act="palette"]') as HTMLButtonElement | null
    if (paletteBtn) {
      paletteBtn.setAttribute('aria-expanded', 'false')
      paletteBtn.classList.remove('is-active')
    }
  })
  actions.querySelector('[data-ddb-card-act="more"]')?.addEventListener('click', () => {
    menu.hidden = !menu.hidden
    filterPanel.hidden = true
    if (chartTypeMenu) {
      chartTypeMenu.hidden = true
      const btn = actions.querySelector('[data-ddb-card-act="chartType"]') as HTMLButtonElement | null
      if (btn) btn.setAttribute('aria-expanded', 'false')
      if (btn) btn.classList.remove('is-active')
    }
    paletteMenu.hidden = true
    const paletteBtn = actions.querySelector('[data-ddb-card-act="palette"]') as HTMLButtonElement | null
    if (paletteBtn) {
      paletteBtn.setAttribute('aria-expanded', 'false')
      paletteBtn.classList.remove('is-active')
    }
  })

  menu.querySelector('[data-action="bringFront"]')?.addEventListener('click', () => {
    const workspace = card.closest('.ddb-canvas-workspace')
    const cards = workspace?.querySelectorAll<HTMLElement>('.ddb-visual-card--canvas') ?? []
    let maxZ = 2
    cards.forEach(c => {
      const z = Number.parseInt(c.style.zIndex || '2', 10)
      if (!Number.isNaN(z)) maxZ = Math.max(maxZ, z)
    })
    card.style.zIndex = String(maxZ + 1)
    menu.hidden = true
  })
  menu.querySelector('[data-action="remove"]')?.addEventListener('click', () => {
    menu.hidden = true
    opts.onClose?.()
  })
  menu.querySelector('[data-action="spotlight"]')?.addEventListener('click', () => {
    card.classList.toggle('ddb-visual-card--focus')
    menu.hidden = true
  })

  const closeBtn = actions.querySelector('[data-ddb-card-act="close"]') as HTMLButtonElement | null
  if (opts.onClose && closeBtn) {
    closeBtn.addEventListener('click', e => {
      e.stopPropagation()
      opts.onClose?.()
    })
  } else {
    closeBtn?.remove()
  }

  return { header, titleEl, actions, chartTypeMenu, paletteMenu, menu, filterPanel, chip }
}

const DDB_CANVAS_LAYOUT_LS = 'ddb-develop-canvas-layouts-v1'

type DdbCanvasRect = { left: number; top: number; width: number; height: number }

function ddbReadCanvasLayouts(): Record<string, DdbCanvasRect> {
  try {
    const raw = localStorage.getItem(DDB_CANVAS_LAYOUT_LS)
    if (!raw) return {}
    const o = JSON.parse(raw) as unknown
    return o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, DdbCanvasRect>) : {}
  } catch {
    return {}
  }
}

function ddbWriteCanvasLayouts(map: Record<string, DdbCanvasRect>) {
  try {
    localStorage.setItem(DDB_CANVAS_LAYOUT_LS, JSON.stringify(map))
  } catch {
    /* ignore quota */
  }
}

function ddbCanvasLayoutKey(layerKey: string, instanceId: string): string {
  return `${layerKey}::canvas::${instanceId}`
}

/** User-added map layers + CSV tables — persist across sessions; only removable via UI delete. */
const DDB_DATA_REGISTRY_LS = 'ddb-develop-data-registry-v1'

type DdbPersistedRegistryV1 = { v: 1; layers: Record<string, LayerState>; csvDatasets: CsvDataset[] }

function ddbIsFeatureCollection(x: unknown): x is GeoJSON.FeatureCollection {
  return Boolean(
    x &&
      typeof x === 'object' &&
      (x as GeoJSON.FeatureCollection).type === 'FeatureCollection' &&
      Array.isArray((x as GeoJSON.FeatureCollection).features),
  )
}

function ddbParseStoredLayerState(raw: unknown): LayerState | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const name = typeof o.name === 'string' ? o.name : ''
  const type = o.type === 'table' || o.type === 'feature' ? o.type : null
  const url = typeof o.url === 'string' ? o.url : ''
  if (!ddbIsFeatureCollection(o.data)) return null
  const fields = Array.isArray(o.fields) ? o.fields.filter((f): f is string => typeof f === 'string') : []
  const visible = typeof o.visible === 'boolean' ? o.visible : true
  const origin = o.origin === 'user' || o.origin === 'sample' ? o.origin : null
  if (!name.trim() || !type || !origin) return null
  return {
    name,
    type,
    url,
    data: o.data,
    fields,
    visible,
    origin,
  }
}

function loadDdbDataRegistry(): { layers: Record<string, LayerState>; csvDatasets: CsvDataset[] } {
  if (typeof window === 'undefined') return { layers: {}, csvDatasets: [] }
  try {
    const raw = window.localStorage.getItem(DDB_DATA_REGISTRY_LS)
    if (!raw) return { layers: {}, csvDatasets: [] }
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return { layers: {}, csvDatasets: [] }
    const root = parsed as Record<string, unknown>
    const layers: Record<string, LayerState> = {}
    const lr = root.layers
    if (lr && typeof lr === 'object' && !Array.isArray(lr)) {
      for (const [key, val] of Object.entries(lr as Record<string, unknown>)) {
        if (!key) continue
        const ls = ddbParseStoredLayerState(val)
        if (ls?.origin === 'user') layers[key] = ls
      }
    }
    const csvDatasets: CsvDataset[] = []
    const cr = root.csvDatasets
    if (Array.isArray(cr)) {
      for (const row of cr) {
        if (!row || typeof row !== 'object') continue
        const r = row as Record<string, unknown>
        const id = typeof r.id === 'string' ? r.id : ''
        const name = typeof r.name === 'string' ? r.name : ''
        const columns = Array.isArray(r.columns) ? r.columns.filter((c): c is string => typeof c === 'string') : []
        const rows = Array.isArray(r.rows) ? (r.rows as Record<string, unknown>[]) : []
        const origin = r.origin === 'user' ? r.origin : null
        if (!id || !name || !origin) continue
        csvDatasets.push({ id, name, columns, rows, origin })
      }
    }
    return { layers, csvDatasets }
  } catch {
    return { layers: {}, csvDatasets: [] }
  }
}

function persistDdbDataRegistry(layers: Record<string, LayerState>, csvDatasets: CsvDataset[]) {
  if (typeof window === 'undefined') return
  const userLayers: Record<string, LayerState> = {}
  for (const [k, v] of Object.entries(layers)) {
    if (v?.origin === 'user') userLayers[k] = v
  }
  const userCsv = csvDatasets.filter(d => d.origin === 'user')
  try {
    const payload: DdbPersistedRegistryV1 = { v: 1, layers: userLayers, csvDatasets: userCsv }
    window.localStorage.setItem(DDB_DATA_REGISTRY_LS, JSON.stringify(payload))
  } catch (e) {
    console.warn('Develop Dashboard: could not persist data registry', e)
  }
}

/** One-time read for initial React state (avoid triple localStorage parse). */
let ddbInitialRegistryCache: { layers: Record<string, LayerState>; csvDatasets: CsvDataset[] } | null = null
function getDdbInitialRegistry() {
  if (!ddbInitialRegistryCache) ddbInitialRegistryCache = loadDdbDataRegistry()
  return ddbInitialRegistryCache
}

function ddbReflowCanvasHost(host: HTMLElement) {
  let maxBottom = 420
  host.querySelectorAll<HTMLElement>('.ddb-visual-card--canvas').forEach(el => {
    const top = parseFloat(el.style.top) || 0
    const h = parseFloat(el.style.height) || el.getBoundingClientRect().height
    maxBottom = Math.max(maxBottom, top + h + 28)
  })
  host.style.minHeight = `${Math.ceil(maxBottom)}px`
  const fieldWs = host.closest<HTMLElement>('.ddb-canvas-workspace--field-map')
  if (fieldWs) {
    let m = maxBottom
    const mapEl = fieldWs.querySelector<HTMLElement>('.ddb-map-container.ddb-map-container--canvas')
    if (mapEl) {
      const t = parseFloat(mapEl.style.top) || 0
      const h = parseFloat(mapEl.style.height) || mapEl.getBoundingClientRect().height
      m = Math.max(m, t + h + 28)
    }
    fieldWs.style.minHeight = `${Math.ceil(m)}px`
  }
}

function ddbResizeChartsInHost(host: HTMLElement) {
  window.requestAnimationFrame(() => {
    host.querySelectorAll('canvas').forEach(cv => {
      const ch = Chart.getChart(cv as HTMLCanvasElement)
      if (ch) ch.resize()
    })
  })
}

type DdbCanvasCardEl = HTMLElement & { __ddbCanvasTeardown?: () => void }

function ddbAttachCanvasCard(card: HTMLElement, host: HTMLElement, layoutKey: string) {
  const el = card as DdbCanvasCardEl
  el.__ddbCanvasTeardown?.()

  const MIN_W = 220
  const MIN_H = 160
  const DEFAULT_W = 380
  const DEFAULT_H = 280
  const GAP = 14

  const readSaved = (): DdbCanvasRect | null => {
    const m = ddbReadCanvasLayouts()[layoutKey]
    if (!m || typeof m.left !== 'number') return null
    return m
  }

  const saveRect = (rect: DdbCanvasRect) => {
    const all = ddbReadCanvasLayouts()
    all[layoutKey] = rect
    ddbWriteCanvasLayouts(all)
  }

  const index = Number(card.dataset.ddbCanvasIndex ?? 0) || 0
  const col = index % 2
  const row = Math.floor(index / 2)
  const saved = readSaved()
  const defLeft = 10 + col * (DEFAULT_W + GAP)
  const defTop = 10 + row * (DEFAULT_H + GAP)

  card.classList.add('ddb-visual-card--canvas')
  card.style.left = `${saved?.left ?? defLeft}px`
  card.style.top = `${saved?.top ?? defTop}px`
  card.style.width = `${Math.max(MIN_W, saved?.width ?? DEFAULT_W)}px`
  card.style.height = `${Math.max(MIN_H, saved?.height ?? DEFAULT_H)}px`

  const resizeDirs = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const
  const handles = resizeDirs.map(dir => {
    const h = document.createElement('button')
    h.type = 'button'
    h.className = `ddb-visual-card__resize-handle ddb-visual-card__resize-handle--${dir}`
    h.title = 'Resize card'
    h.setAttribute('aria-label', `Resize card ${dir}`)
    h.dataset.dir = dir
    if (dir === 'se') h.innerHTML = '<span class="ddb-visual-card__canvas-resize-grip" aria-hidden="true"></span>'
    card.appendChild(h)
    return h
  })

  const dragEl =
    (card.querySelector('.ddb-visual-card__header') as HTMLElement | null) ||
    (card.querySelector('.ddb-visual-title') as HTMLElement | null)

  const clamp = () => {
    const hostW = host.clientWidth || 800
    let w = parseFloat(card.style.width) || DEFAULT_W
    let h = parseFloat(card.style.height) || DEFAULT_H
    let left = parseFloat(card.style.left) || 0
    let top = parseFloat(card.style.top) || 0
    w = Math.min(Math.max(MIN_W, w), Math.max(MIN_W, hostW - 12))
    h = Math.max(MIN_H, h)
    const maxL = Math.max(0, hostW - w - 8)
    left = Math.max(0, Math.min(left, maxL))
    top = Math.max(0, top)
    card.style.width = `${w}px`
    card.style.height = `${h}px`
    card.style.left = `${left}px`
    card.style.top = `${top}px`
  }

  let drag: null | { sx: number; sy: number; sl: number; st: number }
  let resize: null | { sx: number; sy: number; sw: number; sh: number; sl: number; st: number; dir: string }

  const endInteract = () => {
    card.classList.remove('ddb-visual-card--dragging', 'ddb-visual-card--resizing')
    drag = null
    resize = null
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
    clamp()
    saveRect({
      left: parseFloat(card.style.left) || 0,
      top: parseFloat(card.style.top) || 0,
      width: parseFloat(card.style.width) || DEFAULT_W,
      height: parseFloat(card.style.height) || DEFAULT_H,
    })
    ddbReflowCanvasHost(host)
    ddbResizeChartsInHost(host)
  }

  const onMove = (e: PointerEvent) => {
    if (card.classList.contains('ddb-visual-card--focus')) return
    if (drag) {
      const dx = e.clientX - drag.sx
      const dy = e.clientY - drag.sy
      card.style.left = `${drag.sl + dx}px`
      card.style.top = `${drag.st + dy}px`
      clamp()
      ddbReflowCanvasHost(host)
    } else if (resize) {
      const dx = e.clientX - resize.sx
      const dy = e.clientY - resize.sy
      let nextW = resize.sw
      let nextH = resize.sh
      let nextL = resize.sl
      let nextT = resize.st
      if (resize.dir.includes('e')) nextW = Math.max(MIN_W, resize.sw + dx)
      if (resize.dir.includes('s')) nextH = Math.max(MIN_H, resize.sh + dy)
      if (resize.dir.includes('w')) {
        nextW = Math.max(MIN_W, resize.sw - dx)
        nextL = resize.sl + dx
      }
      if (resize.dir.includes('n')) {
        nextH = Math.max(MIN_H, resize.sh - dy)
        nextT = resize.st + dy
      }
      card.style.width = `${nextW}px`
      card.style.height = `${nextH}px`
      card.style.left = `${nextL}px`
      card.style.top = `${nextT}px`
      clamp()
      ddbReflowCanvasHost(host)
    }
  }

  const onUp = () => {
    if (drag || resize) endInteract()
  }

  const onDragDown = (e: PointerEvent) => {
    if (card.classList.contains('ddb-visual-card--focus')) return
    const t = e.target as HTMLElement | null
    if (!t || !dragEl?.contains(t)) return
    if (t.closest('button')) return
    if (handles.some(h => t === h || h.contains(t))) return
    e.preventDefault()
    drag = {
      sx: e.clientX,
      sy: e.clientY,
      sl: parseFloat(card.style.left) || 0,
      st: parseFloat(card.style.top) || 0,
    }
    card.classList.add('ddb-visual-card--dragging')
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  const onResizeDown = (e: PointerEvent) => {
    if (card.classList.contains('ddb-visual-card--focus')) return
    e.preventDefault()
    e.stopPropagation()
    const t = e.currentTarget as HTMLElement
    const dir = t.dataset.dir || 'se'
    resize = {
      sx: e.clientX,
      sy: e.clientY,
      sw: parseFloat(card.style.width) || DEFAULT_W,
      sh: parseFloat(card.style.height) || DEFAULT_H,
      sl: parseFloat(card.style.left) || 0,
      st: parseFloat(card.style.top) || 0,
      dir,
    }
    card.classList.add('ddb-visual-card--resizing')
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  dragEl?.addEventListener('pointerdown', onDragDown)
  handles.forEach(h => h.addEventListener('pointerdown', onResizeDown))

  el.__ddbCanvasTeardown = () => {
    dragEl?.removeEventListener('pointerdown', onDragDown)
    handles.forEach(h => h.removeEventListener('pointerdown', onResizeDown))
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
    handles.forEach(h => h.remove())
    card.classList.remove('ddb-visual-card--canvas', 'ddb-visual-card--dragging', 'ddb-visual-card--resizing')
    delete el.__ddbCanvasTeardown
  }

  clamp()
}

const DDB_FIELD_MAP_LAYOUT_KEY = 'ddb-develop-field-map-panel'

type DdbMapPanelEl = HTMLElement & { __ddbMapPanelTeardown?: () => void }

/** Field Map mode: free-form map card (drag header + resize) like `ddb-visual-card--canvas`. */
function ddbAttachMapPanelCanvas(mapPanel: HTMLElement, workspace: HTMLElement, chartsHost: HTMLElement) {
  const el = mapPanel as DdbMapPanelEl
  el.__ddbMapPanelTeardown?.()

  const MIN_W = 280
  const MIN_H = 200
  const DEFAULT_W = 420
  const DEFAULT_H = 300
  const GAP = 14

  const readSaved = (): DdbCanvasRect | null => {
    const m = ddbReadCanvasLayouts()[DDB_FIELD_MAP_LAYOUT_KEY]
    if (!m || typeof m.left !== 'number') return null
    return m
  }

  const saveRect = (rect: DdbCanvasRect) => {
    const all = ddbReadCanvasLayouts()
    all[DDB_FIELD_MAP_LAYOUT_KEY] = rect
    ddbWriteCanvasLayouts(all)
  }

  const saved = readSaved()
  const defLeft = 10
  const defTop = 10

  mapPanel.style.left = `${saved?.left ?? defLeft}px`
  mapPanel.style.top = `${saved?.top ?? defTop}px`
  mapPanel.style.width = `${Math.max(MIN_W, saved?.width ?? DEFAULT_W)}px`
  mapPanel.style.height = `${Math.max(MIN_H, saved?.height ?? DEFAULT_H)}px`

  mapPanel.querySelectorAll('.ddb-map-container__resize-handle').forEach(n => n.remove())
  const resizeDirs = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const
  const handles = resizeDirs.map(dir => {
    const h = document.createElement('button')
    h.type = 'button'
    h.className = `ddb-map-container__resize-handle ddb-map-container__resize-handle--${dir}`
    h.title = 'Resize map card'
    h.setAttribute('aria-label', `Resize map card ${dir}`)
    h.dataset.dir = dir
    if (dir === 'se') h.innerHTML = '<span class="ddb-visual-card__canvas-resize-grip" aria-hidden="true"></span>'
    mapPanel.appendChild(h)
    return h
  })

  const dragEl = mapPanel.querySelector<HTMLElement>('.ddb-map-container__drag-header')

  const clamp = () => {
    const hostW = workspace.clientWidth || 800
    let w = parseFloat(mapPanel.style.width) || DEFAULT_W
    let h = parseFloat(mapPanel.style.height) || DEFAULT_H
    let left = parseFloat(mapPanel.style.left) || 0
    let top = parseFloat(mapPanel.style.top) || 0
    w = Math.min(Math.max(MIN_W, w), Math.max(MIN_W, hostW - 24))
    h = Math.max(MIN_H, h)
    const maxL = Math.max(0, hostW - w - 12)
    left = Math.max(0, Math.min(left, maxL))
    top = Math.max(0, top)
    mapPanel.style.width = `${w}px`
    mapPanel.style.height = `${h}px`
    mapPanel.style.left = `${left}px`
    mapPanel.style.top = `${top}px`
  }

  let drag: null | { sx: number; sy: number; sl: number; st: number }
  let resize: null | { sx: number; sy: number; sw: number; sh: number; sl: number; st: number; dir: string }

  const endInteract = () => {
    mapPanel.classList.remove('ddb-map-container--dragging', 'ddb-map-container--resizing')
    drag = null
    resize = null
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
    clamp()
    saveRect({
      left: parseFloat(mapPanel.style.left) || 0,
      top: parseFloat(mapPanel.style.top) || 0,
      width: parseFloat(mapPanel.style.width) || DEFAULT_W,
      height: parseFloat(mapPanel.style.height) || DEFAULT_H,
    })
    ddbReflowCanvasHost(chartsHost)
  }

  const onMove = (e: PointerEvent) => {
    if (drag) {
      const dx = e.clientX - drag.sx
      const dy = e.clientY - drag.sy
      mapPanel.style.left = `${drag.sl + dx}px`
      mapPanel.style.top = `${drag.st + dy}px`
      clamp()
      ddbReflowCanvasHost(chartsHost)
    } else if (resize) {
      const dx = e.clientX - resize.sx
      const dy = e.clientY - resize.sy
      let nextW = resize.sw
      let nextH = resize.sh
      let nextL = resize.sl
      let nextT = resize.st
      if (resize.dir.includes('e')) nextW = Math.max(MIN_W, resize.sw + dx)
      if (resize.dir.includes('s')) nextH = Math.max(MIN_H, resize.sh + dy)
      if (resize.dir.includes('w')) {
        nextW = Math.max(MIN_W, resize.sw - dx)
        nextL = resize.sl + dx
      }
      if (resize.dir.includes('n')) {
        nextH = Math.max(MIN_H, resize.sh - dy)
        nextT = resize.st + dy
      }
      mapPanel.style.width = `${nextW}px`
      mapPanel.style.height = `${nextH}px`
      mapPanel.style.left = `${nextL}px`
      mapPanel.style.top = `${nextT}px`
      clamp()
      ddbReflowCanvasHost(chartsHost)
    }
  }

  const onUp = () => {
    if (drag || resize) endInteract()
  }

  const onDragDown = (e: PointerEvent) => {
    const t = e.target as HTMLElement | null
    if (!t || !dragEl?.contains(t)) return
    if (t.closest('button') && t !== dragEl) return
    if (handles.some(h => t === h || h.contains(t))) return
    e.preventDefault()
    drag = {
      sx: e.clientX,
      sy: e.clientY,
      sl: parseFloat(mapPanel.style.left) || 0,
      st: parseFloat(mapPanel.style.top) || 0,
    }
    mapPanel.classList.add('ddb-map-container--dragging')
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  const onResizeDown = (e: PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const t = e.currentTarget as HTMLElement
    const dir = t.dataset.dir || 'se'
    resize = {
      sx: e.clientX,
      sy: e.clientY,
      sw: parseFloat(mapPanel.style.width) || DEFAULT_W,
      sh: parseFloat(mapPanel.style.height) || DEFAULT_H,
      sl: parseFloat(mapPanel.style.left) || 0,
      st: parseFloat(mapPanel.style.top) || 0,
      dir,
    }
    mapPanel.classList.add('ddb-map-container--resizing')
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  dragEl?.addEventListener('pointerdown', onDragDown)
  handles.forEach(h => h.addEventListener('pointerdown', onResizeDown))

  el.__ddbMapPanelTeardown = () => {
    dragEl?.removeEventListener('pointerdown', onDragDown)
    handles.forEach(h => h.removeEventListener('pointerdown', onResizeDown))
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
    handles.forEach(h => h.remove())
    mapPanel.classList.remove('ddb-map-container--dragging', 'ddb-map-container--resizing')
    mapPanel.style.left = ''
    mapPanel.style.top = ''
    mapPanel.style.width = ''
    mapPanel.style.height = ''
    delete el.__ddbMapPanelTeardown
  }

  clamp()
  ddbReflowCanvasHost(chartsHost)
}

function ddbDetachMapPanelCanvas(mapPanel: HTMLElement) {
  ;(mapPanel as DdbMapPanelEl).__ddbMapPanelTeardown?.()
}

type DdbMapSplitEl = HTMLElement & { __ddbMapSplitTeardown?: () => void }

/** Default layout: drag bottom edge to change map strip height. */
function ddbAttachMapSplitHeightResize(mapPanel: HTMLElement, onResizeEnd: () => void) {
  const el = mapPanel as DdbMapSplitEl
  el.__ddbMapSplitTeardown?.()

  const MIN_H = 200
  const MAX_FRAC = 0.72

  let handle = mapPanel.querySelector<HTMLButtonElement>('.ddb-map-container__split-resize')
  if (!handle) {
    handle = document.createElement('button')
    handle.type = 'button'
    handle.className = 'ddb-map-container__split-resize'
    handle.title = 'Resize card'
    handle.setAttribute('aria-label', 'Resize card')
    handle.innerHTML = '<span class="ddb-visual-card__canvas-resize-grip" aria-hidden="true"></span>'
    mapPanel.appendChild(handle)
  }

  let resize: null | { sy: number; sh: number; workspace: HTMLElement }

  const end = () => {
    resize = null
    mapPanel.classList.remove('ddb-map-container--split-resizing')
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
    onResizeEnd()
  }

  const onMove = (e: PointerEvent) => {
    if (!resize) return
    const dy = e.clientY - resize.sy
    const ws = resize.workspace
    const maxH = Math.max(MIN_H, Math.floor(ws.clientHeight * MAX_FRAC))
    const next = Math.min(maxH, Math.max(MIN_H, resize.sh + dy))
    mapPanel.style.flex = `0 0 ${next}px`
    mapPanel.style.height = `${next}px`
    mapPanel.style.minHeight = `${MIN_H}px`
    onResizeEnd()
  }

  const onUp = () => {
    if (resize) end()
  }

  const onDown = (e: PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const workspace = mapPanel.parentElement
    if (!workspace) return
    const rect = mapPanel.getBoundingClientRect()
    resize = { sy: e.clientY, sh: rect.height, workspace }
    mapPanel.classList.add('ddb-map-container--split-resizing')
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  handle.addEventListener('pointerdown', onDown)

  el.__ddbMapSplitTeardown = () => {
    handle.removeEventListener('pointerdown', onDown)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
    handle.remove()
    mapPanel.style.flex = ''
    mapPanel.style.height = ''
    mapPanel.style.minHeight = ''
    mapPanel.classList.remove('ddb-map-container--split-resizing')
    delete el.__ddbMapSplitTeardown
  }
}

function ddbDetachMapSplitHeightResize(mapPanel: HTMLElement) {
  ;(mapPanel as DdbMapSplitEl).__ddbMapSplitTeardown?.()
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

type MapFlyout = 'none' | 'layers' | 'search' | 'analysis' | 'account'
type MapAnalysisTab = 'measure' | 'drive' | 'demographics' | 'relations' | 'routing'
type MapAccountTab = 'profile' | 'community' | 'help' | 'settings'

function haversineKm(a: L.LatLng, b: L.LatLng): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2)
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, x)))
}

export default function DevelopDashboard() {
  const [searchParams, setSearchParams] = useSearchParams()
  const mapElRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const mapMeasureLineRef = useRef<L.Polyline | null>(null)
  const mapMeasureMarkersRef = useRef<L.CircleMarker[]>([])
  const mapSearchMarkerRef = useRef<L.Marker | null>(null)
  const leafletRef = useRef<Record<string, L.Layer>>({})
  const chartsHostRef = useRef<HTMLDivElement | null>(null)
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const canvasWorkspaceRef = useRef<HTMLDivElement | null>(null)
  const chartInstancesRef = useRef<Chart[]>([])
  /** Global chart palette for all Chart.js visuals on the canvas (persisted). */
  const chartPaletteKeyRef = useRef<string>(loadDdbChartPalette())
  /** Global axis tick/grid/border colors for Cartesian charts (persisted). */
  const chartAxisColorsRef = useRef<DdbAxisColors>(loadDdbAxisColors())
  /** Row index in the bound layer’s feature list for map-driven chart highlight (synced in renderCharts). */
  const canvasChartFocusIdxRef = useRef<number | null>(null)
  const [canvasFeatureFocus, setCanvasFeatureFocus] = useState<CanvasFeatureFocus | null>(null)

  const [layers, setLayers] = useState<Record<string, LayerState>>(() => getDdbInitialRegistry().layers)
  const [activeStatsLayer, setActiveStatsLayer] = useState(() => {
    const ks = Object.keys(getDdbInitialRegistry().layers)
    return ks[0] ?? ''
  })
  const [statsField, setStatsField] = useState('')
  const [statsAgg, setStatsAgg] = useState('sum')
  const [selectedCharts, setSelectedCharts] = useState<Set<string>>(() => new Set(['table', 'line', 'kpi']))
  const selectedChartsRef = useRef<Set<string>>(selectedCharts)
  selectedChartsRef.current = selectedCharts
  const [canvasVisualSlots, setCanvasVisualSlots] = useState<CanvasVisualSlot[]>([])
  /** Layer used for Build visual wells / bindings (defaults to active stats layer). */
  const [visualBindingsLayerKey, setVisualBindingsLayerKey] = useState('')
  const [mapFieldWells, setMapFieldWells] = useState({ location: '', legend: '', latitude: '', longitude: '' })
  const [mapTooltipFieldPicks, setMapTooltipFieldPicks] = useState<string[]>([])
  const [cartesianWells, setCartesianWells] = useState({
    xAxis: '',
    yAxis: '',
    legend: '',
    smallMultiples: '',
    tooltips: '',
  })
  const [cartesianFieldPicks, setCartesianFieldPicks] = useState<string[]>([])
  const [tableColumnPicks, setTableColumnPicks] = useState<string[]>([])
  const [buildVisualFieldsOpen, setBuildVisualFieldsOpen] = useState(true)
  const [statCards, setStatCards] = useState<StatCardRow[]>([])
  const [linkStatus, setLinkStatus] = useState('')
  const [addGisOpen, setAddGisOpen] = useState(false)
  const [addWizard, setAddWizard] = useState<AddSourceWizard>('home')
  const [gisContentLayers, setGisContentLayers] = useState<LayerData[]>([])
  const [gisContentLoading, setGisContentLoading] = useState(false)
  const [getDataNotice, setGetDataNotice] = useState<string | null>(null)
  /** Home step only: which source type is selected (Power BI–style radio list). */
  const [addSourceHomeChoice, setAddSourceHomeChoice] = useState<'gis' | 'arcgis' | 'upload' | 'raster' | 'getdata' | ''>('')
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
  const [rightSheet, setRightSheet] = useState<RightPowerBiPanel>('none')
  const [dataPaneSearch, setDataPaneSearch] = useState('')
  const [dataTreeOpen, setDataTreeOpen] = useState<Record<string, boolean>>({})
  const [csvDatasets, setCsvDatasets] = useState<CsvDataset[]>(() => getDdbInitialRegistry().csvDatasets)
  const [linkFrom, setLinkFrom] = useState('')
  const [linkTo, setLinkTo] = useState('')
  const [linkFieldFrom, setLinkFieldFrom] = useState('')
  const [linkFieldTo, setLinkFieldTo] = useState('')
  const [calcFieldOpen, setCalcFieldOpen] = useState(false)
  const [calcLayerKey, setCalcLayerKey] = useState('')
  const [calcExpressionType, setCalcExpressionType] = useState<'Arcade' | 'Python' | 'SQL'>('Arcade')
  const [calcTargetField, setCalcTargetField] = useState('')
  const [calcNewFieldName, setCalcNewFieldName] = useState('')
  const [calcExpression, setCalcExpression] = useState('')
  const [calcFieldStatus, setCalcFieldStatus] = useState('')
  const [linkLayerSearch, setLinkLayerSearch] = useState('')
  const [calcLayerSearch, setCalcLayerSearch] = useState('')
  const [mapFlyout, setMapFlyout] = useState<MapFlyout>('none')
  const [mapAnalysisTab, setMapAnalysisTab] = useState<MapAnalysisTab>('measure')
  const [mapAccountTab, setMapAccountTab] = useState<MapAccountTab>('profile')
  const [canvasLayoutPreset, setCanvasLayoutPreset] = useState<'balanced' | 'compact'>('balanced')
  const [canvasBwTheme, setCanvasBwTheme] = useState(false)
  const [dragFieldName, setDragFieldName] = useState<string | null>(null)
  const [dragOverWell, setDragOverWell] = useState<CartesianWellKey | null>(null)
  const [geoSearchQuery, setGeoSearchQuery] = useState('')
  const [geoSearchBusy, setGeoSearchBusy] = useState(false)
  const [geoSearchError, setGeoSearchError] = useState<string | null>(null)
  const [measureUnit, setMeasureUnit] = useState<'Metric' | 'Imperial'>('Metric')
  const [measureDistanceLabel, setMeasureDistanceLabel] = useState('-')

  const layerKeys = useMemo(() => Object.keys(layers), [layers])
  const bindLayerKey = useMemo(() => {
    if (visualBindingsLayerKey && layers[visualBindingsLayerKey]) return visualBindingsLayerKey
    return activeStatsLayer
  }, [visualBindingsLayerKey, activeStatsLayer, layers])

  const vizBuildMode = useMemo(() => {
    const sel = [...selectedCharts]
    if (sel.some(c => DDB_MAP_VIS_CHARTS.has(c))) return 'map' as const
    if (sel.some(c => DDB_CARTESIAN_VIS_CHARTS.has(c))) return 'cartesian' as const
    if (sel.some(c => DDB_TABLE_VIS_CHARTS.has(c))) return 'table' as const
    return 'none' as const
  }, [selectedCharts])

  const bindLayerFields = useMemo(() => {
    if (!bindLayerKey || !layers[bindLayerKey]) return []
    return layers[bindLayerKey].fields
  }, [bindLayerKey, layers])

  /** Puts `ddb-map-container` in the visuals canvas (drag + resize) — Map, Field Map, or Filled Map (Power BI). */
  const mapInCanvasVisualMode = useMemo(
    () => selectedCharts.has('fieldMap') || selectedCharts.has('filledMap') || selectedCharts.has('map'),
    [selectedCharts],
  )
  const mapCanvasCardPresentation = useMemo(() => {
    if (!mapInCanvasVisualMode) return null
    const hasField = selectedCharts.has('fieldMap')
    const hasFilled = selectedCharts.has('filledMap')
    const hasMap = selectedCharts.has('map')
    if (hasField && hasFilled) {
      return { aria: 'Field and filled map card', icon: 'fa-solid fa-map-location-dot', label: 'Field / Filled map' }
    }
    if (hasField) return { aria: 'Field Map card', icon: 'fa-solid fa-map-pin', label: 'Field Map' }
    if (hasFilled) return { aria: 'Filled Map card', icon: 'fa-solid fa-map-location-dot', label: 'Filled Map' }
    if (hasMap) return { aria: 'Map card', icon: 'fa-solid fa-map', label: 'Map' }
    return { aria: 'Map card', icon: 'fa-solid fa-map', label: 'Map' }
  }, [mapInCanvasVisualMode, selectedCharts])
  const sampleLayerKeys = useMemo(() => layerKeys.filter(k => layers[k]?.origin === 'sample'), [layerKeys, layers])
  const userLayerKeys = useMemo(() => layerKeys.filter(k => layers[k]?.origin === 'user'), [layerKeys, layers])

  const activeFields = useMemo(() => {
    if (!activeStatsLayer || !layers[activeStatsLayer]) return []
    return layers[activeStatsLayer].fields
  }, [activeStatsLayer, layers])

  /** Persist user-added layers and CSV tables; removal only via explicit delete in UI. */
  useEffect(() => {
    persistDdbDataRegistry(layers, csvDatasets)
  }, [layers, csvDatasets])

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
    const map = L.map(el, { zoomControl: false }).setView([28.5, 34.5], 6)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© CartoDB',
    }).addTo(map)
    mapRef.current = map
    const clearMapSelection = () => setCanvasFeatureFocus(null)
    map.on('click', clearMapSelection)
    return () => {
      map.off('click', clearMapSelection)
      try {
        mapMeasureLineRef.current?.remove()
      } catch {
        /* ignore */
      }
      mapMeasureLineRef.current = null
      mapMeasureMarkersRef.current.forEach(m => {
        try {
          map.removeLayer(m)
        } catch {
          /* ignore */
        }
      })
      mapMeasureMarkersRef.current = []
      try {
        mapSearchMarkerRef.current?.remove()
      } catch {
        /* ignore */
      }
      mapSearchMarkerRef.current = null
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
    const mapEl = mapContainerRef.current
    const ws = canvasWorkspaceRef.current
    const charts = chartsHostRef.current
    if (!mapEl || !ws || !charts) return
    const inv = () => {
      window.requestAnimationFrame(() => mapRef.current?.invalidateSize())
    }
    let ro: ResizeObserver | null = null
    if (mapInCanvasVisualMode) {
      ddbDetachMapSplitHeightResize(mapEl)
      ddbAttachMapPanelCanvas(mapEl, ws, charts)
      inv()
    } else {
      ddbDetachMapPanelCanvas(mapEl)
      ddbAttachMapSplitHeightResize(mapEl, inv)
      inv()
    }
    ro = new ResizeObserver(() => inv())
    ro.observe(mapEl)
    return () => {
      ro?.disconnect()
      ddbDetachMapPanelCanvas(mapEl)
      ddbDetachMapSplitHeightResize(mapEl)
      inv()
    }
  }, [mapInCanvasVisualMode])

  /** No bundled demo layers — keep active stats layer in sync when the user adds or removes data. */
  useEffect(() => {
    if (!layerKeys.length) {
      setActiveStatsLayer('')
      return
    }
    const first = layerKeys[0]
    if (!first) return
    setActiveStatsLayer(prev => (prev && layers[prev] ? prev : first))
  }, [layerKeys, layers])

  useEffect(() => {
    setCanvasFeatureFocus(null)
  }, [bindLayerKey])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCanvasFeatureFocus(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
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
            l.on('click', e => {
              L.DomEvent.stopPropagation(e)
              const lyrState = layers[key]
              const jf = ddbResolveCrossfilterJoinField(lyrState, cartesianWells.xAxis)
              if (!jf || props[jf] === undefined || props[jf] === null) return
              const val = String(props[jf])
              setCanvasFeatureFocus(prev =>
                prev?.layerKey === key && prev.joinValue === val ? null : { layerKey: key, joinField: jf, joinValue: val },
              )
            })
          },
        })
        gj.addTo(map)
        leafletRef.current[key] = gj
      }
      /* Table layers have no geometry: do not plot synthetic markers on the map. */
    }
  }, [layers, cartesianWells.xAxis])

  /** Optional point layer from Latitude / Longitude attribute columns (Map / Field Map / Filled Map wells). */
  useEffect(() => {
    const map = mapRef.current
    const lyr = bindLayerKey ? layers[bindLayerKey] : null
    const latK = mapFieldWells.latitude
    const lngK = mapFieldWells.longitude
    const prev = leafletRef.current.__ddbLatLngMarkers

    const clearPrev = () => {
      if (prev && map) {
        try {
          map.removeLayer(prev)
        } catch {
          /* ignore */
        }
      }
      delete leafletRef.current.__ddbLatLngMarkers
    }

    if (!map || !lyr?.data?.features?.length || !latK || !lngK || !lyr.fields.includes(latK) || !lyr.fields.includes(lngK)) {
      clearPrev()
      return
    }

    clearPrev()

    const feats = lyr.data.features as GeoJSON.Feature[]
    const group = L.featureGroup()
    const locK = mapFieldWells.location
    const legK = mapFieldWells.legend
    const palette = ['#2c7a4a', '#5a9e7a', '#3b82f6', '#c2410c', '#7c3aed', '#0d9488', '#b45309', '#15803d']

    feats.forEach(f => {
      const p = (f.properties ?? {}) as Record<string, unknown>
      const la = parseFloat(String(p[latK]))
      const lo = parseFloat(String(p[lngK]))
      if (!Number.isFinite(la) || !Number.isFinite(lo)) return
      let fill = '#2c7a4a'
      if (legK && p[legK] != null && String(p[legK]).length) {
        fill = palette[ddbStrHash(String(p[legK])) % palette.length]!
      }
      const mk = L.circleMarker([la, lo], {
        radius: 6,
        fillColor: fill,
        color: '#fff',
        weight: 1,
        opacity: 1,
        fillOpacity: 0.9,
      })
      const tipLines: string[] = []
      if (locK && p[locK] != null) tipLines.push(`<strong>${locK}</strong>: ${String(p[locK])}`)
      for (const tf of mapTooltipFieldPicks) {
        if (tf === locK) continue
        if (p[tf] == null) continue
        tipLines.push(`${tf}: ${String(p[tf])}`)
      }
      if (!tipLines.length && legK && p[legK] != null) tipLines.push(`${legK}: ${String(p[legK])}`)
      mk.bindPopup(tipLines.length ? tipLines.join('<br/>') : 'Point')
      const jf = ddbResolveCrossfilterJoinField(lyr, cartesianWells.xAxis)
      mk.on('click', e => {
        L.DomEvent.stopPropagation(e)
        if (!bindLayerKey || !jf || p[jf] === undefined || p[jf] === null) return
        const val = String(p[jf])
        setCanvasFeatureFocus(prev =>
          prev?.layerKey === bindLayerKey && prev.joinValue === val ? null : { layerKey: bindLayerKey, joinField: jf, joinValue: val },
        )
      })
      mk.addTo(group)
    })

    if (!group.getLayers().length) return

    group.addTo(map)
    leafletRef.current.__ddbLatLngMarkers = group
    try {
      const b = group.getBounds()
      if (b.isValid()) map.fitBounds(b, { padding: [24, 24], maxZoom: 16 })
    } catch {
      /* ignore */
    }

    return () => {
      try {
        map.removeLayer(group)
      } catch {
        /* ignore */
      }
      if (leafletRef.current.__ddbLatLngMarkers === group) delete leafletRef.current.__ddbLatLngMarkers
    }
  }, [bindLayerKey, layers, mapFieldWells, mapTooltipFieldPicks, cartesianWells.xAxis])

  const destroyCharts = useCallback(() => {
    chartInstancesRef.current.forEach(c => c.destroy())
    chartInstancesRef.current = []
    const host = chartsHostRef.current
    if (host) {
      host.querySelectorAll('.ddb-visual-card').forEach(node => {
        const n = node as DdbCanvasCardEl
        n.__ddbCanvasTeardown?.()
      })
      host.innerHTML = ''
      host.style.minHeight = ''
    }
  }, [])

  const removeCanvasVisualByInstanceId = useCallback((instanceId: string) => {
    setCanvasVisualSlots(prev => {
      const slot = prev.find(s => s.instanceId === instanceId)
      if (!slot) return prev
      const chart = slot.chart
      const next = prev.filter(s => s.instanceId !== instanceId)
      if (!DDB_MAP_VIS_CHARTS.has(chart)) {
        const stillHas = next.some(s => s.chart === chart)
        if (!stillHas) {
          const nextSel = new Set(selectedChartsRef.current)
          nextSel.delete(chart)
          selectedChartsRef.current = nextSel
          setSelectedCharts(nextSel)
        }
      }
      return next
    })
  }, [])

  const renderCharts = useCallback(() => {
    destroyCharts()
    const host = chartsHostRef.current
    if (!host) return

    if (!canvasVisualSlots.length) {
      host.innerHTML =
        '<div class="ddb-hint" style="padding:20px;">Select chart types to add visuals to the canvas.</div>'
      return
    }

    const paletteKeyForMenus = chartPaletteKeyRef.current

    const applyGlobalAxisColors = (next: DdbAxisColors) => {
      chartAxisColorsRef.current = next
      persistDdbAxisColors(next)
      requestAnimationFrame(() => {
        chartInstancesRef.current.forEach(ch => {
          ddbApplyAxisColorsToChart(ch, next)
          ddbApplyChartPalette(ch, chartPaletteKeyRef.current)
          ddbApplyChartRowHighlight(ch, canvasChartFocusIdxRef.current)
        })
      })
    }

    const axisChromeOpts = {
      getAxisColors: () => chartAxisColorsRef.current,
      onAxisColorsChange: applyGlobalAxisColors,
    }

    const layer = bindLayerKey ? layers[bindLayerKey] : undefined
    const hasLayerData = !!(layer?.data?.features?.length)

    let features: GeoJSON.Feature[] = []
    let primaryNum = 'value'
    let labelField = 'category'
    let labels = ['—', '—', '—']
    let values = [0, 0, 0]

    if (hasLayerData && layer) {
      features = layer.data.features
      const numericFields = layer.fields.filter(f => features.some(feat => typeof (feat.properties as any)?.[f] === 'number'))
      const yWell = cartesianWells.yAxis
      primaryNum =
        yWell &&
        layer.fields.includes(yWell) &&
        features.some(feat => {
          const v = (feat.properties as any)?.[yWell]
          return typeof v === 'number' || !Number.isNaN(parseFloat(String(v ?? '')))
        })
          ? yWell
          : numericFields[0] || layer.fields[0]
      const xWell = cartesianWells.xAxis
      labelField =
        xWell && layer.fields.includes(xWell)
          ? xWell
          : layer.fields.includes('Farm_Name')
            ? 'Farm_Name'
            : layer.fields[0] || 'name'
      labels = features.slice(0, 8).map((f, i) => String((f.properties as any)?.[labelField] ?? `Item ${i + 1}`))
      values = features.slice(0, 8).map(f => parseFloat(String((f.properties as any)?.[primaryNum] ?? 0)) || 0)
    }

    let chartFocusIdx: number | null = null
    if (canvasFeatureFocus && bindLayerKey && canvasFeatureFocus.layerKey === bindLayerKey && hasLayerData) {
      const jf = canvasFeatureFocus.joinField
      const nChart = Math.min(8, features.length)
      for (let i = 0; i < nChart; i++) {
        const pv = (features[i]?.properties as Record<string, unknown>)?.[jf]
        if (pv !== undefined && pv !== null && String(pv) === canvasFeatureFocus.joinValue) {
          chartFocusIdx = i
          break
        }
      }
    }
    canvasChartFocusIdxRef.current = chartFocusIdx

    const joinFieldForCrossfilter =
      hasLayerData && layer ? ddbResolveCrossfilterJoinField(layer, cartesianWells.xAxis) : 'OBJECTID'
    const chartJoinValuesSlice = features.slice(0, 8).map(f =>
      String((f.properties as Record<string, unknown>)?.[joinFieldForCrossfilter] ?? ''),
    )

    const addChartCard = (instanceId: string, title: string, type: string, dataConfig: any) => {
      const card = document.createElement('div')
      card.className = 'ddb-visual-card'
      card.dataset.ddbInstanceId = instanceId
      const titleEl = document.createElement('div')
      titleEl.className = 'ddb-visual-title'
      titleEl.innerHTML = `<i class="fa-solid fa-chart-simple" aria-hidden="true"></i> ${title}`
      const canvas = document.createElement('canvas')
      card.appendChild(titleEl)
      card.appendChild(canvas)
      host.appendChild(card)

      const ds0 = dataConfig?.data?.datasets?.[0]
      const rawVals = ds0?.data
      const datasetLabel = String(ds0?.label ?? primaryNum)
      let labels = (dataConfig?.data?.labels as string[]) ?? []
      let values: number[] = Array.isArray(rawVals)
        ? rawVals.map((v: unknown) => (typeof v === 'number' ? v : parseFloat(String(v)) || 0))
        : []
      if (
        type === 'scatter' &&
        Array.isArray(rawVals) &&
        rawVals.length &&
        typeof rawVals[0] === 'object' &&
        rawVals[0] !== null &&
        'y' in (rawVals[0] as object)
      ) {
        labels = rawVals.map((_: unknown, i: number) => String(i))
        values = rawVals.map((p: unknown) => parseFloat(String((p as { y?: unknown }).y ?? 0)) || 0)
      }
      const filterSourceLabels = [...labels]
      const filterSourceValues = [...values]
      const filterSourceJoinValues = filterSourceLabels.map((_, i) => chartJoinValuesSlice[i] ?? '')
      const base = {
        labels: [...labels],
        values: [...values],
        datasetLabel,
        joinValues: [...filterSourceJoinValues],
      }
      let sortKey: 'label' | 'value' = 'label'
      let sortDir: 'asc' | 'desc' = 'asc'
      let calcMode:
        | 'custom'
        | 'running_sum'
        | 'moving_average'
        | 'percent_parent'
        | 'percent_grand_total'
        | 'average_children'
        | 'versus_previous'
        | 'versus_next'
        | 'versus_first'
        | 'versus_last'
        | 'lookup_context'
        | 'lookup_totals' = 'custom'
      let calcSourceValues = [...base.values]
      const initialMini = ddbMiniKindFromChartType(type, dataConfig)
      const chrome = ddbPromoteVisualCardChrome(card, {
        showStatStrip: true,
        initialMini,
        activePaletteKey: paletteKeyForMenus,
        onClose: () => removeCanvasVisualByInstanceId(instanceId),
        ...axisChromeOpts,
      })
      if (!chrome) return

      if (!hasLayerData) {
        const note = document.createElement('p')
        note.className = 'ddb-hint ddb-visual-placeholder-note'
        note.textContent = ''
        chrome.header.after(note)
      }

      const { chartTypeMenu, paletteMenu, menu, filterPanel, chip, titleEl: titleNode } = chrome
      const sortMetricLabel = menu.querySelector('[data-sort-metric-label]') as HTMLSpanElement | null
      if (sortMetricLabel) sortMetricLabel.textContent = datasetLabel || primaryNum || 'Metric value'

      const syncSortUi = () => {
        menu.querySelectorAll<HTMLElement>('.ddb-visual-card__sort-item').forEach(el => {
          const isActive =
            (el.dataset.sortKey && el.dataset.sortKey === sortKey) || (el.dataset.sortDir && el.dataset.sortDir === sortDir)
          el.classList.toggle('is-active', Boolean(isActive))
        })
      }
      syncSortUi()

      const syncCalcUi = () => {
        menu.querySelectorAll<HTMLElement>('.ddb-visual-card__calc-item').forEach(el => {
          el.classList.toggle('is-active', el.dataset.calc === calcMode)
        })
      }
      syncCalcUi()
      const listEl = filterPanel.querySelector('[data-ddb-filter-list]') as HTMLDivElement | null
      const applyFilterBtn = filterPanel.querySelector('.ddb-visual-card__filter-apply') as HTMLButtonElement | null

      const syncFilterList = () => {
        if (!listEl) return
        listEl.innerHTML = ''
        filterSourceLabels.forEach((lab, i) => {
          const id = `ddb-f-${Math.random().toString(16).slice(2)}`
          const row = document.createElement('label')
          row.className = 'ddb-visual-card__filter-row'
          row.innerHTML = `<input type="checkbox" checked data-idx="${i}" id="${id}" /> <span>${lab}</span>`
          listEl.appendChild(row)
        })
      }
      syncFilterList()

      const applyLabelFilter = () => {
        if (!listEl) return
        const checks = listEl.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
        const idxOn: number[] = []
        checks.forEach(c => {
          if (c.checked) idxOn.push(Number(c.dataset.idx))
        })
        if (!idxOn.length) return
        base.labels = idxOn.map(i => filterSourceLabels[i] ?? '')
        base.values = idxOn.map(i => filterSourceValues[i] ?? 0)
        base.joinValues = idxOn.map(i => filterSourceJoinValues[i] ?? '')
      }

      applyFilterBtn?.addEventListener('click', () => {
        applyLabelFilter()
        filterPanel.hidden = true
        rebuild(initialMini)
      })

      const setStripActive = (k: DdbMiniChartKind) => {
        chartTypeMenu?.querySelectorAll('.ddb-visual-card__chart-type-item').forEach(btn => {
          btn.classList.toggle('is-active', btn.getAttribute('data-mini-kind') === k)
        })
        const toggleBtn = chrome.actions.querySelector('[data-ddb-card-act="chartType"]') as HTMLButtonElement | null
        if (toggleBtn) {
          const iconClass = ddbIconClassForMiniKind(k)
          const i = toggleBtn.querySelector('i')
          if (i) i.className = iconClass
          toggleBtn.title = `Chart types (${ddbTitleForMiniKind('Chart', k)})`
          toggleBtn.setAttribute('aria-label', `Chart types (${ddbTitleForMiniKind('Chart', k)})`)
        }
      }

      let chartRef: Chart | null = null

      const syncPaletteUi = () => {
        ddbSyncPaletteMenusInHost(host, chartPaletteKeyRef.current)
      }
      syncPaletteUi()

      const setCrossfilterFromChartIndex = (idx: number) => {
        if (!bindLayerKey || !hasLayerData) return
        const jv = base.joinValues[idx]
        if (jv === undefined || jv === '') return
        setCanvasFeatureFocus(prev =>
          prev?.layerKey === bindLayerKey && prev.joinValue === jv
            ? null
            : { layerKey: bindLayerKey, joinField: joinFieldForCrossfilter, joinValue: jv },
        )
        const feat = features.find(
          f => String((f.properties as Record<string, unknown>)?.[joinFieldForCrossfilter] ?? '') === jv,
        )
        ddbFlyMapToFeature(mapRef.current, feat)
      }

      const rebuild = (kind: DdbMiniChartKind) => {
        const built = ddbBuildChartFromMiniKind(kind, base as { labels: string[]; values: number[]; datasetLabel: string })
        const prev = chartRef
        if (prev) {
          const idx = chartInstancesRef.current.indexOf(prev)
          if (idx >= 0) chartInstancesRef.current.splice(idx, 1)
          prev.destroy()
        }
        chartRef = null
        const opt = {
          ...(ddbChartOptionsFor(built.type, built.modifiers, chartAxisColorsRef.current) as any),
        }
        if (built.modifiers?.indexAxis === 'y') {
          opt.indexAxis = 'y'
        }
        opt.onClick = (_e: unknown, elements: { index: number }[]) => {
          if (!elements?.length) return
          const ix = elements[0].index
          if (typeof ix !== 'number') return
          requestAnimationFrame(() => setCrossfilterFromChartIndex(ix))
        }
        chartRef = new Chart(canvas.getContext('2d')!, {
          type: built.type as any,
          data: built.data as any,
          options: opt,
        } as any)
        chartInstancesRef.current.push(chartRef)
        ddbApplyChartPalette(chartRef, chartPaletteKeyRef.current)
        ddbApplyChartRowHighlight(chartRef, chartFocusIdx)
        const ic = ddbIconClassForMiniKind(kind)
        titleNode.innerHTML = `<i class="${ic}" aria-hidden="true"></i> ${ddbTitleForMiniKind(title, kind)}`
        setStripActive(kind)
      }

      chartTypeMenu?.querySelectorAll('.ddb-visual-card__chart-type-item').forEach(btn => {
        btn.addEventListener('click', () => {
          const k = btn.getAttribute('data-mini-kind') as DdbMiniChartKind
          if (!k) return
          rebuild(k)
          chartTypeMenu.hidden = true
          const toggleBtn = chrome.actions.querySelector('[data-ddb-card-act="chartType"]') as HTMLButtonElement | null
          if (toggleBtn) {
            toggleBtn.setAttribute('aria-expanded', 'false')
            toggleBtn.classList.remove('is-active')
          }
        })
      })

      const applyDevelopCanvasPalette = (key: string) => {
        chartPaletteKeyRef.current = key
        requestAnimationFrame(() => {
          chartInstancesRef.current.forEach(ch => {
            ddbApplyChartPalette(ch, key)
            ddbApplyChartRowHighlight(ch, canvasChartFocusIdxRef.current)
          })
          ddbSyncPaletteMenusInHost(host, key)
        })
        queueMicrotask(() => persistDdbChartPalette(key))
        paletteMenu.hidden = true
        const paletteBtn = chrome.actions.querySelector('[data-ddb-card-act="palette"]') as HTMLButtonElement | null
        if (paletteBtn) {
          paletteBtn.setAttribute('aria-expanded', 'false')
          paletteBtn.classList.remove('is-active')
        }
      }

      paletteMenu?.querySelectorAll('.ddb-visual-card__palette-item').forEach(btn => {
        const readKey = () => {
          const raw = btn.getAttribute('data-palette') || 'emerald'
          return DDB_CHART_PALETTE_MAP[raw] ? raw : 'emerald'
        }
        let skipClickBecausePointer = false
        btn.addEventListener('pointerdown', ev => {
          const e = ev as PointerEvent
          if (e.pointerType === 'mouse' && e.button !== 0) return
          skipClickBecausePointer = true
          applyDevelopCanvasPalette(readKey())
        })
        btn.addEventListener('click', () => {
          if (skipClickBecausePointer) {
            skipClickBecausePointer = false
            return
          }
          applyDevelopCanvasPalette(readKey())
        })
      })

      const applyStat = (stat: string) => {
        const v = base.values
        if (!v.length) return
        let text = ''
        if (stat === 'sum') text = `Sum: ${v.reduce((a, b) => a + b, 0).toFixed(2)}`
        else if (stat === 'avg') text = `Average: ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2)}`
        else if (stat === 'median') {
          const s = [...v].sort((a, b) => a - b)
          const m = Math.floor(s.length / 2)
          const med = s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
          text = `Median: ${med.toFixed(2)}`
        } else if (stat === 'min') text = `Minimum: ${Math.min(...v).toFixed(2)}`
        else if (stat === 'max') text = `Maximum: ${Math.max(...v).toFixed(2)}`
        else if (stat === 'range') text = `Range: ${(Math.max(...v) - Math.min(...v)).toFixed(2)}`
        else if (stat === 'std') {
          if (v.length < 2) text = 'Std dev: —'
          else {
            const mean = v.reduce((a, b) => a + b, 0) / v.length
            const variance = v.reduce((acc, x) => acc + (x - mean) ** 2, 0) / (v.length - 1)
            text = `Std dev: ${Math.sqrt(variance).toFixed(2)}`
          }
        } else if (stat === 'count') text = `Count: ${v.length}`
        else if (stat === 'reset') {
          chip.hidden = true
          menu.hidden = true
          return
        }
        chip.textContent = text
        chip.hidden = false
        menu.hidden = true
      }

      const applySort = () => {
        const zipped = base.labels.map((lab, i) => ({
          label: lab,
          value: Number(base.values[i] ?? 0),
          jv: base.joinValues[i] ?? '',
        }))
        zipped.sort((a, b) => {
          if (sortKey === 'value') return sortDir === 'asc' ? a.value - b.value : b.value - a.value
          const cmp = a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' })
          return sortDir === 'asc' ? cmp : -cmp
        })
        base.labels = zipped.map(r => r.label)
        base.values = zipped.map(r => r.value)
        base.joinValues = zipped.map(r => r.jv)
        calcSourceValues = [...base.values]
      }

      const applyVisualCalculation = () => {
        const src = [...calcSourceValues]
        if (!src.length) return
        const total = src.reduce((a, b) => a + b, 0) || 1
        const first = src[0] ?? 0
        const last = src[src.length - 1] ?? 0
        const mean = src.reduce((a, b) => a + b, 0) / src.length
        const std = Math.sqrt(src.reduce((acc, x) => acc + (x - mean) ** 2, 0) / Math.max(1, src.length - 1)) || 1
        let out = [...src]
        if (calcMode === 'running_sum') {
          let acc = 0
          out = src.map(v => (acc += v))
        } else if (calcMode === 'moving_average') {
          out = src.map((_, i) => {
            const a = src[Math.max(0, i - 1)] ?? src[i] ?? 0
            const b = src[i] ?? 0
            const c = src[Math.min(src.length - 1, i + 1)] ?? src[i] ?? 0
            return (a + b + c) / 3
          })
        } else if (calcMode === 'percent_parent' || calcMode === 'percent_grand_total') {
          out = src.map(v => (v / total) * 100)
        } else if (calcMode === 'average_children') {
          out = src.map((_, i) => {
            const left = src[Math.max(0, i - 1)] ?? src[i] ?? 0
            const mid = src[i] ?? 0
            const right = src[Math.min(src.length - 1, i + 1)] ?? src[i] ?? 0
            return (left + mid + right) / 3
          })
        } else if (calcMode === 'versus_previous') {
          out = src.map((v, i) => (i === 0 ? 0 : v - (src[i - 1] ?? 0)))
        } else if (calcMode === 'versus_next') {
          out = src.map((v, i) => (i === src.length - 1 ? 0 : v - (src[i + 1] ?? 0)))
        } else if (calcMode === 'versus_first') {
          out = src.map(v => v - first)
        } else if (calcMode === 'versus_last') {
          out = src.map(v => v - last)
        } else if (calcMode === 'lookup_context') {
          out = src.map(v => (v - mean) / std)
        } else if (calcMode === 'lookup_totals') {
          let running = 0
          out = src.map(v => {
            running += v
            return (running / total) * 100
          })
        }
        base.values = out
      }

      menu.querySelectorAll('.ddb-visual-card__menu-item').forEach(el => {
        el.addEventListener('click', () => {
          const target = el as HTMLElement
          const stat = target.dataset.stat
          const action = target.dataset.action
          const key = target.dataset.sortKey as 'label' | 'value' | undefined
          const dir = target.dataset.sortDir as 'asc' | 'desc' | undefined
          const calc = target.dataset.calc
          if (stat) applyStat(stat)
          if (key) {
            sortKey = key
            applySort()
            syncSortUi()
            rebuild(ddbMiniKindFromChartType(type, dataConfig))
            chip.textContent = `Sorted by ${sortKey === 'label' ? 'Field ID' : datasetLabel} (${sortDir})`
            chip.hidden = false
            return
          }
          if (dir) {
            sortDir = dir
            applySort()
            syncSortUi()
            rebuild(ddbMiniKindFromChartType(type, dataConfig))
            chip.textContent = `Sort ${sortDir === 'asc' ? 'ascending' : 'descending'}`
            chip.hidden = false
            return
          }
          if (calc) {
            calcMode = calc as typeof calcMode
            if (calcMode === 'custom') {
              base.values = [...calcSourceValues]
              chip.textContent = 'Custom calculation (raw values)'
            } else {
              applyVisualCalculation()
              chip.textContent = `Calculation: ${target.textContent?.trim() ?? calcMode}`
            }
            syncCalcUi()
            rebuild(ddbMiniKindFromChartType(type, dataConfig))
            chip.hidden = false
            menu.hidden = true
            return
          }
          if (action === 'sortAxis') {
            base.labels = [...base.labels].reverse()
            base.values = [...base.values].reverse()
            base.joinValues = [...base.joinValues].reverse()
            const chartType = ((chartRef as any)?.config?.type as string | undefined) || type
            rebuild(ddbMiniKindFromChartType(chartType, { data: chartRef?.data as any }))
            chip.textContent = 'Axis sorted (descending)'
            chip.hidden = false
            menu.hidden = true
          } else if (action === 'showTable') {
            const rows = base.labels.map((lab, i) => `${lab}: ${Number(base.values[i] ?? 0).toFixed(2)}`)
            chip.textContent = rows.slice(0, 3).join(' | ')
            chip.hidden = false
            menu.hidden = true
          } else if (action === 'newCalc') {
            chip.textContent = 'Visual calculation ready (preview)'
            chip.hidden = false
            menu.hidden = true
          } else if (action === 'verified') {
            chip.textContent = 'Verified answer configured'
            chip.hidden = false
            menu.hidden = true
          } else if (action === 'export') {
            const csv = ['Label,Value', ...base.labels.map((lab, i) => `"${String(lab).replace(/"/g, '""')}",${base.values[i] ?? 0}`)].join('\n')
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${title.replace(/\s+/g, '_').toLowerCase()}_data.csv`
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(url)
            menu.hidden = true
          }
        })
      })

      canvas.addEventListener('dblclick', () => {
        chartRef?.resetZoom?.()
      })

      rebuild(initialMini)
    }

    for (const slot of canvasVisualSlots) {
      const { chart: tool, instanceId } = slot
      if (tool === 'fieldMap' || tool === 'filledMap' || tool === 'map') continue
      if (tool === 'table' || tool === 'dataTable') {
        const tbl = document.createElement('div')
        tbl.className = 'ddb-visual-card'
        tbl.dataset.ddbInstanceId = instanceId
        const legendPalList = DDB_CHART_PALETTE_MAP[paletteKeyForMenus] ?? DDB_CHART_PALETTE_MAP.emerald
        if (!hasLayerData || !layer) {
          tbl.innerHTML = `<div class="ddb-visual-title"><i class="fa-solid fa-table"></i> ${tool === 'dataTable' ? 'Data Table' : 'Table'}</div>
            <div class="ddb-visual-card__body-pad">
              <p class="ddb-hint ddb-visual-placeholder-note" style="margin:0 0 12px;">Add a feature layer from <strong>Data</strong> (or GIS), select it as the active layer, then pick columns in Visualizations.</p>
              <div class="ddb-table-responsive"><table><thead><tr><th>Column 1</th><th>Column 2</th><th>Column 3</th></tr></thead><tbody>
              <tr><td colspan="3" style="text-align:center;color:#64748b;padding:16px;">No rows</td></tr></tbody></table></div>
            </div>`
          ddbAttachDevelopTableLegend(
            tbl,
            'Legend',
            [],
            'Legend mirrors the bound layer: assign a field to Legend in Visualizations (Build visual). After linking layers under Link, use Style · Symbology on the map layer to control categories.',
          )
        } else {
          const headers =
            tableColumnPicks.length > 0
              ? tableColumnPicks.filter(h => layer.fields.includes(h)).slice(0, 14)
              : layer.fields.slice(0, 5)
          const rows = features.slice(0, 5)
          tbl.innerHTML = `<div class="ddb-visual-title"><i class="fa-solid fa-table"></i> ${tool === 'dataTable' ? 'Data Table' : 'Table'}</div>
            <div class="ddb-table-responsive"><table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>
            ${rows.map(r => `<tr>${headers.map(h => `<td>${String((r.properties as any)?.[h] ?? '-')}</td>`).join('')}</tr>`).join('')}
            </tbody></table></div>`
          const legendFieldResolved =
            cartesianWells.legend && layer.fields.includes(cartesianWells.legend) ? cartesianWells.legend : labelField
          const legendItems = ddbLegendItemsFromLayerField(features, legendFieldResolved, legendPalList)
          const legendHint =
            legendItems.length === 0
              ? `No legend classes for "${legendFieldResolved}". Choose Legend or X-axis field in Visualizations. Map symbology (Style · Symbology) drives categories when the table follows that layer.`
              : undefined
          ddbAttachDevelopTableLegend(tbl, legendFieldResolved, legendItems, legendHint)
        }
        host.appendChild(tbl)
        ddbPromoteVisualCardChrome(tbl, {
          showStatStrip: false,
          activePaletteKey: paletteKeyForMenus,
          onClose: () => removeCanvasVisualByInstanceId(instanceId),
          ...axisChromeOpts,
        })
      } else if (tool === 'matrix') {
        const matrix = document.createElement('div')
        matrix.className = 'ddb-visual-card'
        matrix.dataset.ddbInstanceId = instanceId
        const rowLabel = labelField
        const matrixLegendPal = DDB_CHART_PALETTE_MAP[paletteKeyForMenus] ?? DDB_CHART_PALETTE_MAP.emerald
        if (!hasLayerData || !layer) {
          matrix.innerHTML = `<div class="ddb-visual-title"><i class="fa-solid fa-th"></i> Matrix</div><div class="ddb-visual-card__body-pad">
            <p class="ddb-hint ddb-visual-placeholder-note" style="margin:0;">Bind rows and values after connecting a layer in <strong>Data</strong>.</p>
            <div class="ddb-table-responsive" style="margin-top:10px"><table><tr><th>Row</th><th>Value</th></tr><tr><td>—</td><td>—</td></tr></table></div></div>`
          ddbAttachDevelopTableLegend(
            matrix,
            'Legend',
            [],
            'Assign Legend in Visualizations to classify matrix rows with the same palette as charts.',
          )
        } else {
          matrix.innerHTML = `<div class="ddb-visual-title"><i class="fa-solid fa-th"></i> Matrix</div><div class="ddb-table-responsive"><table><tr><th>${rowLabel}</th><th>${primaryNum}</th></tr>${labels
            .slice(0, 4)
            .map((l, i) => `<tr><td>${l}</td><td>${values[i]}</td></tr>`)
            .join('')}</table></div>`
          const matrixLegendField =
            cartesianWells.legend && layer.fields.includes(cartesianWells.legend) ? cartesianWells.legend : rowLabel
          const matrixLegendItems = ddbLegendItemsFromLayerField(features, matrixLegendField, matrixLegendPal)
          const matrixLegendHint =
            matrixLegendItems.length === 0
              ? `No classes for "${matrixLegendField}". Adjust Legend in Visualizations or layer symbology.`
              : undefined
          ddbAttachDevelopTableLegend(matrix, matrixLegendField, matrixLegendItems, matrixLegendHint)
        }
        host.appendChild(matrix)
        ddbPromoteVisualCardChrome(matrix, {
          showStatStrip: false,
          activePaletteKey: paletteKeyForMenus,
          onClose: () => removeCanvasVisualByInstanceId(instanceId),
          ...axisChromeOpts,
        })
      } else if (tool === 'stackedBar' || tool === 'clusteredBar') {
        addChartCard(instanceId, tool === 'stackedBar' ? 'Stacked Bar' : 'Clustered Bar', 'bar', {
          data: { labels, datasets: [{ label: primaryNum, data: values, backgroundColor: '#4c9a6e' }] },
        })
      } else if (tool === 'stackedColumn' || tool === 'clusteredColumn') {
        addChartCard(instanceId, `${tool} chart`, 'bar', { data: { labels, datasets: [{ label: primaryNum, data: values }] } })
      } else if (tool === '100stackedBar') {
        const total = values.reduce((a, b) => a + b, 0) || 1
        const perc = values.map(v => (v / total) * 100)
        addChartCard(instanceId, '100% Stacked Bar', 'bar', {
          data: { labels, datasets: [{ label: 'Percentage', data: perc, backgroundColor: '#2b8c5e' }] },
        })
      } else if (tool === '100stackedColumn') {
        const t = values.reduce((a, b) => a + b, 0) || 1
        addChartCard(instanceId, '100% Stacked Column', 'bar', {
          data: { labels, datasets: [{ label: '% Share', data: values.map(v => (v / t) * 100) }] },
        })
      } else if (tool === 'line') {
        addChartCard(instanceId, 'Line Chart', 'line', {
          data: { labels, datasets: [{ label: primaryNum, data: values, borderColor: '#2c7a4a' }] },
        })
      } else if (tool === 'area') {
        addChartCard(instanceId, 'Area Chart', 'line', {
          data: { labels, datasets: [{ label: primaryNum, data: values, fill: true, backgroundColor: '#8fc9a3' }] },
        })
      } else if (tool === 'stackedArea') {
        addChartCard(instanceId, 'Stacked Area', 'line', {
          data: { labels, datasets: [{ label: primaryNum, data: values, fill: true }] },
        })
      } else if (tool === 'lineClusteredColumn') {
        const card = document.createElement('div')
        card.className = 'ddb-visual-card'
        card.dataset.ddbInstanceId = instanceId
        const canvas = document.createElement('canvas')
        const titleEl = document.createElement('div')
        titleEl.className = 'ddb-visual-title'
        titleEl.innerHTML = `<i class="fa-solid fa-chart-simple" aria-hidden="true"></i> Line + Clustered Column`
        card.appendChild(titleEl)
        card.appendChild(canvas)
        host.appendChild(card)
        const comboChrome = ddbPromoteVisualCardChrome(card, {
          showStatStrip: false,
          activePaletteKey: paletteKeyForMenus,
          onClose: () => removeCanvasVisualByInstanceId(instanceId),
          ...axisChromeOpts,
        })
        if (comboChrome && !hasLayerData) {
          const note = document.createElement('p')
          note.className = 'ddb-hint ddb-visual-placeholder-note'
          note.textContent = ''
          comboChrome.header.after(note)
        }
        const comboJoinValues = labels.map((_, i) => chartJoinValuesSlice[i] ?? '')
        const comboOpts = { ...(ddbChartOptionsFor('bar', undefined, chartAxisColorsRef.current) as any) }
        comboOpts.onClick = (_e: unknown, els: { index: number }[]) => {
          if (!els?.length || !bindLayerKey || !hasLayerData) return
          const ix = els[0].index
          if (typeof ix !== 'number') return
          const jv = comboJoinValues[ix]
          if (jv === undefined || jv === '') return
          requestAnimationFrame(() => {
            setCanvasFeatureFocus(prev =>
              prev?.layerKey === bindLayerKey && prev.joinValue === jv
                ? null
                : { layerKey: bindLayerKey, joinField: joinFieldForCrossfilter, joinValue: jv },
            )
            const feat = features.find(
              f => String((f.properties as Record<string, unknown>)?.[joinFieldForCrossfilter] ?? '') === jv,
            )
            ddbFlyMapToFeature(mapRef.current, feat)
          })
        }
        const ch = new Chart(canvas.getContext('2d')!, {
          type: 'bar',
          data: {
            labels,
            datasets: [
              { type: 'bar', label: primaryNum, data: values },
              { type: 'line', label: 'Trend', data: values.map(v => v * 0.9), borderColor: '#1f5e3a' },
            ],
          },
          options: comboOpts,
        } as any)
        chartInstancesRef.current.push(ch)
        ddbApplyChartPalette(ch, chartPaletteKeyRef.current)
        ddbApplyChartRowHighlight(ch, chartFocusIdx)
        canvas.addEventListener('dblclick', () => {
          ch.resetZoom?.()
        })
      } else if (tool === 'pie') {
        addChartCard(instanceId, 'Pie Chart', 'pie', {
          data: {
            labels: labels.slice(0, 5),
            datasets: [{ data: values.slice(0, 5), backgroundColor: ['#2c7a4a', '#5a9e7a', '#8bc0a4', '#b1d4be', '#cfe8d8'] }],
          },
        })
      } else if (tool === 'donut') {
        addChartCard(instanceId, 'Donut Chart', 'doughnut', {
          data: { labels: labels.slice(0, 4), datasets: [{ data: values.slice(0, 4), backgroundColor: ['#3cac6e', '#5a9e7a', '#8bc0a4', '#b1d4be'] }] },
        })
      } else if (tool === 'scatter') {
        const scatterPts = hasLayerData
          ? features.slice(0, 12).map((f, i) => ({
              x: i,
              y: parseFloat(String((f.properties as any)?.[primaryNum] ?? 0)) || 0,
            }))
          : [
              { x: 0, y: 0 },
              { x: 1, y: 0 },
              { x: 2, y: 0 },
            ]
        addChartCard(instanceId, 'Scatter Plot', 'scatter', {
          data: {
            datasets: [
              {
                label: primaryNum,
                data: scatterPts,
                backgroundColor: '#2c7a4a',
              },
            ],
          },
        })
      } else if (tool === 'waterfall') {
        addChartCard(
          instanceId,
          'Waterfall',
          'bar',
          hasLayerData
            ? { data: { labels: ['Start', 'Step1', 'Step2', 'End'], datasets: [{ label: 'Delta', data: [100, 40, -30, 110] }] } }
            : { data: { labels: ['—', '—', '—', '—'], datasets: [{ label: 'Delta', data: [0, 0, 0, 0] }] } },
        )
      } else if (tool === 'funnel') {
        addChartCard(
          instanceId,
          'Funnel',
          'bar',
          hasLayerData
            ? { data: { labels: ['Lead', 'Qualify', 'Proposal', 'Win'], datasets: [{ data: [120, 85, 42, 18] }] } }
            : { data: { labels: ['—', '—', '—', '—'], datasets: [{ data: [0, 0, 0, 0] }] } },
        )
      } else if (tool === 'gauge') {
        const avgVal = values.reduce((a, b) => a + b, 0) / (values.length || 1)
        const gauge = document.createElement('div')
        gauge.className = 'ddb-visual-card'
        gauge.dataset.ddbInstanceId = instanceId
        gauge.innerHTML = `<div class="ddb-visual-title"><i class="fa-solid fa-gauge-high"></i> Gauge</div><div class="ddb-visual-card__body-pad"><div class="ddb-visual-card__kpi-label">${primaryNum}</div><div style="background:#e2e8f0; border-radius:40px; height:20px; margin:4px 0 10px;"><div style="background:#2c7a4a; width:${Math.min(100, (avgVal / 200) * 100)}%; height:20px; border-radius:40px;"></div></div><div class="ddb-visual-card__kpi-value ddb-visual-card__kpi-value--gauge">${avgVal.toFixed(1)}</div><div class="ddb-visual-card__kpi-meta">of 200</div></div>`
        host.appendChild(gauge)
        ddbPromoteVisualCardChrome(gauge, {
          showStatStrip: false,
          activePaletteKey: paletteKeyForMenus,
          onClose: () => removeCanvasVisualByInstanceId(instanceId),
          ...axisChromeOpts,
        })
      } else if (tool === 'card') {
        const total = values.reduce((a, b) => a + b, 0)
        const card = document.createElement('div')
        card.className = 'ddb-visual-card'
        card.dataset.ddbInstanceId = instanceId
        card.innerHTML = `<div class="ddb-visual-title"><i class="fa-solid fa-id-card"></i> Card</div><div class="ddb-visual-card__body-pad"><div class="ddb-visual-card__kpi-label">Total ${primaryNum}</div><div class="ddb-visual-card__kpi-value">${total.toFixed(0)}</div></div>`
        host.appendChild(card)
        ddbPromoteVisualCardChrome(card, {
          showStatStrip: false,
          activePaletteKey: paletteKeyForMenus,
          onClose: () => removeCanvasVisualByInstanceId(instanceId),
          ...axisChromeOpts,
        })
      } else if (tool === 'kpi') {
        const kpi = document.createElement('div')
        kpi.className = 'ddb-visual-card'
        kpi.dataset.ddbInstanceId = instanceId
        kpi.innerHTML = `<div class="ddb-visual-title"><i class="fa-solid fa-chart-simple"></i> KPI</div><div class="ddb-visual-card__body-pad"><div class="ddb-visual-card__kpi-label">${primaryNum}</div><div class="ddb-visual-card__kpi-value">${values[0] ?? 0}</div><div class="ddb-visual-card__kpi-meta">Target: 150 | ${((((values[0] ?? 0) / 150) * 100) || 0).toFixed(0)}%</div></div>`
        host.appendChild(kpi)
        ddbPromoteVisualCardChrome(kpi, {
          showStatStrip: false,
          activePaletteKey: paletteKeyForMenus,
          onClose: () => removeCanvasVisualByInstanceId(instanceId),
          ...axisChromeOpts,
        })
      } else if (tool === 'customStatCard') {
        if (!statCards.length) {
          const wrap = document.createElement('div')
          wrap.className = 'ddb-visual-card'
          wrap.dataset.ddbInstanceId = instanceId
          wrap.innerHTML = `<div class="ddb-visual-title"><i class="fa-solid fa-chart-column"></i> Custom stat cards</div><div class="ddb-visual-card__body-pad"><div class="ddb-hint">Pick layer, field, and aggregation in Visualizations, add cards, then click <strong>Add visuals to canvas</strong> again to refresh.</div></div>`
          host.appendChild(wrap)
          ddbPromoteVisualCardChrome(wrap, {
            showStatStrip: false,
            activePaletteKey: paletteKeyForMenus,
            onClose: () => removeCanvasVisualByInstanceId(instanceId),
            ...axisChromeOpts,
          })
        } else {
          for (const c of statCards) {
            const box = document.createElement('div')
            box.className = 'ddb-visual-card'
            box.dataset.ddbInstanceId = `${instanceId}_${c.id}`
            box.innerHTML = `<div class="ddb-visual-title"><i class="fa-solid fa-chart-column"></i> ${c.layerName}</div><div class="ddb-visual-card__body-pad"><div class="ddb-visual-card__kpi-label">${c.agg} · ${c.field}</div><div class="ddb-visual-card__kpi-value ddb-visual-card__kpi-value--md">${c.result.toFixed(2)}</div></div>`
            host.appendChild(box)
            ddbPromoteVisualCardChrome(box, {
              showStatStrip: false,
              activePaletteKey: paletteKeyForMenus,
              onClose: () => removeCanvasVisualByInstanceId(instanceId),
              ...axisChromeOpts,
            })
          }
        }
      } else {
        const fb = document.createElement('div')
        fb.className = 'ddb-visual-card'
        fb.dataset.ddbInstanceId = instanceId
        fb.innerHTML = `<div class="ddb-visual-title"><i class="fa-solid fa-chart-simple"></i> ${tool.replace(/([A-Z])/g, ' $1')}</div><div class="ddb-visual-card__body-pad"><div>${hasLayerData && layer ? `Static simulation for ${tool} based on ${layer.name}` : `Visual shell for ${tool}. Connect a layer in Data to drive this visual.`}</div></div>`
        host.appendChild(fb)
        ddbPromoteVisualCardChrome(fb, {
          showStatStrip: false,
          activePaletteKey: paletteKeyForMenus,
          onClose: () => removeCanvasVisualByInstanceId(instanceId),
          ...axisChromeOpts,
        })
      }
    }

    Array.from(host.querySelectorAll(':scope > .ddb-visual-card')).forEach(node => {
      const he = node as HTMLElement
      const id = he.dataset.ddbInstanceId
      if (!id) return
      ddbAttachCanvasCard(he, host, ddbCanvasLayoutKey(bindLayerKey, id))
    })
    ddbReflowCanvasHost(host)
    ddbResizeChartsInHost(host)
  }, [
    bindLayerKey,
    canvasFeatureFocus,
    canvasVisualSlots,
    cartesianWells,
    destroyCharts,
    layers,
    statCards,
    tableColumnPicks,
    removeCanvasVisualByInstanceId,
  ])

  useEffect(() => {
    renderCharts()
    return () => destroyCharts()
  }, [
    layers,
    activeStatsLayer,
    bindLayerKey,
    canvasFeatureFocus,
    canvasVisualSlots,
    cartesianWells,
    tableColumnPicks,
    renderCharts,
    destroyCharts,
  ])

  const toggleLayerVisible = (key: string, visible: boolean) => {
    setLayers(prev => {
      const cur = prev[key]
      if (!cur) return prev
      return { ...prev, [key]: { ...cur, visible } }
    })
  }

  const deleteUserLayer = useCallback(
    async (key: string) => {
      const layer = layers[key]
      if (!layer || layer.origin !== 'user') return
      const ok = await appConfirm(`Delete layer "${layer.name}" from the registry? This cannot be undone.`, {
        title: 'Delete layer',
        danger: true,
        confirmLabel: 'Delete',
      })
      if (!ok) return
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
          <button
            type="button"
            className="ddb-btn ddb-small-btn"
            onClick={() => void appAlert(`Fields: ${Lr.fields.join(', ')}`, { title: Lr.name })}
          >
            Fields
          </button>
          {Lr.origin === 'user' ? (
            <button
              type="button"
              className="ddb-layer-delete-btn"
              title="Delete layer"
              aria-label={`Delete layer ${Lr.name}`}
              onClick={() => void deleteUserLayer(key)}
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
    setAddSourceHomeChoice('')
  }, [])

  const openAddGisModal = useCallback(() => {
    resetAddGisForm()
    setAddGisOpen(true)
  }, [resetAddGisForm])

  useEffect(() => {
    if (searchParams.get('addSource') !== '1') return
    openAddGisModal()
    const next = new URLSearchParams(searchParams)
    next.delete('addSource')
    setSearchParams(next, { replace: true })
  }, [searchParams, openAddGisModal, setSearchParams])

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
    setAddSourceHomeChoice('')
    setAddWizard('home')
  }, [])

  const clearMapMeasurement = useCallback(() => {
    const map = mapRef.current
    if (mapMeasureLineRef.current && map) {
      try {
        map.removeLayer(mapMeasureLineRef.current)
      } catch {
        /* ignore */
      }
    }
    mapMeasureLineRef.current = null
    mapMeasureMarkersRef.current.forEach(m => {
      try {
        map?.removeLayer(m)
      } catch {
        /* ignore */
      }
    })
    mapMeasureMarkersRef.current = []
    setMeasureDistanceLabel('-')
  }, [])

  const toggleMapFlyout = useCallback((panel: Exclude<MapFlyout, 'none'>) => {
    setMapFlyout(prev => (prev === panel ? 'none' : panel))
  }, [])

  const runGeoSearch = useCallback(async () => {
    const q = geoSearchQuery.trim()
    if (!q) return
    const map = mapRef.current
    if (!map) return
    setGeoSearchBusy(true)
    setGeoSearchError(null)
    try {
      let lat: number
      let lng: number
      let label: string
      const gKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim()
      if (gKey) {
        const res = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&key=${encodeURIComponent(gKey)}`,
        )
        const data = (await res.json()) as {
          status: string
          results?: Array<{ formatted_address: string; geometry: { location: { lat: number; lng: number } } }>
          error_message?: string
        }
        if (data.status !== 'OK' || !data.results?.[0]) {
          throw new Error(data.error_message || `Geocoder: ${data.status}`)
        }
        const hit = data.results[0]
        lat = hit.geometry.location.lat
        lng = hit.geometry.location.lng
        label = hit.formatted_address
      } else {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`,
          { headers: { Accept: 'application/json' } },
        )
        const arr = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>
        if (!arr?.[0]) throw new Error('No results')
        lat = parseFloat(arr[0].lat)
        lng = parseFloat(arr[0].lon)
        label = arr[0].display_name
      }
      try {
        mapSearchMarkerRef.current?.remove()
      } catch {
        /* ignore */
      }
      mapSearchMarkerRef.current = L.marker([lat, lng]).addTo(map).bindPopup(label).openPopup()
      map.setView([lat, lng], Math.max(map.getZoom(), 11))
    } catch (e) {
      setGeoSearchError(e instanceof Error ? e.message : 'Search failed')
    } finally {
      setGeoSearchBusy(false)
    }
  }, [geoSearchQuery])

  useEffect(() => {
    if (mapFlyout !== 'analysis' || mapAnalysisTab !== 'measure') {
      clearMapMeasurement()
    }
  }, [mapFlyout, mapAnalysisTab, clearMapMeasurement])

  useEffect(() => {
    const map = mapRef.current
    if (!map || mapFlyout !== 'analysis' || mapAnalysisTab !== 'measure') return
    const onClick = (e: L.LeafletMouseEvent) => {
      if (mapMeasureMarkersRef.current.length >= 2) clearMapMeasurement()
      const dot = L.circleMarker(e.latlng, {
        radius: 6,
        color: '#fff',
        weight: 2,
        fillColor: '#1f5e3a',
        fillOpacity: 1,
      }).addTo(map)
      mapMeasureMarkersRef.current.push(dot)
      if (mapMeasureMarkersRef.current.length === 2) {
        const a = mapMeasureMarkersRef.current[0].getLatLng()
        const b = mapMeasureMarkersRef.current[1].getLatLng()
        try {
          if (mapMeasureLineRef.current) map.removeLayer(mapMeasureLineRef.current)
        } catch {
          /* ignore */
        }
        mapMeasureLineRef.current = L.polyline([a, b], { color: '#1f5e3a', weight: 3, dashArray: '6 4' }).addTo(map)
        const km = haversineKm(a, b)
        const dist =
          measureUnit === 'Metric'
            ? km < 1
              ? `${(km * 1000).toFixed(0)} m`
              : `${km.toFixed(2)} km`
            : `${(km * 0.621371).toFixed(2)} mi`
        setMeasureDistanceLabel(dist)
      }
    }
    map.on('click', onClick)
    return () => {
      map.off('click', onClick)
    }
  }, [mapFlyout, mapAnalysisTab, measureUnit, clearMapMeasurement])

  useEffect(() => {
    if (mapFlyout !== 'analysis' || mapAnalysisTab !== 'measure') return
    if (mapMeasureMarkersRef.current.length !== 2) return
    const a = mapMeasureMarkersRef.current[0].getLatLng()
    const b = mapMeasureMarkersRef.current[1].getLatLng()
    const km = haversineKm(a, b)
    const dist =
      measureUnit === 'Metric' ? (km < 1 ? `${(km * 1000).toFixed(0)} m` : `${km.toFixed(2)} km`) : `${(km * 0.621371).toFixed(2)} mi`
    setMeasureDistanceLabel(dist)
  }, [measureUnit, mapFlyout, mapAnalysisTab])

  useEffect(() => {
    if (mapFlyout === 'none') return
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setMapFlyout('none')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mapFlyout])

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

  const toggleChartTool = (chart: string, ev: MouseEvent<HTMLButtonElement>) => {
    const nextSel = new Set(selectedChartsRef.current)

    if (DDB_MAP_VIS_CHARTS.has(chart)) {
      const wasSelected = selectedChartsRef.current.has(chart)
      if (wasSelected) nextSel.delete(chart)
      else nextSel.add(chart)
      selectedChartsRef.current = nextSel
      setSelectedCharts(nextSel)
      return
    }

    if (ev.shiftKey) {
      setCanvasVisualSlots(prev => {
        let removeIdx = -1
        for (let i = prev.length - 1; i >= 0; i--) {
          if (prev[i]!.chart === chart) {
            removeIdx = i
            break
          }
        }
        if (removeIdx < 0) return prev
        const nextSlots = prev.filter((_, j) => j !== removeIdx)
        const stillHas = nextSlots.some(s => s.chart === chart)
        if (!stillHas) {
          nextSel.delete(chart)
          selectedChartsRef.current = nextSel
          setSelectedCharts(nextSel)
        }
        return nextSlots
      })
      return
    }

    nextSel.add(chart)
    selectedChartsRef.current = nextSel
    setSelectedCharts(nextSel)
    setCanvasVisualSlots(sl => [...sl, { instanceId: newId(), chart }])
  }

  const appendSelectedChartsToCanvas = useCallback(() => {
    const toAdd = [...selectedCharts].filter(c => c !== 'fieldMap' && c !== 'filledMap' && c !== 'map')
    if (!toAdd.length) return
    setCanvasVisualSlots(prev => [...prev, ...toAdd.map(chart => ({ instanceId: newId(), chart }))])
  }, [selectedCharts])

  const clearCanvasVisuals = useCallback(() => {
    setCanvasVisualSlots([])
  }, [])

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
  const calcLayerFields = calcLayerKey ? layers[calcLayerKey]?.fields ?? [] : []
  const filteredLinkLayerKeys = useMemo(
    () =>
      layerKeys.filter(k => {
        const q = linkLayerSearch.trim().toLowerCase()
        if (!q) return true
        const name = layers[k]?.name?.toLowerCase() ?? ''
        return name.includes(q) || k.toLowerCase().includes(q)
      }),
    [layerKeys, layers, linkLayerSearch],
  )
  const filteredCalcLayerKeys = useMemo(
    () =>
      layerKeys.filter(k => {
        const q = calcLayerSearch.trim().toLowerCase()
        if (!q) return true
        const name = layers[k]?.name?.toLowerCase() ?? ''
        return name.includes(q) || k.toLowerCase().includes(q)
      }),
    [layerKeys, layers, calcLayerSearch],
  )

  useEffect(() => {
    if (!calcFieldOpen) return
    const fallbackKey = calcLayerKey || linkFrom || activeStatsLayer || layerKeys[0] || ''
    if (!calcLayerKey && fallbackKey) setCalcLayerKey(fallbackKey)
  }, [calcFieldOpen, calcLayerKey, linkFrom, activeStatsLayer, layerKeys])

  useEffect(() => {
    if (!calcFieldOpen) return
    const fields = calcLayerKey ? layers[calcLayerKey]?.fields ?? [] : []
    if (calcTargetField !== '__new__' && calcTargetField && !fields.includes(calcTargetField)) {
      setCalcTargetField('')
    }
  }, [calcFieldOpen, calcLayerKey, calcTargetField, layers])

  const runCalculateField = useCallback(() => {
    if (!calcLayerKey || !layers[calcLayerKey]) {
      setCalcFieldStatus('Select a valid input layer first.')
      return
    }
    const expression = calcExpression.trim()
    if (!expression) {
      setCalcFieldStatus('Enter an expression before calculating.')
      return
    }
    const targetField = calcTargetField === '__new__' ? calcNewFieldName.trim() : calcTargetField.trim()
    if (!targetField) {
      setCalcFieldStatus('Choose an existing target field or provide a new field name.')
      return
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(targetField)) {
      setCalcFieldStatus('Field name must start with a letter/underscore and use letters, numbers, or _.')
      return
    }
    if (calcExpressionType !== 'Arcade') {
      setCalcFieldStatus(`${calcExpressionType} parser is preview-only; Arcade mode is currently executable.`)
      return
    }

    try {
      const normalized = expression
        .replace(/\[([^\]]+)\]/g, (_m, fieldName: string) => `__f(${JSON.stringify(fieldName.trim())})`)
        .replace(/\$feature\.([A-Za-z_][A-Za-z0-9_]*)/g, (_m, fieldName: string) => `__f(${JSON.stringify(fieldName)})`)
      const evaluator = new Function('__f', 'Math', `"use strict"; return (${normalized});`) as (
        getter: (name: string) => unknown,
        mathObj: Math,
      ) => unknown

      const layerName = layers[calcLayerKey].name
      setLayers(prev => {
        const layer = prev[calcLayerKey]
        if (!layer) return prev
        const nextFeatures = layer.data.features.map(feat => {
          const props = { ...((feat.properties ?? {}) as Record<string, unknown>) }
          const getter = (name: string) => props[name]
          let nextVal: unknown = null
          try {
            nextVal = evaluator(getter, Math)
          } catch {
            nextVal = null
          }
          props[targetField] = nextVal
          return { ...feat, properties: props }
        })
        const nextFields = layer.fields.includes(targetField) ? layer.fields : [...layer.fields, targetField]
        return {
          ...prev,
          [calcLayerKey]: {
            ...layer,
            fields: nextFields,
            data: { ...layer.data, features: nextFeatures },
          },
        }
      })
      setCalcFieldStatus(`Calculated "${targetField}" for ${layerName}.`)
    } catch {
      setCalcFieldStatus('Expression error. Use Arcade style, e.g. [Area] * 0.1 or ($feature.Value + 2).')
    }
  }, [calcLayerKey, calcExpression, calcTargetField, calcNewFieldName, calcExpressionType, layers])

  const normalizeCanvasCardSizes = useCallback(() => {
    const host = chartsHostRef.current
    if (!host) return
    const cards = Array.from(host.querySelectorAll<HTMLElement>(':scope > .ddb-visual-card--canvas'))
    if (!cards.length) return
    const targetH = canvasLayoutPreset === 'compact' ? 240 : 280
    const all = ddbReadCanvasLayouts()
    for (const card of cards) {
      card.style.height = `${targetH}px`
      const id = card.dataset.ddbInstanceId
      if (!id) continue
      const key = ddbCanvasLayoutKey(bindLayerKey, id)
      const prev = all[key]
      all[key] = {
        left: prev?.left ?? (parseFloat(card.style.left) || 0),
        top: prev?.top ?? (parseFloat(card.style.top) || 0),
        width: prev?.width ?? (parseFloat(card.style.width) || 320),
        height: targetH,
      }
    }
    ddbWriteCanvasLayouts(all)
    ddbReflowCanvasHost(host)
    ddbResizeChartsInHost(host)
  }, [bindLayerKey, canvasLayoutPreset])

  const autoArrangeCanvasCards = useCallback(() => {
    const host = chartsHostRef.current
    if (!host) return
    const cards = Array.from(host.querySelectorAll<HTMLElement>(':scope > .ddb-visual-card--canvas'))
    if (!cards.length) return

    const sorted = [...cards].sort((a, b) => {
      const ta = parseFloat(a.style.top) || 0
      const tb = parseFloat(b.style.top) || 0
      if (ta !== tb) return ta - tb
      return (parseFloat(a.style.left) || 0) - (parseFloat(b.style.left) || 0)
    })

    const gap: number = canvasLayoutPreset === 'compact' ? 10 : 14
    const minCardW: number = canvasLayoutPreset === 'compact' ? 250 : 300
    const hostW = Math.max(320, host.clientWidth || 320)
    const cols = Math.max(1, Math.min(4, Math.floor((hostW + gap) / (minCardW + gap))))
    const cardW = Math.max(220, Math.floor((hostW - gap * (cols + 1)) / cols))
    const colHeights = Array.from({ length: cols }, () => gap)
    const all = ddbReadCanvasLayouts()

    for (const card of sorted) {
      let col = 0
      for (let i = 1; i < colHeights.length; i += 1) {
        if (colHeights[i] < colHeights[col]) col = i
      }
      const left = gap + col * (cardW + gap)
      const top = colHeights[col]
      const h = Math.max(180, parseFloat(card.style.height) || card.getBoundingClientRect().height || 260)
      card.style.left = `${left}px`
      card.style.top = `${top}px`
      card.style.width = `${cardW}px`
      card.style.height = `${h}px`
      colHeights[col] = top + h + gap

      const id = card.dataset.ddbInstanceId
      if (!id) continue
      all[ddbCanvasLayoutKey(bindLayerKey, id)] = { left, top, width: cardW, height: h }
    }

    ddbWriteCanvasLayouts(all)
    ddbReflowCanvasHost(host)
    ddbResizeChartsInHost(host)
  }, [bindLayerKey, canvasLayoutPreset])

  const toggleCanvasLayoutPreset = useCallback(() => {
    setCanvasLayoutPreset(prev => (prev === 'balanced' ? 'compact' : 'balanced'))
  }, [])

  const assignCartesianFieldToWell = useCallback((field: string, preferred?: CartesianWellKey) => {
    const order: CartesianWellKey[] = ['xAxis', 'yAxis', 'legend', 'smallMultiples', 'tooltips']
    setCartesianWells(prev => {
      const currentKey = order.find(k => prev[k] === field)
      const target = preferred ?? order.find(k => !prev[k]) ?? 'tooltips'
      if (!target) return prev
      if (currentKey && currentKey === target) return prev
      const next = { ...prev }
      if (currentKey) next[currentKey] = ''
      next[target] = field
      return next
    })
    setCartesianFieldPicks(prev => (prev.includes(field) ? prev : [...prev, field]))
  }, [])

  const unassignCartesianField = useCallback((field: string) => {
    setCartesianFieldPicks(prev => prev.filter(x => x !== field))
    setCartesianWells(prev => {
      const next = { ...prev }
      ;(['xAxis', 'yAxis', 'legend', 'smallMultiples', 'tooltips'] as CartesianWellKey[]).forEach(k => {
        if (next[k] === field) next[k] = ''
      })
      return next
    })
  }, [])

  return (
    <>
    <div className={`page page-tight develop-dashboard-root${canvasBwTheme ? ' ddb-theme-bw' : ''}`}>
      <div className="ddb-dashboard">
        <div className="ddb-topbar">
          <div className="ddb-brand">
            <h1>
              <i className="fa-solid fa-chart-line" aria-hidden /> Agro Cloud Analytics
            </h1>
          </div>
          <div className="ddb-topbar-tools" role="group" aria-label="Canvas layout and style tools">
            <button
              type="button"
              className={`ddb-topbar-icon-btn${canvasLayoutPreset === 'compact' ? ' is-active' : ''}`}
              onClick={toggleCanvasLayoutPreset}
              title={`Layout preset: ${canvasLayoutPreset === 'balanced' ? 'Balanced spacing' : 'Compact spacing'}`}
              aria-label={`Layout preset: ${canvasLayoutPreset === 'balanced' ? 'Balanced spacing' : 'Compact spacing'}`}
              aria-pressed={canvasLayoutPreset === 'compact'}
            >
              <i className="fa-solid fa-object-group" aria-hidden />
              <span className="ddb-topbar-icon-badge" aria-hidden>
                {canvasLayoutPreset === 'balanced' ? 'B' : 'C'}
              </span>
            </button>
            <button
              type="button"
              className="ddb-topbar-icon-btn"
              onClick={autoArrangeCanvasCards}
              title="Auto arrange charts in canvas"
              aria-label="Auto arrange charts in canvas"
            >
              <i className="fa-solid fa-table-cells-large" aria-hidden />
            </button>
            <button
              type="button"
              className="ddb-topbar-icon-btn"
              onClick={normalizeCanvasCardSizes}
              title="Normalize chart card sizes"
              aria-label="Normalize chart card sizes"
            >
              <i className="fa-solid fa-up-right-and-down-left-from-center" aria-hidden />
            </button>
            <button
              type="button"
              className={`ddb-topbar-icon-btn ddb-topbar-icon-btn--theme${canvasBwTheme ? ' is-active' : ''}`}
              onClick={() => setCanvasBwTheme(v => !v)}
              title="Black and white canvas theme"
              aria-label="Black and white canvas theme"
              aria-pressed={canvasBwTheme}
            >
              <i className="fa-solid fa-circle-half-stroke" aria-hidden />
            </button>
          </div>
        </div>

        <div className="ddb-dashboard-body">
        <div className="ddb-main">
          <div
            ref={canvasWorkspaceRef}
            className={`ddb-canvas-workspace${mapInCanvasVisualMode ? ' ddb-canvas-workspace--field-map' : ' ddb-canvas-workspace--map-hidden'}`}
            aria-label={
              mapInCanvasVisualMode
                ? 'Visuals canvas with map (Field or Filled map)'
                : 'Visuals canvas — live map hidden until Map, Field Map, or Filled Map is selected in Visualizations'
            }
          >
          <div
            ref={mapContainerRef}
            className={`ddb-map-container${mapInCanvasVisualMode ? ' ddb-map-container--canvas' : ''}`}
            aria-hidden={!mapInCanvasVisualMode}
          >
            {mapCanvasCardPresentation ? (
              <div
                className="ddb-map-container__drag-header"
                role="group"
                aria-label={mapCanvasCardPresentation.aria}
              >
                <span className="ddb-map-container__drag-title">
                  <i className={mapCanvasCardPresentation.icon} aria-hidden /> {mapCanvasCardPresentation.label}
                </span>
                <button
                  type="button"
                  className="ddb-map-container__close"
                  aria-label="Close map card"
                  title="Close map"
                  onClick={() =>
                    setSelectedCharts(prev => {
                      const next = new Set(prev)
                      next.delete('map')
                      next.delete('fieldMap')
                      next.delete('filledMap')
                      return next
                    })
                  }
                >
                  <i className="fa-solid fa-xmark" aria-hidden />
                </button>
              </div>
            ) : null}
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
            <nav className="ddb-map-floating-rail" aria-label="Map quick tools">
              <button
                type="button"
                className={`ddb-map-floating-rail-btn${mapFlyout === 'layers' ? ' is-active' : ''}`}
                title="Layers"
                aria-label="Layers"
                aria-pressed={mapFlyout === 'layers'}
                onClick={() => toggleMapFlyout('layers')}
              >
                <i className="fa-solid fa-layer-group" aria-hidden />
              </button>
              <button
                type="button"
                className={`ddb-map-floating-rail-btn${mapFlyout === 'search' ? ' is-active' : ''}`}
                title="Search map"
                aria-label="Search map"
                aria-pressed={mapFlyout === 'search'}
                onClick={() => toggleMapFlyout('search')}
              >
                <i className="fa-solid fa-magnifying-glass" aria-hidden />
              </button>
              <button
                type="button"
                className={`ddb-map-floating-rail-btn${mapFlyout === 'analysis' ? ' is-active' : ''}`}
                title="Analysis"
                aria-label="Analysis"
                aria-pressed={mapFlyout === 'analysis'}
                onClick={() => toggleMapFlyout('analysis')}
              >
                <i className="fa-solid fa-chart-column" aria-hidden />
              </button>
              <button
                type="button"
                className={`ddb-map-floating-rail-btn${mapFlyout === 'account' ? ' is-active' : ''}`}
                title="Login and settings"
                aria-label="Login and settings"
                aria-pressed={mapFlyout === 'account'}
                onClick={() => toggleMapFlyout('account')}
              >
                <i className="fa-solid fa-user" aria-hidden />
              </button>
            </nav>
            {mapFlyout !== 'none' ? (
              <div className="ddb-map-flyout-backdrop" role="presentation" onClick={() => setMapFlyout('none')} />
            ) : null}
            {mapFlyout === 'layers' ? (
              <div
                className="ddb-map-flyout ddb-map-flyout--layers"
                role="dialog"
                aria-modal="true"
                aria-labelledby="ddb-map-flyout-layers-title"
                onMouseDown={e => e.stopPropagation()}
              >
                <div className="ddb-map-flyout-head">
                  <h2 id="ddb-map-flyout-layers-title" className="ddb-map-flyout-title">
                    Layers
                  </h2>
                  <button type="button" className="ddb-map-flyout-close" onClick={() => setMapFlyout('none')} aria-label="Close">
                    <i className="fa-solid fa-xmark" aria-hidden />
                  </button>
                </div>
                <div className="ddb-map-flyout-body">
                  {layerKeys.length > 0 ? (
                    <>
                      <p className="ddb-map-flyout-layer-section-title">Layers on the map</p>
                      <ul className="ddb-map-flyout-layer-list" role="list">
                        {layerKeys.map(key => {
                          const Lr = layers[key]
                          if (!Lr) return null
                          const nFeat =
                            Lr.type === 'feature' && Array.isArray(Lr.data?.features) ? Lr.data.features.length : 0
                          return (
                            <li key={key} className="ddb-map-flyout-layer-row">
                              <label className="ddb-map-flyout-layer-label">
                                <input
                                  type="checkbox"
                                  checked={Lr.visible}
                                  onChange={e => toggleLayerVisible(key, e.target.checked)}
                                  aria-label={`Show ${Lr.name} on map`}
                                />
                                <span className="ddb-map-flyout-layer-name">{Lr.name}</span>
                              </label>
                              <div className="ddb-map-flyout-layer-meta">
                                <span
                                  className={`ddb-layer-origin-badge${Lr.origin === 'user' ? ' ddb-layer-origin-badge--user' : ''}`}
                                >
                                  {Lr.origin === 'user' ? 'Yours' : 'Sample'}
                                </span>
                                <span className="ddb-layer-badge">{Lr.type}</span>
                                {Lr.type === 'feature' && nFeat > 0 ? (
                                  <span className="ddb-map-flyout-layer-count">{nFeat} features</span>
                                ) : null}
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    </>
                  ) : (
                    <p className="ddb-map-flyout-lead">Add a layer to your map</p>
                  )}
                  <button
                    type="button"
                    className={`ddb-map-flyout-layer-cta${layerKeys.length > 0 ? ' ddb-map-flyout-layer-cta--compact' : ''}`}
                    onClick={() => {
                      setMapFlyout('none')
                      openAddGisModal()
                    }}
                  >
                    <span className="ddb-map-flyout-layer-cta-icon" aria-hidden>
                      <i className="fa-solid fa-layer-group" />
                    </span>
                    <span>Add source data</span>
                  </button>
                  <button
                    type="button"
                    className="ddb-map-flyout-text-btn"
                    onClick={() => {
                      setMapFlyout('none')
                      setRightSheet('data')
                    }}
                  >
                    Open Data catalog
                  </button>
                </div>
              </div>
            ) : null}
            {mapFlyout === 'search' ? (
              <div
                className="ddb-map-flyout ddb-map-flyout--search"
                role="dialog"
                aria-modal="true"
                aria-labelledby="ddb-map-flyout-search-title"
                onMouseDown={e => e.stopPropagation()}
              >
                <div className="ddb-map-flyout-head">
                  <h2 id="ddb-map-flyout-search-title" className="ddb-map-flyout-title">
                    Search
                  </h2>
                  <button type="button" className="ddb-map-flyout-close" onClick={() => setMapFlyout('none')} aria-label="Close">
                    <i className="fa-solid fa-xmark" aria-hidden />
                  </button>
                </div>
                <div className="ddb-map-flyout-body">
                  <p className="ddb-map-flyout-hint">
                    Find a place on the map. With <code className="ddb-map-flyout-code">VITE_GOOGLE_MAPS_API_KEY</code> set, Google
                    Geocoding is used; otherwise OpenStreetMap Nominatim.
                  </p>
                  <form
                    className="ddb-map-search-form"
                    onSubmit={e => {
                      e.preventDefault()
                      void runGeoSearch()
                    }}
                  >
                    <input
                      type="search"
                      className="ddb-map-search-input"
                      placeholder="City, address, or place…"
                      value={geoSearchQuery}
                      onChange={e => setGeoSearchQuery(e.target.value)}
                      aria-label="Search query"
                    />
                    <button type="submit" className="ddb-btn ddb-map-search-submit" disabled={geoSearchBusy}>
                      {geoSearchBusy ? '…' : 'Go'}
                    </button>
                  </form>
                  {geoSearchError ? <p className="ddb-map-flyout-error">{geoSearchError}</p> : null}
                </div>
              </div>
            ) : null}
            {mapFlyout === 'analysis' ? (
              <div
                className="ddb-map-flyout ddb-map-flyout--analysis"
                role="dialog"
                aria-modal="true"
                aria-labelledby="ddb-map-flyout-analysis-title"
                onMouseDown={e => e.stopPropagation()}
              >
                <div className="ddb-map-flyout-head">
                  <h2 id="ddb-map-flyout-analysis-title" className="ddb-map-flyout-title">
                    Analysis
                  </h2>
                  <button type="button" className="ddb-map-flyout-close" onClick={() => setMapFlyout('none')} aria-label="Close">
                    <i className="fa-solid fa-xmark" aria-hidden />
                  </button>
                </div>
                <div className="ddb-map-flyout-tabs" role="tablist" aria-label="Analysis tools">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mapAnalysisTab === 'measure'}
                    className={`ddb-map-flyout-tab${mapAnalysisTab === 'measure' ? ' is-active' : ''}`}
                    title="Measure"
                    onClick={() => setMapAnalysisTab('measure')}
                  >
                    <i className="fa-solid fa-ruler" aria-hidden />
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mapAnalysisTab === 'drive'}
                    className={`ddb-map-flyout-tab${mapAnalysisTab === 'drive' ? ' is-active' : ''}`}
                    title="Drive time"
                    onClick={() => setMapAnalysisTab('drive')}
                  >
                    <i className="fa-solid fa-car-side" aria-hidden />
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mapAnalysisTab === 'demographics'}
                    className={`ddb-map-flyout-tab${mapAnalysisTab === 'demographics' ? ' is-active' : ''}`}
                    title="Demographics"
                    onClick={() => setMapAnalysisTab('demographics')}
                  >
                    <i className="fa-solid fa-users" aria-hidden />
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mapAnalysisTab === 'relations'}
                    className={`ddb-map-flyout-tab${mapAnalysisTab === 'relations' ? ' is-active' : ''}`}
                    title="Link layers"
                    onClick={() => setMapAnalysisTab('relations')}
                  >
                    <i className="fa-solid fa-link" aria-hidden />
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mapAnalysisTab === 'routing'}
                    className={`ddb-map-flyout-tab${mapAnalysisTab === 'routing' ? ' is-active' : ''}`}
                    title="Routing"
                    onClick={() => setMapAnalysisTab('routing')}
                  >
                    <i className="fa-solid fa-route" aria-hidden />
                  </button>
                </div>
                <div className="ddb-map-flyout-body">
                  {mapAnalysisTab === 'measure' ? (
                    <>
                      <label className="ddb-map-flyout-field">
                        <span className="ddb-map-flyout-label">Measurement</span>
                        <select className="ddb-map-flyout-select" value="Distance" disabled aria-disabled>
                          <option>Distance</option>
                        </select>
                      </label>
                      <label className="ddb-map-flyout-field">
                        <span className="ddb-map-flyout-label">Unit</span>
                        <select className="ddb-map-flyout-select" value={measureUnit} onChange={e => setMeasureUnit(e.target.value as 'Metric' | 'Imperial')}>
                          <option value="Metric">Metric</option>
                          <option value="Imperial">Imperial</option>
                        </select>
                      </label>
                      <div className="ddb-map-measure-result">
                        <span className="ddb-map-measure-result-label">Distance</span>
                        <span className="ddb-map-measure-result-value">{measureDistanceLabel}</span>
                      </div>
                      <p className="ddb-map-flyout-hint">Click two points on the map to measure between them.</p>
                      <div className="ddb-map-flyout-foot">
                        <button type="button" className="ddb-btn ddb-map-flyout-primary" onClick={clearMapMeasurement}>
                          Clear measurement
                        </button>
                      </div>
                    </>
                  ) : null}
                  {mapAnalysisTab === 'drive' ? (
                    <p className="ddb-map-flyout-placeholder">Drive-time and reachability analysis (preview — connect a routing service to enable).</p>
                  ) : null}
                  {mapAnalysisTab === 'demographics' ? (
                    <p className="ddb-map-flyout-placeholder">Demographics and population layers (preview).</p>
                  ) : null}
                  {mapAnalysisTab === 'relations' ? (
                    <div className="ddb-map-flyout-stack">
                      <p className="ddb-map-flyout-hint">Define how layers relate by matching fields.</p>
                      <button
                        type="button"
                        className="ddb-btn ddb-map-flyout-primary"
                        onClick={() => {
                          setMapFlyout('none')
                          setRightSheet('link')
                        }}
                      >
                        Open Link Layers (Relation)
                      </button>
                    </div>
                  ) : null}
                  {mapAnalysisTab === 'routing' ? (
                    <p className="ddb-map-flyout-placeholder">Point-to-point routing (preview).</p>
                  ) : null}
                </div>
              </div>
            ) : null}
            {mapFlyout === 'account' ? (
              <div
                className="ddb-map-flyout ddb-map-flyout--account"
                role="dialog"
                aria-modal="true"
                aria-labelledby="ddb-map-flyout-account-title"
                onMouseDown={e => e.stopPropagation()}
              >
                <div className="ddb-map-flyout-head">
                  <h2 id="ddb-map-flyout-account-title" className="ddb-map-flyout-title">
                    Login | Settings
                  </h2>
                  <button type="button" className="ddb-map-flyout-close" onClick={() => setMapFlyout('none')} aria-label="Close">
                    <i className="fa-solid fa-xmark" aria-hidden />
                  </button>
                </div>
                <div className="ddb-map-flyout-tabs" role="tablist" aria-label="Account">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mapAccountTab === 'profile'}
                    className={`ddb-map-flyout-tab${mapAccountTab === 'profile' ? ' is-active' : ''}`}
                    title="Profile"
                    onClick={() => setMapAccountTab('profile')}
                  >
                    <i className="fa-solid fa-user" aria-hidden />
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mapAccountTab === 'community'}
                    className={`ddb-map-flyout-tab${mapAccountTab === 'community' ? ' is-active' : ''}`}
                    title="Community"
                    onClick={() => setMapAccountTab('community')}
                  >
                    <i className="fa-solid fa-comments" aria-hidden />
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mapAccountTab === 'help'}
                    className={`ddb-map-flyout-tab${mapAccountTab === 'help' ? ' is-active' : ''}`}
                    title="Help"
                    onClick={() => setMapAccountTab('help')}
                  >
                    <i className="fa-solid fa-circle-question" aria-hidden />
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mapAccountTab === 'settings'}
                    className={`ddb-map-flyout-tab${mapAccountTab === 'settings' ? ' is-active' : ''}`}
                    title="Settings"
                    onClick={() => setMapAccountTab('settings')}
                  >
                    <i className="fa-solid fa-gear" aria-hidden />
                  </button>
                </div>
                <div className="ddb-map-flyout-body">
                  {mapAccountTab === 'profile' ? (
                    <div className="ddb-map-arcgis-signin">
                      <div className="ddb-map-arcgis-logo" aria-hidden>
                        <i className="fa-solid fa-map-location-dot" />
                      </div>
                      <h3 className="ddb-map-arcgis-heading">Sign in to ArcGIS</h3>
                      <p className="ddb-map-arcgis-url">
                        <i className="fa-solid fa-plug" aria-hidden />{' '}
                        <a href="https://www.arcgis.com" target="_blank" rel="noreferrer">
                          https://www.arcgis.com
                        </a>
                      </p>
                      <p className="ddb-map-flyout-hint">Use your organization credentials in the full GIS app; this dashboard link is a preview.</p>
                      <button
                        type="button"
                        className="ddb-btn ddb-map-arcgis-signin-btn"
                        onClick={() => window.open('https://www.arcgis.com/home/signin.html', '_blank', 'noopener,noreferrer')}
                      >
                        Sign In
                      </button>
                    </div>
                  ) : null}
                  {mapAccountTab === 'community' ? (
                    <p className="ddb-map-flyout-placeholder">Community and announcements (preview).</p>
                  ) : null}
                  {mapAccountTab === 'help' ? (
                    <p className="ddb-map-flyout-placeholder">Help and documentation (preview).</p>
                  ) : null}
                  {mapAccountTab === 'settings' ? (
                    <p className="ddb-map-flyout-placeholder">Application settings (preview).</p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
          <div ref={chartsHostRef} className="ddb-charts-host" id="develop-dashboard-charts" />
          </div>
        </div>

        <div className={`ddb-right-wrap${rightSheet !== 'none' ? ' is-open' : ''}`} aria-label="Power BI style panels">
          {rightSheet !== 'none' ? (
            <aside className={`ddb-right-sheet ddb-right-sheet--${rightSheet}`} aria-labelledby={`ddb-right-sheet-${rightSheet}`}>
              <div className="ddb-right-sheet-head">
                <h2 className="ddb-right-sheet-title" id={`ddb-right-sheet-${rightSheet}`}>
                  {rightSheet === 'filters'
                    ? 'Filters'
                    : rightSheet === 'visualizations'
                      ? 'Visualizations'
                      : rightSheet === 'buildVisual'
                        ? 'Build visual'
                        : rightSheet === 'data'
                          ? 'Data'
                          : 'Link Layers (Relation)'}
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
                <div className="ddb-right-sheet-body ddb-right-sheet-body--visualizations">
                  <section className="ddb-vis-chart-types" aria-labelledby="ddb-vis-chart-types-heading">
                    <h3 className="ddb-vis-chart-types__head" id="ddb-vis-chart-types-heading">
                      Chart types
                    </h3>
                    <div className="ddb-vis-chart-types__scroll">
                      <div
                        className="ddb-powerbi-grid ddb-powerbi-grid--in-right-sheet"
                        role="group"
                        aria-label="Visualization types"
                      >
                        {CHART_TOOLS.map(t => (
                          <button
                            key={t.chart}
                            type="button"
                            className={`ddb-chart-tool-item${selectedCharts.has(t.chart) ? ' is-selected' : ''}`}
                            title={
                              DDB_MAP_VIS_CHARTS.has(t.chart)
                                ? `${t.label} — click to show or hide the map visual`
                                : `${t.label} — click to add another visual; Shift+click removes the last copy from the canvas`
                            }
                            aria-pressed={selectedCharts.has(t.chart)}
                            onClick={e => toggleChartTool(t.chart, e)}
                          >
                            <i className={t.icon} aria-hidden />
                            <span className="ddb-chart-tool-label-sr">{t.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </section>
                  <div className="ddb-vis-add-actions ddb-vis-add-actions--below-charts">
                    <button type="button" className="ddb-btn ddb-right-sheet-primary" onClick={appendSelectedChartsToCanvas}>
                      <i className="fa-solid fa-plus" aria-hidden /> Add visuals to canvas
                    </button>
                    <button
                      type="button"
                      className="ddb-btn ddb-right-sheet-secondary"
                      onClick={clearCanvasVisuals}
                      disabled={canvasVisualSlots.length === 0}
                    >
                      Clear canvas
                    </button>
                  </div>
                  {selectedCharts.has('customStatCard') && vizBuildMode !== 'none' && layerKeys.length > 0 ? (
                    <div className="ddb-vis-stat-card" aria-label="Custom stat card configuration">
                      <div className="ddb-vis-stat-card__icon-badge" aria-hidden>
                        <i className="fa-solid fa-chart-column" />
                      </div>
                      <div className="ddb-vis-stat-card__row">
                        <select
                          className="ddb-select ddb-vis-stat-select"
                          value={activeStatsLayer}
                          onChange={e => setActiveStatsLayer(e.target.value)}
                          disabled={!layerKeys.length}
                          aria-label="Layer for stat card"
                        >
                          {layerKeys.length === 0 ? (
                            <option value="">No layers</option>
                          ) : null}
                          {layerKeys.map(k => (
                            <option key={k} value={k}>
                              {layers[k].name}
                            </option>
                          ))}
                        </select>
                        <select
                          className="ddb-select ddb-vis-stat-select"
                          value={statsField}
                          onChange={e => setStatsField(e.target.value)}
                          disabled={!activeFields.length}
                          aria-label="Numeric field"
                        >
                          {activeFields.length === 0 ? (
                            <option value="">No fields</option>
                          ) : null}
                          {activeFields.map(f => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                        </select>
                        <select className="ddb-select ddb-vis-stat-select" value={statsAgg} onChange={e => setStatsAgg(e.target.value)} aria-label="Aggregation">
                          <option value="sum">Sum</option>
                          <option value="avg">Average</option>
                          <option value="count">Count</option>
                          <option value="max">Max</option>
                          <option value="min">Min</option>
                        </select>
                      </div>
                      <button
                        type="button"
                        className="ddb-btn ddb-vis-stat-add"
                        onClick={addStatCard}
                        disabled={!activeStatsLayer || !statsField}
                      >
                        <span className="ddb-vis-stat-add__icon" aria-hidden>
                          <i className="fa-solid fa-plus" />
                        </span>
                        Add Card
                      </button>
                    </div>
                  ) : null}
                  {statCards.length > 0 ? (
                    <div className="ddb-vis-stat-saved" role="region" aria-label="Saved stat cards">
                      <div className="ddb-vis-stat-saved-head">Your stat cards</div>
                      <div className="ddb-stats-cards-container ddb-stats-cards-container--in-sheet">
                        {statCards.map(c => (
                          <div key={c.id} className="ddb-stat-card-custom">
                            <button
                              type="button"
                              aria-label="Remove stat card"
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
                  ) : null}
                </div>
              ) : null}
              {rightSheet === 'buildVisual' ? (
                <div className="ddb-right-sheet-body ddb-right-sheet-body--build-visual ddb-right-sheet-buildVisual">
                  {vizBuildMode === 'none' || layerKeys.length === 0 ? (
                    <div className="ddb-build-visual-empty" role="status">
                      <p className="ddb-build-visual-empty__title">No visual build context yet</p>
                      <p className="ddb-build-visual-empty__text">
                        {layerKeys.length === 0
                          ? 'Add map layers from the Data panel first.'
                          : 'Select one or more chart types in Charts, then return here to bind fields (data layer, axes, legend, tooltips).'}
                      </p>
                    </div>
                  ) : (
                    <div className="ddb-vis-build-visual ddb-vis-build-visual--solo" aria-label="Build visual field wells">
                      {vizBuildMode === 'map' ? (
                        <div className="ddb-build-fields-panel ddb-build-fields-panel--top">
                          <button
                            type="button"
                            className="ddb-build-fields-panel__tab"
                            aria-expanded={buildVisualFieldsOpen}
                            aria-controls="ddb-build-visual-fields-region"
                            id="ddb-build-visual-fields-panel-head"
                            aria-label={buildVisualFieldsOpen ? 'Collapse Fields panel' : 'Expand Fields panel'}
                            onClick={() => setBuildVisualFieldsOpen(v => !v)}
                          >
                            <span className="ddb-build-fields-panel__chev" aria-hidden>
                              <i className={`fa-solid ${buildVisualFieldsOpen ? 'fa-angles-left' : 'fa-angles-right'}`} />
                            </span>
                            <span className="ddb-build-fields-panel__title">Fields</span>
                          </button>
                          {buildVisualFieldsOpen ? (
                            <div
                              className="ddb-build-fields-panel__body"
                              id="ddb-build-visual-fields-region"
                              role="region"
                              aria-labelledby="ddb-build-visual-fields-panel-head"
                            >
                              <p className="ddb-vis-fields-block__hint">
                                Check a field to include it in map tooltips (configure Location / Legend / Lat / Long in
                                the wells below).
                              </p>
                              <ul className="ddb-vis-field-check-list" role="list">
                                {bindLayerFields.map(f => (
                                  <li key={f}>
                                    <label className="ddb-vis-field-check-row">
                                      <input
                                        type="checkbox"
                                        checked={mapTooltipFieldPicks.includes(f)}
                                        onChange={() =>
                                          setMapTooltipFieldPicks(prev =>
                                            prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f],
                                          )
                                        }
                                      />
                                      <span className="ddb-vis-field-check-row__name">{f}</span>
                                    </label>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </div>
                      ) : vizBuildMode === 'cartesian' ? (
                        <div className="ddb-build-fields-panel ddb-build-fields-panel--top">
                          <button
                            type="button"
                            className="ddb-build-fields-panel__tab"
                            aria-expanded={buildVisualFieldsOpen}
                            aria-controls="ddb-build-visual-fields-region"
                            id="ddb-build-visual-fields-panel-head"
                            aria-label={buildVisualFieldsOpen ? 'Collapse Fields panel' : 'Expand Fields panel'}
                            onClick={() => setBuildVisualFieldsOpen(v => !v)}
                          >
                            <span className="ddb-build-fields-panel__chev" aria-hidden>
                              <i className={`fa-solid ${buildVisualFieldsOpen ? 'fa-angles-left' : 'fa-angles-right'}`} />
                            </span>
                            <span className="ddb-build-fields-panel__title">Fields</span>
                          </button>
                          {buildVisualFieldsOpen ? (
                            <div
                              className="ddb-build-fields-panel__body"
                              id="ddb-build-visual-fields-region"
                              role="region"
                              aria-labelledby="ddb-build-visual-fields-panel-head"
                            >
                              <p className="ddb-vis-fields-block__hint">
                                Pin fields for the next chart build (X/Y wells below drive axis labels and values).
                              </p>
                              <ul className="ddb-vis-field-check-list" role="list">
                                {bindLayerFields.map(f => (
                                  <li key={f}>
                                    <div className="ddb-vis-field-check-row">
                                      <label className="ddb-vis-field-check-row__main">
                                        <input
                                          type="checkbox"
                                          checked={cartesianFieldPicks.includes(f)}
                                          onChange={e => {
                                            if (e.target.checked) assignCartesianFieldToWell(f)
                                            else unassignCartesianField(f)
                                          }}
                                        />
                                        <span
                                          className="ddb-vis-field-check-row__name"
                                          draggable
                                          onDragStart={e => {
                                            setDragFieldName(f)
                                            e.dataTransfer.effectAllowed = 'move'
                                            e.dataTransfer.setData('text/plain', f)
                                          }}
                                          onDragEnd={() => {
                                            setDragFieldName(null)
                                            setDragOverWell(null)
                                          }}
                                          title="Drag this field to a well"
                                        >
                                          {f}
                                        </span>
                                      </label>
                                      <button
                                        type="button"
                                        className="ddb-vis-field-pin-btn"
                                        title="Pin this field to build visual wells"
                                        aria-label={`Pin ${f} to build visual wells`}
                                        onClick={() => assignCartesianFieldToWell(f)}
                                      >
                                        <i className="fa-solid fa-thumbtack" aria-hidden />
                                      </button>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="ddb-build-fields-panel ddb-build-fields-panel--top">
                          <button
                            type="button"
                            className="ddb-build-fields-panel__tab"
                            aria-expanded={buildVisualFieldsOpen}
                            aria-controls="ddb-build-visual-fields-region"
                            id="ddb-build-visual-fields-panel-head"
                            aria-label={buildVisualFieldsOpen ? 'Collapse Fields panel' : 'Expand Fields panel'}
                            onClick={() => setBuildVisualFieldsOpen(v => !v)}
                          >
                            <span className="ddb-build-fields-panel__chev" aria-hidden>
                              <i className={`fa-solid ${buildVisualFieldsOpen ? 'fa-angles-left' : 'fa-angles-right'}`} />
                            </span>
                            <span className="ddb-build-fields-panel__title">Fields</span>
                          </button>
                          {buildVisualFieldsOpen ? (
                            <div
                              className="ddb-build-fields-panel__body"
                              id="ddb-build-visual-fields-region"
                              role="region"
                              aria-labelledby="ddb-build-visual-fields-panel-head"
                            >
                              <p className="ddb-vis-fields-block__hint">
                                Choose columns for Table / Matrix visuals on the canvas (Values well below).
                              </p>
                              <ul className="ddb-vis-field-check-list" role="list">
                                {bindLayerFields.map(f => (
                                  <li key={f}>
                                    <label className="ddb-vis-field-check-row">
                                      <input
                                        type="checkbox"
                                        checked={tableColumnPicks.includes(f)}
                                        onChange={() =>
                                          setTableColumnPicks(prev =>
                                            prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f],
                                          )
                                        }
                                      />
                                      <span className="ddb-vis-field-check-row__name">{f}</span>
                                    </label>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </div>
                      )}
                      <p className="ddb-vis-build-visual__kicker">Build visual</p>
                      <label className="ddb-vis-bind-layer">
                        <span className="ddb-vis-bind-layer__label">Data layer</span>
                        <select
                          className="ddb-select ddb-vis-bind-layer__select"
                          value={
                            visualBindingsLayerKey && layers[visualBindingsLayerKey]
                              ? visualBindingsLayerKey
                              : '__active__'
                          }
                          onChange={e => {
                            const v = e.target.value
                            setVisualBindingsLayerKey(v === '__active__' ? '' : v)
                          }}
                        >
                          <option value="__active__">Active data layer ({layers[activeStatsLayer]?.name ?? '—'})</option>
                          {layerKeys.map(k => (
                            <option key={k} value={k}>
                              {layers[k]?.name ?? k}
                            </option>
                          ))}
                        </select>
                      </label>
                      {vizBuildMode === 'map' ? (
                        <>
                          {(
                            [
                              { key: 'location' as const, label: 'Location' },
                              { key: 'legend' as const, label: 'Legend' },
                              { key: 'latitude' as const, label: 'Latitude' },
                              { key: 'longitude' as const, label: 'Longitude' },
                            ] as const
                          ).map(w => (
                            <div key={w.key} className="ddb-vis-well">
                              <span className="ddb-vis-well__label">{w.label}</span>
                              <select
                                className="ddb-vis-well__select"
                                value={mapFieldWells[w.key]}
                                onChange={e => setMapFieldWells(prev => ({ ...prev, [w.key]: e.target.value }))}
                                aria-label={w.label}
                              >
                                <option value="">Add data fields here</option>
                                {bindLayerFields.map(f => (
                                  <option key={f} value={f}>
                                    {f}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ))}
                          <div className="ddb-vis-well">
                            <span className="ddb-vis-well__label">Tooltips</span>
                            <div className="ddb-vis-well__placeholder" title="Use the Fields list above">
                              Add data fields here
                            </div>
                          </div>
                          <div className="ddb-vis-drill" aria-hidden>
                            <div className="ddb-vis-drill__title">Drill through</div>
                            <div className="ddb-vis-drill__row">
                              <span>Cross-report</span>
                              <span className="ddb-vis-fake-toggle is-off">Off</span>
                            </div>
                          </div>
                        </>
                      ) : vizBuildMode === 'cartesian' ? (
                        <>
                          {(
                            [
                              { key: 'xAxis' as const, label: 'X-axis' },
                              { key: 'yAxis' as const, label: 'Y-axis' },
                              { key: 'legend' as const, label: 'Legend' },
                              { key: 'smallMultiples' as const, label: 'Small multiples' },
                              { key: 'tooltips' as const, label: 'Tooltips' },
                            ] as const
                          ).map(w => (
                            <div
                              key={w.key}
                              className={`ddb-vis-well${dragOverWell === w.key ? ' is-drop-target' : ''}`}
                              onDragOver={e => {
                                if (!dragFieldName) return
                                e.preventDefault()
                                e.dataTransfer.dropEffect = 'move'
                                setDragOverWell(w.key)
                              }}
                              onDragLeave={() => {
                                if (dragOverWell === w.key) setDragOverWell(null)
                              }}
                              onDrop={e => {
                                e.preventDefault()
                                const dropped = dragFieldName || e.dataTransfer.getData('text/plain')
                                if (dropped) assignCartesianFieldToWell(dropped, w.key)
                                setDragFieldName(null)
                                setDragOverWell(null)
                              }}
                            >
                              <span className="ddb-vis-well__label">{w.label}</span>
                              <select
                                className="ddb-vis-well__select"
                                value={cartesianWells[w.key]}
                                onChange={e => {
                                  const value = e.target.value
                                  setCartesianWells(prev => ({ ...prev, [w.key]: value }))
                                  if (value) setCartesianFieldPicks(prev => (prev.includes(value) ? prev : [...prev, value]))
                                }}
                                aria-label={w.label}
                              >
                                <option value="">Add data fields here</option>
                                {bindLayerFields.map(f => (
                                  <option key={f} value={f}>
                                    {f}
                                  </option>
                                ))}
                              </select>
                              {cartesianWells[w.key] ? (
                                <button
                                  type="button"
                                  className="ddb-vis-well__chip"
                                  draggable
                                  onDragStart={e => {
                                    setDragFieldName(cartesianWells[w.key])
                                    e.dataTransfer.effectAllowed = 'move'
                                    e.dataTransfer.setData('text/plain', cartesianWells[w.key])
                                  }}
                                  onDragEnd={() => {
                                    setDragFieldName(null)
                                    setDragOverWell(null)
                                  }}
                                  onClick={() => unassignCartesianField(cartesianWells[w.key])}
                                  title="Drag to another well or click to remove"
                                >
                                  <span>{cartesianWells[w.key]}</span>
                                  <i className="fa-solid fa-xmark" aria-hidden />
                                </button>
                              ) : null}
                            </div>
                          ))}
                          <div className="ddb-vis-drill" aria-hidden>
                            <div className="ddb-vis-drill__title">Drill through</div>
                            <div className="ddb-vis-drill__row">
                              <span>Cross-report</span>
                              <span className="ddb-vis-fake-toggle is-off">Off</span>
                            </div>
                            <div className="ddb-vis-drill__row">
                              <span>Keep all filters</span>
                              <span className="ddb-vis-fake-toggle is-on">On</span>
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="ddb-vis-well">
                            <span className="ddb-vis-well__label">Values</span>
                            <select className="ddb-vis-well__select" disabled aria-disabled title="Use field checkboxes">
                              <option value="">Add data fields here</option>
                            </select>
                          </div>
                        </>
                      )}
                    </div>
                  )}
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
              {rightSheet === 'link' ? (
                <div className="ddb-right-sheet-body ddb-link-sheet-body">
                  <div className="ddb-link-relation-card">
                    <div className="ddb-link-relation-card__head">
                      <div className="ddb-link-relation-card__icon-badge" aria-hidden>
                        <i className="fa-solid fa-link" />
                      </div>
                      <button
                        type="button"
                        className="ddb-link-calc-btn"
                        title="Calculate field"
                        aria-label="Open calculate field"
                        onClick={() => {
                          setCalcFieldStatus('')
                          setCalcExpressionType('Arcade')
                          setCalcExpression('')
                          setCalcTargetField('')
                          setCalcNewFieldName('')
                          setCalcLayerKey(linkFrom || activeStatsLayer || layerKeys[0] || '')
                          setCalcFieldOpen(true)
                        }}
                      >
                        <i className="fa-solid fa-calculator" aria-hidden />
                      </button>
                    </div>
                    <p className="ddb-link-relation-card__lead">
                      Choose source and target layers, then map the fields that tie them together.
                    </p>
                    <label className="ddb-link-layer-search">
                      <i className="fa-solid fa-magnifying-glass" aria-hidden />
                      <input
                        className="ddb-input"
                        value={linkLayerSearch}
                        onChange={e => setLinkLayerSearch(e.target.value)}
                        placeholder="Search layers..."
                        aria-label="Search layers"
                      />
                    </label>
                    <div className="ddb-link-relation-row">
                      <select
                        className="ddb-select ddb-link-relation-select"
                        value={linkFrom}
                        onChange={e => {
                          setLinkFrom(e.target.value)
                          setLinkFieldFrom('')
                        }}
                        aria-label="Source layer"
                      >
                        <option value="">-- Source Layer --</option>
                        {filteredLinkLayerKeys.map(k => (
                          <option key={k} value={k}>
                            {layers[k].name}
                          </option>
                        ))}
                      </select>
                      <span className="ddb-link-relation-arrow" aria-hidden>
                        →
                      </span>
                      <select
                        className="ddb-select ddb-link-relation-select"
                        value={linkTo}
                        onChange={e => {
                          setLinkTo(e.target.value)
                          setLinkFieldTo('')
                        }}
                        aria-label="Target layer"
                      >
                        <option value="">-- Target Layer --</option>
                        {filteredLinkLayerKeys.map(k => (
                          <option key={k} value={k}>
                            {layers[k].name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="ddb-link-relation-row">
                      <select
                        className="ddb-select ddb-link-relation-select"
                        value={linkFieldFrom}
                        onChange={e => setLinkFieldFrom(e.target.value)}
                        aria-label="Source field"
                      >
                        <option value="">-- Source field --</option>
                        {linkFieldsFrom.map(f => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>
                      <span className="ddb-link-relation-arrow ddb-link-relation-arrow--bidir" aria-hidden>
                        ↔
                      </span>
                      <select
                        className="ddb-select ddb-link-relation-select"
                        value={linkFieldTo}
                        onChange={e => setLinkFieldTo(e.target.value)}
                        aria-label="Target field"
                      >
                        <option value="">-- Target field --</option>
                        {linkFieldsTo.map(f => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      className="ddb-btn ddb-link-relation-apply"
                      onClick={() => setLinkStatus('Layers linked successfully (conceptual relation set).')}
                    >
                      Apply Relation &amp; Link Map
                    </button>
                    {linkStatus ? <div className="ddb-hint ddb-link-relation-status">{linkStatus}</div> : null}
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
                <i className="fa-solid fa-sliders ddb-right-rail-icon" />
              </span>
            </button>
            <button
              type="button"
              className={`ddb-right-rail-tab${rightSheet === 'visualizations' ? ' is-active' : ''}`}
              onClick={() => toggleRightSheet('visualizations')}
              title="Visualizations — chart types"
              aria-label="Visualizations"
            >
              <span className="ddb-right-rail-icon-wrap" aria-hidden>
                <i className="fa-solid fa-chart-line ddb-right-rail-icon" />
              </span>
            </button>
            <button
              type="button"
              className={`ddb-right-rail-tab${rightSheet === 'buildVisual' ? ' is-active' : ''}`}
              onClick={() => toggleRightSheet('buildVisual')}
              title="Build visual — data layer and field wells"
              aria-label="Build visual"
            >
              <span className="ddb-right-rail-icon-wrap" aria-hidden>
                <i className="fa-solid fa-wand-magic-sparkles ddb-right-rail-icon" />
              </span>
            </button>
            <button
              type="button"
              className={`ddb-right-rail-tab${rightSheet === 'data' ? ' is-active' : ''}`}
              onClick={() => toggleRightSheet('data')}
              title="Data"
              aria-label="Data"
            >
              <span className="ddb-right-rail-icon-wrap" aria-hidden>
                <i className="fa-solid fa-folder-tree ddb-right-rail-icon" />
              </span>
            </button>
            <button
              type="button"
              className={`ddb-right-rail-tab${rightSheet === 'link' ? ' is-active' : ''}`}
              onClick={() => toggleRightSheet('link')}
              title="Link Layers (Relation)"
              aria-label="Link Layers (Relation)"
            >
              <span className="ddb-right-rail-icon-wrap" aria-hidden>
                <i className="fa-solid fa-diagram-project ddb-right-rail-icon" />
              </span>
            </button>
          </nav>
        </div>
        </div>
      </div>
    </div>

    {calcFieldOpen ? (
      <div className="ddb-calc-modal-backdrop" role="presentation" onMouseDown={() => setCalcFieldOpen(false)}>
        <div
          className="ddb-calc-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ddb-calc-modal-title"
          onMouseDown={(e: MouseEvent<HTMLDivElement>) => e.stopPropagation()}
        >
          <div className="ddb-calc-modal__head">
            <h3 id="ddb-calc-modal-title" className="ddb-calc-modal__title">
              <i className="fa-solid fa-calculator" aria-hidden /> Calculate Field
            </h3>
            <button type="button" className="ddb-calc-modal__close" onClick={() => setCalcFieldOpen(false)} aria-label="Close">
              <i className="fa-solid fa-xmark" aria-hidden />
            </button>
          </div>
          <div className="ddb-calc-modal__body">
            <label className="ddb-calc-modal__field">
              <span>Input table</span>
              <label className="ddb-link-layer-search ddb-link-layer-search--modal">
                <i className="fa-solid fa-magnifying-glass" aria-hidden />
                <input
                  className="ddb-input"
                  value={calcLayerSearch}
                  onChange={e => setCalcLayerSearch(e.target.value)}
                  placeholder="Search input layer..."
                  aria-label="Search input layer"
                />
              </label>
              <select className="ddb-select" value={calcLayerKey} onChange={e => setCalcLayerKey(e.target.value)}>
                <option value="">Select layer</option>
                {filteredCalcLayerKeys.map(k => (
                  <option key={k} value={k}>
                    {layers[k].name}
                  </option>
                ))}
              </select>
            </label>
            <label className="ddb-calc-modal__field">
              <span>Expression type</span>
              <select
                className="ddb-select"
                value={calcExpressionType}
                onChange={e => setCalcExpressionType(e.target.value as 'Arcade' | 'Python' | 'SQL')}
              >
                <option value="Arcade">Arcade</option>
                <option value="Python">Python</option>
                <option value="SQL">SQL</option>
              </select>
            </label>
            <label className="ddb-calc-modal__field">
              <span>Field name (existing or new)</span>
              <select className="ddb-select" value={calcTargetField} onChange={e => setCalcTargetField(e.target.value)}>
                <option value="">Select target field</option>
                <option value="__new__">+ Create new field</option>
                {calcLayerFields.map(f => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
            {calcTargetField === '__new__' ? (
              <label className="ddb-calc-modal__field">
                <span>New field name</span>
                <input
                  className="ddb-input"
                  value={calcNewFieldName}
                  onChange={e => setCalcNewFieldName(e.target.value)}
                  placeholder="e.g. area_score"
                />
              </label>
            ) : null}
            <label className="ddb-calc-modal__field">
              <span>Expression</span>
              <textarea
                className="ddb-calc-modal__expr"
                value={calcExpression}
                onChange={e => setCalcExpression(e.target.value)}
                placeholder="Example: [Area] * 0.1 + ($feature.Count || 0)"
              />
            </label>
            <p className="ddb-calc-modal__hint">Use field tokens like [FieldName] or $feature.FieldName.</p>
            {calcFieldStatus ? <p className="ddb-calc-modal__status">{calcFieldStatus}</p> : null}
          </div>
          <div className="ddb-calc-modal__foot">
            <button type="button" className="ddb-btn ddb-btn--ghost" onClick={() => setCalcFieldOpen(false)}>
              Cancel
            </button>
            <button type="button" className="ddb-btn ddb-calc-modal__apply" onClick={runCalculateField}>
              <i className="fa-solid fa-bolt" aria-hidden /> Calculate
            </button>
          </div>
        </div>
      </div>
    ) : null}

    {addGisOpen ? (
      <div className="gis-modal-overlay ddb-add-source-overlay" role="presentation" onClick={closeAddGisModal}>
        <div
          className="gis-modal gis-modal-compact ddb-add-source-modal ddb-add-source-modal--home"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ddb-add-source-title"
          onClick={e => e.stopPropagation()}
        >
          <div className="ddb-add-source-modal__head">
            <div className="ddb-add-source-modal__head-main">
              <div className="gis-modal-compact-title" id="ddb-add-source-title">
                Add Source Data
              </div>
              {addWizard === 'home' ? (
                <p className="ddb-add-source-lead ddb-add-source-lead--head">
                  Choose how you want to add layers to the registry for analytics and maps.
                </p>
              ) : null}
            </div>
            {addWizard !== 'home' ? (
              <button type="button" className="ddb-add-source-back" onClick={goAddWizardHome}>
                <i className="fa-solid fa-arrow-left" aria-hidden /> All options
              </button>
            ) : null}
          </div>

          {addWizard === 'home' ? (
            <div className="ddb-add-source-home">
              <div className="ddb-add-source-radio-list" role="radiogroup" aria-labelledby="ddb-add-source-title">
                <label className="ddb-add-source-radio-row">
                  <input
                    type="radio"
                    name="ddb-add-source-home"
                    value="gis"
                    checked={addSourceHomeChoice === 'gis'}
                    onChange={() => {
                      setDiscoverError(null)
                      setAddSourceHomeChoice('gis')
                      setAddWizard('gis-list')
                    }}
                  />
                  <span className="ddb-add-source-radio-row__icon" aria-hidden>
                    <i className="fa-solid fa-layer-group" />
                  </span>
                  <span className="ddb-add-source-radio-row__text">
                    <span className="ddb-add-source-radio-row__title">Select from GIS Content</span>
                    <span className="ddb-add-source-radio-row__desc">
                      Use layers and fields already saved in GIS Map in this browser.
                    </span>
                  </span>
                </label>
                <label className="ddb-add-source-radio-row">
                  <input
                    type="radio"
                    name="ddb-add-source-home"
                    value="arcgis"
                    checked={addSourceHomeChoice === 'arcgis'}
                    onChange={() => {
                      setDiscoverError(null)
                      setAddSourceHomeChoice('arcgis')
                      setAddWizard('tabs')
                      setAddTab('arcgis')
                    }}
                  />
                  <span className="ddb-add-source-radio-row__icon" aria-hidden>
                    <i className="fa-solid fa-link" />
                  </span>
                  <span className="ddb-add-source-radio-row__text">
                    <span className="ddb-add-source-radio-row__title">Provide an ArcGIS Server layer URL</span>
                    <span className="ddb-add-source-radio-row__desc">
                      Connect to a feature service and pick a layer or table.
                    </span>
                  </span>
                </label>
                <label className="ddb-add-source-radio-row">
                  <input
                    type="radio"
                    name="ddb-add-source-home"
                    value="upload"
                    checked={addSourceHomeChoice === 'upload'}
                    onChange={() => {
                      setDiscoverError(null)
                      setAddSourceHomeChoice('upload')
                      setAddWizard('tabs')
                      setAddTab('upload')
                    }}
                  />
                  <span className="ddb-add-source-radio-row__icon" aria-hidden>
                    <i className="fa-solid fa-file-arrow-up" />
                  </span>
                  <span className="ddb-add-source-radio-row__text">
                    <span className="ddb-add-source-radio-row__title">Upload a file</span>
                    <span className="ddb-add-source-radio-row__desc">
                      GeoJSON, KML, KMZ, Shapefile (zip), CSV with coordinates, and more.
                    </span>
                  </span>
                </label>
                <label className="ddb-add-source-radio-row">
                  <input
                    type="radio"
                    name="ddb-add-source-home"
                    value="getdata"
                    checked={addSourceHomeChoice === 'getdata'}
                    onChange={() => {
                      setDiscoverError(null)
                      setGetDataNotice(null)
                      setAddSourceHomeChoice('getdata')
                      setAddWizard('get-data')
                    }}
                  />
                  <span className="ddb-add-source-radio-row__icon ddb-add-source-radio-row__icon--getdata" aria-hidden>
                    <i className="fa-solid fa-database" />
                    <i className="fa-solid fa-table-cells" />
                  </span>
                  <span className="ddb-add-source-radio-row__text">
                    <span className="ddb-add-source-radio-row__title">Get Data</span>
                    <span className="ddb-add-source-radio-row__desc">
                      Open the same “Common data sources” list as Power BI (Excel, CSV, SQL, Web, OData, …).
                    </span>
                  </span>
                </label>
                <label className="ddb-add-source-radio-row">
                  <input
                    type="radio"
                    name="ddb-add-source-home"
                    value="raster"
                    checked={addSourceHomeChoice === 'raster'}
                    onChange={() => {
                      setDiscoverError(null)
                      setAddSourceHomeChoice('raster')
                      setAddWizard('tabs')
                      setAddTab('url')
                    }}
                  />
                  <span className="ddb-add-source-radio-row__icon" aria-hidden>
                    <i className="fa-regular fa-image" />
                  </span>
                  <span className="ddb-add-source-radio-row__text">
                    <span className="ddb-add-source-radio-row__title">Raster path / URL</span>
                    <span className="ddb-add-source-radio-row__desc">
                      Add a raster endpoint or image path and import it through the URL connector.
                    </span>
                  </span>
                </label>
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
                … Database, web URL &amp; advanced…
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
                  accept=".kml,.kmz,.zip,.geojson,.json,.csv,.tif,.tiff,.img,.vrt,.jp2,.ecw"
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
                <p className="ddb-hint" style={{ marginTop: 4, textAlign: 'left' }}>
                  Raster support: Raster Dataset, Raster Layer, Mosaic Layer, Image Service, Map Server/Layer, Internet Tiled Layer, and
                  Folder endpoints can be added via URL/Raster path workflows.
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
                  placeholder="https://… (GeoJSON, KML, KMZ, zip, Raster path / URL, …)"
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

          <div className="gis-modal-footer ddb-add-source-modal__footer">
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
