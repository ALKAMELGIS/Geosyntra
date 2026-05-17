import { useHomeOnboarding } from '../HomeOnboardingContext'
import { StripeCheckoutPanel } from '../StripeCheckoutPanel'
import { getPricingPlan } from '../../../../lib/onboarding/pricingPlans'

export function WizardPaymentStep() {
  const { selectedPlanId, setStep, completePayment } = useHomeOnboarding()
  const plan = selectedPlanId ? getPricingPlan(selectedPlanId) : null

  if (!selectedPlanId || !plan) {
    return (
      <div className="home-wizard-step">
        <p className="home-wizard-step__lede">Select a plan first.</p>
        <button type="button" className="home-wizard-back" onClick={() => setStep('pricing')}>
          ← Back to plans
        </button>
      </div>
    )
  }

  return (
    <div className="home-wizard-step home-wizard-step--payment">
      <p className="home-wizard-step__eyebrow">Step 3 · Checkout</p>
      <h2 className="home-wizard-step__title">Secure payment</h2>
      <p className="home-wizard-step__lede">
        Complete your subscription with Stripe. Card data never touches our servers.
      </p>
      <StripeCheckoutPanel
        planId={selectedPlanId}
        onBack={() => setStep('pricing')}
        onPaid={completePayment}
      />
    </div>
  )
}
