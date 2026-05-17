import { AnimatePresence, motion } from 'framer-motion'
import { PaymentSheet } from './PaymentSheet'
import { useHomeOnboarding } from './HomeOnboardingContext'
import { WizardAuthStep } from './steps/WizardAuthStep'
import { WizardIdentityStep } from './steps/WizardIdentityStep'
import { WizardPricingStep } from './steps/WizardPricingStep'
import { WizardActivationStep } from './steps/WizardActivationStep'
import { WizardLaunchStep } from './steps/WizardLaunchStep'
import '../home-onboarding.css'

const STEPS = ['auth', 'identity', 'pricing', 'activation', 'launch'] as const

export function HomeOnboardingWizard() {
  const { open, step, closeWizard, paymentOpen, selectedPlanId, closePayment, completePayment } =
    useHomeOnboarding()

  const stepIndex = Math.max(0, STEPS.indexOf(step as (typeof STEPS)[number]))

  return (
    <>
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
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
            >
              <header className="home-wizard-shell__header">
                <span className="home-wizard-shell__brand">GeoSyntra</span>
                <div className="home-wizard-progress" aria-hidden>
                  {STEPS.map((s, i) => (
                    <span key={s} className={i <= stepIndex ? 'is-done' : ''} />
                  ))}
                </div>
                <button type="button" className="home-wizard-shell__close" onClick={closeWizard} aria-label="Close">
                  ×
                </button>
              </header>

              <div className="home-wizard-shell__body">
                <AnimatePresence mode="wait">
                  {step === 'auth' ? (
                    <motion.div key="auth" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
                      <WizardAuthStep />
                    </motion.div>
                  ) : null}
                  {step === 'identity' ? (
                    <motion.div key="identity" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
                      <WizardIdentityStep />
                    </motion.div>
                  ) : null}
                  {step === 'pricing' ? (
                    <motion.div key="pricing" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
                      <WizardPricingStep />
                    </motion.div>
                  ) : null}
                  {step === 'activation' ? (
                    <motion.div key="activation" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <WizardActivationStep />
                    </motion.div>
                  ) : null}
                  {step === 'launch' ? (
                    <motion.div key="launch" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <WizardLaunchStep />
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
              {selectedPlanId && selectedPlanId !== 'trial' && selectedPlanId !== 'enterprise' ? (
                <PaymentSheet
                  open={paymentOpen}
                  planId={selectedPlanId}
                  onClose={closePayment}
                  onPaid={completePayment}
                />
              ) : null}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  )
}
