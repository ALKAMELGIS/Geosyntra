import Papa from 'papaparse'
import type { EsriDataSource, EsriDataset, EsriDatasetRow } from './types'

function toNum(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function inferXY(row: Record<string, unknown>): EsriDatasetRow {
  const lat = toNum(row.lat ?? row.latitude ?? row.y)
  const lon = toNum(row.lon ?? row.lng ?? row.longitude ?? row.x)
  return { ...row, __x: lon ?? undefined, __y: lat ?? undefined }
}

async function parseCsvText(text: string, sourceId: string): Promise<EsriDataset> {
  const parsed = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true })
  const rows = (parsed.data || []).map(inferXY)
  const columns = parsed.meta.fields || Object.keys(rows[0] || {})
  return { sourceId, columns, rows }
}

async function parseGeoJson(json: any, sourceId: string): Promise<EsriDataset> {
  const features = Array.isArray(json?.features) ? json.features : []
  const rows: EsriDatasetRow[] = features.map((f: any) => {
    const props = f?.properties && typeof f.properties === 'object' ? f.properties : {}
    let x: number | undefined
    let y: number | undefined
    if (f?.geometry?.type === 'Point' && Array.isArray(f.geometry.coordinates)) {
      x = Number(f.geometry.coordinates[0])
      y = Number(f.geometry.coordinates[1])
    }
    return { ...props, __x: x, __y: y }
  })
  const columns = Object.keys(rows[0] || {})
  return { sourceId, columns, rows }
}

async function fetchArcGisRows(url: string, sourceId: string): Promise<EsriDataset> {
  const base = url.replace(/\/+$/, '')
  const q = `${base}/query?where=1%3D1&outFields=*&f=json&returnGeometry=true`
  const res = await fetch(q)
  if (!res.ok) throw new Error('ArcGIS query failed')
  const json = await res.json()
  const features = Array.isArray(json?.features) ? json.features : []
  const rows: EsriDatasetRow[] = features.map((f: any) => {
    const attrs = f?.attributes && typeof f.attributes === 'object' ? f.attributes : {}
    const geom = f?.geometry && typeof f.geometry === 'object' ? f.geometry : {}
    const x = toNum(geom.x)
    const y = toNum(geom.y)
    return { ...attrs, __x: x ?? undefined, __y: y ?? undefined }
  })
  const columns = Object.keys(rows[0] || {})
  return { sourceId, columns, rows }
}

export async function loadDataset(source: EsriDataSource, file?: File | null): Promise<EsriDataset> {
  if (!source.enabled) return { sourceId: source.id, columns: [], rows: [] }
  if (source.kind === 'csv-file' && file) {
    return parseCsvText(await file.text(), source.id)
  }
  if (source.kind === 'csv-url' && source.url) {
    const res = await fetch(source.url)
    return parseCsvText(await res.text(), source.id)
  }
  if ((source.kind === 'geojson-file' || source.kind === 'geojson-url') && (file || source.url)) {
    const text = file ? await file.text() : await (await fetch(source.url as string)).text()
    return parseGeoJson(JSON.parse(text), source.id)
  }
  if (source.kind === 'arcgis-rest' && source.url) {
    return fetchArcGisRows(source.url, source.id)
  }
  return { sourceId: source.id, columns: [], rows: [] }
}

export function applyFilters(dataset: EsriDataset, byField: Record<string, string[]>) {
  const entries = Object.entries(byField).filter(([, v]) => v.length)
  if (!entries.length) return dataset
  const rows = dataset.rows.filter((row) =>
    entries.every(([field, selected]) => selected.includes(String(row[field] ?? ''))),
  )
  return { ...dataset, rows }
}

export function applyViewport(dataset: EsriDataset, bbox?: [number, number, number, number] | null) {
  if (!bbox) return dataset
  const [minX, minY, maxX, maxY] = bbox
  const rows = dataset.rows.filter((row) => {
    const x = Number(row.__x)
    const y = Number(row.__y)
    return Number.isFinite(x) && Number.isFinite(y) && x >= minX && x <= maxX && y >= minY && y <= maxY
  })
  return { ...dataset, rows }
}
