import { motion, useReducedMotion } from 'framer-motion'

import { useMemo } from 'react'

import { GeosyntraAnimatedBrandMark } from '../../../components/ui/GeosyntraAnimatedBrandMark'

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

    <GeosyntraAnimatedBrandMark

      size={195}

      satellites={5}

      live

      className="home-wizard-welcome__logo"

      sceneClassName="home-wizard-welcome__orbit-scene"

      gradientId="gs-wizard-welcome-line"

    >

      <motion.div

        className="home-wizard-welcome__logo-mark gs-animated-brand__mark"

        dangerouslySetInnerHTML={{ __html: svg }}

        initial={reduceMotion ? false : { opacity: 0, scale: 0.88 }}

        animate={reduceMotion ? undefined : { opacity: 1, scale: 1 }}

        transition={{ duration: 0.85, ease: [0.23, 1, 0.32, 1] }}

      />

    </GeosyntraAnimatedBrandMark>

  )

}

