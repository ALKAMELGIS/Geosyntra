import { useAuth } from '../../state/auth'
import { PricingCards } from './onboarding/PricingCards'
import { useHomeOnboarding } from './onboarding/HomeOnboardingContext'
import type { BillingPlanId } from '../../lib/onboarding/pricingPlans'
import { getPricingPlan } from '../../lib/onboarding/pricingPlans'

export function HomePricingSection() {
  const { user } = useAuth()
  const { openWizard, selectPlan, runActivation, openPayment, selectedPlanId } = useHomeOnboarding()

  const handleGetStarted = (planId: BillingPlanId) => {
    const plan = getPricingPlan(planId)
    if (!plan) return
    if (plan.id === 'enterprise') {
      window.open('mailto:sales@geosyntra.com?subject=Enterprise%20plan', '_blank')
      return
    }
    selectPlan(planId)
    if (!user) {
      openWizard({ step: 'welcome', planId })
      return
    }
    openWizard({ step: 'pricing', planId })
    if (plan.requiresPayment) {
      openPayment(planId)
      return
    }
    void runActivation()
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
          Start with a 14-day trial or go Pro instantly — billing stays inside GeoSyntra, no tab hopping.
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
