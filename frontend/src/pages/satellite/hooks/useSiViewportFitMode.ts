import { useLayoutEffect, type RefObject } from 'react'

/** Responsive density tier for Map Canvas chrome (ArcGIS-style fit). */
export type SiViewportFitMode = 'compact' | 'cozy' | 'comfortable' | 'spacious'

export function resolveSiViewportFitMode(width: number, height: number): SiViewportFitMode {
  if (width <= 640 || height <= 520) return 'compact'
  if (width <= 1024 || height <= 680) return 'cozy'
  if (width <= 1536) return 'comfortable'
  return 'spacious'
}

/** Sets `data-si-fit-mode` on the Map Canvas page root for CSS-driven layout tiers. */
export function useSiViewportFitMode(pageRef: RefObject<HTMLElement | null>): SiViewportFitMode {
  useLayoutEffect(() => {
    const root = pageRef.current
    if (!root || typeof window === 'undefined') return

    const sync = () => {
      const mode = resolveSiViewportFitMode(window.innerWidth, window.innerHeight)
      root.dataset.siFitMode = mode
    }

    sync()
    window.addEventListener('resize', sync, { passive: true })
    window.visualViewport?.addEventListener('resize', sync)
    return () => {
      window.removeEventListener('resize', sync)
      window.visualViewport?.removeEventListener('resize', sync)
    }
  }, [pageRef])

  if (typeof window === 'undefined') return 'comfortable'
  return resolveSiViewportFitMode(window.innerWidth, window.innerHeight)
}
