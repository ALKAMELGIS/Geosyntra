import { useNavigate } from 'react-router-dom'
import LandingPage from '../components/ui/landing-page'
import './Home.css'

/**
 * Home shell — renders the upstream "Explore Our World" 3D ScrollGlobe
 * landing page (https://21st.dev/r/m.umairwaheedansari/landing-page) inside
 * the Geosyntra app.
 *
 * The wrapper className matches the upstream demo (`bg-gradient-to-br
 * from-background via-muted/20 to-background`) so the soft charcoal sweep
 * behind the pinned globe stays identical to the reference bundle. CTAs are
 * intercepted here and routed into the live Satellite Imagery group, so a
 * visitor exploring the globe lands directly inside the platform's GIS
 * surface instead of bouncing on a marketing dead-end.
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
