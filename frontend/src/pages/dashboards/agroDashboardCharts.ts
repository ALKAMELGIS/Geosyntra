import type { ChartConfiguration, ChartType } from 'chart.js'

export const MAX_AGRO_ROWS = 1500

export type AgroVizType =
  | 'bar'
  | 'barStack'
  | 'line'
  | 'area'
  | 'pie'
  | 'doughnut'
  | 'polarArea'
  | 'radar'
  | 'scatter'
  | 'bubble'
  | 'horizontalBar'
  | 'funnel'
  | 'treemapBar'
  | 'table'
  /** Geographic basemap (dashboard preview, not a Chart.js type). */
  | 'map'

export type FieldChartSlot = { main: boolean; pie: boolean; bot: boolean }

/** Panel toggles default off; user opts fields into Main / Pie / Line areas. */
export const DEFAULT_FIELD_CHART: FieldChartSlot = { main: false, pie: false, bot: false }

/** How a field maps into cartesian / bubble charts when the user assigns axes in the workflow modal. */
export type FieldAxisRole = 'x' | 'y' | 'value' | 'legend'

/** Chart kinds that support X / Y / Value / Legend binding in Layers & fields → Chart assignments. */
export const AGRO_AXIS_BINDING_VIZ: readonly AgroVizType[] = [
  'bar',
  'horizontalBar',
  'line',
  'area',
  'scatter',
  'bubble',
  'barStack',
]

export type FieldAxisRolesMap = Record<string, FieldAxisRole | ''>

export function fieldChartUsesAxisBindings(styles: AgroVizType[] | undefined): boolean {
  if (!styles?.length) return false
  const set = new Set<string>(AGRO_AXIS_BINDING_VIZ as readonly string[])
  return styles.some(s => set.has(s))
}

export const VIZ_OPTIONS: readonly { id: AgroVizType; title: string; icon: string }[] = [
  { id: 'bar', title: 'Bar', icon: 'fa-solid fa-chart-column' },
  { id: 'barStack', title: 'Stacked bar', icon: 'fa-solid fa-layer-group' },
  { id: 'line', title: 'Line', icon: 'fa-solid fa-chart-line' },
  { id: 'area', title: 'Area', icon: 'fa-solid fa-chart-area' },
  { id: 'pie', title: 'Pie', icon: 'fa-solid fa-chart-pie' },
  { id: 'doughnut', title: 'Doughnut', icon: 'fa-regular fa-circle' },
  { id: 'polarArea', title: 'Polar area', icon: 'fa-solid fa-bullseye' },
  { id: 'radar', title: 'Radar', icon: 'fa-solid fa-draw-polygon' },
  { id: 'scatter', title: 'Scatter', icon: 'fa-solid fa-braille' },
  { id: 'bubble', title: 'Bubble', icon: 'fa-solid fa-circle' },
  { id: 'horizontalBar', title: 'Horizontal bar', icon: 'fa-solid fa-chart-bar' },
  { id: 'funnel', title: 'Funnel (bars)', icon: 'fa-solid fa-filter' },
  { id: 'treemapBar', title: 'Blocks (bars)', icon: 'fa-solid fa-th-large' },
  { id: 'table', title: 'Table', icon: 'fa-solid fa-table' },
] as const

export function rowsFromFeatureCollection(fc: GeoJSON.FeatureCollection, maxRows = MAX_AGRO_ROWS): Record<string, unknown>[] {
  return fc.features.slice(0, maxRows).map(f => {
    const p = f?.properties
    return p && typeof p === 'object' ? { ...(p as Record<string, unknown>) } : {}
  })
}

export function trimRows<T>(rows: T[], max = MAX_AGRO_ROWS): T[] {
  return rows.length <= max ? rows : rows.slice(0, max)
}

export function coerceNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const t = v.trim()
    if (!t) return null
    const n = Number.parseFloat(t.replace(/,/g, ''))
    return Number.isFinite(n) ? n : null
  }
  return null
}

export function parseFieldKey(key: string): { sourceId: string; field: string } {
  const i = key.indexOf('|||')
  if (i === -1) return { sourceId: key, field: '' }
  return { sourceId: key.slice(0, i), field: key.slice(i + 3) }
}

