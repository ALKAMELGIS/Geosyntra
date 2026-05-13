import { useNavigate } from 'react-router-dom'
import LandingPage from '../components/ui/landing-page'
import HeroThemeToggle from './components/HeroThemeToggle'
import './Home.css'

/**
 * Home → 1:1 mount of the upstream 21st.dev `landing-page` bundle
 * (https://21st.dev/r/m.umairwaheedansari/landing-page).
 *
 * Mirrors the upstream `Demo.tsx` (`<Component />`) one-liner — the entire
 * landing experience (4 sections, pinned globe, right-rail nav, progress
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
        onPrimaryAction={() => navigate('/satellite/indices')}
        onSecondaryAction={() => navigate('/learn-more')}
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
