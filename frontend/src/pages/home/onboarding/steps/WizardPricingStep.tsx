import { useState } from 'react'
import { useAuth } from '../../../../state/auth'
import { getPricingPlan, type BillingPlanId } from '../../../../lib/onboarding/pricingPlans'
import {
  ONBOARDING_PRO_MONTHS,
  ONBOARDING_TRIAL_DAYS,
  planCreditsSummary,
} from '../../../../lib/onboarding/onboardingPlanFlow'
import { openEnterpriseSales, planRequiresPaidCheckout } from '../../../../lib/onboarding/planSubscriptionFlow'
import { PricingCards } from '../PricingCards'
import { useHomeOnboarding } from '../HomeOnboardingContext'

export function WizardPricingStep() {
  const { user } = useAuth()
  const { openPayment, runActivation, selectedPlanId, selectPlan, setStep } = useHomeOnboarding()
  const [info, setInfo] = useState('')

  const handleGetStarted = (planId: BillingPlanId) => {
    setInfo('')
    selectPlan(planId)
    const plan = getPricingPlan(planId)
    if (!plan) return
    if (plan.id === 'enterprise') {
      openEnterpriseSales(user?.email)
      setInfo(
        'Your Enterprise request was opened in your email app. Our sales team will contact you to complete subscription — your workspace is not activated until then.',
      )
      return
    }
    if (planRequiresPaidCheckout(planId)) {
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
        Confirm the subscription type you chose at sign-up to activate your workspace. Free Trial runs{' '}
        {ONBOARDING_TRIAL_DAYS} days; Pro includes {ONBOARDING_PRO_MONTHS} months with usage credits.
      </p>
      {selectedPlanId === 'trial' ? (
        <p className="home-wizard-trial-badge">Free Trial · {ONBOARDING_TRIAL_DAYS} days after activation</p>
      ) : null}
      {selectedPlanId === 'pro' ? (
        <p className="home-wizard-trial-badge home-wizard-trial-badge--pro">
          Pro · {ONBOARDING_PRO_MONTHS} months · {planCreditsSummary('pro')}
        </p>
      ) : null}
      {info ? <p className="home-wizard-form__info">{info}</p> : null}
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