type AgroLayer = {
  id: string
  name: string
  fields: string[]
  kind: 'feature' | 'table'
  rows: Record<string, unknown>[]
}

function layerById(sources: AgroLayer[], id: string): AgroLayer | undefined {
  return sources.find(s => s.id === id)
}

function seriesForField(layer: AgroLayer, field: string): (number | null)[] {
  return layer.rows.map(r => coerceNumber(r[field]))
}

function fieldShortLabel(key: string, sources: AgroLayer[]): string {
  const { sourceId, field } = parseFieldKey(key)
  const L = layerById(sources, sourceId)
  if (L && field) return `${L.name}: ${field}`
  return field || key
}

function slotKeys(
  slot: 'main' | 'pie' | 'bot',
  pinnedFieldKeys: string[],
  placement: Record<string, FieldChartSlot>,
  viz: AgroVizType,
  fieldStyles?: Record<string, AgroVizType[]>,
): string[] {
  return pinnedFieldKeys.filter(k => {
    const slotOn = (placement[k] ?? DEFAULT_FIELD_CHART)[slot]
    if (!slotOn) return false
    const allow = fieldStyles?.[k]
    if (!allow?.length) return true
    return allow.includes(viz)
  })
}

function alignNumericSeries(keys: string[], sources: AgroLayer[]): { labels: string[]; series: { key: string; label: string; data: number[] }[] } {
  const series: { key: string; label: string; data: number[] }[] = []
  let n = 0
  for (const key of keys) {
    const { sourceId, field } = parseFieldKey(key)
    const layer = layerById(sources, sourceId)
    if (!layer || !field) continue
    const raw = seriesForField(layer, field)
    const nums = raw.map(v => (v === null ? 0 : v))
    if (nums.length === 0) continue
    series.push({ key, label: fieldShortLabel(key, sources), data: nums })
    n = n === 0 ? nums.length : Math.min(n, nums.length)
  }
  const cap = Math.min(n, 72)
  const labels = Array.from({ length: cap }, (_, i) => String(i + 1))
  return {
    labels,
    series: series.map(s => ({ ...s, data: s.data.slice(0, cap) })),
  }
}

function categoryDistribution(layer: AgroLayer, field: string, top = 10): { labels: string[]; data: number[] } {
  const counts = new Map<string, number>()
  for (const r of layer.rows) {
    const v = r[field]
    const lab = v === null || v === undefined ? '—' : String(v).slice(0, 40)
    counts.set(lab, (counts.get(lab) ?? 0) + 1)
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, top)
  return {
    labels: sorted.map(([k]) => k),
    data: sorted.map(([, v]) => v),
  }
}

