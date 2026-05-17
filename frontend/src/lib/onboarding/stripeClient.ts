/**
 * Stripe-ready client. Wire Payment Intent when backend exposes:
 *   POST /api/billing/payment-intent  → { clientSecret }
 *   POST /api/billing/create-checkout-session → { url }
 */
import type { BillingPlanId } from './pricingPlans'

const publishableKey =
  typeof import.meta !== 'undefined' ? String(import.meta.env?.VITE_STRIPE_PUBLISHABLE_KEY ?? '').trim() : ''

const paymentIntentUrl =
  typeof import.meta !== 'undefined'
    ? String(import.meta.env?.VITE_STRIPE_PAYMENT_INTENT_URL ?? '/api/billing/payment-intent').trim()
    : '/api/billing/payment-intent'

export function getStripePublishableKey(): string {
  return publishableKey
}

export function isStripeConfigured(): boolean {
  return publishableKey.length > 0 && publishableKey.startsWith('pk_')
}

export async function fetchPaymentIntentClientSecret(planId: BillingPlanId): Promise<string | null> {
  if (!isStripeConfigured()) return null
  try {
    const res = await fetch(paymentIntentUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { clientSecret?: string }
    return typeof data.clientSecret === 'string' ? data.clientSecret : null
  } catch {
    return null
  }
}

export async function createStripeCheckout(_planId: BillingPlanId): Promise<{ url: string } | null> {
  if (!isStripeConfigured()) return null
  return null
}
