import type { SubscriptionPlanId } from '../geoEnterpriseUserModel'

export type SubscriptionDisplayStatus =
  | 'active'
  | 'trialing'
  | 'trial_expired'
  | 'payment_pending'
  | 'pro'
  | 'enterprise'
  | 'canceled'

export type BillingSubscription = {
  user_id: string
  plan: SubscriptionPlanId
  status: string
  display_status: SubscriptionDisplayStatus
  trial_days_remaining: number | null
  trial_started_at: string | null
  trial_ends_at: string | null
  billing_plan_id: string | null
  limits: Record<string, unknown>
  billing_provider: string | null
  current_period_end: string | null
  can_use_paid_features: boolean
}

export type BillingUsage = {
  ai_queries: number
  grounding_calls: number
  exports: number
}

export type BillingInvoice = {
  id: string
  plan: string
  amount_cents: number
  currency: string
  status: string
  provider: string | null
  description: string | null
  external_id?: string | null
  paid_at: string | null
  period_start: string | null
  period_end: string | null
  created_at: string
}

export const DISPLAY_STATUS_LABELS: Record<SubscriptionDisplayStatus, string> = {
  active: 'Active',
  trialing: 'Free trial',
  trial_expired: 'Trial expired',
  payment_pending: 'Payment pending',
  pro: 'Pro',
  enterprise: 'Enterprise',
  canceled: 'Canceled',
}

export type CheckoutStep = 'summary' | 'payment' | 'confirm' | 'done'

export type PaymentMethodId = 'card' | 'paypal' | 'apple_pay' | 'google_pay' | 'bank_transfer' | 'stripe_checkout'
