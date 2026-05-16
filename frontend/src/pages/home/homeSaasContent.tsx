import type { ReactNode } from 'react'
import { GEOSYNTRA_BRAND_NAME } from '../../lib/brand'
import { SAAS_ROUTES } from '../../lib/saasRoutes'

/** Hero headline split for accent + hand-drawn underline (injected into HomeSaasHero). */
export type HomeSaasHeroCopy = {
  lineBefore: ReactNode
  accent: ReactNode
  lineAfter: ReactNode
  subtitle: ReactNode
}

/** Nav + hero copy for Home — swap for CMS / SaaS engine without touching SaasEntryShell. */
export const homeSaasContent = {
  brand: GEOSYNTRA_BRAND_NAME as ReactNode,
  signInLabel: 'Sign in' as ReactNode,
  startLabel: 'Try for free' as ReactNode,
  navItems: [
    { id: 'platform', href: '#/learn-more', label: 'Platform' as ReactNode },
    { id: 'pricing', href: `#${SAAS_ROUTES.billingPricing}`, label: 'Pricing' as ReactNode },
    { id: 'about', href: '#/learn-more', label: 'About' as ReactNode },
  ],
  hero: {
    lineBefore: 'Geo-intelligence built for',
    accent: 'your AOIs',
    lineAfter: 'and field teams',
    subtitle:
      'Draw areas of interest on the map, run Sentinel NDVI timelines, and export two-page scientific reports — clarity and trust without extra GIS overhead.',
  } satisfies HomeSaasHeroCopy,
} as const
