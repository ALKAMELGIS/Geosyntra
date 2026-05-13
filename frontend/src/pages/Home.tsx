import { useNavigate } from 'react-router-dom'
import LandingPage from '../components/ui/landing-page'
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
    <div className="home-landing">
      <LandingPage
        className="bg-gradient-to-br from-background via-muted/20 to-background"
        onPrimaryAction={() => navigate('/satellite/indices')}
        onSecondaryAction={() => navigate('/satellite/gis')}
      />
    </div>
  )
}
