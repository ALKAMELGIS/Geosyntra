import { geminiGenerateContent, type GeminiContent } from './geoExplorerGemini'

export const AGRO_AI_CHAT_SYSTEM = `You are AgriCloud AI Agro-Chat, a concise agricultural data assistant.

You must answer ONLY using the GIS Content context appended below (layers saved from GIS Map in this browser). If something is not in that context, say so briefly and suggest saving layers in GIS Map.

Style: clear, short paragraphs or bullet lists; no invented field names, statistics, or coordinates.`

export type AgroChatTurn = { role: 'user' | 'assistant'; text: string }

function geminiContentsFromTurns(turns: AgroChatTurn[], userMessage: string): GeminiContent[] {
  const rows: GeminiContent[] = turns.map(t => ({
    role: t.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: t.text }],
  }))
  rows.push({ role: 'user', parts: [{ text: userMessage }] })
  return rows
}

export async function agroChatWithGemini(params: {
  apiKey: string
  systemInstruction: string
  turns: AgroChatTurn[]
  userMessage: string
}): Promise<string> {
  const { apiKey, systemInstruction, turns, userMessage } = params
  return geminiGenerateContent({
    apiKey,
    systemInstruction,
    contents: geminiContentsFromTurns(turns, userMessage),
  })
}

const DEEPSEEK_MODEL = 'deepseek-chat'

export async function agroChatWithDeepSeek(params: {
  apiKey: string
  system: string
  turns: AgroChatTurn[]
  userMessage: string
}): Promise<string> {
  const { apiKey, system, turns, userMessage } = params
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [{ role: 'system', content: system }]
  for (const t of turns) {
    messages.push({ role: t.role === 'user' ? 'user' : 'assistant', content: t.text })
  }
  messages.push({ role: 'user', content: userMessage })

  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages,
      max_tokens: 4096,
    }),
  })
  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string }
    choices?: Array<{ message?: { content?: string } }>
  }
  if (!res.ok) {
    throw new Error(data?.error?.message || res.statusText || `HTTP ${res.status}`)
  }
  const text = data.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error('Empty DeepSeek response')
  return text
}
