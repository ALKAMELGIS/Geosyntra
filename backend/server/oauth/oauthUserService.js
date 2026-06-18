/**
 * OAuth user upsert with provider linking and email conflict handling.
 */
import { applySystemOwnerToDirectoryUser } from '../rbac/systemOwnerUser.js'
import { isSystemOwnerEmail } from '../rbac/systemOwnerEmails.js'
import { PUBLIC_SIGNUP_ROLE, USER_STATUSES } from '../rbac/roles.js'
import { canLoginUser, toPublicAuthUser } from '../rbac/userPublic.js'

export const OAUTH_PROVIDERS = ['google', 'linkedin', 'github', 'apple']

function normalizeEmail(e) {
  return String(e || '').trim().toLowerCase()
}

function slugUsername(input, email) {
  const base =
    String(input || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '') ||
    String(email || '')
      .split('@')[0]
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
  return base.slice(0, 48) || 'user'
}

function readProviderSub(user, provider) {
  if (!user) return ''
  if (provider === 'google') return String(user.oauthGoogleSub || '').trim()
  if (provider === 'apple') return String(user.oauthAppleSub || '').trim()
  const extra = user.profileExtra && typeof user.profileExtra === 'object' ? user.profileExtra : {}
  if (provider === 'github') return String(extra.oauthGithubSub || user.oauthGithubSub || '').trim()
  if (provider === 'linkedin') return String(extra.oauthLinkedinSub || user.oauthLinkedinSub || '').trim()
  return ''
}

function applyProviderSub(user, provider, sub) {
  const next = { ...user }
  if (provider === 'google') next.oauthGoogleSub = sub
  else if (provider === 'apple') next.oauthAppleSub = sub
  else {
    const extra = {
      ...(next.profileExtra && typeof next.profileExtra === 'object' ? next.profileExtra : {}),
      oauthProvider: provider,
    }
    if (provider === 'github') {
      next.oauthGithubSub = sub
      extra.oauthGithubSub = sub
    }
    if (provider === 'linkedin') {
      next.oauthLinkedinSub = sub
      extra.oauthLinkedinSub = sub
    }
    next.profileExtra = extra
  }
  return next
}

/**
 * @param {{
 *   users: object[]
 *   findByEmail: (email: string) => object | null
 *   findByProviderSub?: (provider: string, sub: string) => object | null
 * }} deps
 */
export function createOAuthUserService(deps) {
  function findByProviderSub(provider, sub) {
    if (deps.findByProviderSub) return deps.findByProviderSub(provider, sub)
    const s = String(sub || '').trim()
    if (!s) return null
    return (
      deps.users.find(u => readProviderSub(u, provider) === s) ||
      null
    )
  }

  function upsertOAuthUser({ email, name, provider, sub, username, profileImage }) {
    const em = normalizeEmail(email)
    if (!em) return { ok: false, error: 'email_required' }
    if (!OAUTH_PROVIDERS.includes(provider)) {
      return { ok: false, error: 'invalid_provider' }
    }
    const providerSub = String(sub || '').trim()
    if (!providerSub) return { ok: false, error: 'oauth_sub_required' }

    const ts = new Date().toISOString()
    const displayName = String(name || em).trim()
    const uname = slugUsername(username, em)
    const avatar = String(profileImage || '').trim() || undefined

    let existing = findByProviderSub(provider, providerSub)
    const byEmail = deps.findByEmail(em)

    if (existing && byEmail && existing.id !== byEmail.id) {
      return {
        ok: false,
        error: 'oauth_email_conflict',
        message:
          'This email is already linked to another account. Sign in with your original provider or contact support.',
      }
    }

    if (!existing) existing = byEmail

    if (existing) {
      const linkedSub = readProviderSub(existing, provider)
      if (linkedSub && linkedSub !== providerSub) {
        return {
          ok: false,
          error: 'oauth_provider_conflict',
          message: 'This account is linked to a different identity for this provider.',
        }
      }
      let merged = applySystemOwnerToDirectoryUser({
        ...existing,
        name: displayName || existing.name,
        email: em,
        emailVerified: true,
        verificationToken: null,
        lastLogin: ts,
        username: existing.username || uname,
        profileImage: avatar || existing.profileImage,
      })
      merged = applyProviderSub(merged, provider, providerSub)
      merged.profileExtra = {
        ...(merged.profileExtra && typeof merged.profileExtra === 'object' ? merged.profileExtra : {}),
        oauthProvider: provider,
        oauthProviders: Array.from(
          new Set([...(Array.isArray(merged.profileExtra?.oauthProviders) ? merged.profileExtra.oauthProviders : []), provider]),
        ),
      }
      const gate = canLoginUser(merged)
      if (!gate.ok) return { ok: false, error: gate.error, message: gate.message }
      return { ok: true, user: merged, publicUser: toPublicAuthUser(merged), linked: true }
    }

    let user = {
      id: null,
      email: em,
      name: displayName,
      username: uname,
      profileImage: avatar,
      role: PUBLIC_SIGNUP_ROLE,
      status: isSystemOwnerEmail(em) ? USER_STATUSES.ACTIVE : USER_STATUSES.PENDING_APPROVAL,
      lastLogin: ts,
      passwordHash: null,
      emailVerified: true,
      verificationToken: null,
      createdAt: ts,
      profileExtra: { oauthProvider: provider, oauthProviders: [provider] },
    }
    user = applyProviderSub(user, provider, providerSub)
    user = applySystemOwnerToDirectoryUser(user)
    return {
      ok: true,
      user,
      publicUser: toPublicAuthUser(user),
      pendingApproval: user.status === USER_STATUSES.PENDING_APPROVAL,
      created: true,
    }
  }

  return { upsertOAuthUser, slugUsername }
}
