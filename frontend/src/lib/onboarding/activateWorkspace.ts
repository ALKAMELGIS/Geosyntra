import type { CurrentUser } from '../auth'
import { getPricingPlan, type BillingPlanId } from './pricingPlans'
import { displayFirstName } from './localAuth'
import { persistGeoEnterpriseProfile, readWorkspaceState, writeWorkspaceState, type WorkspaceStateV1 } from './workspaceState'
import type { SubscriptionPlanId } from '../geoEnterpriseUserModel'

const TRIAL_MS = 14 * 24 * 60 * 60 * 1000

export type ActivationResult = {
  state: WorkspaceStateV1
  message: string
}

function buildWorkspaceId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `ws_${crypto.randomUUID().slice(0, 8)}`
    : `ws_${Date.now()}`
}

export function activateWorkspaceForUser(
  user: CurrentUser,
  billingPlanId: BillingPlanId,
  opts?: { paymentCompleted?: boolean },
): ActivationResult {
  const plan = getPricingPlan(billingPlanId)
  if (!plan) throw new Error('Unknown plan')

  const now = new Date()
  const existing = readWorkspaceState(user.email)
  const workspaceId = existing?.workspaceId ?? buildWorkspaceId()

  let lifecycle: WorkspaceStateV1['lifecycle'] = 'active'
  let trialStartedAt = ''
  let trialEndsAt = ''
  let subscriptionExpiresAt = ''
  let paymentCompleted = Boolean(opts?.paymentCompleted)

  if (billingPlanId === 'trial' || !plan.requiresPayment) {
    lifecycle = 'trialing'
    trialStartedAt = now.toISOString()
    trialEndsAt = new Date(now.getTime() + TRIAL_MS).toISOString()
    subscriptionExpiresAt = trialEndsAt
    paymentCompleted = true
  } else if (plan.requiresPayment && paymentCompleted) {
    lifecycle = 'active'
    const renew = new Date(now)
    renew.setMonth(renew.getMonth() + 1)
    subscriptionExpiresAt = renew.toISOString()
  }

  const subscriptionPlan: SubscriptionPlanId = plan.subscriptionPlan

  const state: WorkspaceStateV1 = {
    email: user.email,
    displayName: user.name || displayFirstName(user),
    lifecycle,
    billingPlanId,
    subscriptionPlan,
    trialStartedAt,
    trialEndsAt,
    subscriptionExpiresAt,
    workspaceId,
    workspaceReady: true,
    paymentCompleted,
    updatedAt: now.toISOString(),
  }

  writeWorkspaceState(state)

  const nameParts = user.name.trim().split(/\s+/)
  persistGeoEnterpriseProfile(user.email, {
    firstName: nameParts[0] ?? '',
    lastName: nameParts.slice(1).join(' '),
    subscriptionPlan,
    subscriptionExpiresAt,
    workspaceId,
    workspaceLabel: `${displayFirstName(user)} workspace`,
  })

  const message =
    lifecycle === 'trialing'
      ? `Free trial activated — 14 days for ${displayFirstName(user)}.`
      : `Subscription active on ${plan.name}.`

  return { state, message }
}

/** Mock card / PayPal checkout — replace with Stripe Elements when `VITE_STRIPE_PUBLISHABLE_KEY` is set. */
export async function processMockPayment(_planId: BillingPlanId): Promise<{ ok: true } | { ok: false; error: string }> {
  await new Promise(r => window.setTimeout(r, 1200))
  return { ok: true }
}
