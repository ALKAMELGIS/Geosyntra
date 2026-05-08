import type { ChangeEvent, RefObject } from 'react'
import { useGeoAiSpeechRecognition } from '../../../hooks/useGeoAiSpeechRecognition'
import type { GeoExplorerCssPrefix } from './GeoExplorerGeminiChatBody'

export type GeoExplorerGeminiInputRowProps = {
  cssPrefix: GeoExplorerCssPrefix
  draft: string
  onDraftChange: (next: string) => void
  /** Send using current draft + attachments, or pass final voice text (skips stale draft read). */
  onSend: (voiceOverrideText?: string) => void
  busy: boolean
  /** When `showAttach` is true, image attach is shown and pending image gates Send. */
  pendingImage: { mime: string; base64: string } | null
  fileInputRef?: RefObject<HTMLInputElement | null>
  onAttachChange?: (e: ChangeEvent<HTMLInputElement>) => void
  textareaAriaLabel: string
  showAttach?: boolean
  enableVoice?: boolean
  /** Overrides default Geo AI placeholder (Claude / DeepSeek prompts). */
  placeholder?: string
  /** Dynamic context for smart suggestions/help words. */
  availableFields?: string[]
  availableNumericFields?: string[]
  availableLayers?: string[]
  availableGeometryOps?: string[]
  smartSuggestionsEnabled?: boolean
}

function pfx(prefix: GeoExplorerCssPrefix, part: string): string {
  return `${prefix}-${part}`
}

/**
 * Geo AI / Geo Explorer composer: textarea with inset mic, optional attach, send.
 */
