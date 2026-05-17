import { AnimatePresence, motion } from 'framer-motion'
import { useHomeOnboarding } from './HomeOnboardingContext'
import { WIZARD_PROGRESS_STEPS, type WizardProgressStep } from './homeOnboarding.types'
import { WizardWelcomeStep } from './steps/WizardWelcomeStep'
import { WizardPricingStep } from './steps/WizardPricingStep'
import { WizardPaymentStep } from './steps/WizardPaymentStep'
import { WizardActivationStep } from './steps/WizardActivationStep'
import { WizardLaunchStep } from './steps/WizardLaunchStep'
import '../home-onboarding.css'

const PROGRESS_LABELS: Record<WizardProgressStep, string> = {
  welcome: 'Welcome',
  pricing: 'Plan',
  payment: 'Checkout',
}

export function HomeOnboardingWizard() {
  const { open, step, closeWizard } = useHomeOnboarding()

  const progressIndex = WIZARD_PROGRESS_STEPS.indexOf(step as WizardProgressStep)
  const showProgress = progressIndex >= 0

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="home-wizard-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="GeoSyntra onboarding"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button type="button" className="home-wizard-overlay__backdrop" aria-label="Close" onClick={closeWizard} />

          <motion.div
            className="home-wizard-shell"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.38, ease: [0.23, 1, 0.32, 1] }}
          >
            <div className="home-wizard-shell__glow" aria-hidden />

            <header className="home-wizard-shell__header">
              <div className="home-wizard-shell__brand-block">
                <span className="home-wizard-shell__brand">GeoSyntra</span>
                <span className="home-wizard-shell__tagline">Spatial intelligence platform</span>
              </div>

              {showProgress ? (
                <nav className="home-wizard-progress" aria-label="Onboarding progress">
                  {WIZARD_PROGRESS_STEPS.map((s, i) => (
                    <span
                      key={s}
                      className={`home-wizard-progress__step${i <= progressIndex ? ' is-active' : ''}${i < progressIndex ? ' is-done' : ''}`}
                    >
                      <span className="home-wizard-progress__dot">{i + 1}</span>
                      <span className="home-wizard-progress__label">{PROGRESS_LABELS[s]}</span>
                    </span>
                  ))}
                </nav>
              ) : (
                <span className="home-wizard-shell__phase" aria-live="polite">
                  {step === 'activation' ? 'Activating…' : 'Ready'}
                </span>
              )}

              <button type="button" className="home-wizard-shell__close" onClick={closeWizard} aria-label="Close">
                ×
              </button>
            </header>

            <div className="home-wizard-shell__body">
              <AnimatePresence mode="wait">
                {step === 'welcome' ? (
                  <motion.div
                    key="welcome"
                    className="home-wizard-panel"
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.28 }}
                  >
                    <WizardWelcomeStep />
                  </motion.div>
                ) : null}
                {step === 'pricing' ? (
                  <motion.div
                    key="pricing"
                    className="home-wizard-panel"
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.28 }}
                  >
                    <WizardPricingStep />
                  </motion.div>
                ) : null}
                {step === 'payment' ? (
                  <motion.div
                    key="payment"
                    className="home-wizard-panel"
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.28 }}
                  >
                    <WizardPaymentStep />
                  </motion.div>
                ) : null}
                {step === 'activation' ? (
                  <motion.div
                    key="activation"
                    className="home-wizard-panel home-wizard-panel--center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <WizardActivationStep />
                  </motion.div>
                ) : null}
                {step === 'launch' ? (
                  <motion.div
                    key="launch"
                    className="home-wizard-panel home-wizard-panel--center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <WizardLaunchStep />
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
