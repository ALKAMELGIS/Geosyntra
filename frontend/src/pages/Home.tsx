import { useEffect, startTransition } from 'react'
import { useNavigate } from 'react-router-dom'
import LandingPage from '../components/ui/landing-page'
import HeroThemeToggle from './components/HeroThemeToggle'
import { prefetchRoute } from '../routes/routePrefetch'
import './Home.css'

/* Routes the Home Hero CTAs jump to. We surface them as constants so
 * the speculative prefetch list (below) and the runtime navigate
 * callbacks stay in lock-step — change one, you change both. */
const HERO_PRIMARY_PATH = '/satellite/indices'
const HERO_SECONDARY_PATH = '/learn-more'

/**
 * Home → 1:1 mount of the upstream 21st.dev `landing-page` bundle
 * (https://21st.dev/r/m.umairwaheedansari/landing-page).
 *
 * Mirrors the upstream `Demo.tsx` (`<Component />`) one-liner — the entire
 * landing experience (4 sections, right-rail nav, progress
 * hairline) lives inside `<LandingPage />`. The host shell (App.tsx) drops
 * chrome on `/` so this component owns the full viewport, matching the
 * reference bundle byte-for-byte.
 *
 * The two CTAs are intercepted to bridge into the live Satellite Imagery
 * surface (NDVI dashboard / GIS Map), turning the marketing splash into the
 * real platform entry point instead of an upstream `console.log`.
 */
export default function Home() {
  const navigate = useNavigate()

  /* Speculative chunk warming — once the Hero has painted and the
   * browser is idle, kick off the dynamic imports for the two CTA
   * targets (Satellite Indices + Learn More). By the time the user
   * actually clicks a button they both resolve from cache, so the
   * navigation reads as instant instead of waiting for a 400 KB+
   * chunk to download. `requestIdleCallback` defers the work past
   * the first paint so it never competes with Hero animations.
   * Falls back to `setTimeout(0)` on browsers without RIC (Safari). */
  useEffect(() => {
    if (typeof window === 'undefined') return
    const ric =
      (window as unknown as {
        requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number
        cancelIdleCallback?: (id: number) => void
      }).requestIdleCallback ?? null
    let id: number
    if (ric) {
      id = ric(
        () => {
          prefetchRoute(HERO_PRIMARY_PATH)
          prefetchRoute(HERO_SECONDARY_PATH)
        },
        { timeout: 1500 },
      )
      return () => {
        const cic = (window as unknown as { cancelIdleCallback?: (id: number) => void })
          .cancelIdleCallback
        if (cic) cic(id)
      }
    }
    const tid = window.setTimeout(() => {
      prefetchRoute(HERO_PRIMARY_PATH)
      prefetchRoute(HERO_SECONDARY_PATH)
    }, 600)
    return () => window.clearTimeout(tid)
  }, [])

  /* `startTransition` lets React keep the current Hero responsive
   * while the heavy lazy() route mounts in the background — no
   * frame drop, no layout jank. The router's `v7_startTransition`
   * flag does the same for declarative <Link> clicks; this covers
   * the imperative `navigate()` path the CTAs use. */
  const goPrimary = () => startTransition(() => navigate(HERO_PRIMARY_PATH))
  const goSecondary = () => startTransition(() => navigate(HERO_SECONDARY_PATH))

  return (
    /*
     * Home wrapper — locked to the responsive spec the user signed off on
     * (2026-05-13):
     *   - `min-h-screen`               page is at least one full viewport tall
     *   - `w-full max-w-full`          spans the parent without overflowing
     *   - `flex flex-col`              children stack vertically
     *
     * Per-section padding (`px-4 sm:px-6 md:px-8 lg:px-12 py-12 sm:py-16
     * lg:py-20`) lives on each `<section>` inside `<LandingPage />` so
     * every scroll panel honours the same responsive ramp without
     * double-padding the outer shell. Vertical centring of the panel
     * content also lives inside each section (`justify-center`), so a
     * 1920×1080 desktop renders ≈ 1824×920 of usable content area
     * (1920 − 2 × 48 px horizontal, 1080 − 2 × 80 px vertical).
     */
    <div className="home-landing min-h-screen w-full max-w-full flex flex-col">
      <LandingPage
        className="bg-gradient-to-br from-background via-muted/20 to-background"
        onPrimaryAction={goPrimary}
        onSecondaryAction={goSecondary}
      />
      {/* Floating Dark/Light preview toggle — Home page only.
       *   Lives outside <LandingPage /> so it isn't trapped inside
       *   any per-section stacking context (the sections create
       *   z-30 contexts that would otherwise pin the pill to a
       *   single panel). Mounting it here keeps it `position: fixed`
       *   relative to the viewport across every Hero / Innovation /
       *   Discovery / Future scroll. The component owns its own
       *   z-index (35) so it doesn't need any outer wrapper styling. */}
      <HeroThemeToggle />
    </div>
  )
}
