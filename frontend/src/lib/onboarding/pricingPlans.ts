import type { SubscriptionPlanId } from '../geoEnterpriseUserModel'

export type BillingPlanId = 'trial' | 'pro' | 'enterprise'

export type PricingPlan = {
  id: BillingPlanId
  subscriptionPlan: SubscriptionPlanId
  name: string
  priceLabel: string
  priceNote: string
  description: string
  features: string[]
  highlighted?: boolean
  cta: string
  requiresPayment: boolean
  trialDays?: number
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'trial',
    subscriptionPlan: 'free',
    name: 'Free Trial',
    priceLabel: '$0',
    priceNote: '14 days · full platform',
    description: 'Explore Layer Live, GeoAI, and exports with no credit card.',
    features: [
      'Sentinel & Planet preview layers',
      'NDVI / NDWI analytics',
      '5 GB workspace storage',
      'AI assistant (fair use)',
    ],
    cta: 'Start 14-day trial',
    requiresPayment: false,
    trialDays: 14,
  },
  {
    id: 'pro',
    subscriptionPlan: 'pro',
    name: 'Pro',
    priceLabel: '$49',
    priceNote: 'per seat / month',
    description: 'Production workflows for analysts and small teams.',
    features: [
      'Unlimited AOI & timeline',
      'Priority imagery refresh',
      '50 GB storage · 2K exports/mo',
      'API access & webhooks',
    ],
    highlighted: true,
    cta: 'Get started',
    requiresPayment: true,
  },
  {
    id: 'enterprise',
    subscriptionPlan: 'enterprise',
    name: 'Enterprise',
    priceLabel: 'Custom',
    priceNote: 'annual · SLA',
    description: 'Dedicated capacity, SSO, and compliance for organizations.',
    features: [
      'Private tile pipelines',
      'SSO / SCIM & audit logs',
      'Dedicated support engineer',
      'Custom quotas & on-prem option',
    ],
    cta: 'Talk to sales',
    requiresPayment: true,
  },
]

export function getPricingPlan(id: BillingPlanId): PricingPlan | undefined {
  return PRICING_PLANS.find(p => p.id === id)
}
