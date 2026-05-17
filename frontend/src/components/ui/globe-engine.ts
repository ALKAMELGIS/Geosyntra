/** Shared ScrollGlobe camera / motion config — Welcome + integrated SaaS hero. */

export type GlobeCameraPosition = {
  top: string
  left: string
  scale: number
}

export type ScrollGlobeGlobeConfig = {
  /** Welcome → Innovation → Discovery → Future */
  positions: GlobeCameraPosition[]
  /** SaaS hero (leading panel) — centered, same visual mass as Welcome */
  leading?: GlobeCameraPosition
}

export const DEFAULT_SCROLL_GLOBE_CONFIG: ScrollGlobeGlobeConfig = {
  /** Same visual mass as Welcome (#hero) — centered behind SaaS copy */
  leading: { top: '50%', left: '50%', scale: 1.96 },
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

/** CSS transform for pinned globe (vw/vh anchor + scale). */
export function buildGlobeTransform(
  pos: GlobeCameraResolved,
  opts?: { scrollDriftY?: number },
): string {
  const drift = opts?.scrollDriftY ?? 0
  return `translate3d(${pos.left}vw, calc(${pos.top}vh + ${drift}vh), 0) translate3d(-50%, -50%, 0) scale3d(${pos.scale}, ${pos.scale}, 1)`
}

export function buildGlobeParallaxTransform(px: number, py: number, enabled: boolean): string {
  if (!enabled) return 'translate3d(0, 0, 0)'
  const { parallaxRotateYDeg, parallaxRotateXDeg, parallaxTranslatePx } = GLOBE_MOTION
  return [
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
  if (opts.leadingGlobeClear && opts.hasLeading && opts.activeSection === 0) {
    return opts.mobileReduced ? 0.96 : 1
  }
  if (opts.reduceMotion) return opts.hasLeading && opts.activeSection === 0 ? 0.82 : 0.92

  let opacity = 0.92
  if (opts.hasLeading && opts.activeSection === 0) {
    opacity = opts.mobileReduced ? 0.72 : 0.9
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
