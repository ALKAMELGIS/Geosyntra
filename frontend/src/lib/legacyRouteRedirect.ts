import { redirectToHomeWizard } from './homeWizardEntry'

const LEGACY_ROUTE_MAP: Record<string, { wizard: 'auth' | 'pricing'; authMode?: 'signup' | 'signin' }> = {
  'app/auth/login': { wizard: 'auth', authMode: 'signin' },
  'app/auth/register': { wizard: 'auth', authMode: 'signup' },
  login: { wizard: 'auth', authMode: 'signin' },
  'app/onboarding/trial-start': { wizard: 'pricing', authMode: 'signup' },
  'app/billing/pricing': { wizard: 'pricing', authMode: 'signup' },
}

/**
 * Synchronous redirect off legacy standalone auth / trial pages.
 * Call before React mounts so old bundles never paint AuthLoginPage.
 */
export function redirectLegacySaasRoutes(): boolean {
  if (typeof window === 'undefined') return false
  const hash = window.location.hash || ''
  if (!hash.startsWith('#/')) return false
  const route = hash.slice(2).split('?')[0]?.replace(/\/$/, '') ?? ''
  const mapped = LEGACY_ROUTE_MAP[route]
  if (!mapped) return false
  redirectToHomeWizard(mapped)
  return true
}
