/** Shared ScrollGlobe camera / motion config — Welcome + integrated SaaS hero. */

export type GlobeCameraPosition = {
  top: string
  left: string
  scale: number
}

export type ScrollGlobeMotionMode = 'section' | 'smooth'

export type ScrollGlobeGlobeConfig = {
  /** Welcome → Innovation → Future (home) */
  positions: GlobeCameraPosition[]
  /** SaaS hero (leading panel) — centered, same visual mass as Welcome */
  leading?: GlobeCameraPosition
  /**
   * `smooth` — continuous path across leading + positions (5 stops on Home).
   * `section` — discrete camera per nearest section (upstream default).
   */
  motionMode?: ScrollGlobeMotionMode
}

export const DEFAULT_SCROLL_GLOBE_CONFIG: ScrollGlobeGlobeConfig = {
  /** Centered behind SaaS copy — same camera as Innovation for clarity */
  leading: { top: '50%', left: '50%', scale: 0.88 },
  positions: [
    { top: '43%', left: '74%', scale: 1.96 },
    { top: '50%', left: '50%', scale: 0.88 },
    { top: '15%', left: '90%', scale: 2 },
    { top: '50%', left: '50%', scale: 1.8 },
  ],
}

export const GLOBE_MOTION = {
  transformTransition: 'transform 550ms cubic-bezier(0.23, 1, 0.32, 1)',
  opacityTransition: 'opacity 420ms cubic-bezier(0.23, 1, 0.32, 1)',
  filterTransition: 'filter 550ms cubic-bezier(0.23, 1, 0.32, 1)',
  parallaxLerp: 0.09,
  parallaxRotateYDeg: 5.5,
  parallaxRotateXDeg: 4,
  parallaxTranslatePx: 14,
  scrollDriftVh: 6,
} as const

export type GlobeCameraResolved = { top: number; left: number; scale: number }

export function parsePercent(str: string): number {
  return parseFloat(str.replace('%', ''))
}

export function resolveGlobeConfig(config: ScrollGlobeGlobeConfig): {
  leading: GlobeCameraResolved
  positions: GlobeCameraResolved[]
} {
  const leading = config.leading ?? DEFAULT_SCROLL_GLOBE_CONFIG.leading!
  return {
    leading: {
      top: parsePercent(leading.top),
      left: parsePercent(leading.left),
      scale: leading.scale,
    },
    positions: config.positions.map(p => ({
      top: parsePercent(p.top),
      left: parsePercent(p.left),
      scale: p.scale,
    })),
  }
}

export function lerpGlobePosition(a: GlobeCameraResolved, b: GlobeCameraResolved, t: number): GlobeCameraResolved {
  const k = Math.min(Math.max(t, 0), 1)
  return {
    top: a.top + (b.top - a.top) * k,
    left: a.left + (b.left - a.left) * k,
    scale: a.scale + (b.scale - a.scale) * k,
  }
}

/** Ordered cameras: leading (hero) then each narrative section. */
export function buildGlobeWaypoints(
  resolved: ReturnType<typeof resolveGlobeConfig>,
  hasLeading: boolean,
): GlobeCameraResolved[] {
  return hasLeading ? [resolved.leading, ...resolved.positions] : [...resolved.positions]
}

/** Piecewise-linear path — mirrors Framer `useTransform` keyframes at scroll 0…1. */
export function interpolateGlobePath(waypoints: GlobeCameraResolved[], t: number): GlobeCameraResolved {
  if (waypoints.length === 0) {
    return { top: 50, left: 50, scale: 1 }
  }
  if (waypoints.length === 1) return waypoints[0]!

  const n = waypoints.length - 1
  const clamped = Math.min(Math.max(t, 0), 1) * n
  const i = Math.min(Math.floor(clamped), n - 1)
  const frac = clamped - i
  return lerpGlobePosition(waypoints[i]!, waypoints[i + 1]!, frac)
}

/**
 * Scroll progress 0→1 while the viewport center travels from the first narrative
 * section center to the last (hero → … → Future).
 */
export function computeNarrativeScrollProgress(
  sectionRefs: (HTMLElement | null)[],
  narrativeEndIndex: number,
): number {
  const first = sectionRefs[0]
  const last = sectionRefs[narrativeEndIndex]
  if (!first || !last) return 0

  const vpCenter = (typeof window !== 'undefined' ? window.innerHeight : 800) / 2
  const firstCenter = first.getBoundingClientRect().top + first.getBoundingClientRect().height / 2
  const lastCenter = last.getBoundingClientRect().top + last.getBoundingClientRect().height / 2
  const span = firstCenter - lastCenter
  if (Math.abs(span) < 12) return 0

  const t = (firstCenter - vpCenter) / span
  return Math.min(Math.max(t, 0), 1)
}

/** CSS transform for pinned globe (vw/vh anchor + scale). Centering uses `.gs-hero-globe__parallax`. */
export function buildGlobeTransform(
  pos: GlobeCameraResolved,
  opts?: { scrollDriftY?: number },
): string {
  const drift = opts?.scrollDriftY ?? 0
  return `translate3d(${pos.left}vw, calc(${pos.top}vh + ${drift}vh), 0) scale3d(${pos.scale}, ${pos.scale}, 1)`
}

/** Centers the Earth mesh on the anchor; optional pointer parallax stacks on top. */
export function buildGlobeParallaxTransform(px: number, py: number, enabled: boolean): string {
  const center = 'translate(-50%, -50%)'
  if (!enabled) return center
  const { parallaxRotateYDeg, parallaxRotateXDeg, parallaxTranslatePx } = GLOBE_MOTION
  return [
    center,
    `translate3d(${px * parallaxTranslatePx}px, ${py * parallaxTranslatePx * 0.65}px, 0)`,
    `rotateX(${-py * parallaxRotateXDeg}deg)`,
    `rotateY(${px * parallaxRotateYDeg}deg)`,
  ].join(' ')
}

export function resolveGlobeOpacity(opts: {
  hasLeading: boolean
  activeSection: number
  lastSectionIndex: number
  globeArrived: boolean
  reduceMotion: boolean
  mobileReduced: boolean
  leadingGlobeClear?: boolean
}): number {
  if (!opts.globeArrived) return 0
  /* Home integrated scroll — full globe on every stop (Start through Footer). */
  if (opts.leadingGlobeClear && opts.hasLeading) {
    return opts.mobileReduced ? 0.96 : 1
  }
  if (opts.reduceMotion) return opts.hasLeading && opts.activeSection === 0 ? 0.82 : 0.92

  let opacity = 0.92
  if (opts.hasLeading && opts.activeSection === 0) {
    opacity = opts.mobileReduced ? 0.88 : 0.94
  } else if (opts.activeSection === opts.lastSectionIndex) {
    opacity = 0.4
  }

  return opacity
}

export function resolveHeroScrimBlur(leadingScrollT: number): number {
  return 10 + leadingScrollT * 6
}

/** Subtle defocus on the globe when leaving the hero (scroll handoff). */
export function resolveHeroGlobeBlur(leadingScrollT: number): number {
  return leadingScrollT * 2.8
}
