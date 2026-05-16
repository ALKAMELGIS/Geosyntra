import type { ReactNode } from 'react'
import { GEOSYNTRA_BRAND_NAME } from '../../lib/brand'
import { SAAS_ROUTES } from '../../lib/saasRoutes'

/** Nav + CTA labels for Home — swap for CMS / SaaS engine without touching SaasEntryShell. */
export const homeSaasContent = {
  brand: GEOSYNTRA_BRAND_NAME as ReactNode,
  signInLabel: 'Sign in' as ReactNode,
  startLabel: 'Continue' as ReactNode,
  navItems: [
    { id: 'pricing', href: `#${SAAS_ROUTES.billingPricing}`, label: 'Pricing' as ReactNode },
  ],
} as const
