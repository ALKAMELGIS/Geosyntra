/**
 * Server-side Gemini generateContent — keys never sent to the browser.
 */

const GEMINI_MODEL_CANDIDATES = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-flash-latest',
  'gemini-2.5-pro',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-1.5-pro',
]

const GEMINI_API_VERSIONS = ['v1beta', 'v1']

function mergeSystemIntoContents(systemInstruction, contents) {
  const prefix = `System (follow strictly):\n${systemInstruction}\n\n---\n\n`
  const out = contents.map(row => ({
    role: row.role,
    parts: row.parts.map(part => ({ ...part })),
  }))
  const userIdx = out.findIndex(r => r.role === 'user')
  if (userIdx < 0) {
    return [{ role: 'user', parts: [{ text: prefix.trimEnd() }] }, ...out]
  }
  const parts = [...out[userIdx].parts]
  if (parts.length === 0) {
    parts.push({ text: prefix.trimEnd() })
  } else {
    const first = parts[0]
    if (typeof first?.text === 'string') {
      parts[0] = { text: prefix + first.text }
    } else {
      parts.unshift({ text: prefix.trimEnd() })
    }
  }
  out[userIdx] = { role: 'user', parts }
  return out
}

function isNonRetryableGeminiAuthError(message) {
  const m = String(message).toLowerCase()
  return (
    m.includes('api key not valid') ||
    m.includes('invalid api key') ||
    (m.includes('invalid argument') && m.includes('key'))
  )
}

function shouldTryNextGeminiModel(status, message) {
  const m = String(message).toLowerCase()
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

/**
 * @param {{ apiKey: string; systemInstruction: string; contents: Array<{ role: string; parts: unknown[] }> }} params
 */
export async function geminiGenerateContentServer(params) {
  const { apiKey, systemInstruction, contents } = params
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

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        lastErr = data?.error?.message || res.statusText || `HTTP ${res.status}`
        if (isNonRetryableGeminiAuthError(String(lastErr))) {
          const err = new Error(lastErr)
          err.code = 'gemini_auth'
          throw err
        }
        if (shouldTryNextGeminiModel(res.status, String(lastErr))) continue
        const err = new Error(lastErr)
        err.code = 'gemini_request'
        throw err
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
      return { text, model, apiVersion }
    }
  }

  const hint = /quota|exceeded|rate|billing|limit:\s*0/i.test(lastErr)
    ? ' Enable billing in Google AI Studio / Cloud console, or wait and retry.'
    : ''
  const err = new Error(`${lastErr}${hint}`)
  err.code = 'gemini_exhausted'
  throw err
}
