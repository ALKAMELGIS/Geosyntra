import { useAuth } from '../../state/auth'
import { PricingCards } from './onboarding/PricingCards'
import { useHomeOnboarding } from './onboarding/HomeOnboardingContext'
import type { BillingPlanId } from '../../lib/onboarding/pricingPlans'
import { getPricingPlan } from '../../lib/onboarding/pricingPlans'
import { enterpriseSalesMailto } from '../../lib/onboarding/onboardingPlanFlow'
import { planRequiresPaidCheckout } from '../../lib/onboarding/planSubscriptionFlow'

export function HomePricingSection() {
  const { user } = useAuth()
  const { openWizard, selectPlan, runActivation, openPayment, selectedPlanId } = useHomeOnboarding()

  const handleGetStarted = (planId: BillingPlanId) => {
    const plan = getPricingPlan(planId)
    if (!plan) return
    if (plan.id === 'enterprise') {
      window.location.href = enterpriseSalesMailto(user?.email)
      return
    }
    selectPlan(planId)
    if (!user) {
      openWizard({ step: 'welcome', planId, authMode: 'signup' })
      return
    }
    if (planRequiresPaidCheckout(planId)) {
      openWizard({ step: 'payment', planId, authMode: 'signin' })
      return
    }
    openWizard({ step: 'pricing', planId, authMode: 'signin' })
    if (!plan.requiresPayment) {
      void runActivation()
    }
  }

  const handleSelect = (planId: BillingPlanId) => {
    selectPlan(planId)
    document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <section id="pricing" className="home-pricing-section" aria-labelledby="home-pricing-heading">
      <div className="home-pricing-section__inner">
        <h2 id="home-pricing-heading" className="home-pricing-section__title">
          Plans built for spatial teams
        </h2>
        <p className="home-pricing-section__lede">
          Start with a 21-day free trial or activate Pro for 3 months with plan credits — Enterprise goes through sales.
        </p>
        <PricingCards
          selectedPlanId={selectedPlanId}
          onSelectPlan={handleSelect}
          onGetStarted={handleGetStarted}
        />
      </div>
    </section>
  )
}
