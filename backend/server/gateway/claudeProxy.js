const CLAUDE_MODEL_CANDIDATES = ['claude-3-5-haiku-20241022', 'claude-3-5-sonnet-20241022']

/**
 * @param {{
 *   apiKey: string
 *   system: string
 *   messages: Array<{ role: 'user' | 'assistant'; content: string | Array<{ type: string; text: string }> }>
 *   max_tokens?: number
 * }} params
 */
export async function claudeMessagesServer(params) {
  const { apiKey, system, messages } = params
  const max_tokens = Math.min(Math.max(Number(params.max_tokens) || 4096, 256), 8192)

  let lastErr = 'Unknown error'
  for (const model of CLAUDE_MODEL_CANDIDATES) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens, system, messages }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      lastErr = data?.error?.message || res.statusText || `HTTP ${res.status}`
      if (res.status === 404 || res.status === 400) continue
      const err = new Error(lastErr)
      err.code = res.status === 401 ? 'claude_auth' : 'claude_upstream'
      throw err
    }
    const text = data?.content?.find(c => c.type === 'text')?.text?.trim()
    if (text) return { text, model }
    lastErr = 'Empty Claude response'
  }
  const err = new Error(lastErr)
  err.code = 'claude_empty'
  throw err
}
