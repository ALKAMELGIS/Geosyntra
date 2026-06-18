/**
 * Gemini HTTP client — isolated from Geo Explorer contracts so Satellite Intelligence
 * does not pull API wiring into the same init graph as UI constants/types.
 *
 * Production: routes through GeoAI Backend Gateway (no API key in browser).
 * Legacy dev: direct Google API when VITE_ALLOW_CLIENT_API_SECRET_HYDRATION=true.
 */
import type { GeminiContent } from './geoExplorerContracts'
import { gatewayGeminiGenerateContent } from './apiGatewayClient'
import { mustUseApiGateway } from './platformTokenRuntime'

const GEMINI_MODEL_CANDIDATES = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-flash-latest',
  'gemini-2.5-pro',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-1.5-pro',
] as const

const GEMINI_API_VERSIONS = ['v1beta', 'v1'] as const

function mergeSystemIntoContents(systemInstruction: string, contents: GeminiContent[]): GeminiContent[] {
  const prefix = `System (follow strictly):\n${systemInstruction}\n\n---\n\n`
  const out: GeminiContent[] = contents.map(row => ({
    role: row.role,
    parts: row.parts.map(part => ({ ...part })),
  }))
  const userIdx = out.findIndex(r => r.role === 'user')
  if (userIdx < 0) {
    return [{ role: 'user', parts: [{ text: prefix.trimEnd() }] }, ...out]
  }
  const parts = [...out[userIdx]!.parts]
  if (parts.length === 0) {
    parts.push({ text: prefix.trimEnd() })
  } else {
    const first = parts[0] as { text?: string; inline_data?: { mime_type: string; data: string } }
    if (typeof first?.text === 'string') {
      parts[0] = { text: prefix + first.text }
    } else {
      parts.unshift({ text: prefix.trimEnd() })
    }
  }
  out[userIdx] = { role: 'user', parts }
  return out
}

function isNonRetryableGeminiAuthError(message: string): boolean {
  const m = message.toLowerCase()
  return (
    m.includes('api key not valid') ||
    m.includes('invalid api key') ||
    (m.includes('invalid argument') && m.includes('key'))
  )
}

function shouldTryNextGeminiModel(status: number, message: string): boolean {
  const m = message.toLowerCase()
  return (
    status === 404 ||
    status === 400 ||
    status === 403 ||
    status === 429 ||
    status === 503 ||
    m.includes('quota') ||
    m.includes('exceeded') ||
    m.includes('billing') ||
    m.includes('limit: 0') ||
    m.includes('resource_exhausted') ||
    m.includes('resource exhausted') ||
    m.includes('rate limit') ||
    m.includes('rate_limit') ||
    m.includes('overloaded') ||
    m.includes('not found') ||
    m.includes('is not found') ||
    m.includes('not supported') ||
    m.includes('permission_denied') ||
    m.includes('permission denied')
  )
}

export async function geminiGenerateContent(params: {
  apiKey?: string
  systemInstruction: string
  contents: GeminiContent[]
}): Promise<string> {
  const { systemInstruction, contents } = params

  if (mustUseApiGateway()) {
    return gatewayGeminiGenerateContent({ systemInstruction, contents })
  }

  const apiKey = String(params.apiKey || '').trim()
  if (!apiKey) {
    throw new Error(
      'Gemini is not configured. Platform Owner must add a Gemini key in API Manager (server gateway mode).',
    )
  }

  let lastErr = 'Unknown error'

  for (const model of GEMINI_MODEL_CANDIDATES) {
    for (const apiVersion of GEMINI_API_VERSIONS) {
      const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`
      const body =
        apiVersion === 'v1beta'
          ? {
              systemInstruction: { parts: [{ text: systemInstruction }] },
              contents,
            }
          : { contents: mergeSystemIntoContents(systemInstruction, contents) }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: { message?: string }
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
      }
      if (!res.ok) {
        lastErr = data?.error?.message || res.statusText || `HTTP ${res.status}`
        if (isNonRetryableGeminiAuthError(String(lastErr))) throw new Error(lastErr)
        if (shouldTryNextGeminiModel(res.status, String(lastErr))) continue
        throw new Error(lastErr)
      }
      const text =
        data?.candidates?.[0]?.content?.parts
          ?.map(p => p.text)
          .filter(Boolean)
          .join('') ?? ''
      if (!text) {
        lastErr = 'Empty model response'
        continue
      }
      return text
    }
  }

  const hint = /quota|exceeded|rate|billing|limit:\s*0/i.test(lastErr)
    ? ' Enable billing in Google AI Studio / Cloud console, or wait and retry; free-tier limits vary by model.'
    : ''
  throw new Error(`${lastErr}${hint}`)
}
