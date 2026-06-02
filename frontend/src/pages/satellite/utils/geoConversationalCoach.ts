/**
 * Unified conversational flow: one grounded / smart suggestion per step.
 */
import {
  buildSmartSuggestions,
  type SmartSuggestionItem,
  type SmartSuggestionsContext,
} from './smartSuggestionsEngine'

export type ConversationalStep = {
  id: string
  prompt: string
  insertText: string
  source: 'grounding' | 'smart'
}

function normalizeKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

function groundingChipToPrompt(chip: string): string {
  const c = chip.trim()
  if (/^more about:/i.test(c)) {
    const topic = c.replace(/^more about:\s*/i, '').trim()
    return topic ? `Tell me more about “${topic}” on the map.` : 'Tell me more about this place on the map.'
  }
  if (/route/i.test(c)) return 'Would you like directions or a route for your map pin?'
  if (/weather/i.test(c)) return 'Check weather conditions at your selected location?'
  if (/hotel|restaurant|nearby/i.test(c)) return c.endsWith('?') ? c : `${c}?`
  if (/elevation/i.test(c)) return 'Show elevation details for your map pin?'
  return c.endsWith('?') ? c : `${c}?`
}

function smartItemToPrompt(item: SmartSuggestionItem): string {
  if (item.description?.trim()) return item.description.trim()
  const t = item.title.trim()
  return t.endsWith('?') ? t : `${t}?`
}

function smartItemsToSteps(items: SmartSuggestionItem[]): ConversationalStep[] {
  return items
    .filter(i => i.insertText?.trim() || i.actionId)
    .map(i => ({
      id: i.id,
      prompt: smartItemToPrompt(i),
      insertText: (i.insertText ?? i.title).trim(),
      source: 'smart' as const,
    }))
}

export function buildConversationalFlow(opts: {
  groundingChips?: string[]
  smartContext?: Partial<SmartSuggestionsContext>
  smartEnabled?: boolean
  /** After the user has sent messages, deprioritize empty-draft composer chips. */
  hasConversation?: boolean
}): ConversationalStep[] {
  const seen = new Set<string>()
  const out: ConversationalStep[] = []

  const push = (step: ConversationalStep) => {
    const key = normalizeKey(step.insertText || step.prompt)
    if (!key || seen.has(key)) return
    seen.add(key)
    out.push(step)
  }

  for (const chip of opts.groundingChips ?? []) {
    const t = chip.trim()
    if (!t) continue
    push({
      id: `ground-${normalizeKey(t)}`,
      prompt: groundingChipToPrompt(t),
      insertText: t,
      source: 'grounding',
    })
  }

  if (opts.smartEnabled !== false) {
    const smart = buildSmartSuggestions(opts.smartContext ?? {})
    const filtered = opts.hasConversation
      ? smart.filter(i => i.category !== 'composer' || (i.score ?? 0) >= 70)
      : smart
    for (const step of smartItemsToSteps(filtered)) {
      push(step)
    }
  }

  return out.slice(0, 24)
}

export function pickConversationalStep(
  steps: ConversationalStep[],
  stepIndex: number,
): ConversationalStep | null {
  if (!steps.length) return null
  const i = ((stepIndex % steps.length) + steps.length) % steps.length
  return steps[i] ?? null
}
