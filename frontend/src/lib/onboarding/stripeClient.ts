/**
 * Stripe-ready client. Wire Payment Intent when backend exposes:
 *   POST /api/billing/payment-intent  → { clientSecret }
 *   POST /api/billing/create-checkout-session → { url }
 */
import { readAccessToken } from '../auth'
import { resolveApiUrl } from '../apiClient'
import { apiBillingPaymentIntent } from '../subscription/subscriptionApi'
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
  const api = await apiBillingPaymentIntent(planId)
  if (api.ok) return api.clientSecret
  try {
    const token = readAccessToken()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await fetch(resolveApiUrl(paymentIntentUrl), {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ planId }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { clientSecret?: string }
    return typeof data.clientSecret === 'string' ? data.clientSecret : null
  } catch {
    return null
  }
}

export async function createStripeCheckout(planId: BillingPlanId): Promise<{ url: string } | null> {
  if (!isStripeConfigured()) return null
  const checkoutUrl = String(
    import.meta.env?.VITE_STRIPE_CHECKOUT_URL ?? '/api/billing/create-checkout-session',
  ).trim()
  const token = readAccessToken()
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await fetch(resolveApiUrl(checkoutUrl), {
      method: 'POST',
      headers,
      body: JSON.stringify({ planId }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { url?: string }
    return typeof data.url === 'string' ? { url: data.url } : null
  } catch {
    return null
  }
}
