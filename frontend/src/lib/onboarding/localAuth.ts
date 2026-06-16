import { normalizeEmail, normalizeRole, startSession, type CurrentUser } from '../auth'
import { readKeepSignedInPreference, syncSavedLoginCredentials } from '../authKeepSignedIn'
import { registerPendingSignupInDirectory } from '../admin/adminUserManagement'
import { adminPlanLabelForBillingId, normalizeSignupPlanId } from './signupPlans'
import type { BillingPlanId } from './pricingPlans'
import { scheduleAdminDirectorySync } from '../adminDirectoryPersistence'
import {
  apiLogin,
  apiOAuthUpsert,
  apiRegister,
  isAuthApiConfigured,
  type PublicAuthUser,
} from './authApi'
import {
  buildLocalVerificationLink,
  createVerificationToken,
  isGeosyntraPublicSite,
  isStaticLocalAuthMode,
  resendLocalVerification,
  verificationExpiresAt,
  verifyEmailWithLocalToken,
} from './localAuthVerification'
import { openOAuthAuthorizePopup } from '../oauthPopup'
import {
  clearOAuthHandshake,
  exchangeAppleAuthCode,
  exchangeGitHubAuthCode,
  exchangeGoogleAuthCode,
  exchangeLinkedInAuthCode,
  resolveLinkedInAuthorizationUrl,
  getAppleOAuthRedirectUri,
  getGitHubOAuthRedirectUri,
  getGoogleOAuthRedirectUri,
  resolveOAuthPopupRedirectUri,
  invalidateOAuthPublicConfig,
  isAppleOAuthConfigured,
  isGitHubOAuthConfigured,
  isGoogleOAuthConfigured,
  isLinkedInOAuthConfigured,
  isOAuthStateValid,
  loadOAuthPublicConfig,
  readStoredOAuthProvider,
  resolveAppleAuthorizationUrl,
  resolveGitHubAuthorizationUrl,
  resolveGoogleAuthorizationUrl,
  startServerOAuthRedirect,
  useServerOAuthRedirect,
} from '../oauthSignIn'
import { readHomeWizardParams, stripOAuthQueryFromLocation } from '../homeWizardEntry'
import { isSystemOwnerEmail, permissionsForRoleSlug } from '../rbacPermissions'
import { isSubtleCryptoAvailable, sha256Hex } from '../sha256Hex'
import {
  ensureStaticPlatformOwner,
  ensureStaticPlatformOwnerSync,
} from './staticOwnerBootstrap'

export type HomeAuthResult =
  | { ok: true; user: CurrentUser }
  | { ok: true; needsVerification: true; email: string; devVerificationLink?: string }
  | { ok: false; error: string; needsVerification?: boolean }

