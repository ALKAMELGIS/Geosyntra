import { useMemo } from 'react'
import {
  buildSmartSuggestions,
  type SmartSuggestionsContext,
} from '../../utils/smartSuggestionsEngine'
import type { SmartSuggestionActionPayload } from './smart-suggestions-panel'
import './smart-suggestions.css'

const MAX_INLINE = 3

export type SmartSuggestionsInlineStripProps = {
  context: SmartSuggestionsContext
  disabled?: boolean
  onSelect: (payload: SmartSuggestionActionPayload) => void
}

export function SmartSuggestionsInlineStrip({
  context,
  disabled,
  onSelect,
}: SmartSuggestionsInlineStripProps) {
  const items = useMemo(() => {
    const all = buildSmartSuggestions(context)
    return all
      .filter(i => i.insertText?.trim())
      .slice(0, MAX_INLINE)
  }, [context])

  if (items.length === 0) return null

  return (
    <div className="geo-chat-smart-inline" role="list" aria-label="Smart suggestions">
      {items.map(item => {
        const label = item.title.trim() || item.insertText!.trim()
        return (
          <button
            key={item.id}
            type="button"
            role="listitem"
            className="geo-chat-smart-inline__chip"
            disabled={disabled}
            title={item.description ?? item.insertText}
            onClick={() =>
              onSelect({
                item,
                insertText: item.insertText,
              })
            }
          >
            <span className="geo-chat-smart-inline__chip-text">{label}</span>
          </button>
        )
      })}
    </div>
  )
}
