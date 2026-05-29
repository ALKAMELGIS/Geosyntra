import type { CurrentUser } from '../auth'
import { isPlatformOwnerUser } from '../auth'
import { activateWorkspaceForUser } from './activateWorkspace'
import {
  enterpriseSalesMailto,
  isUserPreAuthorizedByAdmin,
  signupPlanIdForEmail,
} from './onboardingPlanFlow'
import type { BillingPlanId } from './pricingPlans'
import { getPricingPlan } from './pricingPlans'
import {
  readWorkspaceState,
  trialDaysRemaining,
  writeWorkspaceState,
  type WorkspaceStateV1,
} from './workspaceState'
import type { HomeWizardLaunch } from '../homeWizardEntry'

/** All Stripe checkouts use the platform merchant keys on the API host (single account). */
export const PLATFORM_MERCHANT_LABEL =
  String(import.meta.env.VITE_BILLING_MERCHANT_LABEL ?? '').trim() || 'GeoSyntra Platform'

export type AuthPlanRoute =
  | { kind: 'enter_workspace' }
  | { kind: 'activate_provisioned' }
  | { kind: 'activate_trial' }
  | { kind: 'open_payment'; planId: 'pro' }
  | { kind: 'open_pricing'; upgrade?: boolean }
  | { kind: 'enterprise_sales' }

export function planRequiresPaidCheckout(planId: BillingPlanId): boolean {
  return planId === 'pro'
}

/** Sync local workspace when a free trial period has ended. */
export function syncTrialExpiry(email: string): WorkspaceStateV1 | null {
  const state = readWorkspaceState(email)
  if (!state || state.lifecycle !== 'trialing' || !state.trialEndsAt) return state
  if (new Date(state.trialEndsAt).getTime() > Date.now()) return state
  return writeWorkspaceState({
    ...state,
    lifecycle: 'expired',
    workspaceReady: false,
    paymentCompleted: false,
  })
}

export function isTrialExpired(state: WorkspaceStateV1 | null): boolean {
  if (!state) return false
  if (state.lifecycle === 'expired') return true
  if (state.lifecycle !== 'trialing') return false
  const days = trialDaysRemaining(state)
  return days !== null && days <= 0
}

export function requiresUpgradeToPaid(email: string): boolean {
  const state = syncTrialExpiry(email)
  return isTrialExpired(state)
}

export function resolveAuthPlanRoute(user: CurrentUser): AuthPlanRoute {
  if (isPlatformOwnerUser(user)) return { kind: 'enter_workspace' }

  const state = syncTrialExpiry(user.email)
  if (requiresUpgradeToPaid(user.email)) {
    return { kind: 'open_pricing', upgrade: true }
  }

  if (state?.workspaceReady && state.lifecycle !== 'expired') {
    return { kind: 'enter_workspace' }
  }

  if (isUserPreAuthorizedByAdmin(user.email)) {
    return { kind: 'activate_provisioned' }
  }

  const signupPlan = signupPlanIdForEmail(user.email)
  if (signupPlan === 'enterprise') return { kind: 'enterprise_sales' }
  if (signupPlan === 'pro') return { kind: 'open_payment', planId: 'pro' }
  if (signupPlan === 'trial') return { kind: 'activate_trial' }

  return { kind: 'open_pricing' }
}

export function activateTrialWorkspace(user: CurrentUser): void {
  activateWorkspaceForUser(user, 'trial', { paymentCompleted: true })
}

/** Wizard redirect after email verification, based on plan chosen at sign-up. */
export function postVerificationWizardIntent(planId: BillingPlanId): HomeWizardLaunch {
  if (planId === 'pro') {
    return { wizard: 'payment', authMode: 'signin', planId: 'pro' }
  }
  if (planId === 'enterprise') {
    return { wizard: 'pricing', authMode: 'signin', planId: 'enterprise' }
  }
  return { wizard: 'launch', authMode: 'signin', planId: 'trial' }
}

export function postVerificationMessage(planId: BillingPlanId): string {
  if (planId === 'pro') {
    return 'Email verified. Complete secure checkout to activate your Pro subscription…'
  }
  if (planId === 'enterprise') {
    return 'Email verified. Contact our sales team to complete your Enterprise subscription.'
  }
  return 'Email verified. Activating your free trial…'
}

export function openEnterpriseSales(email?: string): void {
  window.location.href = enterpriseSalesMailto(email)
}

export function pricingPlanActionLabel(planId: BillingPlanId): string {
  const plan = getPricingPlan(planId)
  if (!plan) return 'Get started'
  if (planId === 'enterprise') return plan.cta
  if (planRequiresPaidCheckout(planId)) return plan.cta
  return plan.cta
}