export function GeoExplorerGeminiInputRow(props: GeoExplorerGeminiInputRowProps) {
  const {
    cssPrefix,
    draft,
    onDraftChange,
    onSend,
    busy,
    pendingImage,
    fileInputRef,
    onAttachChange,
    textareaAriaLabel,
    showAttach = true,
    enableVoice = true,
    placeholder = 'Describe a place, ask for directions, or plan a trip…',
    availableFields = [],
    availableNumericFields = [],
    availableLayers = [],
    availableGeometryOps = ['Within', 'Intersects', 'Buffer', 'Contains'],
    smartSuggestionsEnabled = true,
  } = props

  const voice = useGeoAiSpeechRecognition({
    disabled: busy || !enableVoice,
    onFinalTranscript: text => {
      const t = text.trim()
      if (!t) return
      onDraftChange(t)
      onSend(t)
    },
  })

  const onMicClick = () => {
    if (voice.listening) voice.stopListening()
    else {
      voice.clearError()
      voice.startListening()
    }
  }

  const q = draft.trim().toLowerCase()
  const opSuggestions =
    /احسب|calculate|sum|average|mean|count|min|max|statistics|group by|مجموع|متوسط|عدد|احص|إحصاء/.test(q) || !q
      ? ['Sum', 'Average', 'Count', 'Min', 'Max', 'Group By']
      : []
  const selectSuggestions =
    /حدد|select|where|filter|>|<|=|!|within|intersects|contains|buffer|اكبر|اصغر/.test(q) || !q
      ? ['>', '<', '>=', '<=', '=', '!=', ...availableGeometryOps]
      : []
  const quickActions = ['Count records', 'Range filter', 'Group by summary', 'Calculate field preview']
  const helpWords = ['field', 'layer', 'group by', 'sum', 'average', 'select where', 'within', 'intersects']

  const matchedFields =
    q.length >= 2
      ? availableFields.filter(f => f.toLowerCase().includes(q)).slice(0, 6)
      : availableFields.slice(0, 4)
  const matchedLayers =
    q.length >= 2
      ? availableLayers.filter(l => l.toLowerCase().includes(q)).slice(0, 4)
      : availableLayers.slice(0, 3)
  const numericHints =
    q.length >= 2
      ? availableNumericFields.filter(f => f.toLowerCase().includes(q)).slice(0, 4)
      : availableNumericFields.slice(0, 2)

  const suggestions = Array.from(
    new Set<string>([
      ...opSuggestions,
      ...selectSuggestions,
      ...matchedFields.map(f => `Field: ${f}`),
      ...numericHints.map(f => `Numeric: ${f}`),
      ...matchedLayers.map(l => `Layer: ${l}`),
      ...quickActions,
    ]),
  ).slice(0, 14)

  const applySuggestion = (s: string) => {
    const clean = s.replace(/^Field:\s*/i, '').replace(/^Layer:\s*/i, '').replace(/^Numeric:\s*/i, '')
    const next = draft.trim() ? `${draft} ${clean}` : clean
    onDraftChange(next)
    try {
      const key = 'geo_ai_suggestions_recent_v1'
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null
      const rec = raw ? (JSON.parse(raw) as Record<string, number>) : {}
      rec[clean] = (rec[clean] ?? 0) + 1
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(rec))
    } catch {
      /* ignore */
    }
  }

  const recentSuggestions = (() => {
    try {
      const key = 'geo_ai_suggestions_recent_v1'
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null
      if (!raw) return [] as string[]
      const rec = JSON.parse(raw) as Record<string, number>
      return Object.entries(rec)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([k]) => k)
    } catch {
      return [] as string[]
    }
  })()

  return (
    <>
      {smartSuggestionsEnabled ? (
        <div className={pfx(cssPrefix, 'smart-suggest-panel')}>
          <div className={pfx(cssPrefix, 'smart-suggest-row')}>
            {recentSuggestions.map(s => (
              <button key={`recent-${s}`} type="button" className={pfx(cssPrefix, 'smart-chip')} onClick={() => applySuggestion(s)}>
                {s}
              </button>
            ))}
            {suggestions.map(s => (
              <button key={s} type="button" className={pfx(cssPrefix, 'smart-chip')} onClick={() => applySuggestion(s)}>
                {s}
              </button>
            ))}
          </div>
          {!draft.trim() ? (
            <div className={pfx(cssPrefix, 'help-words')}>
              {helpWords.map(w => (
                <button key={w} type="button" className={pfx(cssPrefix, 'help-word')} onClick={() => applySuggestion(w)}>
                  {w}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className={pfx(cssPrefix, 'input-row')}>
        <div className={pfx(cssPrefix, 'input-shell')}>
          <textarea
            className={pfx(cssPrefix, 'input')}
            rows={2}
            value={draft}
            onChange={e => onDraftChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                onSend()
              }
            }}
            placeholder={placeholder}
            aria-label={textareaAriaLabel}
            disabled={busy}
          />
          <div className={pfx(cssPrefix, 'input-inset-trail')}>
            {voice.listening ? (
              <span className={pfx(cssPrefix, 'input-listening')} aria-live="polite">
                Listening…
              </span>
            ) : null}
            {enableVoice ? (
              <>
                <button
                  type="button"
                  className={`${pfx(cssPrefix, 'mic')} ${voice.listening ? `${pfx(cssPrefix, 'mic--active')}` : ''} ${
                    !voice.supported ? `${pfx(cssPrefix, 'mic--unsupported')}` : ''
                  }`}
                  onClick={onMicClick}
                  disabled={busy}
                  aria-label={voice.listening ? 'Stop voice input' : 'Voice input'}
                  title={
                    voice.supported
                      ? `${voice.listening ? 'Stop' : 'Start'} voice (${voice.lang}). Use the EN/ع chip to switch English/Arabic.`
                      : 'Voice input is not available in this browser (try Chrome or Edge). Click for details.'
                  }
                >
                  <i className="fa-solid fa-microphone" aria-hidden />
                </button>
                <button
                  type="button"
                  className={pfx(cssPrefix, 'lang-chip')}
                  onClick={() => {
                    voice.cycleLang()
                    voice.clearError()
                  }}
                  disabled={busy}
                  aria-label="Toggle speech language English / Arabic"
                  title={`Speech language: ${voice.lang} (click to toggle)`}
                >
                  {voice.lang.toLowerCase().startsWith('ar') ? 'ع' : 'EN'}
                </button>
              </>
            ) : null}
          </div>
        </div>
        {showAttach && fileInputRef && onAttachChange ? (
          <>
            <input
              ref={fileInputRef}
              type="file"
              className={pfx(cssPrefix, 'file-input')}
              accept="image/*"
              onChange={onAttachChange}
              aria-hidden
              tabIndex={-1}
            />
            <button
              type="button"
              className={pfx(cssPrefix, 'attach')}
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              aria-label="Attach image"
              title="Attach image"
            >
              <i className="fa-solid fa-paperclip" aria-hidden />
            </button>
          </>
        ) : null}
        <button
          type="button"
          className={pfx(cssPrefix, 'send')}
          onClick={() => onSend()}
          disabled={busy || (!draft.trim() && !(showAttach && pendingImage))}
          aria-label="Send"
          title="Send"
        >
          <i className="fa-solid fa-paper-plane" aria-hidden />
        </button>
      </div>
      {voice.error ? <p className={pfx(cssPrefix, 'voice-error')}>{voice.error}</p> : null}
    </>
  )
}
