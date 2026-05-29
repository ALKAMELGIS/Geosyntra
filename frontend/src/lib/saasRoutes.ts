/** SaaS entry + auth surface paths (hash router). */
export const SAAS_ROUTES = {
  home: '/',
  authLogin: '/app/auth/login',
  authRegister: '/app/auth/register',
  authVerifyEmail: '/app/auth/verify-email',
  authResetPassword: '/app/auth/reset-password',
  authOAuthCallback: '/app/auth/oauth-callback',
  billingPricing: '/app/billing/pricing',
  onboardingTrialStart: '/app/onboarding/trial-start',
  dashboardDefault: '/satellite/indices',
  accountProfile: '/account/profile',
} as const

export function isSaasAuthPath(pathname: string): boolean {
  return (
    pathname === SAAS_ROUTES.authLogin ||
    pathname === SAAS_ROUTES.authRegister ||
    pathname === SAAS_ROUTES.authVerifyEmail ||
    pathname === SAAS_ROUTES.authResetPassword ||
    pathname === SAAS_ROUTES.authOAuthCallback
  )
}

export function isSaasPublicPath(pathname: string): boolean {
  if (pathname === '/' || pathname === '') return true
  if (isSaasAuthPath(pathname)) return true
  if (pathname === SAAS_ROUTES.billingPricing) return true
  if (pathname === SAAS_ROUTES.onboardingTrialStart) return true
  return false
}
