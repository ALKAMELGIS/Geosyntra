import { motion, useReducedMotion } from 'framer-motion'
import { GEOSYNTRA_BRAND_LOGO_SVG } from '../../../lib/brand'

const WIZARD_WELCOME_LOGO_SVG = GEOSYNTRA_BRAND_LOGO_SVG.replaceAll('id="gs-line"', 'id="gs-wizard-welcome-line"').replaceAll(
  'url(#gs-line)',
  'url(#gs-wizard-welcome-line)',
)

/** Luminous brand mark for the welcome wizard column — scoped SVG ids avoid gradient clashes. */
export function WizardWelcomeBrandMark() {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      className="home-wizard-welcome__logo"
      aria-hidden
      initial={reduceMotion ? false : { opacity: 0, scale: 0.94 }}
      animate={reduceMotion ? undefined : { opacity: 1, scale: 1 }}
      transition={{ duration: 0.75, delay: 0.12, ease: [0.23, 1, 0.32, 1] }}
    >
      <div className="home-wizard-welcome__logo-aura" />
      <motion.div
        className="home-wizard-welcome__logo-orbit"
        animate={reduceMotion ? undefined : { rotate: 360 }}
        transition={{ duration: 22, repeat: Infinity, ease: 'linear' }}
      />
      <motion.div
        className="home-wizard-welcome__logo-mark"
        dangerouslySetInnerHTML={{ __html: WIZARD_WELCOME_LOGO_SVG }}
        animate={reduceMotion ? undefined : { y: [0, -6, 0] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
      />
    </motion.div>
  )
}
