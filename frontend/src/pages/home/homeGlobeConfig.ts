import type { ScrollGlobeGlobeConfig } from '../../components/ui/globe-engine'

/**
 * Home scroll globe — Start + two narrative stops with smooth scroll interpolation.
 *
 * 0 Start (SaaS hero) — center
 * 1 Innovation — same center camera as Start (no motion from Start → Innovation)
 * 2 Future — same centered camera, scale, and clarity as Innovation (orbits + live RS glow)
 * 3 Pricing + 4 Footer (trailing) — hold on the last narrative waypoint (centered, same scale as Start)
 *
 * Values are inspired by the Framer scroll demo (vw/vh anchors + scale keyframes).
 */
export const HOME_SCROLL_GLOBE_CONFIG: ScrollGlobeGlobeConfig = {
  motionMode: 'smooth',
  leading: { top: '50%', left: '50%', scale: 0.94 },
  positions: [
    { top: '50%', left: '50%', scale: 0.94 },
    { top: '50%', left: '50%', scale: 0.94 },
  ],
}
