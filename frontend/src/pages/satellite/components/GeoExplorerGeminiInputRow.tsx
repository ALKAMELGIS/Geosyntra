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

  return (
    <>
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
