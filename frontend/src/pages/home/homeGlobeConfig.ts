import {
  DEFAULT_SCROLL_GLOBE_CONFIG,
  type ScrollGlobeGlobeConfig,
} from '../../components/ui/globe-engine'

/**
 * Home scroll globe — Start (leading) stays centered; Welcome → Future use
 * the classic pan/zoom camera path from DEFAULT_SCROLL_GLOBE_CONFIG.
 */
const { positions: defaultPositions } = DEFAULT_SCROLL_GLOBE_CONFIG

export const HOME_SCROLL_GLOBE_CONFIG: ScrollGlobeGlobeConfig = {
  /** Start (page 1) — centered hero; optical nudge via Home.css on section 0 only */
  leading: { top: '50%', left: '50%', scale: 1.52 },
  positions: [
    defaultPositions[0]!,
    /** Innovation — nudge left so the lit hemisphere reads centered behind copy */
    { top: '50%', left: '46%', scale: 1.05 },
    /** Discovery — pull anchor left so the globe isn't clipped off the right edge */
    { top: '15%', left: '82%', scale: 2 },
    /** Future — centered behind “Tomorrow” copy */
    { top: '50%', left: '46%', scale: 1.8 },
  ],
}
