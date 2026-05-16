export type GisSidebarChevronKind = 'single' | 'double'
export type GisSidebarChevronDirection = 'left' | 'right'

export type GisSidebarChevronIconProps = {
  kind?: GisSidebarChevronKind
  direction?: GisSidebarChevronDirection
  className?: string
}

/** Shared stroke — equal weight for every chevron arm. */
const STROKE = 1.75

/** 16×16 viewBox; chevrons centered on y = 8. */
const Y_TOP = 3.75
const Y_MID = 8
const Y_BOTTOM = 12.25

/** Arm width and inter-arm gap — chosen so 2×arm + gap + 2×margin = 16. */
const ARM_W = 3.5
const ARM_GAP = 1.75
const SIDE_MARGIN = (16 - (2 * ARM_W + ARM_GAP)) / 2

function chevronPath(backX: number): string {
  const tipX = backX + ARM_W
  return `M${backX} ${Y_TOP} L${tipX} ${Y_MID} L${backX} ${Y_BOTTOM}`
}

const SINGLE_RIGHT = chevronPath((16 - ARM_W) / 2)
const DOUBLE_RIGHT = [
  chevronPath(SIDE_MARGIN),
  chevronPath(SIDE_MARGIN + ARM_W + ARM_GAP),
] as const

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
      overflow="visible"
    >
      <g transform={mirror ? 'matrix(-1 0 0 1 16 0)' : undefined}>
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
