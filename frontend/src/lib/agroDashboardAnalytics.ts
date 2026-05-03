import type { Feature, FeatureCollection } from 'geojson'

export type AgroDashSourceKind = 'gis' | 'upload' | 'arcgis' | 'url'

/** Compact aggregates only (fits localStorage; no raw geometry). */
export type AgroDashSource = {
  id: string
  name: string
  kind: AgroDashSourceKind
  addedAt: number
  featureCount: number
  primaryKey: string | null
  totalPrimary: number
  categoryKey: string | null
  categoryCounts: { label: string; count: number }[]
  monthlyBins: number[]
  secondaryBins: number[]
  tableRows: { label: string; value: number; pct: number; status: string }[]
}

const LS_KEY = 'agro-dashboard-sources-v1'

const ID_SKIP = new Set(
  ['objectid', 'fid', 'globalid', 'shape_length', 'shape_area', 'st_area', 'st_length'].map(s => s.toLowerCase()),
)

function isNumeric(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function numFromProp(v: unknown): number | null {
  if (isNumeric(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(/,/g, ''))
    return Number.isFinite(n) ? n : null
  }
  return null
}

function collectFeatures(fc: unknown): Feature[] {
  if (!fc || typeof fc !== 'object') return []
  const o = fc as FeatureCollection
  if (o.type === 'FeatureCollection' && Array.isArray(o.features)) return o.features
  if ((o as { type?: string }).type === 'Feature' && 'geometry' in o) return [o as unknown as Feature]
  return []
}

function scoreNumericKey(key: string, sum: number): number {
  const k = key.toLowerCase()
  let bonus = 0
  if (/yield|harvest|kg|ton|area|ha|crop|prod|amount|value|total|qty|quantity/.test(k)) bonus += 50
  if (ID_SKIP.has(k) || k.endsWith('_id')) bonus -= 100
  return sum + bonus
}

export function aggregateGeoJsonToSource(params: {
  name: string
  kind: AgroDashSourceKind
  geojson: unknown
}): AgroDashSource | null {
  const features = collectFeatures(params.geojson)
  if (features.length === 0) return null

  const numericSums = new Map<string, number>()
  const stringCardinality = new Map<string, Map<string, number>>()

  for (const f of features) {
    const p = (f.properties ?? {}) as Record<string, unknown>
    for (const [key, val] of Object.entries(p)) {
      const n = numFromProp(val)
      if (n != null) {
        numericSums.set(key, (numericSums.get(key) ?? 0) + n)
      } else if (typeof val === 'string' && val.trim() !== '') {
        let m = stringCardinality.get(key)
        if (!m) {
          m = new Map()
          stringCardinality.set(key, m)
        }
        const s = val.trim().slice(0, 80)
        m.set(s, (m.get(s) ?? 0) + 1)
      }
    }
  }

  let primaryKey: string | null = null
  let bestScore = -Infinity
  for (const [key, sum] of numericSums) {
    const sc = scoreNumericKey(key, sum)
    if (sc > bestScore) {
      bestScore = sc
      primaryKey = key
    }
  }
  if (!primaryKey && numericSums.size > 0) {
    primaryKey = [...numericSums.entries()].sort((a, b) => b[1] - a[1])[0][0]
  }

  let totalPrimary = primaryKey ? (numericSums.get(primaryKey) ?? 0) : 0
  if (!primaryKey) {
    totalPrimary = features.length
  }

  let categoryKey: string | null = null
  let categoryCounts: { label: string; count: number }[] = []
  for (const [key, m] of stringCardinality) {
    const uniq = m.size
    if (uniq >= 2 && uniq <= 24) {
      categoryKey = key
      categoryCounts = [...m.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8)
      break
    }
  }

  const monthlyBins = new Array(12).fill(0)
  const secondaryBins = new Array(12).fill(0)
  const n = features.length
  const per = Math.max(1, Math.ceil(n / 12))
  for (let i = 0; i < n; i++) {
    const bin = Math.min(11, Math.floor(i / per))
    const p = (features[i].properties ?? {}) as Record<string, unknown>
    const v1 = primaryKey ? numFromProp(p[primaryKey]) : 1
    monthlyBins[bin] += v1 != null ? v1 : 0
    const altKey = [...numericSums.keys()].find(k => k !== primaryKey)
    const v2 = altKey ? numFromProp(p[altKey]) : null
    secondaryBins[bin] += v2 != null ? v2 : 0
  }

  const maxVal = Math.max(1, ...monthlyBins)
  const tableRows: AgroDashSource['tableRows'] = []
  const labelKey =
    categoryKey ||
    [...stringCardinality.keys()].find(k => {
      const m = stringCardinality.get(k)!
      return m.size === n || m.size >= Math.min(8, n)
    }) ||
    primaryKey ||
    'Feature'

  for (let i = 0; i < Math.min(12, n); i++) {
    const p = (features[i].properties ?? {}) as Record<string, unknown>
    const rawLabel = labelKey && p[labelKey] != null ? String(p[labelKey]) : `#${i + 1}`
    const val = primaryKey ? numFromProp(p[primaryKey]) ?? 0 : 1
    const pct = Math.round((val / maxVal) * 100)
    const status = pct >= 70 ? 'Active' : pct >= 40 ? 'Active' : 'Fallow'
    tableRows.push({ label: rawLabel.slice(0, 42), value: Math.round(val), pct: Math.min(100, pct), status })
  }

  const id = `${params.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

  return {
    id,
    name: params.name,
    kind: params.kind,
    addedAt: Date.now(),
    featureCount: n,
    primaryKey,
    totalPrimary: Math.round(totalPrimary),
    categoryKey,
    categoryCounts,
    monthlyBins,
    secondaryBins,
    tableRows,
  }
}

/** Tabular CSV rows (no geometry) → synthetic features for aggregation. */
export function aggregateRowsToSource(params: {
  name: string
  kind: AgroDashSourceKind
  rows: Record<string, unknown>[]
}): AgroDashSource | null {
  if (!Array.isArray(params.rows) || params.rows.length === 0) return null
  const features = params.rows.map(row => ({
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: [0, 0] },
    properties: row,
  }))
  return aggregateGeoJsonToSource({
    name: params.name,
    kind: params.kind,
    geojson: { type: 'FeatureCollection', features },
  })
}

export function mergeSourcesForCharts(sources: AgroDashSource[]): {
  monthly: number[]
  secondary: number[]
  pie: { label: string; value: number }[]
  table: AgroDashSource['tableRows']
  totals: { sum: number; features: number; count: number }
} {
  if (sources.length === 0) {
    return { monthly: [], secondary: [], pie: [], table: [], totals: { sum: 0, features: 0, count: 0 } }
  }
  const monthly = new Array(12).fill(0)
  const secondary = new Array(12).fill(0)
  for (const s of sources) {
    for (let i = 0; i < 12; i++) {
      monthly[i] += s.monthlyBins[i] ?? 0
      secondary[i] += s.secondaryBins[i] ?? 0
    }
  }
  const catMap = new Map<string, number>()
  for (const s of sources) {
    for (const { label, count } of s.categoryCounts) {
      const k = `${s.name}: ${label}`
      catMap.set(k, (catMap.get(k) ?? 0) + count)
    }
  }
  let pie = [...catMap.entries()].map(([label, value]) => ({ label, value }))
  if (pie.length === 0) {
    pie = sources.map(s => ({ label: s.name, value: Math.max(1, s.totalPrimary) }))
  }
  const totalPie = pie.reduce((a, p) => a + p.value, 0) || 1
  pie = pie.map(p => ({ ...p, value: Math.round((p.value / totalPie) * 100) }))

  const table = sources.flatMap(s => s.tableRows).slice(0, 12)
  const sum = sources.reduce((a, s) => a + s.totalPrimary, 0)
  const features = sources.reduce((a, s) => a + s.featureCount, 0)
  return { monthly, secondary, pie, table, totals: { sum, features, count: sources.length } }
}

export function loadAgroDashSources(): AgroDashSource[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as AgroDashSource[]
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

export function saveAgroDashSources(sources: AgroDashSource[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(sources))
  } catch {
    /* quota */
  }
}

export function clearAgroDashSources() {
  try {
    localStorage.removeItem(LS_KEY)
  } catch {
    /* */
  }
}
