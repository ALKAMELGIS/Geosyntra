import type { BillingPlanId } from '../../../lib/onboarding/pricingPlans'

export type { BillingPlanId }

/** Primary wizard flow (progress bar). Post-checkout screens are auxiliary. */
export type WizardStep = 'welcome' | 'pricing' | 'payment' | 'activation' | 'launch'

export const WIZARD_PROGRESS_STEPS = ['welcome', 'pricing', 'payment'] as const
export type WizardProgressStep = (typeof WIZARD_PROGRESS_STEPS)[number]

export type WizardOpenOptions = {
  /** Legacy aliases: `auth` → welcome, `identity` → pricing */
  step?: WizardStep | 'auth' | 'identity'
  planId?: BillingPlanId
  authMode?: 'signup' | 'signin'
  /** Open plan/checkout for an existing workspace (profile upgrade, billing route). */
  upgrade?: boolean
}
