import { getSentinelHubAccessToken } from './sentinelHubAccessToken'
import { getSentinelHubWmsBaseUrl, getSentinelHubWmsInstanceId } from './sentinelHubWmsInstance'

export type SentinelHubWmsLayerInfo = { name: string; title: string }

function normalizeWmsLayerTitleKey(title: string): string {
  return String(title || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function parseWmsLayersFromCapabilitiesXml(text: string): SentinelHubWmsLayerInfo[] {
  const xml = new DOMParser().parseFromString(text, 'application/xml')
  if (xml.querySelector('ParserError') || xml.getElementsByTagName('ServiceException').length > 0) {
    return []
  }

  const parsed: SentinelHubWmsLayerInfo[] = []
  const seenNames = new Set<string>()
  const seenTitleKeys = new Set<string>()
  const nodes = Array.from(xml.getElementsByTagName('Layer'))
  nodes.forEach(node => {
    const childLayers = Array.from(node.children).filter(c => c.localName === 'Layer')
    if (childLayers.length > 0) return

    const nameNode = node.getElementsByTagName('Name')[0]
    if (!nameNode) return
    const name = (nameNode.textContent || '').trim()
    if (!name || name === 'WMS' || seenNames.has(name)) return

    const titleNode = node.getElementsByTagName('Title')[0]
    let title = (titleNode?.textContent || name).trim()
    if (name === 'NDWI' && /Moisture Index \(NDWI\)/i.test(title)) title = 'NDWI'
    const titleKey = normalizeWmsLayerTitleKey(title)
    if (titleKey && seenTitleKeys.has(titleKey)) return
    seenNames.add(name)
    if (titleKey) seenTitleKeys.add(titleKey)
    parsed.push({ name, title })
  })
  return parsed
}

export async function fetchSentinelHubWmsLayers(): Promise<SentinelHubWmsLayerInfo[]> {
  const instanceId = getSentinelHubWmsInstanceId().trim()
  if (!instanceId) return []

  const token = getSentinelHubAccessToken().trim()
  const url = `${getSentinelHubWmsBaseUrl()}?SERVICE=WMS&REQUEST=GetCapabilities`

  const request = async (useAuth: boolean) => {
    const headers: HeadersInit = {}
    if (useAuth && token) headers.Authorization = `Bearer ${token}`
    return fetch(url, { headers, cache: 'no-store' })
  }

  let response = await request(Boolean(token))
  if (!response.ok && token) {
    response = await request(false)
  }
  if (!response.ok) {
    console.warn('[sentinel-hub] GetCapabilities failed', response.status, instanceId)
    return []
  }

  const text = await response.text()
  return parseWmsLayersFromCapabilitiesXml(text)
}
