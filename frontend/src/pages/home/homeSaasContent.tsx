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
  /** Inline before “The Future of” on the headline row. */
  globeBrand: ReactNode
  subtitle: ReactNode
}

/** Nav + hero copy for Home — swap for CMS / SaaS engine without touching SaasEntryShell. */
export const homeSaasContent = {
  brand: GEOSYNTRA_BRAND_NAME as ReactNode,
  signInLabel: 'Sign in' as ReactNode,
  startLabel: 'Free 21-Day Trial' as ReactNode,
  heroStartLabel: 'Start' as ReactNode,
  heroTrialLabel: 'Free 21-Day Trial' as ReactNode,
  getStartedLabel: 'Get Started' as ReactNode,
  navItems: [
    { id: 'platform', href: '#innovation', label: 'Platform' as ReactNode },
    { id: 'pricing', href: '#pricing', label: 'Pricing' as ReactNode },
    { id: 'about', href: '#future', label: 'About' as ReactNode },
  ],
  hero: {
    lineBefore: 'The Future of',
    accentHighlight: 'Spatial',
    accentRemainder: ' Intelligence',
    globeBrand: GEOSYNTRA_BRAND_NAME,
    subtitle: (
      <span className="home-saas-hero__subtitle-copy">
        <span className="home-saas-hero__subtitle-line home-saas-hero__subtitle-line--lead">
          GeoSyntra redefines satellite intelligence, transforming raw imagery into high-fidelity, actionable spatial insights
        </span>
        <span className="home-saas-hero__subtitle-line home-saas-hero__subtitle-line--secondary">
          through advanced analytics, precision change detection, and publication-ready scientific reporting, all without operational complexity
        </span>
      </span>
    ),
  } satisfies HomeSaasHeroCopy,
} as const
