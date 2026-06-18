export type HomeWizardLaunch = {
  /** `payment` opens checkout; `launch` opens post-trial activation screen. */
  wizard: 'auth' | 'pricing' | 'payment' | 'launch'
  authMode: 'signup' | 'signin'
  /** Pre-select plan after email verification (from sign-up choice). */
  planId?: string
  /** Show pricing/checkout even when workspace is already active. */
  upgrade?: boolean
}

const WIZARD_INTENT_KEY = 'geosyntra-wizard-intent'
const WIZARD_INTENT_MAX_AGE_MS = 120_000

export type HomeWizardIntent = HomeWizardLaunch & { ts: number; planId?: string }

/** One-shot flag so wizard opens after navigation, not on a plain refresh. */
export function stashHomeWizardIntent(
  opts: Partial<HomeWizardLaunch> & { wizard?: HomeWizardLaunch['wizard'] } = {},
): void {
  if (typeof window === 'undefined') return
  const wizard = opts.wizard ?? 'auth'
  const authMode = opts.authMode ?? 'signup'
  const upgrade = opts.upgrade === true
  try {
    const planId = typeof opts.planId === 'string' ? opts.planId.trim() : undefined
    sessionStorage.setItem(
      WIZARD_INTENT_KEY,
      JSON.stringify({ wizard, authMode, upgrade, planId, ts: Date.now() } satisfies HomeWizardIntent),
    )
  } catch {
    /* ignore */
  }
}

/** Read and clear wizard intent; returns null if missing or stale. */
export function consumeHomeWizardIntent(): HomeWizardLaunch | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(WIZARD_INTENT_KEY)
    sessionStorage.removeItem(WIZARD_INTENT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as HomeWizardIntent
    if (typeof parsed.ts === 'number' && Date.now() - parsed.ts > WIZARD_INTENT_MAX_AGE_MS) {
      return null
    }
    return {
      wizard: parsed.wizard ?? 'auth',
      authMode: parsed.authMode ?? 'signup',
      upgrade: parsed.upgrade === true,
      planId: typeof parsed.planId === 'string' ? parsed.planId : undefined,
    }
  } catch {
    return null
  }
}

/** Remove `start` / `wizard` query flags without opening the overlay. */
export function stripHomeWizardQueryFromLocation(): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  const hadWizard =
    url.searchParams.has('start') ||
    url.searchParams.has('wizard') ||
    url.searchParams.has('mode')
  if (!hadWizard) return
  url.searchParams.delete('start')
  url.searchParams.delete('wizard')
  url.searchParams.delete('mode')
  try {
    window.history.replaceState({}, '', url.pathname + (url.search || '') + url.hash)
  } catch {
    /* ignore */
  }
}

import type { NavigateFunction } from 'react-router-dom'
import { SAAS_ROUTES } from './saasRoutes'

export function navigateToHomeWizard(
  navigate: NavigateFunction,
  opts: Partial<HomeWizardLaunch> & { wizard?: 'auth' | 'pricing' } = {},
): void {
  stashHomeWizardIntent(opts)
  void navigate({ pathname: SAAS_ROUTES.home, search: homeWizardSearch(opts) })
}

export function homeWizardSearch(
  opts: Partial<HomeWizardLaunch> & { wizard?: HomeWizardLaunch['wizard'] } = {},
): string {
  const wizard = opts.wizard ?? 'auth'
  const authMode = opts.authMode ?? 'signup'
  const p = new URLSearchParams()
  p.set('start', '1')
  p.set('wizard', wizard)
  if (wizard === 'auth') p.set('mode', authMode)
  if (opts.upgrade) p.set('upgrade', '1')
  if (opts.planId) p.set('plan', opts.planId)
  return `?${p.toString()}`
}

export function appBasePath(): string {
  const base = import.meta.env.BASE_URL || '/'
  return base.endsWith('/') ? base : `${base}/`
}

/** Full URL for HashRouter home + wizard (query on document URL, hash route `#/`). */
export function homeWizardUrl(opts?: Partial<HomeWizardLaunch> & { wizard?: 'auth' | 'pricing' }): string {
  if (typeof window === 'undefined') return '/'
  return `${window.location.origin}${appBasePath()}${homeWizardSearch(opts)}#/`
}

export function redirectToHomeWizard(
  opts?: Partial<HomeWizardLaunch> & { wizard?: HomeWizardLaunch['wizard'] },
): void {
  if (typeof window === 'undefined') return
  stashHomeWizardIntent(opts)
  window.location.replace(homeWizardUrl(opts))
}

/** Read wizard flags from `?search` or legacy `#/…?…` embed. */
export function readHomeWizardParams(): {
  start: boolean
  wizard: string | null
  mode: string | null
  oauthCode: string | null
  oauthState: string | null
} {
  if (typeof window === 'undefined') {
    return { start: false, wizard: null, mode: null, oauthCode: null, oauthState: null }
  }
  let qs = new URLSearchParams(window.location.search)
  if (!qs.get('start') && !qs.get('wizard') && window.location.hash.includes('?')) {
    const hashQuery = window.location.hash.split('?').slice(1).join('?').split('#')[0]
    if (hashQuery) qs = new URLSearchParams(hashQuery)
  }
  return {
    start: qs.get('start') === '1',
    wizard: qs.get('wizard'),
    mode: qs.get('mode'),
    oauthCode: qs.get('code'),
    oauthState: qs.get('state'),
  }
}

/** Remove OAuth query params from the URL after a successful callback. */
export function stripOAuthQueryFromLocation(): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  url.searchParams.delete('code')
  url.searchParams.delete('state')
  url.searchParams.delete('scope')
  url.searchParams.delete('authuser')
  url.searchParams.delete('prompt')
  window.history.replaceState({}, '', url.pathname + url.search + url.hash)
}
