const ARCGIS_ITEM_REST =
  /^https?:\/\/[^/]+\/sharing\/rest\/content\/items\/([0-9a-f]{32})\/?$/i

const ARCGIS_ITEM_HOME = /^https?:\/\/[^/]+\/home\/item\.html\?.*id=([0-9a-f]{32})/i

const ITEM_ID_IN_URL = /(?:items\/|[?&]id=)([0-9a-f]{32})\b/i

const DIRECT_MODEL = /\.(dlpk|onnx|pt|pth)(\?.*)?$/i

export const ARCGIS_MODEL_URL_PLACEHOLDER =
  'https://www.arcgis.com/sharing/rest/content/items/…'

export function isLikelyModelSourceUrl(url: string): boolean {
  const t = url.trim()
  if (!t) return false
  if (DIRECT_MODEL.test(t)) return true
  if (ARCGIS_ITEM_REST.test(t)) return true
  if (ARCGIS_ITEM_HOME.test(t)) return true
  return ITEM_ID_IN_URL.test(t)
}

export function extractArcgisItemId(url: string): string | null {
  const t = url.trim()
  const m1 = t.match(ARCGIS_ITEM_REST)
  if (m1) return m1[1]
  const m2 = t.match(ARCGIS_ITEM_HOME)
  if (m2) return m2[1]
  const m3 = t.match(ITEM_ID_IN_URL)
  return m3 ? m3[1] : null
}

export function normalizeArcgisItemRestUrl(url: string): string {
  const t = url.trim()
  const id = extractArcgisItemId(t)
  if (!id) return t
  try {
    const host = new URL(t).origin
    return `${host}/sharing/rest/content/items/${id}`
  } catch {
    return `https://www.arcgis.com/sharing/rest/content/items/${id}`
  }
}
