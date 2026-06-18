import type { ChangeEvent, KeyboardEvent, RefObject } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useGeoAiSpeechRecognition } from '../../../hooks/useGeoAiSpeechRecognition'
import {
  geoAiPromptFromVoiceGisIntent,
  parseGeoAiVoiceGisIntent,
  type GeoAiVoiceGisIntent,
} from '../../../lib/geoAiVoiceGisIntent'
import type { GeoExplorerCssPrefix } from './geoExplorerCssPrefix'
import {
  buildSmartSuggestions,
  type SmartSuggestionsContext,
} from '../utils/smartSuggestionsEngine'
import { SmartSuggestionsAnchor } from './smart-suggestions/smart-suggestions-button'
import { SmartSuggestionsButton } from './smart-suggestions/smart-suggestions-button'
import {
  SmartSuggestionsPanel,
  type SmartSuggestionActionPayload,
} from './smart-suggestions/smart-suggestions-panel'
import { SmartSuggestionsInlineStrip } from './smart-suggestions/smart-suggestions-inline-strip'
import './smart-suggestions/smart-suggestions.css'
import './geo-chat-google.css'

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
  /** Map / RS context for provider- and layer-aware suggestions. */
  smartSuggestionsContext?: Partial<SmartSuggestionsContext>
  /** App actions (timeline, export, symbology) â€” composer inserts stay in-row. */
  onSmartSuggestionAction?: (actionId: string, payload: SmartSuggestionActionPayload) => void
  /** Fired when voice input resolves to a GIS JSON intent (rule-based). */
  onVoiceGisIntent?: (intent: GeoAiVoiceGisIntent, spokenText: string) => void
  /** Geo-Cart AI spatial extraction — composer tool. */
  /** When true, inline chips are hidden (thread coach handles suggestions). */
  conversationalCoachActive?: boolean
}

function pfx(prefix: GeoExplorerCssPrefix, part: string): string {
  return `${prefix}-${part}`
}

type OptimizePack = {
  refined: string
  stats: string[]
  math: string[]
  spatial: string[]
}

function buildOptimizePack(
  draft: string,
  layers: string[],
  fields: string[],
  numericFields: string[],
  geometryOps: string[],
): OptimizePack {
  const layer = layers[0]
  const num = numericFields[0] ?? fields.find(f => /\b(area|total|count|sum|length|width|height|amount|price|qty)\b/i.test(f)) ?? fields[0] ?? 'NumericField'
  const cat =
    fields.find(f => f !== num && !numericFields.includes(f)) ?? fields.find(f => f !== num) ?? 'Farm_Code'
  const layerPhrase = layer ? ` on layer "${layer}"` : ''

  const stats = [
    `Count records${layerPhrase}`,
    `SUM(${num})${layerPhrase}`,
    `Average ${num}${layerPhrase}`,
    `Group by ${cat}`,
    `Min ${num} and Max ${num}${layerPhrase}`,
  ]
  const math = [`${num} < 3000`, `${num} > 100`, `${cat} = MH101`, `${num} >= 500 and ${num} <= 2000`]
  const spatial = geometryOps.slice(0, 5).map(op => `${op}: describe boundary then filter attributes`)

  const d = draft.trim()
  let refined = ''
  if (!d) {
    refined = `SUM(${num}) where ${num} < 3000${layerPhrase}`
  } else if (/sum|total|Ù…Ø¬Ù…ÙˆØ¹|Ø§Ø¬Ù…Ø§Ù„ÙŠ/i.test(d) && !/\b(where|>|<|>=|<=|=)\b/i.test(d)) {
    refined = `${d.trim()} where ${num} < 3000`
  } else if (/count|Ø¹Ø¯Ø¯/i.test(d) && layer) {
    refined = `Count records${layerPhrase}`
  } else if (/group|ØªØ¬Ù…ÙŠØ¹/i.test(d)) {
    refined = `Group by ${cat}${layerPhrase}`
  } else {
    refined = `${d.trim()} â€” specify layer (${layer ?? 'â€¦'}), field (${num}), and comparison for sharper stats`
  }

  return { refined, stats, math, spatial }
}

