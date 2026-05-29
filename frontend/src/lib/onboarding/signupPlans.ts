import type { BillingPlanId } from './pricingPlans'

export type SignupPlanOption = {
  id: BillingPlanId
  label: string
  shortLabel: string
  iconClass: string
  description: string
}

/** Self-service registration — plan drives access; RBAC role stays Trial User. */
export const SIGNUP_PLAN_OPTIONS: readonly SignupPlanOption[] = [
  {
    id: 'trial',
    label: 'Trial User',
    shortLabel: 'Trial User',
    iconClass: 'fa-solid fa-hourglass-half',
    description: '21-day trial — explore maps, GeoAI, and core workflows at no cost.',
  },
  {
    id: 'pro',
    label: 'Pro',
    shortLabel: 'Pro',
    iconClass: 'fa-solid fa-bolt',
    description: '3 months with analysis credits — production workflows for analysts and teams.',
  },
  {
    id: 'enterprise',
    label: 'Enterprise',
    shortLabel: 'Enterprise',
    iconClass: 'fa-solid fa-building',
    description: 'Custom capacity, SSO, and SLA — our sales team completes activation.',
  },
] as const

export const DEFAULT_SIGNUP_PLAN_ID: BillingPlanId = 'trial'

export function normalizeSignupPlanId(raw: string | undefined | null): BillingPlanId {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
  if (s === 'pro') return 'pro'
  if (s === 'enterprise') return 'enterprise'
  if (s === 'trial' || s === 'trial_user' || s === 'free') return 'trial'
  return DEFAULT_SIGNUP_PLAN_ID
}

export function signupPlanById(id: string): SignupPlanOption | undefined {
  const planId = normalizeSignupPlanId(id)
  return SIGNUP_PLAN_OPTIONS.find(p => p.id === planId)
}

/** Admin directory `plan` column labels. */
export function adminPlanLabelForBillingId(planId: BillingPlanId): string {
  if (planId === 'pro') return 'Pro'
  if (planId === 'enterprise') return 'Enterprise'
  return 'Trial'
}
