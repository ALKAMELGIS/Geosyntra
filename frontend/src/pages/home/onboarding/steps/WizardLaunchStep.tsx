import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../../../../state/auth'
import { displayFirstName } from '../../../../lib/onboarding/localAuth'
import { SaasButton } from '../../../../components/saas/SaasEntryShell'
import { useHomeOnboarding } from '../HomeOnboardingContext'

const BOOT_LINES = [
  'Loading GeoSyntra Workspace…',
  'Initializing layers…',
  'Connecting imagery providers…',
  'Starting AI engine…',
]

export function WizardLaunchStep() {
  const { enterWorkspace, trialDaysLeft } = useHomeOnboarding()
  const { user } = useAuth()
  const first = displayFirstName(user)

  useEffect(() => {
    const t = window.setTimeout(() => enterWorkspace(), 4200)
    return () => window.clearTimeout(t)
  }, [enterWorkspace])

  return (
    <div className="home-wizard-step home-wizard-step--launch">
      <p className="home-wizard-step__eyebrow">Ready</p>
      <h2 className="home-wizard-step__title">Welcome, {first}</h2>
      {trialDaysLeft != null ? (
        <p className="home-wizard-trial-badge">Free Trial · {trialDaysLeft} days left</p>
      ) : (
        <p className="home-wizard-trial-badge home-wizard-trial-badge--pro">Pro workspace active</p>
      )}
      <ul className="home-wizard-launch-lines">
        {BOOT_LINES.map((line, i) => (
          <motion.li
            key={line}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.5, duration: 0.35 }}
          >
            {line}
          </motion.li>
        ))}
      </ul>
      <SaasButton size="lg" variant="primary" onClick={enterWorkspace}>
        Enter dashboard now
      </SaasButton>
    </div>
  )
}
