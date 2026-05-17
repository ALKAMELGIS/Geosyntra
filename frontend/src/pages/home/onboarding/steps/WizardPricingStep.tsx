import { useAuth } from '../../../../state/auth'
import { getPricingPlan, type BillingPlanId } from '../../../../lib/onboarding/pricingPlans'
import { displayFirstName } from '../../../../lib/onboarding/localAuth'
import { PricingCards } from '../PricingCards'
import { useHomeOnboarding } from '../HomeOnboardingContext'

export function WizardPricingStep() {
  const { openPayment, runActivation, setStep, selectedPlanId, selectPlan } = useHomeOnboarding()
  const { user } = useAuth()
  const first = displayFirstName(user)

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
      <p className="home-wizard-step__eyebrow">Step 2 · Plans</p>
      <h2 className="home-wizard-step__title">
        Hello {first} <span aria-hidden>👋</span>
      </h2>
      <p className="home-wizard-step__lede">Choose how you want to run GeoSyntra. You can change plans anytime.</p>
      {selectedPlanId === 'trial' ? (
        <p className="home-wizard-trial-badge">Free Trial · 14 days active after activation</p>
      ) : null}
      <PricingCards
        compact
        selectedPlanId={selectedPlanId}
        onSelectPlan={selectPlan}
        onGetStarted={handleGetStarted}
      />
      <button type="button" className="home-wizard-back" onClick={() => setStep('auth')}>
        ← Back to account
      </button>
    </div>
  )
}
