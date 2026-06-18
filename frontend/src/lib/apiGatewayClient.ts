/**
 * GeoAI Backend Gateway client — vendor secrets never enter the browser.
 */
import { resolveApiUrl } from './apiClient'
import { readAccessToken } from './auth'
import type { GatewayGeminiParams, PlatformCapabilities } from './platformTokenRuntime'

function authHeaders(): HeadersInit {
  const token = readAccessToken()
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

async function gatewayFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(resolveApiUrl(path), {
    ...init,
    credentials: 'include',
    headers: authHeaders(init?.headers),
  })
}

export async function fetchGatewayStatus(): Promise<{
  ok: boolean
  revision?: number
  capabilities?: PlatformCapabilities
  error?: string
}> {
  try {
    const res = await gatewayFetch('/api/gateway/status')
    const data = (await res.json()) as {
      ok?: boolean
      revision?: number
      capabilities?: PlatformCapabilities
      error?: string
    }
    if (!res.ok) return { ok: false, error: data?.error || res.statusText }
    return { ok: true, revision: data.revision, capabilities: data.capabilities }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network' }
  }
}

export async function fetchMapboxPublicTokenFromGateway(): Promise<{
  ok: boolean
  token?: string | null
  error?: string
}> {
  try {
    const res = await gatewayFetch('/api/config/mapbox')
    const data = (await res.json()) as { ok?: boolean; token?: string | null; error?: string }
    if (!res.ok) return { ok: false, error: data?.error || res.statusText }
    return { ok: true, token: data.token ?? null }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network' }
  }
}

export async function gatewayGeminiGenerateContent(
  params: GatewayGeminiParams,
): Promise<string> {
  const res = await gatewayFetch('/api/gateway/gemini/generate-content', {
    method: 'POST',
    body: JSON.stringify(params),
  })
  const data = (await res.json()) as {
    ok?: boolean
    text?: string
    message?: string
    error?: string
  }
  if (!res.ok) {
    throw new Error(data?.message || data?.error || res.statusText || 'Gemini gateway failed')
  }
  const text = data.text?.trim()
  if (!text) throw new Error('Empty model response')
  return text
}

export type GatewayChatTurn = { role: 'user' | 'assistant'; text: string }

export async function gatewayClaudeMessages(params: {
  system: string
  turns: GatewayChatTurn[]
  userMessage: string
  max_tokens?: number
}): Promise<string> {
  const res = await gatewayFetch('/api/gateway/claude/messages', {
    method: 'POST',
    body: JSON.stringify(params),
  })
  const data = (await res.json()) as {
    ok?: boolean
    text?: string
    message?: string
    error?: string
  }
  if (!res.ok) {
    throw new Error(data?.message || data?.error || res.statusText || 'Claude gateway failed')
  }
  const text = data.text?.trim()
  if (!text) throw new Error('Empty model response')
  return text
}

export async function gatewayDeepSeekChat(params: {
  system: string
  turns: GatewayChatTurn[]
  userMessage: string
  model?: string
  max_tokens?: number
}): Promise<string> {
  const res = await gatewayFetch('/api/gateway/deepseek/chat', {
    method: 'POST',
    body: JSON.stringify(params),
  })
  const data = (await res.json()) as {
    ok?: boolean
    text?: string
    message?: string
    error?: string
  }
  if (!res.ok) {
    throw new Error(data?.message || data?.error || res.statusText || 'DeepSeek gateway failed')
  }
  const text = data.text?.trim()
  if (!text) throw new Error('Empty model response')
  return text
}

export async function fetchSentinelCredentialsFromGateway(): Promise<{
  ok: boolean
  accessToken?: string | null
  wmsInstanceId?: string | null
  error?: string
}> {
  try {
    const res = await gatewayFetch('/api/gateway/sentinel/credentials')
    const data = (await res.json()) as {
      ok?: boolean
      accessToken?: string | null
      wmsInstanceId?: string | null
      error?: string
    }
    if (!res.ok) return { ok: false, error: data?.error || res.statusText }
    return {
      ok: true,
      accessToken: data.accessToken ?? null,
      wmsInstanceId: data.wmsInstanceId ?? null,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network' }
  }
}

export async function gatewayOpenAiChat(params: {
  messages: Array<{ role: string; content: unknown }>
  model?: string
  max_tokens?: number
}): Promise<string> {
  const res = await gatewayFetch('/api/gateway/openai/chat', {
    method: 'POST',
    body: JSON.stringify(params),
  })
  const data = (await res.json()) as {
    ok?: boolean
    text?: string
    message?: string
    error?: string
  }
  if (!res.ok) {
    throw new Error(data?.message || data?.error || res.statusText || 'OpenAI gateway failed')
  }
  const text = data.text?.trim()
  if (!text) throw new Error('Empty model response')
  return text
}
