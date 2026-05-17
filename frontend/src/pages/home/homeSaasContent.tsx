import type { ReactNode } from 'react'
import { GEOSYNTRA_BRAND_NAME } from '../../lib/brand'
import { SAAS_ROUTES } from '../../lib/saasRoutes'

/** Hero headline split for accent + hand-drawn underline (injected into HomeSaasHero). */
export type HomeSaasHeroCopy = {
  lineBefore: ReactNode
  /** Word under the animated underline (e.g. "Spatial"). */
  accentHighlight: ReactNode
  /** Rest of the accent phrase after the highlight (e.g. " intelligence"). */
  accentRemainder: ReactNode
  lineAfter: ReactNode
  subtitle: ReactNode
}

/** Nav + hero copy for Home — swap for CMS / SaaS engine without touching SaasEntryShell. */
export const homeSaasContent = {
  brand: GEOSYNTRA_BRAND_NAME as ReactNode,
  signInLabel: 'Sign in' as ReactNode,
  startLabel: 'Try for free' as ReactNode,
  navItems: [
    { id: 'platform', href: '#innovation', label: 'Platform' as ReactNode },
    { id: 'pricing', href: '#pricing', label: 'Pricing' as ReactNode },
    { id: 'about', href: '#discovery', label: 'About' as ReactNode },
  ],
  hero: {
    lineBefore: 'Geosyntra built for',
    accentHighlight: 'Spatial',
    accentRemainder: ' intelligence',
    lineAfter: 'without limits',
    subtitle:
      'Geosyntra redefines satellite intelligence — transforming raw imagery into high-fidelity, actionable spatial insights through advanced analytics, precision change detection, and publication-ready scientific reporting, all without operational complexity.',
  } satisfies HomeSaasHeroCopy,
} as const