/**
 * Geo AI / Geo Explorer composer: textarea for text, floating voice/lang dock beside it, attach + send.
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
    placeholder = 'Ask about this map, AOI, imagery, or layers…',
    availableFields = [],
    availableNumericFields = [],
    availableLayers = [],
    availableGeometryOps = ['Within', 'Intersects', 'Buffer', 'Contains'],
    smartSuggestionsEnabled = true,
    smartSuggestionsContext: smartSuggestionsContextProp,
    onSmartSuggestionAction,
    onVoiceGisIntent,
    conversationalCoachActive = false,
  } = props

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const optimizeWrapRef = useRef<HTMLDivElement | null>(null)
  const smartSuggestAnchorRef = useRef<HTMLDivElement | null>(null)
  const [composerFocused, setComposerFocused] = useState(false)
  const [smartPanelOpen, setSmartPanelOpen] = useState(false)
  const [optimizeOpen, setOptimizeOpen] = useState(false)

  const onSendRef = useRef(onSend)
  const onVoiceGisIntentRef = useRef(onVoiceGisIntent)
  onSendRef.current = onSend
  onVoiceGisIntentRef.current = onVoiceGisIntent

  const voice = useGeoAiSpeechRecognition({
    disabled: busy || !enableVoice,
    onFinalTranscript: text => {
      const spoken = text.trim()
      if (!spoken) return
      const intent = parseGeoAiVoiceGisIntent(spoken)
      onVoiceGisIntentRef.current?.(intent, spoken)
      onSendRef.current(geoAiPromptFromVoiceGisIntent(intent))
    },
  })

  const voiceUiState: 'idle' | 'listening' | 'capturing' =
    !enableVoice || busy
      ? 'idle'
      : voice.listening
        ? voice.interimTranscript.trim()
          ? 'capturing'
          : 'listening'
        : 'idle'

  const interimPreview =
    voice.interimTranscript.trim().length > 56
      ? `${voice.interimTranscript.trim().slice(0, 54)}…`
      : voice.interimTranscript.trim()

  const speechLangArabic = voice.lang.toLowerCase().startsWith('ar')

  const onMicClick = useCallback(() => {
    if (voice.listening) voice.stopListening()
    else {
      voice.clearError()
      voice.startListening()
    }
  }, [voice])

  const qRaw = draft.trim()

  const mergedSmartContext = useMemo(
    (): SmartSuggestionsContext => ({
      draft,
      composerFocused,
      availableLayers,
      availableFields,
      availableNumericFields,
      availableGeometryOps,
      ...smartSuggestionsContextProp,
    }),
    [
      draft,
      composerFocused,
      availableLayers,
      availableFields,
      availableNumericFields,
      availableGeometryOps,
      smartSuggestionsContextProp,
    ],
  )

  const smartSuggestionCount = useMemo(
    () => (smartSuggestionsEnabled ? buildSmartSuggestions(mergedSmartContext).length : 0),
    [smartSuggestionsEnabled, mergedSmartContext],
  )

  const optimizePack = useMemo(
    () => buildOptimizePack(qRaw, availableLayers, availableFields, availableNumericFields, availableGeometryOps),
    [qRaw, availableLayers, availableFields, availableNumericFields, availableGeometryOps],
  )

  const syncTextareaHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const maxPx =
      typeof window !== 'undefined' ? Math.min(340, Math.max(200, Math.round(window.innerHeight * 0.42))) : 280
    const h = Math.min(Math.max(el.scrollHeight, 44), maxPx)
    el.style.height = `${h}px`
  }, [])

  useEffect(() => {
    syncTextareaHeight()
  }, [draft, busy, syncTextareaHeight])

  useEffect(() => {
    const onResize = () => syncTextareaHeight()
    window.addEventListener('resize', onResize, { passive: true })
    return () => window.removeEventListener('resize', onResize)
  }, [syncTextareaHeight])

  useEffect(() => {
    if (!optimizeOpen) return
    const onDocMouseDown = (ev: Event) => {
      const el = optimizeWrapRef.current
      const t = ev.target
      if (!el || !(t instanceof Node) || el.contains(t)) return
      setOptimizeOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [optimizeOpen])

  const applySuggestion = useCallback(
    (insert: string) => {
      const clean = insert.replace(/^Field:\s*/i, '').replace(/^Layer:\s*/i, '').replace(/^Numeric:\s*/i, '')
      const next = draft.trim() ? `${draft} ${clean}` : clean
      onDraftChange(next)
      textareaRef.current?.focus()
    },
    [draft, onDraftChange],
  )

  const handleSmartSelect = useCallback(
    (payload: SmartSuggestionActionPayload) => {
      if (payload.insertText) {
        applySuggestion(payload.insertText)
      }
      const actionId = payload.item.actionId
      if (actionId && onSmartSuggestionAction) {
        onSmartSuggestionAction(actionId, payload)
      }
    },
    [applySuggestion, onSmartSuggestionAction],
  )

  const applyReplaceDraft = useCallback(
    (next: string) => {
      const t = next.trim()
      if (!t) return
      onDraftChange(t)
      textareaRef.current?.focus()
    },
    [onDraftChange],
  )

  const insertFromOptimize = useCallback(
    (text: string, mode: 'append' | 'replace') => {
      const t = text.trim()
      if (!t) return
      if (mode === 'replace') applyReplaceDraft(t)
      else applySuggestion(t)
      setOptimizeOpen(false)
    },
    [applyReplaceDraft, applySuggestion],
  )

  const optimizePopover = optimizeOpen ? (
    <div
      className={pfx(cssPrefix, 'optimize-popover')}
      role="dialog"
      aria-label="Optimize Your Input"
      onMouseDown={ev => ev.preventDefault()}
    >
      <div className={pfx(cssPrefix, 'optimize-popover-head')}>
        <span className={pfx(cssPrefix, 'optimize-popover-title')}>Optimize Your Input</span>
        <button
          type="button"
          className={pfx(cssPrefix, 'optimize-popover-close')}
          aria-label="Close"
          onClick={() => setOptimizeOpen(false)}
        >
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </div>
      <p className={pfx(cssPrefix, 'optimize-popover-lead')}>
        Templates use your loaded layers and fields. Tap to append; use â€œUse wordingâ€ to replace the draft.
      </p>

      <div className={pfx(cssPrefix, 'optimize-refined')}>
        <span className={pfx(cssPrefix, 'optimize-refined-label')}>Suggested wording</span>
        <p className={pfx(cssPrefix, 'optimize-refined-text')}>{optimizePack.refined}</p>
        <div className={pfx(cssPrefix, 'optimize-refined-actions')}>
          <button type="button" className={pfx(cssPrefix, 'optimize-chip-primary')} onClick={() => insertFromOptimize(optimizePack.refined, 'replace')}>
            Use wording
          </button>
          <button type="button" className={pfx(cssPrefix, 'optimize-chip')} onClick={() => insertFromOptimize(optimizePack.refined, 'append')}>
            Append
          </button>
        </div>
      </div>

      <div className={pfx(cssPrefix, 'optimize-section')}>
        <div className={pfx(cssPrefix, 'optimize-section-title')}>
          Stats Ops <span className={pfx(cssPrefix, 'optimize-section-sub')}>(Ø¥Ø­ØµØ§Ø¦ÙŠØ§Ù‹)</span>
        </div>
        <div className={pfx(cssPrefix, 'optimize-chip-row')}>
          {optimizePack.stats.map(s => (
            <button key={s} type="button" className={pfx(cssPrefix, 'optimize-chip')} onClick={() => insertFromOptimize(s, 'append')}>
              {s.length > 52 ? `${s.slice(0, 50)}â€¦` : s}
            </button>
          ))}
        </div>
      </div>

      <div className={pfx(cssPrefix, 'optimize-section')}>
        <div className={pfx(cssPrefix, 'optimize-section-title')}>
          Math Ops <span className={pfx(cssPrefix, 'optimize-section-sub')}>(Ø±ÙŠØ§Ø¶ÙŠØ§Ù‹)</span>
        </div>
        <div className={pfx(cssPrefix, 'optimize-chip-row')}>
          {optimizePack.math.map(s => (
            <button key={s} type="button" className={pfx(cssPrefix, 'optimize-chip')} onClick={() => insertFromOptimize(s, 'append')}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className={pfx(cssPrefix, 'optimize-section')}>
        <div className={pfx(cssPrefix, 'optimize-section-title')}>
          Spatial Ops <span className={pfx(cssPrefix, 'optimize-section-sub')}>(Ù…ÙƒØ§Ù†ÙŠØ§Ù‹)</span>
        </div>
        <div className={pfx(cssPrefix, 'optimize-chip-row')}>
          {optimizePack.spatial.map(s => (
            <button key={s} type="button" className={pfx(cssPrefix, 'optimize-chip')} onClick={() => insertFromOptimize(s, 'append')}>
              {s.length > 56 ? `${s.slice(0, 54)}â€¦` : s}
            </button>
          ))}
        </div>
      </div>

      <p className={pfx(cssPrefix, 'optimize-context')}>
        Layers: {availableLayers.length ? availableLayers.slice(0, 4).join(', ') : 'â€”'}
        {availableLayers.length > 4 ? 'â€¦' : ''} Â· Fields: {availableFields.length} Â· Numeric: {availableNumericFields.length}
      </p>
    </div>
  ) : null

  return (
    <>
      <div ref={optimizeWrapRef} className={pfx(cssPrefix, 'optimize-wrap')}>
        {optimizePopover}
      </div>
      <div className="geo-chat-composer-stack geo-chat-google">
        {smartSuggestionsEnabled && !qRaw && !conversationalCoachActive ? (
          <div className="geo-chat-quick-answers">
            <div className="geo-chat-quick-answers__row">
              <SmartSuggestionsInlineStrip
                context={mergedSmartContext}
                disabled={busy}
                onSelect={handleSmartSelect}
              />
            </div>
          </div>
        ) : null}
        <SmartSuggestionsAnchor anchorRef={smartSuggestAnchorRef}>
          {smartSuggestionsEnabled ? (
            <SmartSuggestionsPanel
              cssPrefix={cssPrefix}
              open={smartPanelOpen}
              onClose={() => setSmartPanelOpen(false)}
              context={mergedSmartContext}
              onSelectItem={handleSmartSelect}
              onOpenOptimize={() => {
                setSmartPanelOpen(false)
                setOptimizeOpen(true)
              }}
            />
          ) : null}
          <div
            className={`${pfx(cssPrefix, 'composer-surface')} geo-chat-composer-google`}
            data-voice-state={enableVoice ? voiceUiState : undefined}
          >
            <form
              className="geo-chat-input-form"
              onSubmit={e => {
                e.preventDefault()
                onSend()
              }}
            >
              <div className="geo-chat-input-split">
                <div className="geo-chat-input-main">
                  <div className={pfx(cssPrefix, 'composer-field')}>
                    <textarea
                      ref={textareaRef}
            className={pfx(cssPrefix, 'input')}
            rows={1}
            value={draft}
            onChange={e => {
              onDraftChange(e.target.value)
              requestAnimationFrame(() => syncTextareaHeight())
            }}
            onFocus={() => setComposerFocused(true)}
            onBlur={() => {
              window.setTimeout(() => {
                const a = document.activeElement
                if (a && a.closest?.('.si-smart-suggest-panel')) return
                if (a && a.closest?.(`.${pfx(cssPrefix, 'optimize-wrap')}`)) return
                if (a && a.closest?.('.si-smart-suggest-trigger')) return
                setComposerFocused(false)
              }, 0)
            }}
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
          {enableVoice && (voiceUiState === 'listening' || voiceUiState === 'capturing') ? (
            <div className={pfx(cssPrefix, 'composer-voice-hint')} aria-live="polite">
              {voiceUiState === 'capturing' && interimPreview ? (
                <>
                  <span className={pfx(cssPrefix, 'composer-voice-dot')} aria-hidden />
                  <span className={pfx(cssPrefix, 'composer-voice-hint-text')}>{interimPreview}</span>
                </>
              ) : (
                <>
                  <span className={pfx(cssPrefix, 'composer-voice-dot')} aria-hidden />
                  <span className={pfx(cssPrefix, 'composer-voice-hint-text')}>
                    {voiceUiState === 'capturing' ? 'Capturingâ€¦' : 'Listeningâ€¦'}
                  </span>
                </>
              )}
            </div>
          ) : null}
        </div>

                <button
                  type="submit"
                  className="geo-chat-send-btn"
                  disabled={busy || (!draft.trim() && !(showAttach && pendingImage))}
                  aria-label="Send message"
                  title="Send"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
                  </svg>
                </button>
                </div>
                <div className="geo-chat-composer-tools" aria-label="Composer tools">
                  {enableVoice ? (
                    <>
                      <button
                        type="button"
                        className={`${pfx(cssPrefix, 'composer-icon-btn')} ${voice.listening ? `${pfx(cssPrefix, 'composer-icon-btn--active')}` : ''} ${
                          voiceUiState === 'capturing' ? `${pfx(cssPrefix, 'composer-icon-btn--live')}` : ''
                        } ${!voice.supported ? `${pfx(cssPrefix, 'composer-icon-btn--muted')}` : ''}`}
                        onClick={onMicClick}
                        disabled={busy}
                        aria-pressed={voice.listening}
                        aria-label={voice.listening ? 'Stop voice input' : 'Start voice input'}
                        title={
                          voice.supported
                            ? `${voice.listening ? 'Stop' : 'Start'} voice (${speechLangArabic ? 'Arabic' : 'English'})`
                            : 'Voice not supported in this browser'
                        }
                      >
                        <i className="fa-solid fa-microphone" aria-hidden />
                      </button>
                      <button
                        type="button"
                        className={`${pfx(cssPrefix, 'composer-icon-btn')} ${pfx(cssPrefix, 'composer-icon-btn--lang')}`}
                        onClick={() => {
                          voice.cycleLang()
                          voice.clearError()
                        }}
                        disabled={busy}
                        aria-label={`Speech language: ${speechLangArabic ? 'Arabic' : 'English'}. Switch.`}
                        title={`${speechLangArabic ? 'Arabic' : 'English'} — click to toggle`}
                      >
                        <i className="fa-solid fa-language" aria-hidden />
                        <span className={pfx(cssPrefix, 'composer-lang-badge')}>{speechLangArabic ? 'AR' : 'EN'}</span>
                      </button>
                    </>
                  ) : null}
                  {smartSuggestionsEnabled ? (
                    <SmartSuggestionsButton
                      open={smartPanelOpen}
                      onToggle={() => setSmartPanelOpen(o => !o)}
                      disabled={busy}
                      className={pfx(cssPrefix, 'composer-icon-btn')}
                      suggestionCount={smartSuggestionCount}
                    />
                  ) : null}
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
                        className={pfx(cssPrefix, 'composer-icon-btn')}
                        onClick={() => fileInputRef.current?.click()}
                        disabled={busy}
                        aria-label="Attach image"
                        title="Attach image"
                      >
                        <i className="fa-solid fa-paperclip" aria-hidden />
                      </button>
                    </>
                  ) : null}
                </div>
                </div>
            </form>

          </div>
        </SmartSuggestionsAnchor>
      </div>
    </>
  )
}