function readAdminUsers(): Array<Record<string, unknown>> {
  try {
    const raw = localStorage.getItem('adminUsers')
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeAdminUsers(users: Array<Record<string, unknown>>): void {
  localStorage.setItem('adminUsers', JSON.stringify(users))
  scheduleAdminDirectorySync()
}

function syncPublicUserToAdminDirectory(user: PublicAuthUser): void {
  const email = normalizeEmail(user.email)
  const users = readAdminUsers()
  const idx = users.findIndex(u => normalizeEmail(String(u.email ?? '')) === email)
  const row: Record<string, unknown> = {
    id: user.id,
    name: user.name,
    email,
    role: user.role || 'Viewer',
    status:
      user.status === 'Suspended'
        ? 'Suspended'
        : user.status === 'Pending Approval'
          ? 'Pending Approval'
          : user.emailVerified
            ? 'Active'
            : 'Pending Verification',
    plan: 'Trial',
    emailVerified: user.emailVerified,
    lastLogin: new Date().toISOString(),
    profileExtra: { source: 'server-auth', roleSlug: user.roleSlug },
  }
  if (idx >= 0) {
    users[idx] = { ...users[idx], ...row }
  } else {
    users.push(row)
  }
  writeAdminUsers(users)
}

function toCurrentUser(user: PublicAuthUser): CurrentUser {
  const email = normalizeEmail(user.email)
  if (isSystemOwnerEmail(email)) {
    return {
      id: user.id,
      name: user.name,
      email,
      role: 'Owner',
      roleSlug: 'owner',
      status: 'Active',
      permissions: permissionsForRoleSlug('owner'),
    }
  }
  return {
    id: user.id,
    name: user.name,
    email,
    role: normalizeRole(user.role),
    roleSlug: user.roleSlug,
    status: user.emailVerified === false ? 'Pending Verification' : user.status,
    permissions: user.permissions,
  }
}

/** GeoSyntra on plain HTTP must not depend on API round-trips for password hashing. */
function preferBrowserOnlyAuth(): boolean {
  return isStaticLocalAuthMode() || (isGeosyntraPublicSite() && !isSubtleCryptoAvailable())
}

function isLocalDevHost(): boolean {
  if (typeof window === 'undefined') return false
  const h = window.location.hostname.toLowerCase()
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]'
}

function shouldUseLocalAuthFallback(apiError: string): boolean {
  if (apiError.includes('Incorrect email or password')) return false
  if (apiError.includes('Incorrect password')) return false
  if (apiError.includes('already exists')) return false
  if (isLocalDevHost()) {
    if (apiError.includes('Cannot reach the auth server')) return true
    if (apiError.includes('No sign-in account on the server')) return true
    if (apiError === 'Registration failed.' || apiError === 'Sign in failed.') return true
    if (apiError.includes('network_error')) return true
  }
  if (!isStaticLocalAuthMode() && !isGeosyntraPublicSite()) return false
  if (apiError.includes('Cannot reach the auth server')) return true
  if (apiError === 'Registration failed.' || apiError === 'Sign in failed.') return true
  if (apiError.includes('network_error')) return true
  return false
}

/** GitHub Pages / static hosting — no `/api` backend; persist account in localStorage. */
function localRoleLabel(roleSlug: string): string {
  const map: Record<string, string> = {
    owner: 'Owner',
    admin: 'Admin',
    manager: 'Manager',
    analyst: 'Analyst',
    viewer: 'Viewer',
    ai_operator: 'AI Operator',
    trial_user: 'Trial User',
  }
  return map[roleSlug] ?? 'Trial User'
}

async function homeSignUpLocal(input: {
  name: string
  email: string
  password: string
  planId?: BillingPlanId
}): Promise<HomeAuthResult> {
  const email = normalizeEmail(input.email)
  const password = input.password.trim()
  const name = input.name.trim()
  const users = readAdminUsers()
  const existing = users.find(u => normalizeEmail(String(u.email ?? '')) === email)
  if (existing) {
    if (existing.emailVerified === false) {
      return {
        ok: false,
        needsVerification: true,
        error: 'This email is awaiting verification. Check your inbox or resend the activation email.',
      }
    }
    return { ok: false, error: 'An account with this email already exists. Sign in instead.' }
  }
  const passwordHash = await sha256Hex(password)
  const parts = name.split(/\s+/)
  const planId = normalizeSignupPlanId(input.planId)
  const id = Date.now()
  const token = createVerificationToken()
  users.push({
    id,
    name,
    email,
    role: 'Trial User',
    status: 'Pending Verification',
    plan: adminPlanLabelForBillingId(planId),
    emailVerified: false,
    verificationToken: token,
    verificationTokenExpires: verificationExpiresAt(),
    createdAt: new Date().toISOString(),
    lastLogin: 'Never',
    passwordHash,
    profileExtra: {
      firstName: parts[0] ?? '',
      lastName: parts.slice(1).join(' '),
      roleSlug: 'trial_user',
      billingPlanId: planId,
      signupPlan: planId,
      subscriptionPlan: planId === 'trial' ? 'free' : planId,
    },
  })
  writeAdminUsers(users)
  return {
    ok: true,
    needsVerification: true,
    email,
    devVerificationLink: buildLocalVerificationLink(token),
  }
}

async function homeSignInLocal(input: {
  email: string
  password: string
  keepSignedIn?: boolean
}): Promise<HomeAuthResult> {
  ensureStaticPlatformOwnerSync()
  await ensureStaticPlatformOwner()

  const email = normalizeEmail(input.email)
  const password = input.password.trim()
  const passwordHash = await sha256Hex(password)
  const users = readAdminUsers()
  let match = users.find(u => normalizeEmail(String(u.email ?? '')) === email)
  if (!match && isSystemOwnerEmail(email)) {
    ensureStaticPlatformOwnerSync()
    await ensureStaticPlatformOwner()
    const retryUsers = readAdminUsers()
    match = retryUsers.find(u => normalizeEmail(String(u.email ?? '')) === email)
  }
  if (!match) {
    const hint = isAuthApiConfigured()
      ? ''
      : ' This site is using browser-only sign-in; accounts created in User Management exist only on the administrator’s device unless VITE_API_BASE_URL points to your backend.'
    return { ok: false, error: `No account found for this email.${hint}` }
  }
  const storedHash = String(match.passwordHash ?? '').trim()
  if (!storedHash) {
    return {
      ok: false,
      error: 'Account exists but is not activated for sign-in. Contact your administrator.',
    }
  }
  if (match.emailVerified === false) {
    return {
      ok: false,
      needsVerification: true,
      error: 'Please verify your email before signing in. Check your inbox for the activation link.',
    }
  }
  if (match.status === 'Suspended') {
    return { ok: false, error: 'This account is suspended. Contact your administrator.' }
  }
  if (storedHash !== passwordHash) {
    return { ok: false, error: 'Incorrect password.' }
  }
  const user: CurrentUser = isSystemOwnerEmail(email)
    ? {
        id: typeof match.id === 'number' ? match.id : Date.now(),
        name: String(match.name ?? 'GeoSyntra Admin'),
        email,
        role: 'Owner',
        roleSlug: 'owner',
        status: 'Active',
        permissions: permissionsForRoleSlug('owner'),
      }
    : {
        id: typeof match.id === 'number' ? match.id : Date.now(),
        name: String(match.name ?? email),
        email,
        role: normalizeRole(match.role),
      }
  match.lastLogin = new Date().toISOString()
  writeAdminUsers(users)
  syncSavedLoginCredentials(input.keepSignedIn === true, email, password)
  startSession(user, { persist: input.keepSignedIn === true })
  return { ok: true, user }
}

export async function homeSignUp(input: {
  name: string
  email: string
  password: string
  planId?: BillingPlanId
}): Promise<HomeAuthResult> {
  const email = normalizeEmail(input.email)
  const password = input.password.trim()
  const name = input.name.trim()
  if (!email || !password || password.length < 6) {
    return { ok: false, error: 'Enter a valid email and password (min 6 characters).' }
  }
  if (!name) return { ok: false, error: 'Enter your full name.' }

  const planId = normalizeSignupPlanId(input.planId)
  if (preferBrowserOnlyAuth()) {
    ensureStaticPlatformOwnerSync()
    await ensureStaticPlatformOwner()
    return homeSignUpLocal({ name, email, password, planId })
  }

  const result = await apiRegister({ name, email, password, planId })
  if (!result.ok) {
    if (result.needsVerification) {
      return { ok: true, needsVerification: true, email }
    }
    if (result.error.includes('cannot be selected')) {
      return result
    }
    if (shouldUseLocalAuthFallback(result.error)) {
      ensureStaticPlatformOwnerSync()
      await ensureStaticPlatformOwner()
      return homeSignUpLocal({ name, email, password, planId })
    }
    return result
  }

  registerPendingSignupInDirectory({ name, email, planId })
  return {
    ok: true,
    needsVerification: true,
    email: result.email,
    devVerificationLink: result.devVerificationLink,
  }
}

export async function homeSignIn(input: {
  email: string
  password: string
  keepSignedIn?: boolean
}): Promise<HomeAuthResult> {
  const email = normalizeEmail(input.email)
  const password = input.password.trim()
  if (!email || !password) return { ok: false, error: 'Enter email and password.' }

  if (preferBrowserOnlyAuth()) {
    ensureStaticPlatformOwnerSync()
    return homeSignInLocal({ email, password, keepSignedIn: input.keepSignedIn })
  }

  const result = await apiLogin({ email, password })
  if (!result.ok) {
    if (!result.needsVerification && shouldUseLocalAuthFallback(result.error)) {
      ensureStaticPlatformOwnerSync()
      await ensureStaticPlatformOwner()
      return homeSignInLocal({ email, password, keepSignedIn: input.keepSignedIn })
    }
    if (!isStaticLocalAuthMode() && result.error === 'Sign in failed.') {
      return {
        ok: false,
        error: 'Cannot reach the auth server. Start the backend (port 3001) or check VITE_API_BASE_URL.',
      }
    }
    return {
      ok: false,
      error: result.error,
      needsVerification: result.needsVerification,
    }
  }

  if (!result.user.emailVerified) {
    return {
      ok: false,
      needsVerification: true,
      error: 'Please verify your email before signing in. Check your inbox for the activation link.',
    }
  }

  syncPublicUserToAdminDirectory(result.user)
  const user = toCurrentUser(result.user)
  syncSavedLoginCredentials(input.keepSignedIn === true, email, password)
  startSession(user, { persist: input.keepSignedIn === true, accessToken: result.accessToken })
  return { ok: true, user }
}

export async function completeVerifiedSignIn(
  user: PublicAuthUser,
  accessToken?: string,
): Promise<HomeAuthResult> {
  syncPublicUserToAdminDirectory(user)
  const current = toCurrentUser(user)
  const persist = readKeepSignedInPreference()
  startSession(current, { persist, accessToken })
  return { ok: true, user: current }
}

export async function verifyEmailLocal(
  token: string,
): Promise<{ ok: true; user: PublicAuthUser } | { ok: false; error: string }> {
  return verifyEmailWithLocalToken(token, readAdminUsers, writeAdminUsers)
}

export function resendVerificationLocal(
  email: string,
): { ok: true; devVerificationLink: string } | { ok: false; error: string } {
  return resendLocalVerification(email, readAdminUsers, writeAdminUsers)
}

export { isStaticLocalAuthMode }

export function displayFirstName(user: CurrentUser | null): string {
  if (!user) return ''
  const parts = user.name.trim().split(/\s+/)
  return parts[0] || user.email.split('@')[0] || 'there'
}

/** Header greeting — e.g. "MOHAMED" for nav status bar. */
export function displayHeaderName(user: CurrentUser | null): string {
  const first = displayFirstName(user)
  return first ? first.toLocaleUpperCase('en-US') : ''
}

export type OAuthProvider = 'google' | 'apple' | 'github' | 'linkedin'

async function finishOAuthUpsert(input: {
  email: string
  name: string
  provider: OAuthProvider
  sub?: string
}): Promise<HomeAuthResult> {
  const result = await apiOAuthUpsert({
    email: input.email,
    name: input.name,
    provider: input.provider,
    sub: input.sub,
  })
  if (!result.ok) {
    return { ok: false, error: result.error }
  }
  syncPublicUserToAdminDirectory(result.user)
  const user = toCurrentUser(result.user)
  const persist = readKeepSignedInPreference()
  startSession(user, { persist, accessToken: result.accessToken })
  return { ok: true, user }
}

/** Exchange OAuth authorization code and create session (popup or full-page return). */
export async function completeOAuthWithCode(
  oauthCode: string,
  oauthState: string | null,
): Promise<HomeAuthResult> {
  if (!oauthCode.trim()) {
    return { ok: false, error: 'Sign-in did not return an authorization code.' }
  }

  if (!isOAuthStateValid(oauthState)) {
    clearOAuthHandshake()
    return { ok: false, error: 'Sign-in was interrupted. Please try again.' }
  }

  const provider = readStoredOAuthProvider() || 'google'

  try {
    if (provider === 'google') {
      const exchanged = await exchangeGoogleAuthCode(
        oauthCode.trim(),
        resolveOAuthPopupRedirectUri('google'),
      )
      if (!exchanged.ok || !exchanged.email) {
        return { ok: false, error: exchanged.error || 'Google sign-in failed.' }
      }
      return await finishOAuthUpsert({
        email: exchanged.email,
        name: exchanged.name || exchanged.email,
        provider: 'google',
        sub: exchanged.sub,
      })
    }

    if (provider === 'apple') {
      const exchanged = await exchangeAppleAuthCode(oauthCode.trim(), getAppleOAuthRedirectUri())
      if (!exchanged.ok || !exchanged.email) {
        return {
          ok: false,
          error: exchanged.message || exchanged.error || 'Apple sign-in failed.',
        }
      }
      return await finishOAuthUpsert({
        email: exchanged.email,
        name: exchanged.name || exchanged.email,
        provider: 'apple',
        sub: exchanged.sub,
      })
    }

    if (provider === 'github') {
      const exchanged = await exchangeGitHubAuthCode(
        oauthCode.trim(),
        resolveOAuthPopupRedirectUri('github'),
      )
      if (!exchanged.ok || !exchanged.email) {
        return {
          ok: false,
          error: exchanged.message || exchanged.error || 'GitHub sign-in failed.',
        }
      }
      return await finishOAuthUpsert({
        email: exchanged.email,
        name: exchanged.name || exchanged.email,
        provider: 'github',
        sub: exchanged.sub,
      })
    }

    if (provider === 'linkedin') {
      const exchanged = await exchangeLinkedInAuthCode(
        oauthCode.trim(),
        resolveOAuthPopupRedirectUri('linkedin'),
      )
      if (!exchanged.ok || !exchanged.email) {
        return {
          ok: false,
          error: exchanged.message || exchanged.error || 'LinkedIn sign-in failed.',
        }
      }
      return await finishOAuthUpsert({
        email: exchanged.email,
        name: exchanged.name || exchanged.email,
        provider: 'linkedin',
        sub: exchanged.sub,
      })
    }
  } finally {
    clearOAuthHandshake()
  }

  return { ok: false, error: 'Unknown sign-in provider.' }
}

/** Complete OAuth redirect callback (`oauth-return.html` → home wizard with `?code=`). */
export async function tryCompleteOAuthCallback(): Promise<HomeAuthResult | null> {
  const { oauthCode, oauthState } = readHomeWizardParams()
  if (!oauthCode?.trim()) return null

  try {
    return await completeOAuthWithCode(oauthCode, oauthState)
  } finally {
    stripOAuthQueryFromLocation()
  }
}

function oauthProviderConfigured(provider: OAuthProvider): boolean {
  if (provider === 'google') return isGoogleOAuthConfigured()
  if (provider === 'apple') return isAppleOAuthConfigured()
  if (provider === 'linkedin') return isLinkedInOAuthConfigured()
  return isGitHubOAuthConfigured()
}

function resolveOAuthAuthorizationUrl(provider: OAuthProvider): string | null {
  if (provider === 'google') return resolveGoogleAuthorizationUrl()
  if (provider === 'apple') return resolveAppleAuthorizationUrl()
  if (provider === 'linkedin') return resolveLinkedInAuthorizationUrl()
  return resolveGitHubAuthorizationUrl()
}

function oauthNotConfiguredMessage(provider: OAuthProvider): string {
  if (provider === 'google') {
    return 'Google sign-in is not available. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET on the API server (or VITE_AUTH_GOOGLE_CLIENT_ID in the SPA build). Ensure VITE_API_BASE_URL reaches that API.'
  }
  if (provider === 'apple') {
    return 'Apple sign-in is not available. Set APPLE_OAUTH_* keys on the API server (or VITE_AUTH_APPLE_CLIENT_ID in the SPA build).'
  }
  if (provider === 'linkedin') {
    return 'LinkedIn sign-in is not configured. Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET on the API server.'
  }
  return 'GitHub sign-in is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET on the API server.'
}

async function ensureOAuthRuntimeConfig(): Promise<void> {
  invalidateOAuthPublicConfig()
  await loadOAuthPublicConfig()
}

/** Open provider sign-in in a popup (fallback: full redirect if blocked). */
export async function homeOAuthSignIn(provider: OAuthProvider): Promise<HomeAuthResult> {
  if (!isAuthApiConfigured()) {
    if (isStaticLocalAuthMode()) {
      return homeOAuthDemoSignIn(provider)
    }
    return {
      ok: false,
      error: 'Sign-in API is not configured. Set VITE_API_BASE_URL to your backend URL.',
    }
  }

  await ensureOAuthRuntimeConfig()

  if (!oauthProviderConfigured(provider)) {
    if (isStaticLocalAuthMode()) {
      return homeOAuthDemoSignIn(provider)
    }
    return { ok: false, error: oauthNotConfiguredMessage(provider) }
  }

  if (
    useServerOAuthRedirect() &&
    (provider === 'google' || provider === 'github' || provider === 'linkedin')
  ) {
    startServerOAuthRedirect(provider, true)
    return { ok: false, error: '' }
  }

  const url = resolveOAuthAuthorizationUrl(provider)
  if (!url) {
    return { ok: false, error: oauthNotConfiguredMessage(provider) }
  }

  const popup = await openOAuthAuthorizePopup(url)
  if (popup.ok) {
    return completeOAuthWithCode(popup.code, popup.state)
  }
  if (popup.blocked) {
    window.location.assign(url)
    return { ok: false, error: '' }
  }
  if (popup.cancelled) {
    return { ok: false, error: '' }
  }
  return { ok: false, error: popup.error }
}

async function homeOAuthDemoSignIn(provider: OAuthProvider): Promise<HomeAuthResult> {
  const label = provider === 'google' ? 'Google' : provider === 'apple' ? 'Apple' : 'GitHub'
  const email = `${provider}.user@geosyntra.demo`
  const users = readAdminUsers()
  let match = users.find(u => normalizeEmail(String(u.email ?? '')) === email)
  if (!match) {
    const id = Date.now()
    match = {
      id,
      name: `${label} User`,
      email,
      role: 'Viewer',
      status: 'Active',
      emailVerified: true,
      lastLogin: new Date().toISOString(),
      passwordHash: '',
      profileExtra: { firstName: label, lastName: 'User', oauthProvider: provider },
    }
    users.push(match)
    writeAdminUsers(users)
  } else {
    match.lastLogin = new Date().toISOString()
    writeAdminUsers(users)
  }
  const user: CurrentUser = {
    id: typeof match.id === 'number' ? match.id : Date.now(),
    name: String(match.name ?? `${label} User`),
    email,
    role: normalizeRole(match.role),
  }
  const persist = readKeepSignedInPreference()
  startSession(user, { persist })
  return { ok: true, user }
}
