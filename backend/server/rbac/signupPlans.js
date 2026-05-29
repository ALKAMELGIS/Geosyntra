/** Self-service sign-up subscription types (replaces role selection). */

export const SIGNUP_PLAN_IDS = Object.freeze(['trial', 'pro', 'enterprise'])

export function normalizeSignupPlanId(value) {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
  if (raw === 'pro') return 'pro'
  if (raw === 'enterprise') return 'enterprise'
  if (raw === 'trial' || raw === 'trial_user' || raw === 'free') return 'trial'
  return 'trial'
}

export function resolveSignupPlan(requested) {
  const planId = normalizeSignupPlanId(requested)
  const adminPlan =
    planId === 'pro' ? 'Pro' : planId === 'enterprise' ? 'Enterprise' : 'Trial'
  const subscriptionPlan = planId === 'trial' ? 'free' : planId
  return { ok: true, planId, adminPlan, subscriptionPlan }
}
