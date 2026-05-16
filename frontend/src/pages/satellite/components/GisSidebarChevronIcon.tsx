export type GisSidebarChevronKind = 'single' | 'double'
export type GisSidebarChevronDirection = 'left' | 'right'

export type GisSidebarChevronIconProps = {
  kind?: GisSidebarChevronKind
  direction?: GisSidebarChevronDirection
  className?: string
}

/** Shared stroke — equal weight for every chevron arm. */
const STROKE = 1.75

/**
 * Right-pointing chevrons in a tight 16×16 box.
 * Double pair: identical width/height and even 1.75u gap between the two « arms.
 */
const SINGLE_RIGHT = 'M5.25 3.75 L9.5 8 L5.25 12.25'
const DOUBLE_RIGHT = ['M2.75 3.75 L6.5 8 L2.75 12.25', 'M8.25 3.75 L12 8 L8.25 12.25'] as const

/**
 * Custom sidebar chevrons (» / « / ›) — one SVG, optically balanced double stroke.
 * Replaces Font Awesome angles so spacing stays consistent in rail + pane chrome.
 */
export function GisSidebarChevronIcon({
  kind = 'single',
  direction = 'right',
  className = '',
}: GisSidebarChevronIconProps) {
  const paths = kind === 'double' ? DOUBLE_RIGHT : [SINGLE_RIGHT]
  const mirror = direction === 'left'

  return (
    <svg
      className={[
        'gis-sidebar-chevron-icon',
        `gis-sidebar-chevron-icon--${kind}`,
        `gis-sidebar-chevron-icon--${direction}`,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      overflow="hidden"
    >
      <g transform={mirror ? 'translate(16 0) scale(-1 1)' : undefined}>
        {paths.map((d, i) => (
          <path
            key={i}
            className="gis-sidebar-chevron-icon__arm"
            d={d}
            stroke="currentColor"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </g>
    </svg>
  )
}