function mean(nums: number[]): number {
  if (!nums.length) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

export type AgroSlotBuildResult =
  | { kind: 'chart'; config: ChartConfiguration }
  | { kind: 'table'; columns: string[]; rows: Record<string, unknown>[] }
  | { kind: 'empty'; message: string }
  | { kind: 'map' }

const PALETTE = ['#2D6BE4', '#12A97B', '#E8920A', '#6C5DD3', '#0EA5E9', '#D946EF', '#14B8A6', '#F97316']

function axisRoleOf(roles: FieldAxisRolesMap | undefined, k: string): FieldAxisRole | undefined {
  const r = roles?.[k]
  if (!r || r === '') return undefined
  return r
}

function hasAnyAxisRole(keys: string[], roles: FieldAxisRolesMap | undefined): boolean {
  return keys.some(k => Boolean(axisRoleOf(roles, k)))
}

function rowColorsFromLegendField(layer: AgroLayer, legendField: string, n: number): string[] {
  const u = new Map<string, number>()
  let c = 0
  return Array.from({ length: n }, (_, i) => {
    const lab = String(layer.rows[i]?.[legendField] ?? '—')
    if (!u.has(lab)) {
      u.set(lab, c)
      c += 1
    }
    const idx = u.get(lab) ?? 0
    return `${PALETTE[idx % PALETTE.length]!}cc`
  })
}

/** When axis roles are set on fields in this slot, build chart config from them; else null → legacy path. */
function buildFromAxisRoles(
  viz: AgroVizType,
  keys: string[],
  sources: AgroLayer[],
  roles: FieldAxisRolesMap,
  noDataMsg: string,
): AgroSlotBuildResult | null {
  if (!(AGRO_AXIS_BINDING_VIZ as readonly AgroVizType[]).includes(viz)) return null
  if (!hasAnyAxisRole(keys, roles)) return null

  if (viz === 'scatter' || viz === 'bubble') {
    let xk = keys.find(k => axisRoleOf(roles, k) === 'x')
    let yk = keys.find(k => axisRoleOf(roles, k) === 'y')
    const rk = keys.find(k => axisRoleOf(roles, k) === 'value')
    const legK = keys.find(k => axisRoleOf(roles, k) === 'legend')
    if (!xk || !yk) {
      if (keys.length < 2) return null
      xk ??= keys[0]
      yk ??= keys[1]
    }
    if (!xk || !yk || xk === yk) return null
    const a = parseFieldKey(xk)
    const b = parseFieldKey(yk)
    const La = layerById(sources, a.sourceId)
    const Lb = layerById(sources, b.sourceId)
    if (!La || !Lb || !a.field || !b.field) return null
    const n = Math.min(La.rows.length, Lb.rows.length, 120)
    const rv = rk ? parseFieldKey(rk) : null
    const Lr = rv ? layerById(sources, rv.sourceId) : null
    const rField = rv?.field
    const leg = legK ? parseFieldKey(legK) : null
    const Lleg = leg?.sourceId ? layerById(sources, leg.sourceId) : null
    const legField = leg?.field
    const pts: { x: number; y: number; r?: number }[] = []
    const rawR: number[] = []
    for (let i = 0; i < n; i += 1) {
      const x = coerceNumber(La.rows[i]![a.field])
      const y = coerceNumber(Lb.rows[i]![b.field])
      if (x === null || y === null) continue
      let r: number | undefined
      if (viz === 'bubble' && rField && Lr && rv) {
        const row = Lr.rows[i]
        if (row) {
          const rvv = coerceNumber(row[rField])
          if (rvv !== null) {
            rawR.push(rvv)
            r = rvv
          }
        }
      }
      if (viz === 'bubble') pts.push({ x, y, r: r ?? 8 })
      else pts.push({ x, y })
    }
    if (!pts.length) return { kind: 'empty', message: noDataMsg }
    if (viz === 'bubble' && rawR.length) {
      const mn = Math.min(...rawR)
      const mx = Math.max(...rawR)
      const span = mx - mn || 1
      for (let i = 0; i < pts.length; i += 1) {
        const p = pts[i]!
        if (typeof p.r !== 'number') continue
        const t = (p.r - mn) / span
        p.r = 4 + t * 18
      }
    }
    let backgroundColor: string | string[] = 'rgba(45,107,228,0.55)'
    if (legField && Lleg) {
      backgroundColor = pts.map((_, i) => {
        const lab = String(Lleg.rows[i]?.[legField] ?? '—')
        let h = 0
        for (let j = 0; j < lab.length; j += 1) h = (h * 31 + lab.charCodeAt(j)) >>> 0
        return PALETTE[h % PALETTE.length]! + 'aa'
      })
    }
    return {
      kind: 'chart',
      config: {
        type: viz === 'bubble' ? 'bubble' : 'scatter',
        data: {
          datasets: [
            {
              label: `${a.field} vs ${b.field}`,
              data: pts,
              backgroundColor,
              borderColor: PALETTE[0],
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: Boolean(legField), position: 'bottom', labels: { boxWidth: 10, font: { size: 9 } } } },
          scales: {
            x: { type: 'linear', title: { display: true, text: a.field } },
            y: { type: 'linear', title: { display: true, text: b.field } },
          },
        },
      },
    }
  }

  const xk = keys.find(k => axisRoleOf(roles, k) === 'x')
  const valKeys = keys.filter(k => {
    const r = axisRoleOf(roles, k)
    return r === 'value' || r === 'y'
  })
  const legK = keys.find(k => axisRoleOf(roles, k) === 'legend')
  if (!xk || valKeys.length === 0) return null

  const { sourceId: sx, field: xf } = parseFieldKey(xk)
  const layerX = layerById(sources, sx)
  if (!layerX || !xf) return null
  for (const vk of valKeys) {
    if (parseFieldKey(vk).sourceId !== sx) return null
  }

  const n = Math.min(layerX.rows.length, 72)
  const labels = layerX.rows.slice(0, n).map(r => {
    const v = r[xf]
    return v === null || v === undefined ? '—' : String(v).slice(0, 40)
  })
  const { field: legField } = legK ? parseFieldKey(legK) : { field: '' as string }
  const legSame = Boolean(legK && parseFieldKey(legK).sourceId === sx && legField)

  const datasets = valKeys
    .map((vk, i) => {
      const { field } = parseFieldKey(vk)
      if (!field) return null
      const data = layerX.rows.slice(0, n).map(r => {
        const co = coerceNumber(r[field])
        return co === null ? 0 : co
      })
      const baseColor = PALETTE[i % PALETTE.length]!
      const perBar = valKeys.length === 1 && legSame ? rowColorsFromLegendField(layerX, legField, n) : undefined
      return {
        type: (viz === 'line' || viz === 'area' ? 'line' : 'bar') as 'line' | 'bar',
        label: fieldShortLabel(vk, sources),
        data,
        backgroundColor:
          viz === 'bar' || viz === 'barStack' ? (perBar ?? `${baseColor}cc`) : viz === 'area' ? `${baseColor}33` : undefined,
        borderColor: baseColor,
        borderWidth: viz === 'line' || viz === 'area' ? 2 : 1,
        fill: viz === 'area',
        tension: 0.35,
        stack: viz === 'barStack' ? 's' : undefined,
        borderRadius: viz === 'bar' || viz === 'barStack' ? 4 : 0,
      }
    })
    .filter(Boolean) as Array<{
      type: 'line' | 'bar'
      label: string
      data: number[]
      backgroundColor?: string | string[]
      borderColor: string
      borderWidth: number
      fill?: boolean
      tension?: number
      stack?: string
      borderRadius?: number
    }>

  if (!datasets.length) return { kind: 'empty', message: noDataMsg }

  const indexAxis = viz === 'horizontalBar' ? ('y' as const) : undefined
  const primary: ChartType =
    viz === 'line' || viz === 'area' ? 'line' : viz === 'horizontalBar' ? 'bar' : viz === 'barStack' ? 'bar' : 'bar'

  return {
    kind: 'chart',
    config: {
      type: primary,
      data: { labels, datasets },
      options: {
        indexAxis,
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: datasets.length > 1 || legSame,
            position: 'bottom',
            labels: { boxWidth: 10, font: { size: 9 } },
          },
        },
        scales:
          primary === 'line' || primary === 'bar'
            ? {
                x: { ticks: { maxRotation: 0, font: { size: 9 } }, grid: { display: false }, title: { display: true, text: xf } },
                y: { beginAtZero: true, ticks: { font: { size: 9 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
              }
            : undefined,
      },
    },
  }
}

export function buildSlotVisualization(
  slot: 'main' | 'pie' | 'bot',
  viz: AgroVizType,
  pinnedFieldKeys: string[],
  placement: Record<string, FieldChartSlot>,
  sources: AgroLayer[],
  noDataMsg: string,
  /** If set for a key, that field is only used when the dashboard card uses one of these viz types. */
  fieldStyles?: Record<string, AgroVizType[]>,
  /** X / Y / Value / Legend roles for column, line, area, scatter, bubble, bar charts. */
  fieldAxisRoles?: FieldAxisRolesMap,
): AgroSlotBuildResult {
  if (viz === 'map') {
    return { kind: 'map' }
  }

  const keys = slotKeys(slot, pinnedFieldKeys, placement, viz, fieldStyles)
  if (!keys.length || !sources.length) {
    return { kind: 'empty', message: noDataMsg }
  }

  if (viz === 'table') {
    const cols = new Set<string>()
    for (const key of keys) {
      const { sourceId, field } = parseFieldKey(key)
      const L = layerById(sources, sourceId)
      if (L && field) cols.add(field)
    }
    const columns = [...cols]
    const base = layerById(sources, parseFieldKey(keys[0]!).sourceId)
    const rows = (base?.rows ?? []).slice(0, 80).map(r => {
      const o: Record<string, unknown> = {}
      for (const c of columns) o[c] = r[c]
      return o
    })
    if (!columns.length) return { kind: 'empty', message: noDataMsg }
    return { kind: 'table', columns, rows }
  }

  if (fieldAxisRoles && (AGRO_AXIS_BINDING_VIZ as readonly AgroVizType[]).includes(viz)) {
    const fromRoles = buildFromAxisRoles(viz, keys, sources, fieldAxisRoles, noDataMsg)
    if (fromRoles) return fromRoles
  }

  const { labels, series } = alignNumericSeries(keys, sources)
  const hasNumeric = series.some(s => s.data.some(v => v !== 0))
  const firstKey = keys[0]!
  const { sourceId: sid0, field: f0 } = parseFieldKey(firstKey)
  const layer0 = layerById(sources, sid0)

  if (viz === 'pie' || viz === 'doughnut' || viz === 'polarArea') {
    if (layer0 && f0) {
      const nums = seriesForField(layer0, f0)
      const numericCount = nums.filter(v => v !== null).length
      if (numericCount < nums.length * 0.4 && nums.length) {
        const { labels: cl, data } = categoryDistribution(layer0, f0, 12)
        if (!data.length) return { kind: 'empty', message: noDataMsg }
        const t = viz === 'pie' ? 'pie' : viz === 'doughnut' ? 'doughnut' : 'polarArea'
        return {
          kind: 'chart',
          config: {
            type: t as ChartType,
            data: {
              labels: cl,
              datasets: [
                {
                  data,
                  backgroundColor: cl.map((_, i) => PALETTE[i % PALETTE.length]!),
                  borderWidth: 1,
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 9 } } } },
            },
          },
        }
      }
      const vals = nums.map(v => (v === null ? 0 : v)).slice(0, 16)
      const labs = vals.map((_, i) => String(i + 1))
      const t = viz === 'pie' ? 'pie' : viz === 'doughnut' ? 'doughnut' : 'polarArea'
      return {
        kind: 'chart',
        config: {
          type: t as ChartType,
          data: {
            labels: labs,
            datasets: [
              {
                data: vals,
                backgroundColor: labs.map((_, i) => PALETTE[i % PALETTE.length]!),
                borderWidth: 1,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
          },
        },
      }
    }
  }

  if (viz === 'radar') {
    const labs: string[] = []
    const pts: number[] = []
    for (const key of keys.slice(0, 8)) {
      const { sourceId, field } = parseFieldKey(key)
      const L = layerById(sources, sourceId)
      if (!L || !field) continue
      const s = seriesForField(L, field).filter((x): x is number => x !== null)
      if (!s.length) continue
      labs.push(fieldShortLabel(key, sources).slice(0, 28))
      pts.push(mean(s))
    }
    if (!pts.length) return { kind: 'empty', message: noDataMsg }
    return {
      kind: 'chart',
      config: {
        type: 'radar',
        data: {
          labels: labs,
          datasets: [
            {
              label: 'Profile',
              data: pts,
              borderColor: PALETTE[0],
              backgroundColor: 'rgba(45,107,228,0.18)',
              borderWidth: 2,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { r: { beginAtZero: true } },
        },
      },
    }
  }

  if (viz === 'scatter' || viz === 'bubble') {
    if (keys.length < 2) return { kind: 'empty', message: noDataMsg }
    const a = parseFieldKey(keys[0]!)
    const b = parseFieldKey(keys[1]!)
    const La = layerById(sources, a.sourceId)
    const Lb = layerById(sources, b.sourceId)
    if (!La || !Lb || !a.field || !b.field) return { kind: 'empty', message: noDataMsg }
    const n = Math.min(La.rows.length, Lb.rows.length, 120)
    const pts: { x: number; y: number; r?: number }[] = []
    for (let i = 0; i < n; i++) {
      const x = coerceNumber(La.rows[i]![a.field])
      const y = coerceNumber(Lb.rows[i]![b.field])
      if (x === null || y === null) continue
      if (viz === 'bubble') pts.push({ x, y, r: 6 })
      else pts.push({ x, y })
    }
    if (!pts.length) return { kind: 'empty', message: noDataMsg }
    return {
      kind: 'chart',
      config: {
        type: viz === 'bubble' ? 'bubble' : 'scatter',
        data: {
          datasets: [
            {
              label: `${a.field} vs ${b.field}`,
              data: pts,
              backgroundColor: 'rgba(45,107,228,0.55)',
              borderColor: PALETTE[0],
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { type: 'linear', title: { display: true, text: a.field } },
            y: { type: 'linear', title: { display: true, text: b.field } },
          },
        },
      },
    }
  }

  if (viz === 'funnel') {
    if (!series.length) return { kind: 'empty', message: noDataMsg }
    const s0 = series[0]!
    const sorted = [...s0.data].sort((a, b) => b - a).slice(0, 12)
    const labs = sorted.map((_, i) => String(i + 1))
    return {
      kind: 'chart',
      config: {
        type: 'bar',
        data: {
          labels: labs,
          datasets: [{ label: s0.label, data: sorted, backgroundColor: PALETTE[0], borderRadius: 4 }],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { x: { beginAtZero: true }, y: { grid: { display: false } } },
        },
      },
    }
  }

  if (viz === 'treemapBar') {
    if (!layer0 || !f0) return { kind: 'empty', message: noDataMsg }
    const { labels: cl, data } = categoryDistribution(layer0, f0, 10)
    if (!data.length) return { kind: 'empty', message: noDataMsg }
    return {
      kind: 'chart',
      config: {
        type: 'bar',
        data: {
          labels: cl,
          datasets: [{ label: f0, data, backgroundColor: cl.map((_, i) => PALETTE[i % PALETTE.length]!), borderRadius: 4 }],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
        },
      },
    }
  }

  if (!hasNumeric && series.length === 0) {
    if (layer0 && f0) {
      const { labels: cl, data } = categoryDistribution(layer0, f0, 12)
      if (!data.length) return { kind: 'empty', message: noDataMsg }
      const barType: ChartType = viz === 'horizontalBar' ? 'bar' : 'bar'
      const indexAxis = viz === 'horizontalBar' ? ('y' as const) : undefined
      return {
        kind: 'chart',
        config: {
          type: barType,
          data: {
            labels: cl,
            datasets: [{ label: f0, data, backgroundColor: cl.map((_, i) => PALETTE[i % PALETTE.length]!) }],
          },
          options: {
            indexAxis,
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { font: { size: 9 } } } },
          },
        },
      }
    }
    return { kind: 'empty', message: noDataMsg }
  }

  const datasets = series.map((s, i) => ({
    type: (viz === 'line' || viz === 'area' ? 'line' : 'bar') as 'line' | 'bar',
    label: s.label,
    data: s.data,
    backgroundColor: viz === 'bar' || viz === 'barStack' ? PALETTE[i % PALETTE.length]! + 'cc' : undefined,
    borderColor: PALETTE[i % PALETTE.length]!,
    borderWidth: viz === 'line' || viz === 'area' ? 2 : 1,
    fill: viz === 'area',
    tension: 0.35,
    stack: viz === 'barStack' ? 's' : undefined,
    borderRadius: viz === 'bar' || viz === 'barStack' ? 4 : 0,
  }))

  const indexAxis = viz === 'horizontalBar' ? ('y' as const) : undefined
  const primary: ChartType =
    viz === 'line' || viz === 'area' ? 'line' : viz === 'horizontalBar' ? 'bar' : viz === 'barStack' ? 'bar' : 'bar'

  return {
    kind: 'chart',
    config: {
      type: primary,
      data: { labels, datasets },
      options: {
        indexAxis,
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: datasets.length > 1, position: 'bottom', labels: { boxWidth: 10, font: { size: 9 } } },
        },
        scales:
          primary === 'line' || primary === 'bar'
            ? {
                x: { ticks: { maxRotation: 0, font: { size: 9 } }, grid: { display: false } },
                y: { beginAtZero: true, ticks: { font: { size: 9 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
              }
            : undefined,
      },
    },
  }
}
