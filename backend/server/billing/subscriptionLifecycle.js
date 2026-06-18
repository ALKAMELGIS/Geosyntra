/**
 * Trial windows, display status, and access resolution for subscriptions.
 */

export const DEFAULT_TRIAL_DAYS = Number(process.env.BILLING_TRIAL_DAYS || 14)

export const DISPLAY_STATUSES = [
  'active',
  'trialing',
  'trial_expired',
  'payment_pending',
  'pro',
  'enterprise',
  'canceled',
]

/** @typedef {'active'|'trialing'|'trial_expired'|'payment_pending'|'pro'|'enterprise'|'canceled'} DisplayStatus */

/**
 * @param {string | null | undefined} iso
 */
export function daysUntil(iso) {
  if (!iso) return null
  const ms = new Date(iso).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)))
}

/**
 * @param {Date} [from]
 */
export function trialEndIso(days = DEFAULT_TRIAL_DAYS, from = new Date()) {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000).toISOString()
}

/**
 * @param {{
 *   plan?: string
 *   status?: string
 *   trial_ends_at?: string | null
 *   current_period_end?: string | null
 *   billing_plan_id?: string | null
 * }} sub
 * @returns {DisplayStatus}
 */
export function displayStatus(sub) {
  const plan = String(sub?.plan || 'free').toLowerCase()
  const status = String(sub?.status || 'active').toLowerCase()
  const billingPlanId = String(sub?.billing_plan_id || '').toLowerCase()

  if (status === 'payment_pending') return 'payment_pending'
  if (status === 'canceled') return 'canceled'

  if (status === 'trialing') {
    const left = daysUntil(sub.trial_ends_at)
    if (left !== null && left <= 0) return 'trial_expired'
    return 'trialing'
  }

  if (plan === 'enterprise') return 'enterprise'
  if (plan === 'pro' && status === 'active') return 'pro'
  if (status === 'trial_expired') return 'trial_expired'

  if (plan === 'free' && billingPlanId === 'trial') {
    const left = daysUntil(sub.trial_ends_at)
    if (sub.trial_ends_at && left !== null && left <= 0) return 'trial_expired'
    if (sub.trial_ends_at && left !== null && left > 0) return 'trialing'
  }

  return 'active'
}

/**
 * Normalize record for API + middleware (may mark trial_expired).
 * @param {Record<string, unknown>} record
 */
export function resolveSubscriptionAccess(record) {
  const sub = { ...record }
  const display = displayStatus(sub)
  if (display === 'trial_expired' && sub.status === 'trialing') {
    sub.status = 'trial_expired'
  }
  sub.display_status = display
  sub.trial_days_remaining =
    display === 'trialing' ? daysUntil(String(sub.trial_ends_at || '')) : null
  sub.is_paid_active = display === 'pro' || display === 'enterprise'
  sub.can_use_paid_features =
    display === 'pro' || display === 'enterprise' || display === 'trialing'
  return sub
}
