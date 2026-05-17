import {
  DEFAULT_SCROLL_GLOBE_CONFIG,
  type ScrollGlobeGlobeConfig,
} from '../../components/ui/globe-engine'

/**
 * Home SaaS hero — nudge globe anchor left so the lit hemisphere sits behind centered copy
 * (the upstream texture + right-side terminator reads visually right of geometric center).
 */
const { positions: defaultPositions } = DEFAULT_SCROLL_GLOBE_CONFIG

export const HOME_SCROLL_GLOBE_CONFIG: ScrollGlobeGlobeConfig = {
  ...DEFAULT_SCROLL_GLOBE_CONFIG,
  leading: { top: '50%', left: '46%', scale: 0.88 },
  positions: [
    defaultPositions[0]!,
    /** Innovation (#innovation) — nudge left + scale up so the lit hemisphere reads centered behind copy */
    { top: '50%', left: '46%', scale: 1.05 },
    /** Discovery (#discovery) — pull anchor left so the globe isn’t clipped off the right edge */
    { top: '15%', left: '82%', scale: 2 },
    /** Future (#future) — centered behind “Tomorrow” copy (terminator reads right of 50%) */
    { top: '50%', left: '46%', scale: 1.8 },
  ],
}
