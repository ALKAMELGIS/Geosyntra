import { useNavigate } from 'react-router-dom'
import LandingPage from '../components/ui/landing-page'
import './Home.css'

/**
 * Home shell — renders the AI 3D ScrollGlobe landing.
 * The two CTAs route into the live Satellite Imagery group, so visitors land
 * directly inside the platform's GIS surface after exploring the globe.
 */
export default function Home() {
  const navigate = useNavigate()
  return (
    <div className="home-landing">
      <LandingPage
        onPrimaryAction={() => navigate('/satellite/indices')}
        onSecondaryAction={() => navigate('/satellite/gis')}
      />
    </div>
  )
}
