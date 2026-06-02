export type AddLayerStatusKind = 'info' | 'success' | 'error' | 'progress'

/** Classify footer status text so info/success are not shown as errors. */
export function inferAddLayerStatusKind(message: string): AddLayerStatusKind {
  const msg = String(message || '').trim()
  if (!msg) return 'info'
  const lower = msg.toLowerCase()

  if (
    /^(failed|error|unsupported|invalid|cannot |could not|enter |no drawable|no layers|not valid|not a valid|not supported|please compress|please convert)/i.test(
      msg,
    ) ||
    lower.includes('query failed') ||
    lower.includes('discover failed')
  ) {
    return 'error'
  }

  if (/^(connecting|adding|downloading|reading|processing|importing|syncing)/i.test(msg)) {
    return 'progress'
  }

  if (/^(added|imported|completed:|layer synced|database connection profile saved)/i.test(msg)) {
    return 'success'
  }

  if (
    /^(ready|found \d+|layer selected|choose a file|upload vector|arcgis:|this site is using)/i.test(msg) ||
    lower.includes('click add') ||
    lower.includes('click “import') ||
    lower.includes('pick one') ||
    lower.includes('select a layer') ||
    lower.includes('browse) or drop')
  ) {
    return 'info'
  }

  return 'info'
}

export function appendArcgisToken(url: string, token: string): string {
  if (!token.trim()) return url
  try {
    const u = new URL(url)
    u.searchParams.set('token', token.trim())
    return u.toString()
  } catch {
    return url
  }
}

export async function fetchArcgisJson(url: string, token = ''): Promise<Record<string, unknown>> {
  const finalUrl = appendArcgisToken(url, token)
  const res = await fetch(finalUrl)
  let json: Record<string, unknown> = {}
  try {
    json = (await res.json()) as Record<string, unknown>
  } catch {
    /* non-json body */
  }
  const err = json?.error as { message?: string } | undefined
  if (err && typeof err === 'object') {
    throw new Error(String(err.message || 'ArcGIS service returned an error.'))
  }
  if (!res.ok) {
    throw new Error(`ArcGIS request failed (${res.status}).`)
  }
  return json
}

export type NormalizedArcgisService = {
  serviceBase: string
  /** When URL already points at `/FeatureServer/{id}` */
  directLayerId: number | null
}

export function normalizeArcgisFeatureServiceInput(raw: string): NormalizedArcgisService {
  let baseUrl = raw.trim()
  if (!baseUrl) return { serviceBase: '', directLayerId: null }
  if (!/^https?:\/\//i.test(baseUrl)) baseUrl = `https://${baseUrl}`
  const clean = baseUrl.replace(/[?#].*$/, '').replace(/\/+$/, '')

  const direct = clean.match(/\/(FeatureServer|MapServer)\/(\d+)$/i)
  if (direct) {
    return {
      serviceBase: clean.replace(/\/\d+$/i, ''),
      directLayerId: Number(direct[2]),
    }
  }

  if (/\/(FeatureServer|MapServer)$/i.test(clean)) {
    return { serviceBase: clean, directLayerId: null }
  }

  if (/\/rest\/services\/[^/]+$/i.test(clean)) {
    return { serviceBase: `${clean}/FeatureServer`, directLayerId: null }
  }

  return { serviceBase: `${clean}/FeatureServer`, directLayerId: null }
}

export type DiscoveredArcgisLayer = {
  id: number
  name: string
  url: string
  kind: 'layer' | 'table'
  geometryType?: string
}

export function isMappableArcgisLayer(layer: DiscoveredArcgisLayer): boolean {
  if (layer.kind === 'table') return false
  const gt = String(layer.geometryType || '').toLowerCase()
  if (!gt || gt === 'esrigeometrynull') return false
  return true
}

export function discoverArcgisLayersFromServiceJson(
  serviceBase: string,
  discover: Record<string, unknown>,
): DiscoveredArcgisLayer[] {
  const layers = Array.isArray(discover?.layers) ? discover.layers : []
  const tables = Array.isArray(discover?.tables) ? discover.tables : []
  return [
    ...layers.map((l: Record<string, unknown>) => ({ ...l, kind: 'layer' as const })),
    ...tables.map((t: Record<string, unknown>) => ({ ...t, kind: 'table' as const })),
  ]
    .filter((l: Record<string, unknown>) => typeof l?.id === 'number' && typeof l?.name === 'string')
    .map((l: Record<string, unknown>) => ({
      id: l.id as number,
      name: l.name as string,
      kind: l.kind as 'layer' | 'table',
      url: `${serviceBase}/${l.id}`,
      geometryType: typeof l?.geometryType === 'string' ? (l.geometryType as string) : undefined,
    }))
}
