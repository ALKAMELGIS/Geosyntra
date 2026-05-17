import { motion } from 'framer-motion'

const LINES = [
  'Securing your workspace…',
  'Provisioning Layer Live sync…',
  'Loading Sentinel & Planet catalogs…',
  'Starting GeoAI engine…',
]

export function WizardActivationStep() {
  return (
    <div className="home-wizard-step home-wizard-step--activation">
      <p className="home-wizard-step__eyebrow">Step 3 · Activation</p>
      <h2 className="home-wizard-step__title">Preparing GeoSyntra</h2>
      <ul className="home-wizard-activation-list">
        {LINES.map((line, i) => (
          <motion.li
            key={line}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.35, duration: 0.4 }}
          >
            <span className="home-wizard-activation-dot" />
            {line}
          </motion.li>
        ))}
      </ul>
    </div>
  )
}
