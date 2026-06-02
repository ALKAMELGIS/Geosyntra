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
    priceNote: '21 days · full platform',
    description: 'Explore Layer Live, GeoAI, and exports with no credit card.',
    features: [
      'Basic map view (Mapbox)',
      'Limited POI search (OSM)',
      '10 AI queries / day',
      'No AOI analysis or layer compare',
    ],
    cta: 'Start 21-day trial',
    requiresPayment: false,
    trialDays: 21,
  },
  {
    id: 'pro',
    subscriptionPlan: 'pro',
    name: 'Pro',
    priceLabel: '$100',
    priceNote: '3 months · plan credits included',
    description: 'Production workflows for analysts and small teams — activated for 3 months with usage credits.',
    features: [
      'Unlimited AOI & timeline',
      'Priority imagery refresh',
      '50 GB storage · 2K exports/mo',
      'API access & webhooks',
    ],
    highlighted: true,
    cta: 'Activate Pro',
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
      'Full GIS engine (PostGIS / ArcGIS)',
      'Multi-user workspace · custom datasets',
      'Advanced spatial analytics · API access',
      'SLA · on-prem or cloud deployment',
    ],
    cta: 'Talk to sales',
    requiresPayment: true,
  },
]

export function getPricingPlan(id: BillingPlanId): PricingPlan | undefined {
  return PRICING_PLANS.find(p => p.id === id)
}
