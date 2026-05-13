import { type CSSProperties } from 'react'
import './Home.css'
import { useSystemSettingsOptional } from '@/store/SystemSettingsContext'

/**
 * Home route (`/`) — empty canvas by product choice; navigation uses the primary sidebar.
 */
export default function Home() {
  const systemSettings = useSystemSettingsOptional()
  const homePageSettings = systemSettings?.settings.homePage ?? {
    showItemCounts: true,
    showCardChevron: true,
    cardDensity: 'comfortable' as const,
    backgroundMode: 'default' as const,
    backgroundColor: '#0b1220',
    backgroundGradientFrom: '#0f172a',
    backgroundGradientTo: '#14532d',
    backgroundImage: '',
  }
  const homeBackgroundStyle: CSSProperties =
    homePageSettings.backgroundMode === 'solid'
      ? { background: homePageSettings.backgroundColor }
      : homePageSettings.backgroundMode === 'gradient'
        ? {
            background: `linear-gradient(160deg, ${homePageSettings.backgroundGradientFrom}, ${homePageSettings.backgroundGradientTo})`,
          }
        : homePageSettings.backgroundMode === 'image' && homePageSettings.backgroundImage
          ? {
              backgroundImage: `linear-gradient(180deg, rgba(2, 6, 23, 0.42), rgba(2, 6, 23, 0.52)), url(${homePageSettings.backgroundImage})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }
          : {}

  return <div className="page home-page home-page--empty" style={homeBackgroundStyle} aria-label="Home" />
}
