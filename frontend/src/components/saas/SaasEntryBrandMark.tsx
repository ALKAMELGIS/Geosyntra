import { motion, useReducedMotion } from 'framer-motion'
import { useMemo } from 'react'
import { brandLogoSvgWithGradientId } from '../../lib/brand'

const SAAS_ENTRY_LOGO_SVG = brandLogoSvgWithGradientId('gs-saas-entry-line')

/** Animated Geosyntra mark for `.saas-entry__brand` — hex chip with luminous aura + orbit ring. */
export function SaasEntryBrandMark() {
  const reduceMotion = useReducedMotion()
  const svg = useMemo(() => SAAS_ENTRY_LOGO_SVG, [])

  return (
    <span className="saas-entry__brand-mark" aria-hidden>
      <span className="saas-entry__brand-mark-aura" />
      <motion.span
        className="saas-entry__brand-mark-orbit"
        animate={reduceMotion ? undefined : { rotate: 360 }}
        transition={{ duration: 28, repeat: Infinity, ease: 'linear' }}
      />
      <motion.span
        className="saas-entry__brand-mark-icon"
        dangerouslySetInnerHTML={{ __html: svg }}
        initial={reduceMotion ? false : { opacity: 0, scale: 0.9 }}
        animate={reduceMotion ? undefined : { opacity: 1, scale: 1 }}
        transition={{ duration: 0.75, ease: [0.23, 1, 0.32, 1] }}
      />
    </span>
  )
}
