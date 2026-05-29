import { getAdminUserByEmail } from '../admin/adminUserStore'
import { isPlatformOwnerUser, normalizeEmail, type CurrentUser } from '../auth'
import { SUBSCRIPTION_DEFAULTS } from '../geoEnterpriseUserModel'
import type { BillingPlanId } from './pricingPlans'
import { normalizeSignupPlanId } from './signupPlans'
import { readWorkspaceState } from './workspaceState'

export const ONBOARDING_TRIAL_DAYS = 21
export const ONBOARDING_PRO_MONTHS = 3
export const ENTERPRISE_SALES_EMAIL = 'sales@geosyntra.com'

export type PostAuthRoute = 'enter_workspace' | 'activate_provisioned' | 'choose_plan'

export function isUserPreAuthorizedByAdmin(email: string): boolean {
  const row = getAdminUserByEmail(normalizeEmail(email))
  if (!row) return false
  const pe = row.profileExtra
  if (pe?.source === 'owner_provision') return true
  if (typeof pe?.provisionedBy === 'string' && pe.provisionedBy.trim()) return true
  return false
}

/** Plan chosen at self-service sign-up (before workspace activation). */
export function signupPlanIdForEmail(email: string): BillingPlanId | null {
  const row = getAdminUserByEmail(normalizeEmail(email))
  if (!row) return null
  const pe = row.profileExtra
  const raw =
    (typeof pe?.billingPlanId === 'string' && pe.billingPlanId) ||
    (typeof pe?.signupPlan === 'string' && pe.signupPlan) ||
    ''
  if (raw) return normalizeSignupPlanId(raw)
  const plan = String(row.plan ?? '').trim()
  if (plan === 'Pro') return 'pro'
  if (plan === 'Enterprise' || plan === 'Internal Team') return 'enterprise'
  if (plan === 'Trial') return 'trial'
  return null
}

export function billingPlanIdForAdminUser(email: string): BillingPlanId {
  const fromSignup = signupPlanIdForEmail(email)
  if (fromSignup) return fromSignup
  const row = getAdminUserByEmail(normalizeEmail(email))
  const plan = String(row?.plan ?? 'Trial')
  if (plan === 'Trial') return 'trial'
  if (plan === 'Enterprise' || plan === 'Internal Team') return 'enterprise'
  return 'pro'
}

/** Email/password sign-ups stay blocked until the inbox link is confirmed. */
export function isUserEmailVerified(user: CurrentUser | null | undefined): boolean {
  if (!user) return false
  if (isPlatformOwnerUser(user)) return true
  if (user.status === 'Pending Verification') return false
  const row = getAdminUserByEmail(normalizeEmail(user.email))
  if (row) {
    if (row.emailVerified === false) return false
    if (row.status === 'Pending Verification') return false
  }
  return user.status !== 'Pending Verification'
}

export function resolvePostAuthRoute(user: CurrentUser): PostAuthRoute {
  if (!isUserEmailVerified(user)) return 'choose_plan'
  if (isPlatformOwnerUser(user)) return 'enter_workspace'
  const ws = readWorkspaceState(user.email)
  if (ws?.workspaceReady) return 'enter_workspace'
  if (isUserPreAuthorizedByAdmin(user.email)) return 'activate_provisioned'
  return 'choose_plan'
}

export function enterpriseSalesMailto(userEmail?: string): string {
  const em = String(userEmail ?? '').trim()
  const subject = encodeURIComponent('GeoSyntra Enterprise subscription request')
  const body = encodeURIComponent(
    [
      'Hello GeoSyntra sales team,',
      '',
      'I would like to complete an Enterprise subscription for our organization.',
      em ? `Account email: ${em}` : '',
      '',
      'Thank you.',
    ]
      .filter(Boolean)
      .join('\n'),
  )
  return `mailto:${ENTERPRISE_SALES_EMAIL}?subject=${subject}&body=${body}`
}

export function planCreditsSummary(planId: BillingPlanId): string {
  const q = SUBSCRIPTION_DEFAULTS[planId === 'trial' ? 'free' : planId]
  return `${q.monthlyAnalysisQuota.toLocaleString()} analysis credits / month · ${q.apiCallsLimit.toLocaleString()} API calls`
}
