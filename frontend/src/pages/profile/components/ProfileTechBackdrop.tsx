import { GeoTechOrbitScene } from '../../../components/ui/GeoTechOrbitScene'
import './profile-tech-backdrop.css'

/** Profile-only ambient: mesh Earth + orbiting satellites (fixed behind content). */
export function ProfileTechBackdrop() {
  return (
    <div className="profile-tech-backdrop" aria-hidden>
      <div className="profile-tech-backdrop__glow profile-tech-backdrop__glow--cyan" />
      <div className="profile-tech-backdrop__glow profile-tech-backdrop__glow--violet" />

      <div className="profile-tech-backdrop__scene profile-tech-backdrop__scene--primary">
        <GeoTechOrbitScene size={440} satellites={6} live />
      </div>

      <div className="profile-tech-backdrop__scene profile-tech-backdrop__scene--secondary">
        <GeoTechOrbitScene size={260} satellites={4} live />
      </div>

      <div className="profile-tech-backdrop__vignette" />
    </div>
  )
}
