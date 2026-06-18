import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { SparklesCore } from '../../../components/ui/sparkles'

function resolveSparkleParticleColor(): string {
  if (typeof document === 'undefined') return '#FFFFFF'
  return document.documentElement.getAttribute('data-theme') === 'light' ? '#0B1220' : '#FFFFFF'
}

/** Subtle spark field behind plan price labels — mirrors Welcome hero sparkle strip. */
export function PricingPriceSparks() {
  const [particleColor, setParticleColor] = useState(resolveSparkleParticleColor)

  useEffect(() => {
    const root = document.documentElement
    const sync = () => setParticleColor(resolveSparkleParticleColor())
    sync()
    const obs = new MutationObserver(sync)
    obs.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])

  return (
    <div className="home-pricing__price-sparks" aria-hidden>
      <motion.div
        className="home-pricing__price-sparks-inner"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.85, ease: [0.23, 1, 0.32, 1] }}
      >
        <div className="home-pricing__sparkle-line home-pricing__sparkle-line--soft" />
        <motion.div className="home-pricing__sparkle-line home-pricing__sparkle-line--hairline" />
        <div className="home-pricing__sparkle-line home-pricing__sparkle-line--core-soft" />
        <div className="home-pricing__sparkle-line home-pricing__sparkle-line--core" />

        <SparklesCore
          background="transparent"
          minSize={0.35}
          maxSize={0.9}
          particleDensity={240}
          className="home-pricing__price-sparks-canvas"
          particleColor={particleColor}
          speed={0.85}
        />

        <div className="home-pricing__price-sparks-mask" />
      </motion.div>
    </div>
  )
}
