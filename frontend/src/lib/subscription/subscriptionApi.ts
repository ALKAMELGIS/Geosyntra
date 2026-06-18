import { readAccessToken } from '../auth'
import { resolveApiUrl } from '../apiClient'
import type { BillingInvoice, BillingSubscription, BillingUsage } from './subscriptionTypes'

function billingFetch<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T }> {
  const token = readAccessToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string>),
  }
  if (token) headers.Authorization = `Bearer ${token}`
  return fetch(resolveApiUrl(path), { ...init, headers, credentials: 'include' })
    .then(async res => {
      const data = (await res.json().catch(() => ({}))) as T
      return { ok: res.ok, status: res.status, data }
    })
    .catch(() => ({ ok: false, status: 0, data: { error: 'network_error' } as T }))
}

export function isBillingApiConfigured(): boolean {
  const base = String(import.meta.env.VITE_API_BASE_URL ?? '').trim()
  if (base) return true
  if (typeof window === 'undefined') return false
  const host = window.location.hostname
  return !(host.endsWith('github.io') || host.endsWith('github.dev'))
}

export async function apiBillingMe(): Promise<
  | { ok: true; subscription: BillingSubscription; usage: BillingUsage }
  | { ok: false; error?: string }
> {
  const { ok, data } = await billingFetch<{
    ok?: boolean
    subscription?: BillingSubscription
    usage?: BillingUsage
    error?: string
  }>('/api/billing/me')
  if (ok && data.ok && data.subscription) {
    return {
      ok: true,
      subscription: data.subscription,
      usage: data.usage ?? { ai_queries: 0, grounding_calls: 0, exports: 0 },
    }
  }
  return { ok: false, error: data.error }
}

export async function apiBillingInvoices(): Promise<{ ok: true; invoices: BillingInvoice[] } | { ok: false }> {
  const { ok, data } = await billingFetch<{ ok?: boolean; invoices?: BillingInvoice[] }>('/api/billing/invoices')
  if (ok && data.ok && Array.isArray(data.invoices)) return { ok: true, invoices: data.invoices }
  return { ok: false }
}

export async function apiBillingStartTrial(): Promise<{ ok: boolean; subscription?: BillingSubscription }> {
  const { ok, data } = await billingFetch<{ ok?: boolean; subscription?: BillingSubscription }>(
    '/api/billing/start-trial',
    { method: 'POST', body: '{}' },
  )
  return { ok: ok && Boolean(data.ok), subscription: data.subscription }
}

export async function apiBillingActivate(
  planId: string,
  opts?: { paymentCompleted?: boolean; provider?: string },
): Promise<{ ok: boolean; subscription?: BillingSubscription }> {
  const { ok, data } = await billingFetch<{ ok?: boolean; subscription?: BillingSubscription }>(
    '/api/billing/activate',
    {
      method: 'POST',
      body: JSON.stringify({
        planId,
        paymentCompleted: opts?.paymentCompleted ?? false,
        provider: opts?.provider,
      }),
    },
  )
  return { ok: ok && Boolean(data.ok), subscription: data.subscription }
}

export async function apiBillingConfirmPayment(
  planId: string,
  provider = 'stripe',
): Promise<{ ok: boolean; subscription?: BillingSubscription }> {
  const { ok, data } = await billingFetch<{ ok?: boolean; subscription?: BillingSubscription }>(
    '/api/billing/confirm-payment',
    {
      method: 'POST',
      body: JSON.stringify({ planId, provider }),
    },
  )
  return { ok: ok && Boolean(data.ok), subscription: data.subscription }
}

export async function apiBillingBankTransfer(
  planId: string,
): Promise<{ ok: boolean; instructions?: { reference: string; note: string } }> {
  const { ok, data } = await billingFetch<{
    ok?: boolean
    instructions?: { reference: string; note: string }
  }>('/api/billing/bank-transfer', {
    method: 'POST',
    body: JSON.stringify({ planId }),
  })
  return { ok: ok && Boolean(data.ok), instructions: data.instructions }
}

export async function apiBillingRecordAiQuery(): Promise<{ ok: boolean; status: number }> {
  const { ok, status } = await billingFetch<{ ok?: boolean }>('/api/billing/usage/ai-query', {
    method: 'POST',
    body: '{}',
  })
  return { ok, status }
}

export async function apiBillingCreateCheckout(planId: string): Promise<{ ok: true; url: string } | { ok: false }> {
  const { ok, data } = await billingFetch<{ ok?: boolean; url?: string }>(
    '/api/billing/create-checkout-session',
    {
      method: 'POST',
      body: JSON.stringify({ planId }),
    },
  )
  if (ok && data.ok && data.url) return { ok: true, url: data.url }
  return { ok: false }
}

export async function apiBillingPaymentIntent(
  planId: string,
): Promise<{ ok: true; clientSecret: string } | { ok: false }> {
  const { ok, data } = await billingFetch<{ ok?: boolean; clientSecret?: string }>(
    '/api/billing/payment-intent',
    {
      method: 'POST',
      body: JSON.stringify({ planId }),
    },
  )
  if (ok && data.ok && data.clientSecret) return { ok: true, clientSecret: data.clientSecret }
  return { ok: false }
}
