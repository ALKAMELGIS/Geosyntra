import type { ChangeEvent, RefObject } from 'react'
import { messageDisplayText, stripMapQueryLine, type GeoExplorerMessage } from '../../../lib/geoExplorerGemini'

export type GeoExplorerCssPrefix = 'gis-geo-explorer' | 'si-geo-explorer'

export type GeoExplorerGeminiChatBodyProps = {
  cssPrefix: GeoExplorerCssPrefix
  messages: GeoExplorerMessage[]
  busy: boolean
  error: string
  draft: string
  onDraftChange: (next: string) => void
  pendingImage: { mime: string; base64: string } | null
  onClearPendingImage: () => void
  fileInputRef: RefObject<HTMLInputElement | null>
  onAttachChange: (e: ChangeEvent<HTMLInputElement>) => void
  onSend: () => void
  textareaAriaLabel: string
}

function pfx(prefix: GeoExplorerCssPrefix, part: string): string {
  return `${prefix}-${part}`
}

/**
 * Shared Gemini Geo AI / Geo Explorer chat UI (messages, input, attach, footnote).
 * Parent supplies layout chrome (header, tabs, close) and `cssPrefix` for GIS vs Satellite stylesheets.
 */
export function GeoExplorerGeminiChatBody(props: GeoExplorerGeminiChatBodyProps) {
  const {
    cssPrefix,
    messages,
    busy,
    error,
    draft,
    onDraftChange,
    pendingImage,
    onClearPendingImage,
    fileInputRef,
    onAttachChange,
    onSend,
    textareaAriaLabel,
  } = props

  return (
    <>
      <div className={pfx(cssPrefix, 'messages')}>
        <div className={`${pfx(cssPrefix, 'row')} ${pfx(cssPrefix, 'row--model')}`}>
          <div className={pfx(cssPrefix, 'avatar')} aria-hidden>
            <i className="fa-solid fa-globe" />
          </div>
          <div className={pfx(cssPrefix, 'bubble')}>
            Hello! Describe a place, upload an image, or ask for directions. When a location is clear, the map will fly
            there (the model adds a MAP_QUERY line).
          </div>
        </div>
        {messages.map(msg => {
          const raw = messageDisplayText(msg)
          const show = msg.role === 'model' ? stripMapQueryLine(raw) : raw
          const hasImage = msg.parts.some(part => part.type === 'image')
          return (
            <div key={msg.id} className={`${pfx(cssPrefix, 'row')} ${pfx(cssPrefix, `row--${msg.role}`)}`}>
              {msg.role === 'model' ? (
                <div className={pfx(cssPrefix, 'avatar')} aria-hidden>
                  <i className="fa-solid fa-wand-magic-sparkles" />
                </div>
              ) : null}
              <div className={pfx(cssPrefix, 'bubble')}>
                {show ? <p className={pfx(cssPrefix, 'bubble-text')}>{show}</p> : null}
                {msg.role === 'user' && hasImage ? (
                  <p className={pfx(cssPrefix, 'bubble-meta')}>
                    <i className="fa-solid fa-paperclip" aria-hidden /> Image attached
                  </p>
                ) : null}
              </div>
            </div>
          )
        })}
        {busy ? (
          <div className={`${pfx(cssPrefix, 'row')} ${pfx(cssPrefix, 'row--model')}`}>
            <div className={pfx(cssPrefix, 'avatar')} aria-hidden>
              <i className="fa-solid fa-wand-magic-sparkles" />
            </div>
            <div className={`${pfx(cssPrefix, 'bubble')} ${pfx(cssPrefix, 'bubble--typing')}`}>
              <i className="fa-solid fa-spinner fa-spin" aria-hidden /> Thinking…
            </div>
          </div>
        ) : null}
      </div>
      {error ? <p className={pfx(cssPrefix, 'error')}>{error}</p> : null}
      {pendingImage ? (
        <p className={pfx(cssPrefix, 'pending-img')}>
          <i className="fa-solid fa-image" aria-hidden /> Image ready to send
          <button type="button" className={pfx(cssPrefix, 'linkish')} onClick={onClearPendingImage}>
            Remove
          </button>
        </p>
      ) : null}
      <div className={pfx(cssPrefix, 'input-row')}>
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
          placeholder="Describe a place, ask for directions, or plan a trip…"
          aria-label={textareaAriaLabel}
          disabled={busy}
        />
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
        <button
          type="button"
          className={pfx(cssPrefix, 'send')}
          onClick={onSend}
          disabled={busy || (!draft.trim() && !pendingImage)}
          aria-label="Send"
          title="Send"
        >
          <i className="fa-solid fa-paper-plane" aria-hidden />
        </button>
      </div>
      <p className={pfx(cssPrefix, 'footnote')}>
        Powered by Google Gemini. Set <code>VITE_GEMINI_API_KEY</code> or save under System Settings → API Tokens → Gemini
        API. Do not commit keys.
      </p>
    </>
  )
}
