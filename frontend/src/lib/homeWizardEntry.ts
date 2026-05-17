export type HomeWizardLaunch = {
  wizard: 'auth' | 'pricing'
  authMode: 'signup' | 'signin'
}

export function homeWizardSearch(
  opts: Partial<HomeWizardLaunch> & { wizard?: 'auth' | 'pricing' } = {},
): string {
  const wizard = opts.wizard ?? 'auth'
  const authMode = opts.authMode ?? 'signup'
  const p = new URLSearchParams()
  p.set('start', '1')
  p.set('wizard', wizard)
  if (wizard === 'auth') p.set('mode', authMode)
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
  opts?: Partial<HomeWizardLaunch> & { wizard?: 'auth' | 'pricing' },
): void {
  if (typeof window === 'undefined') return
  window.location.replace(homeWizardUrl(opts))
}

/** Read wizard flags from `?search` or legacy `#/…?…` embed. */
export function readHomeWizardParams(): { start: boolean; wizard: string | null; mode: string | null } {
  if (typeof window === 'undefined') {
    return { start: false, wizard: null, mode: null }
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
  }
}
