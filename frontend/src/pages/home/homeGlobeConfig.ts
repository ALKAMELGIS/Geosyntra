import type { ScrollGlobeGlobeConfig } from '../../components/ui/globe-engine'

/**
 * Home scroll globe — Start · Innovation · Future.
 * All three beats anchor the Earth at viewport center (50%/50%) with
 * scale keyed to narrative emphasis (largest on Start, grand on Future).
 */
export const HOME_SCROLL_GLOBE_CONFIG: ScrollGlobeGlobeConfig = {
  leading: { top: '50%', left: '50%', scale: 1.52 },
  positions: [
    { top: '50%', left: '50%', scale: 1.18 },
    { top: '50%', left: '50%', scale: 1.88 },
  ],
}
