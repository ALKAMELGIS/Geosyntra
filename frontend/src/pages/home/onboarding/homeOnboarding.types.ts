import type { BillingPlanId } from '../../../lib/onboarding/pricingPlans'

export type WizardStep = 'auth' | 'identity' | 'pricing' | 'payment' | 'activation' | 'launch'

export type WizardOpenOptions = {
  step?: WizardStep
  planId?: BillingPlanId
  authMode?: 'signup' | 'signin'
}
