/**
 * Geo AI Chat: Claude + data context from GIS Content (saved layers) and Develop Dashboard Data pane snapshot.
 */

import { gatewayClaudeMessages } from './apiGatewayClient'
import { formatFeaturePropertiesForGeoAi, type ArcgisLayerDefLite } from './arcgisAttributeDisplay'
import { DEVELOP_DATA_CONTEXT_LS_KEY, type GeoAiChatTurn } from './geoAiChatConstants'
import { mustUseApiGateway } from './platformTokenRuntime'
import { loadGisMapSavedLayers } from './gisMapLayerStore'
import type { LayerData } from './gisLayerTypes'
import { buildLayerIdValueCatalogSnippet, summarizeGeoAiMapLayers } from './geoExplorerLayerContext'
import type { GeoAiMapLayer } from './geoExplorerLayerContext'

export { DEVELOP_DATA_CONTEXT_LS_KEY, GEO_AI_CHAT_SYSTEM_BASE, type GeoAiChatTurn } from './geoAiChatConstants'

function layerFields(l: LayerData): string[] {
  const any = l as { fields?: string[] }
  return Array.isArray(any.fields) ? any.fields : []
}

export function summarizeGisLayer(l: LayerData): string {
  const fields = layerFields(l).slice(0, 48).join(', ')
  let sample = ''
  const data = l.data as { features?: Array<{ properties?: Record<string, unknown> }> } | undefined
  if (data?.features?.length) {
    const ft = data.features[0]
    const props = ft?.properties
    const arcDef =
      l.source === 'arcgis'
        ? ((l as { arcgisLayerDefinition?: ArcgisLayerDefLite | null }).arcgisLayerDefinition ?? undefined)
        : undefined
    if (props && typeof props === 'object') {
      const shown =
        arcDef && typeof arcDef === 'object'
          ? formatFeaturePropertiesForGeoAi(
              props as Record<string, unknown>,
              ft as { properties?: Record<string, unknown> },
              arcDef,
            )
          : props
      const label = arcDef && typeof arcDef === 'object' ? 'example attributes (domain/subtype descriptions)' : 'example attributes'
      sample = ` | ${label}: ${JSON.stringify(shown).slice(0, 420)}`
    }
    const feats = data.features as Array<{ properties?: Record<string, unknown> }>
    const cat = buildLayerIdValueCatalogSnippet(feats, 2400)
    if (cat) sample += ` | ${cat}`
  }
  return `- ${l.name} (type=${l.type}, source=${l.source ?? 'n/a'}, visible=${l.visible}) fields=[${fields || '—'}]${sample}`
}

/** GIS Content layers only (IndexedDB), for Geosyntra Chat and similar. */
export async function buildGisContentLayersContext(maxChars = 40000): Promise<string> {
  try {
    const layers = await loadGisMapSavedLayers()
    let block =
      layers.length > 0
        ? '### GIS Content (layers saved in this browser)\n' + layers.map(summarizeGisLayer).join('\n')
        : '### GIS Content\n(no saved layers yet — add layers on Satellite Intelligence and save them to attach data here).'
    if (block.length > maxChars) block = `${block.slice(0, maxChars)}\n[…truncated…]`
    return block
  } catch {
    return '### GIS Content\n(could not read saved layers).'
  }
}

export type { GeoAiMapLayer } from './geoExplorerLayerContext'

/** Build a single text block appended to the system prompt (truncated for safety). */
export async function buildGeoAiDataContext(
  maxChars = 48000,
  opts?: { satelliteLayers?: GeoAiMapLayer[]; includeGisSavedLayers?: boolean },
): Promise<string> {
  const chunks: string[] = []
  const includeGisSavedLayers = opts?.includeGisSavedLayers !== false

  if (opts?.satelliteLayers?.length) {
    const cap = Math.min(30000, Math.max(8000, maxChars - 12000))
    chunks.push(
      '### Satellite Imagery — Added layers (visible vector layers on this map session)\n' +
        summarizeGeoAiMapLayers(opts.satelliteLayers, cap),
    )
  }

  if (includeGisSavedLayers) {
    try {
      const layers = await loadGisMapSavedLayers()
      if (layers.length) {
        chunks.push(
          '### GIS Content (layers saved in this browser)\n' + layers.map(summarizeGisLayer).join('\n'),
        )
      } else {
        chunks.push('### GIS Content\n(no saved layers in IndexedDB for this browser yet).')
      }
    } catch {
      chunks.push('### GIS Content\n(could not read saved layers).')
    }
  } else {
    chunks.push(
      '### GIS Content\n(Omitted on this page — Geo AI uses only layers added on this map session.)',
    )
  }

  try {
    if (typeof localStorage === 'undefined') {
      chunks.push('### Develop Dashboard — Data\n(localStorage unavailable).')
    } else {
      const raw = localStorage.getItem(DEVELOP_DATA_CONTEXT_LS_KEY)
      if (raw) {
        chunks.push('### Develop Dashboard — Data pane snapshot (JSON)\n' + raw.slice(0, maxChars))
      } else {
        chunks.push(
          '### Develop Dashboard — Data\n(no snapshot yet). Open Develop Dashboard and use the Data panel (layers / CSV) so the app can record a summary here.',
        )
      }
    }
  } catch {
    chunks.push('### Develop Dashboard\n(could not read snapshot).')
  }

  let out = chunks.join('\n\n')
  if (out.length > maxChars) out = `${out.slice(0, maxChars)}\n\n[…context truncated…]`
  return out
}

const CLAUDE_MODEL_CANDIDATES = ['claude-3-5-haiku-20241022', 'claude-3-5-sonnet-20241022'] as const

type AnthropicContentBlock = { type: 'text'; text: string }

type AnthropicMessage = { role: 'user' | 'assistant'; content: string | AnthropicContentBlock[] }

function toAnthropicMessages(turns: GeoAiChatTurn[]): AnthropicMessage[] {
  return turns.map(t => ({
    role: t.role,
    content: [{ type: 'text', text: t.text } satisfies AnthropicContentBlock],
  }))
}

/** One completion; `turns` should be prior user/assistant pairs (text only), then caller appends latest user separately. */
export async function claudeGeoAiComplete(params: {
  apiKey: string
  system: string
  turns: GeoAiChatTurn[]
  userMessage: string
}): Promise<string> {
  const { apiKey, system, turns, userMessage } = params

  if (mustUseApiGateway() || apiKey === '__gateway__') {
    return gatewayClaudeMessages({ system, turns, userMessage })
  }
  const messages: AnthropicMessage[] = [...toAnthropicMessages(turns), { role: 'user', content: userMessage }]

  let lastErr = 'Unknown error'
  for (const model of CLAUDE_MODEL_CANDIDATES) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system,
        messages,
      }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      error?: { message?: string }
      content?: Array<{ type?: string; text?: string }>
    }
    if (!res.ok) {
      lastErr = data?.error?.message || res.statusText || `HTTP ${res.status}`
      if (res.status === 404 || res.status === 400) continue
      throw new Error(lastErr)
    }
    const text = data.content?.find(c => c.type === 'text')?.text?.trim()
    if (text) return text
    lastErr = 'Empty Claude response'
  }
  throw new Error(lastErr)
}
