import { motion, useReducedMotion } from 'framer-motion'
import { useMemo } from 'react'
import { GeoTechOrbitScene } from '../../../components/ui/GeoTechOrbitScene'
import { brandLogoSvgWithGradientId } from '../../../lib/brand'

const WIZARD_WELCOME_LOGO_SVG = brandLogoSvgWithGradientId('gs-wizard-welcome-line')

/**
 * Welcome wizard brand — animated tech orbit scene (mesh + satellites) with
 * the hex G/L mark centered. Matches the pre-refactor motion; SVG stays crisp.
 */
export function WizardWelcomeBrandMark() {
  const reduceMotion = useReducedMotion()
  const svg = useMemo(() => WIZARD_WELCOME_LOGO_SVG, [])

  return (
    <div className="home-wizard-welcome__logo" aria-hidden>
      <GeoTechOrbitScene size={195} satellites={5} live className="home-wizard-welcome__orbit-scene">
        <motion.div
          className="home-wizard-welcome__logo-mark"
          dangerouslySetInnerHTML={{ __html: svg }}
          initial={reduceMotion ? false : { opacity: 0, scale: 0.88 }}
          animate={reduceMotion ? undefined : { opacity: 1, scale: 1 }}
          transition={{ duration: 0.85, ease: [0.23, 1, 0.32, 1] }}
        />
      </GeoTechOrbitScene>
    </div>
  )
}
