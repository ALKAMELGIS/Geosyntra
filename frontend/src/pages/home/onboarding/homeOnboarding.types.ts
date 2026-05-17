import type { BillingPlanId } from '../../../lib/onboarding/pricingPlans'

export type WizardStep = 'auth' | 'pricing' | 'payment' | 'activation' | 'launch'

export type WizardOpenOptions = {
  step?: WizardStep
  planId?: BillingPlanId
}
