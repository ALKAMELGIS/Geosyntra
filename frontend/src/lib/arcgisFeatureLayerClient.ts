/**
 * ArcGIS FeatureServer client — root service URL + layerId (not sublayer URL in storage).
 * Queries GeoJSON in EPSG:4326 for Mapbox GL; supports pagination + portal token.
 */
import {
  appendArcgisToken,
  fetchArcgisJson,
  normalizeArcgisFeatureServiceInput,
} from './addSourceLayerHelpers'

export type ArcgisFeatureLayerRef = {
  serviceBase: string
  layerId: number
}

export type ArcgisLayerStorageFields = {
  sourceUrl?: string
  arcgisLayerId?: number
}

/** Parse FeatureServer root + numeric layer id from a sublayer or service URL. */
export function parseArcgisFeatureLayerRef(rawUrl: string): ArcgisFeatureLayerRef | null {
  const trimmed = String(rawUrl || '').trim()
  if (!trimmed) return null
  const { serviceBase, directLayerId } = normalizeArcgisFeatureServiceInput(trimmed)
  if (!serviceBase || directLayerId == null || !Number.isFinite(directLayerId)) return null
  return { serviceBase: serviceBase.replace(/\/+$/, ''), layerId: directLayerId }
}

/** Resolve stored layer fields (legacy sublayer URLs or root + arcgisLayerId). */
export function resolveArcgisFeatureLayerRef(fields: ArcgisLayerStorageFields): ArcgisFeatureLayerRef | null {
  const fromUrl = fields.sourceUrl ? parseArcgisFeatureLayerRef(fields.sourceUrl) : null
  if (fromUrl) return fromUrl
  const base = String(fields.sourceUrl || '').trim().replace(/\/+$/, '')
  const layerId = fields.arcgisLayerId
  if (!base || layerId == null || !Number.isFinite(layerId)) return null
  const { serviceBase } = normalizeArcgisFeatureServiceInput(base)
  if (!serviceBase) return null
  return { serviceBase: serviceBase.replace(/\/+$/, ''), layerId }
}

export function arcgisFeatureLayerItemUrl(ref: ArcgisFeatureLayerRef): string {
  return `${ref.serviceBase.replace(/\/+$/, '')}/${ref.layerId}`
}

export function resolveArcgisFeatureLayerToken(layerToken?: string, portalToken?: string): string {
  const layer = String(layerToken || '').trim()
  if (layer) return layer
  return String(portalToken || '').trim()
}

const DEFAULT_PAGE_SIZE = 2000

type GeoJsonFc = {
  type?: string
  features?: unknown[]
  properties?: { exceededTransferLimit?: boolean }
  error?: { message?: string }
}

/** Query all features as GeoJSON (EPSG:4326 / WGS84 for Mapbox). */
export async function queryArcgisFeatureLayerGeoJson(
  ref: ArcgisFeatureLayerRef,
  token = '',
): Promise<GeoJSON.FeatureCollection> {
  const base = arcgisFeatureLayerItemUrl(ref)
  const allFeatures: GeoJSON.Feature[] = []
  let offset = 0
  let page = 0
  const maxPages = 50

  while (page < maxPages) {
    const qUrl =
      `${base}/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=geojson` +
      `&resultOffset=${offset}&resultRecordCount=${DEFAULT_PAGE_SIZE}`
    const res = await fetch(appendArcgisToken(qUrl, token))
    let data: GeoJsonFc = {}
    try {
      data = (await res.json()) as GeoJsonFc
    } catch {
      /* non-json */
    }
    if (data?.error && typeof data.error === 'object') {
      throw new Error(String(data.error.message || 'ArcGIS query failed.'))
    }
    if (!res.ok) throw new Error(`ArcGIS query failed (${res.status}).`)
    if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
      throw new Error('Service did not return GeoJSON features. Check token, layer id, and permissions.')
    }
    allFeatures.push(...(data.features as GeoJSON.Feature[]))
    const exceeded = Boolean(data.properties?.exceededTransferLimit)
    if (!exceeded || data.features.length === 0) break
    offset += data.features.length
    page += 1
  }

  if (!allFeatures.length) {
    throw new Error('Layer returned zero features. Try another sublayer or adjust filters.')
  }

  return { type: 'FeatureCollection', features: allFeatures }
}

/** Load layer metadata from `{serviceBase}/{layerId}?f=pjson`. */
export async function fetchArcgisFeatureLayerPjson(
  ref: ArcgisFeatureLayerRef,
  token = '',
): Promise<Record<string, unknown> | null> {
  const url = `${arcgisFeatureLayerItemUrl(ref)}?f=pjson`
  try {
    return await fetchArcgisJson(url, token)
  } catch {
    return null
  }
}

/** Web Mercator (EPSG:3857 / 102100) extent → WGS84 bounds [minX, minY, maxX, maxY]. */
export function arcgisExtentToLngLatBounds(extent: {
  xmin?: number
  ymin?: number
  xmax?: number
  ymax?: number
  spatialReference?: { wkid?: number; latestWkid?: number }
}): [number, number, number, number] | null {
  const xmin = Number(extent.xmin)
  const ymin = Number(extent.ymin)
  const xmax = Number(extent.xmax)
  const ymax = Number(extent.ymax)
  if (![xmin, ymin, xmax, ymax].every(Number.isFinite)) return null

  const wkid = extent.spatialReference?.latestWkid ?? extent.spatialReference?.wkid
  const isWebMercator = wkid === 3857 || wkid === 102100 || wkid === 900913

  if (isWebMercator) {
    const toLng = (x: number) => (x / 20037508.342789244) * 180
    const toLat = (y: number) => {
      const latRad = Math.atan(Math.sinh((Math.PI * y) / 20037508.342789244))
      return (latRad * 180) / Math.PI
    }
    return [toLng(xmin), toLat(ymin), toLng(xmax), toLat(ymax)]
  }

  if (Math.abs(xmin) <= 180 && Math.abs(xmax) <= 180 && Math.abs(ymin) <= 90 && Math.abs(ymax) <= 90) {
    return [xmin, ymin, xmax, ymax]
  }

  return null
}

export function arcgisLayerFullExtentBounds(pjson: Record<string, unknown> | null): [number, number, number, number] | null {
  if (!pjson || typeof pjson !== 'object') return null
  const ext = pjson.extent as Record<string, unknown> | undefined
  if (ext && typeof ext === 'object') {
    return arcgisExtentToLngLatBounds(ext as Parameters<typeof arcgisExtentToLngLatBounds>[0])
  }
  const full = pjson.fullExtent as Record<string, unknown> | undefined
  if (full && typeof full === 'object') {
    return arcgisExtentToLngLatBounds(full as Parameters<typeof arcgisExtentToLngLatBounds>[0])
  }
  return null
}
