import { getSentinelHubAccessToken } from './sentinelHubAccessToken'
import { getSentinelHubWmsBaseUrl } from './sentinelHubWmsInstance'

export type SentinelHubWmsLayerInfo = { name: string; title: string }

export async function fetchSentinelHubWmsLayers(): Promise<SentinelHubWmsLayerInfo[]> {
  const token = getSentinelHubAccessToken().trim()
  const url = `${getSentinelHubWmsBaseUrl()}?SERVICE=WMS&REQUEST=GetCapabilities`
  const headers: HeadersInit = {}
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(url, { headers, cache: 'no-store' })
  if (!response.ok) return []

  const text = await response.text()
  const xml = new DOMParser().parseFromString(text, 'application/xml')
  if (xml.querySelector('ParserError') || xml.getElementsByTagName('ServiceException').length > 0) {
    return []
  }

  const parsed: SentinelHubWmsLayerInfo[] = []
  const nodes = Array.from(xml.getElementsByTagName('Layer'))
  nodes.forEach(node => {
    const nameNode = node.getElementsByTagName('Name')[0]
    if (!nameNode) return
    const titleNode = node.getElementsByTagName('Title')[0]
    const name = nameNode.textContent || ''
    let title = (titleNode?.textContent || name).trim()
    if (name === 'NDWI' && /Moisture Index \(NDWI\)/i.test(title)) title = 'NDWI'
    if (name && !parsed.some(l => l.name === name)) parsed.push({ name, title })
  })
  return parsed
}
