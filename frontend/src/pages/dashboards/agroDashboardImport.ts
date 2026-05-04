/**
 * Shared GIS / ArcGIS import helpers for Agro / GeoDash dashboards (no React).
 */

import type { LayerData } from '../satellite/components/LayerManager'
import { rowsFromFeatureCollection, trimRows } from './agroDashboardCharts'

export type DiscoveredArcLayer = {
  id: number
  name: string
  kind: 'layer' | 'table'
  url: string
  geometryType?: string
}

export function buildArcGisUrl(baseUrl: string, params: Record<string, string>) {
  const normalized = baseUrl.trim().replace(/#.*$/, '').replace(/\?.*$/, '').replace(/\/+$/, '')
  const u = new URL(normalized, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
  const search = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== '') search.set(k, v)
  })
  u.search = search.toString()
  return u.toString()
}

export function normalizeArcGisServiceUrl(raw: string) {
  const trimmed = raw.trim().replace(/#.*$/, '').replace(/\?.*$/, '').replace(/\/+$/, '')
  const parts = trimmed.split('/')
  const last = parts[parts.length - 1]
  const prev = parts[parts.length - 2]
  if (/^\d+$/.test(last) && (prev === 'FeatureServer' || prev === 'MapServer')) {
    return parts.slice(0, -1).join('/')
  }
  return trimmed
}

export async function fetchArcGisFeatureCollection(
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

export function isFeatureCollection(x: unknown): x is GeoJSON.FeatureCollection {
  return Boolean(
    x &&
      typeof x === 'object' &&
      (x as GeoJSON.FeatureCollection).type === 'FeatureCollection' &&
      Array.isArray((x as GeoJSON.FeatureCollection).features),
  )
}

export function gisLayerCanImportToDashboard(layer: LayerData): boolean {
  if (isFeatureCollection(layer.data)) return true
  if (layer.url && layer.source === 'arcgis') return true
  return false
}

export function uniqueRegistryKey(existingKeys: string[], displayName: string): string {
  const stem = (displayName.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '') || 'layer').toLowerCase()
  let key = stem
  let i = 0
  while (existingKeys.includes(key)) {
    i += 1
    key = `${stem}_${i}`
  }
  return key
}

export function newAgroSourceId() {
  return `src-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function agroFieldKey(sourceId: string, field: string) {
  return `${sourceId}|||${field}`
}

export function parseAgroFieldKey(key: string): { sourceId: string; field: string } {
  const i = key.indexOf('|||')
  if (i === -1) return { sourceId: key, field: '' }
  return { sourceId: key.slice(0, i), field: key.slice(i + 3) }
}

export function fieldsFromFeatureCollection(fc: GeoJSON.FeatureCollection): string[] {
  const f0 = fc.features[0]?.properties
  if (!f0 || typeof f0 !== 'object') return []
  return Object.keys(f0 as Record<string, unknown>)
}

export type AgroRegistrySource = {
  id: string
  name: string
  fields: string[]
  kind: 'feature' | 'table'
  rows: Record<string, unknown>[]
  /** Preserved for Mapbox when importing vector features */
  geojson: GeoJSON.FeatureCollection | null
}

export function sourceFromFeatureCollection(
  id: string,
  name: string,
  fc: GeoJSON.FeatureCollection,
  kind: 'feature' | 'table',
): AgroRegistrySource {
  return {
    id,
    name,
    fields: fieldsFromFeatureCollection(fc),
    kind,
    rows: trimRows(rowsFromFeatureCollection(fc)),
    geojson: fc,
  }
}

export function sourceFromTable(id: string, name: string, rows: Record<string, unknown>[], columns: string[]): AgroRegistrySource {
  return { id, name, fields: columns, kind: 'table', rows: trimRows(rows), geojson: null }
}
