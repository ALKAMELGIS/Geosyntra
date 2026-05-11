import type { GeoExplorerMapLink, GeoExplorerMessage, GeoExplorerPart } from '../../../lib/geoExplorerGemini'
import { stripGeoExplorerBubbleDisplayText } from '../../../lib/geoExplorerGemini'
import { splitTextIntoMarkdownSegments, type GeoMarkdownSegment } from '../../../lib/geoAiMarkdownTable'
import type { GeoExplorerCssPrefix } from './GeoExplorerGeminiChatBody'
import { GeoExplorerDynamicTable, type GeoExplorerMapAction } from './GeoExplorerDynamicTable'
import { GeoAiEditQuestionTool } from './GeoAiEditQuestionTool'

function pfx(prefix: GeoExplorerCssPrefix, part: string): string {
  return `${prefix}-${part}`
}

function modelSegmentsFromParts(parts: GeoExplorerPart[]): GeoMarkdownSegment[] {
  const out: GeoMarkdownSegment[] = []
  for (const p of parts) {
    if (p.type === 'text') {
      const stripped = stripGeoExplorerBubbleDisplayText(p.text)
      for (const seg of splitTextIntoMarkdownSegments(stripped)) {
        if (seg.type === 'text' && !seg.text.trim()) continue
        out.push(seg)
      }
    } else if (p.type === 'dataTable') {
      out.push({ type: 'table', table: p.table })
    }
  }
  return out
}

export type GeoExplorerGeminiMessagePartsProps = {
  msg: GeoExplorerMessage
  cssPrefix: GeoExplorerCssPrefix
  onTableMapAction?: (action: GeoExplorerMapAction, link: GeoExplorerMapLink) => void
  /** Zoom map to combined extent of several linked features (GIS table multi-select). */
  onTableBatchZoom?: (links: GeoExplorerMapLink[]) => void
  /** When set, user text bubbles show edit / rephrase controls and update history on save (text only, no re-run). */
  onUpdateUserMessage?: (messageId: string, nextText: string) => void
  /**
   * When set (Gemini Geo AI), saving an edited question truncates stale replies after it and re-runs the model
   * for a partial refresh with the same thread context.
   */
  onSaveEditedUserMessage?: (messageId: string, nextText: string) => void
  onSendEditedToComposer?: (text: string) => void
  suggestLayers?: string[]
  suggestFields?: string[]
  suggestNumericFields?: string[]
}

export function GeoExplorerGeminiMessageParts(props: GeoExplorerGeminiMessagePartsProps) {
  const {
    msg,
    cssPrefix,
    onTableMapAction,
    onTableBatchZoom,
    onUpdateUserMessage,
    onSaveEditedUserMessage,
    onSendEditedToComposer,
    suggestLayers,
    suggestFields,
    suggestNumericFields,
  } = props

  if (msg.role === 'user') {
    const text = msg.parts
      .filter((p): p is Extract<GeoExplorerPart, { type: 'text' }> => p.type === 'text')
      .map(p => p.text)
      .join('\n')
    const hasImage = msg.parts.some(p => p.type === 'image')
    return (
      <>
        {text ? (
          onSaveEditedUserMessage || onUpdateUserMessage ? (
            <GeoAiEditQuestionTool
              cssPrefix={cssPrefix}
              messageId={msg.id}
              originalText={text}
              onCommit={next =>
                (onSaveEditedUserMessage ?? onUpdateUserMessage)!(msg.id, next)
              }
              onUseInComposer={onSendEditedToComposer}
              suggestLayers={suggestLayers}
              suggestFields={suggestFields}
              suggestNumericFields={suggestNumericFields}
            />
          ) : (
            <p className={pfx(cssPrefix, 'bubble-text')}>{text}</p>
          )
        ) : null}
        {hasImage ? (
          <p className={pfx(cssPrefix, 'bubble-meta')}>
            <i className="fa-solid fa-paperclip" aria-hidden /> Image attached
          </p>
        ) : null}
      </>
    )
  }

  const segments = modelSegmentsFromParts(msg.parts)

  return (
    <>
      {segments.map((seg, i) =>
        seg.type === 'text' ? (
          <p key={`t-${i}`} className={pfx(cssPrefix, 'bubble-text')}>
            {seg.text}
          </p>
        ) : (
          <GeoExplorerDynamicTable
            key={`tbl-${i}`}
            cssPrefix={cssPrefix}
            table={seg.table}
            onMapAction={onTableMapAction}
            onBatchZoom={onTableBatchZoom ?? undefined}
          />
        ),
      )}
    </>
  )
}
