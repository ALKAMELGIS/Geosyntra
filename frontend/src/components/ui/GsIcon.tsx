import type { CSSProperties, SVGProps } from 'react'

/**
 * GsIcon — Geosyntra unified icon system.
 *
 * Why this exists:
 *   The platform historically mixed FontAwesome solid (`fa-solid`),
 *   FontAwesome regular, lineicons, and ad-hoc Unicode glyphs. Result: every
 *   surface had a slightly different stroke weight, optical alignment, and
 *   theme contrast — which read as "noise" against the rest of the Black /
 *   White Glass One UI direction.
 *
 *   `GsIcon` is the single source of truth for chrome icons. Each glyph is
 *   an inline SVG with:
 *     - A fixed 24×24 viewbox (so optical sizes match across surfaces).
 *     - 1.5px stroke width (LinkedIn / Apple HIG / One UI standard).
 *     - Round line caps + joins (premium feel, no jagged corners).
 *     - `currentColor` for stroke + fill — inherits any text color the
 *       parent button picks, so dark/light themes "just work" without
 *       per-icon overrides.
 *     - No baked-in colors / shadows — wrap the icon in a `gs-icon-glass-*`
 *       chip when a glass surround is needed (see Profile.css overrides).
 *
 *   Adding new glyphs: append a new entry to `ICON_PATHS` keyed by the
 *   semantic name. Keep paths inside the 24×24 viewport with a 2-3px inset
 *   so the optical weight stays consistent.
 */

export type GsIconName =
  | 'image'
  | 'image-plus'
  | 'close'
  | 'check'
  | 'check-circle'
  | 'camera'
  | 'pencil'
  | 'save'
  | 'trash'
  | 'shield'
  | 'globe'
  | 'paint-roller'
  | 'eye'
  | 'eye-off'
  | 'sliders'
  | 'sun'
  | 'moon'
  | 'monitor'
  | 'lock'
  | 'phone'
  | 'mail'

export interface GsIconProps extends Omit<SVGProps<SVGSVGElement>, 'name' | 'width' | 'height'> {
  name: GsIconName
  /** Pixel size of the rendered icon. Defaults to `18` — the LinkedIn-grade
   *  default for action buttons + chip rows. */
  size?: number
  /** Extra CSS class to append (e.g. `gs-icon-glass-chip` for a frosted
   *  surround). */
  className?: string
  /** Inline style escape hatch (rarely needed — prefer CSS). */
  style?: CSSProperties
  /** Title applied as the SVG `<title>` for accessibility. When omitted the
   *  icon is treated as decorative (`aria-hidden`). */
  title?: string
}

/**
 * 24×24 SVG path data for every supported glyph. Keep stroke weight + cap
 * style consistent — render layer applies them uniformly.
 */
const ICON_PATHS: Record<GsIconName, JSX.Element> = {
  image: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="3" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M3.6 17.5 8.5 13.4a2 2 0 0 1 2.7 0l3.4 3 1.7-1.4a2 2 0 0 1 2.7.1l1.4 1.4" />
    </>
  ),
  'image-plus': (
    <>
      <path d="M21 13v3.5A3.5 3.5 0 0 1 17.5 20H6.5A3.5 3.5 0 0 1 3 16.5v-9A3.5 3.5 0 0 1 6.5 4H13" />
      <path d="M3.6 17.5 8.5 13.4a2 2 0 0 1 2.7 0l3.4 3 1.7-1.4a2 2 0 0 1 2.7.1l1.4 1.4" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M19 4v6M16 7h6" />
    </>
  ),
  close: (
    <>
      <path d="M6 6 18 18" />
      <path d="M18 6 6 18" />
    </>
  ),
  check: <path d="M5 12.5 10 17.5 19 7" />,
  'check-circle': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5 11 15.5 16.5 9.5" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8.5h3.2l1.4-2a1.6 1.6 0 0 1 1.3-.7h4.2a1.6 1.6 0 0 1 1.3.7l1.4 2H20a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 20 19.5H4A1.5 1.5 0 0 1 2.5 18v-8A1.5 1.5 0 0 1 4 8.5Z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </>
  ),
  pencil: (
    <>
      <path d="M14.6 4.4 19.6 9.4" />
      <path d="M4.5 19.5h4.4l10-10a2.4 2.4 0 0 0 0-3.4l-1-1a2.4 2.4 0 0 0-3.4 0l-10 10v4.4Z" />
    </>
  ),
  save: (
    <>
      <path d="M5 4h11l3 3v12.5A1.5 1.5 0 0 1 17.5 21h-11A1.5 1.5 0 0 1 5 19.5v-15A1.5 1.5 0 0 1 5 4Z" />
      <path d="M8 4v4h7V4" />
      <rect x="8" y="13" width="8" height="6" rx="0.6" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
      <path d="M6.5 7 7.4 18.6A1.6 1.6 0 0 0 9 20h6a1.6 1.6 0 0 0 1.6-1.4L17.5 7" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.5 4.5 6.5v5c0 4.5 3 7.6 7.5 9 4.5-1.4 7.5-4.5 7.5-9v-5L12 3.5Z" />
      <path d="M9 12.5 11.5 15 16 10.5" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a13 13 0 0 1 0 18M12 3a13 13 0 0 0 0 18" />
    </>
  ),
  'paint-roller': (
    <>
      <rect x="3" y="4" width="14" height="6" rx="2" />
      <path d="M17 7h2.5A1.5 1.5 0 0 1 21 8.5V11a1.5 1.5 0 0 1-1.5 1.5H10A1.5 1.5 0 0 0 8.5 14v1" />
      <rect x="6.5" y="15" width="4" height="6" rx="1.2" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  'eye-off': (
    <>
      <path d="M3 3l18 18" />
      <path d="M9.7 5.6A10.3 10.3 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16.4 16.4 0 0 1-3.5 4.2" />
      <path d="M14.6 14.6a3 3 0 0 1-4.2-4.2" />
      <path d="M6 6.5A16.3 16.3 0 0 0 2.5 12s3.5 6.5 9.5 6.5a10 10 0 0 0 4.2-.9" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 6h10M18 6h2" />
      <path d="M4 12h4M12 12h8" />
      <path d="M4 18h12M20 18h0" />
      <circle cx="16" cy="6" r="1.6" />
      <circle cx="10" cy="12" r="1.6" />
      <circle cx="18" cy="18" r="1.6" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.4A8 8 0 1 1 9.6 4a6.6 6.6 0 0 0 10.4 10.4Z" />,
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="12.5" rx="2" />
      <path d="M9 20h6M12 16.5V20" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="9" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
      <circle cx="12" cy="15" r="1.2" />
    </>
  ),
  phone: <path d="M5 4.5h3.2l1.6 4-2 1.5a13 13 0 0 0 6 6l1.5-2 4 1.6V19A1.5 1.5 0 0 1 17.8 20.5 16.5 16.5 0 0 1 3.5 6.2 1.5 1.5 0 0 1 5 4.5Z" />,
  mail: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="m4 7 7.3 5.5a1.5 1.5 0 0 0 1.8 0L20 7" />
    </>
  ),
}

export default function GsIcon({
  name,
  size = 18,
  className,
  style,
  title,
  ...rest
}: GsIconProps) {
  const decorative = !title
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={['gs-icon', className].filter(Boolean).join(' ')}
      style={style}
      role={decorative ? 'presentation' : 'img'}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : title}
      focusable={false}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {ICON_PATHS[name]}
    </svg>
  )
}
