import type { GeoExplorerMapLink, GeoExplorerMessage, GeoExplorerPart } from '../../../lib/geoExplorerGemini'
import { stripGeoExplorerBubbleDisplayText } from '../../../lib/geoExplorerGemini'
import { splitTextIntoMarkdownSegments, type GeoMarkdownSegment } from '../../../lib/geoAiMarkdownTable'
import type { GeoExplorerCssPrefix } from './GeoExplorerGeminiChatBody'
import { GeoExplorerDynamicTable, type GeoExplorerMapAction } from './GeoExplorerDynamicTable'

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
}

export function GeoExplorerGeminiMessageParts(props: GeoExplorerGeminiMessagePartsProps) {
  const { msg, cssPrefix, onTableMapAction } = props

  if (msg.role === 'user') {
    const text = msg.parts
      .filter((p): p is Extract<GeoExplorerPart, { type: 'text' }> => p.type === 'text')
      .map(p => p.text)
      .join('\n')
    const hasImage = msg.parts.some(p => p.type === 'image')
    return (
      <>
        {text ? <p className={pfx(cssPrefix, 'bubble-text')}>{text}</p> : null}
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
          <GeoExplorerDynamicTable key={`tbl-${i}`} cssPrefix={cssPrefix} table={seg.table} onMapAction={onTableMapAction} />
        ),
      )}
    </>
  )
}
