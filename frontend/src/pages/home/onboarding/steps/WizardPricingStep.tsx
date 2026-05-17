import { getPricingPlan, type BillingPlanId } from '../../../../lib/onboarding/pricingPlans'
import { PricingCards } from '../PricingCards'
import { useHomeOnboarding } from '../HomeOnboardingContext'

export function WizardPricingStep() {
  const { openPayment, runActivation, selectedPlanId, selectPlan, setStep } = useHomeOnboarding()

  const handleGetStarted = (planId: BillingPlanId) => {
    selectPlan(planId)
    const plan = getPricingPlan(planId)
    if (!plan) return
    if (plan.id === 'enterprise') {
      window.open('mailto:sales@geosyntra.com?subject=Enterprise%20plan', '_blank')
      return
    }
    if (plan.requiresPayment) {
      openPayment(planId)
      return
    }
    void runActivation()
  }

  return (
    <div className="home-wizard-step home-wizard-step--pricing">
      <p className="home-wizard-step__eyebrow">Step 2 · Plan selection</p>
      <h2 className="home-wizard-step__title">Choose your plan</h2>
      <p className="home-wizard-step__lede">
        Start with a 14-day trial or subscribe to Pro. Checkout opens in the next step — no page leave.
      </p>
      {selectedPlanId === 'trial' ? (
        <p className="home-wizard-trial-badge">Free Trial · 14 days active after activation</p>
      ) : null}
      <PricingCards
        compact
        selectedPlanId={selectedPlanId}
        onSelectPlan={selectPlan}
        onGetStarted={handleGetStarted}
      />
      <button type="button" className="home-wizard-back" onClick={() => setStep('welcome')}>
        ← Back to welcome
      </button>
    </div>
  )
}
