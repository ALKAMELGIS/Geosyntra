/**
 * Stripe-ready client stub. Wire Checkout Session or Payment Element when backend exposes:
 *   POST /api/billing/create-checkout-session
 *   POST /api/billing/create-portal-session
 */
import type { BillingPlanId } from './pricingPlans'

const publishableKey =
  typeof import.meta !== 'undefined' ? String(import.meta.env?.VITE_STRIPE_PUBLISHABLE_KEY ?? '').trim() : ''

export function isStripeConfigured(): boolean {
  return publishableKey.length > 0 && publishableKey.startsWith('pk_')
}

export async function createStripeCheckout(_planId: BillingPlanId): Promise<{ url: string } | null> {
  if (!isStripeConfigured()) return null
  // Production: fetch session URL from API
  return null
}
