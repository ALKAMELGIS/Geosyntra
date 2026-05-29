import { motion } from 'framer-motion'

const LINES = [
  'Loading GeoSyntra Workspace…',
  'Initializing Spatial Layers…',
  'Loading Satellite Data (Sentinel / Planet)…',
  'Starting AI Engine…',
]

export function WizardActivationStep() {
  return (
    <div className="home-wizard-step home-wizard-step--activation">
      <p className="home-wizard-step__eyebrow">Step 5 · Workspace</p>
      <h2 className="home-wizard-step__title">Launching your workspace</h2>
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
