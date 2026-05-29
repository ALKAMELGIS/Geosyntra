import { appendAuditLog } from '../audit'
import { normalizeEmail, type CurrentUser } from '../auth'
import {
  buildLocalVerificationLink,
  createVerificationToken,
  verificationExpiresAt,
} from '../onboarding/localAuthVerification'
import { flushAdminDirectoryToServerNow } from '../adminDirectoryPersistence'
import { apiProvisionUser, apiRepairUserSignIn, isAuthApiConfigured } from '../onboarding/authApi'
import { isStaticLocalAuthMode } from '../onboarding/localAuthVerification'
import {
  rbacRoleDisplayLabel,
  rbacRoleSlugFromLabel,
} from '../rbac/rbacRoleCatalog'
import { permissionsForRoleSlug } from '../rbacPermissions'
import {
  DEFAULT_OWNER_PROVISIONED_LIMITS,
  type AdminDirectoryUser,
  type AdminUserPlan,
  type AdminUserStatus,
  type OwnerProvisionedLimits,
} from './adminUserModel'
import { sha256Hex } from '../sha256Hex'
import { getAdminUserByEmail, getAdminUserById, updateAdminUser, upsertAdminUser } from './adminUserStore'

/** @deprecated Prefer `rbacRoleSlugFromLabel` — kept for imports outside admin. */
export function ownerRoleLabelToSlug(label: string): string {
  return rbacRoleSlugFromLabel(label)
}

export type CreateOwnerAccountInput = {
  name: string
  email: string
  password: string
  role: string
  /** Permission slugs from matrix row (optional — derived from role slug if omitted). */
  permissions?: string[]
  plan: AdminUserPlan
  status: AdminUserStatus
  organization?: string
  sendActivationEmail: boolean
  limits?: Partial<OwnerProvisionedLimits>
}

export type CreateOwnerAccountResult =
  | { ok: true; user: AdminDirectoryUser; activationLink?: string; message: string }
  | { ok: false; message: string }

/** True when the user may exist in admin UI but not on the shared auth server (other devices cannot sign in). */
export function needsCrossDeviceSignInRepair(user: AdminDirectoryUser): boolean {
  if (isStaticLocalAuthMode()) return false
  return user.profileExtra?.authServerSynced !== true
}

function withAuthServerSynced(
  profileExtra: Record<string, unknown> | undefined,
  synced: boolean,
): Record<string, unknown> {
  return { ...(profileExtra ?? {}), authServerSynced: synced }
}

export async function createOwnerProvisionedAccount(
  input: CreateOwnerAccountInput,
  actor: CurrentUser | null,
): Promise<CreateOwnerAccountResult> {
  const email = normalizeEmail(input.email)
  const name = input.name.trim()
  const password = input.password.trim()

  if (!email || !email.includes('@')) {
    return { ok: false, message: 'A valid email address is required.' }
  }
  if (!name) return { ok: false, message: 'Full name is required.' }
  if (password.length < 8) {
    return { ok: false, message: 'Temporary password must be at least 8 characters.' }
  }

  const existingLocal = getAdminUserByEmail(email)
  if (existingLocal) {
    return { ok: false, message: 'An account with this email already exists.' }
  }

  const roleSlug = rbacRoleSlugFromLabel(input.role)
  const roleDisplay = rbacRoleDisplayLabel(roleSlug)
  const permissions =
    input.permissions?.length ? [...input.permissions] : permissionsForRoleSlug(roleSlug)
  const limits: OwnerProvisionedLimits = {
    ...DEFAULT_OWNER_PROVISIONED_LIMITS,
    ...input.limits,
    apiAccess: {
      ...DEFAULT_OWNER_PROVISIONED_LIMITS.apiAccess,
      ...input.limits?.apiAccess,
    },
    specialPermissions: input.limits?.specialPermissions ?? DEFAULT_OWNER_PROVISIONED_LIMITS.specialPermissions,
  }

  const sendActivation = input.sendActivationEmail
  const activeImmediately = input.status === 'Active' && !sendActivation
  const token = sendActivation || input.status === 'Pending Verification' ? createVerificationToken() : undefined

  let status: AdminUserStatus = input.status
  let emailVerified = activeImmediately
  if (sendActivation) {
    status = 'Pending Verification'
    emailVerified = false
  } else if (status === 'Pending Verification') {
    emailVerified = false
  } else if (status === 'Active') {
    emailVerified = true
  }

  let profileExtra: Record<string, unknown> = {
    source: 'owner_provision',
    roleSlug,
    permissions,
    limits,
    provisionedBy: actor?.email ?? 'owner',
    provisionedAt: new Date().toISOString(),
    ownerOverride: true,
    authServerSynced: false,
  }

  if (isAuthApiConfigured()) {
    const authResult = await apiProvisionUser({
      name,
      email,
      password,
      role: roleDisplay,
      status,
      emailVerified,
      profileExtra,
      provisionedBy: actor?.email,
      ensureSignIn: true,
    })
    if (!authResult.ok) {
      const repair = await apiRepairUserSignIn({
        name,
        email,
        password,
        role: roleDisplay,
        status,
        emailVerified,
        profileExtra,
        provisionedBy: actor?.email,
      })
      if (!repair.ok) {
        return { ok: false, message: authResult.error }
      }
      profileExtra = withAuthServerSynced(profileExtra, true)
    } else {
      profileExtra = withAuthServerSynced(profileExtra, true)
    }
  } else if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if (host.endsWith('github.io') || host.endsWith('github.dev')) {
      return {
        ok: false,
        message:
          'Cannot create sign-in accounts on static hosting without VITE_API_BASE_URL. Point the build to your backend API so users can log in.',
      }
    }
  }

  const passwordHash = await sha256Hex(password)
  const user = upsertAdminUser({
    email,
    name,
    role: roleDisplay,
    plan: input.plan,
    status,
    emailVerified,
    organization: input.organization?.trim() || undefined,
    passwordHash,
    verificationToken: token,
    verificationTokenExpires: token ? verificationExpiresAt() : undefined,
    createdAt: new Date().toISOString(),
    profileExtra,
  })

  appendAuditLog({
    entity: 'user',
    entityId: String(user.id),
    action: 'owner.account.created',
    meta: {
      email,
      role: user.role,
      roleSlug,
      permissions,
      plan: user.plan,
      status: user.status,
      sendActivation,
      actor: actor?.email,
    },
  })

  await flushAdminDirectoryToServerNow()

  const activationLink = token ? buildLocalVerificationLink(token) : undefined
  const message = sendActivation
    ? `Account created for ${email}. Share the activation link or resend from the user row.`
    : `Account created for ${email} — user can sign in with the assigned password.`

  return {
    ok: true,
    user,
    activationLink,
    message,
  }
}

/** Push password + sign-in flags to the shared auth server (fixes login from other devices). */
export async function repairAuthServerSignInForUser(
  userId: number,
  password: string,
  actor: CurrentUser | null,
): Promise<{ ok: boolean; message: string }> {
  const pwd = password.trim()
  if (pwd.length < 8) {
    return { ok: false, message: 'Password must be at least 8 characters.' }
  }
  const user = getAdminUserById(userId)
  if (!user) return { ok: false, message: 'User not found.' }

  if (!isAuthApiConfigured()) {
    return {
      ok: false,
      message:
        'Cross-device sign-in is not available on this host. Deploy with the backend API or set VITE_API_BASE_URL.',
    }
  }

  const authResult = await apiRepairUserSignIn({
    name: user.name,
    email: user.email,
    password: pwd,
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerified !== false,
    profileExtra: user.profileExtra,
    provisionedBy: actor?.email,
  })
  if (!authResult.ok) {
    return { ok: false, message: authResult.error }
  }

  const passwordHash = await sha256Hex(pwd)
  updateAdminUser(userId, {
    passwordHash,
    profileExtra: {
      ...user.profileExtra,
      authServerSynced: true,
      authServerRepairedAt: new Date().toISOString(),
      authServerRepairedBy: actor?.email,
    },
  })
  appendAuditLog({
    entity: 'user',
    entityId: String(userId),
    action: 'owner.account.auth_server_repair',
    meta: { email: user.email, actor: actor?.email, repaired: authResult.repaired },
  })
  await flushAdminDirectoryToServerNow()
  return {
    ok: true,
    message: `Sign-in enabled on the server for ${user.email}. User can sign in from any device with this password.`,
  }
}

export async function ownerResetAccountPassword(
  userId: number,
  newPassword: string,
  actor: CurrentUser | null,
): Promise<{ ok: boolean; message: string }> {
  const password = newPassword.trim()
  if (password.length < 8) {
    return { ok: false, message: 'Password must be at least 8 characters.' }
  }
  const passwordHash = await sha256Hex(password)
  const user = getAdminUserById(userId)
  if (!user) return { ok: false, message: 'User not found.' }

  if (isAuthApiConfigured()) {
    const authResult = await apiProvisionUser({
      name: user.name,
      email: user.email,
      password,
      role: user.role,
      status: user.status,
      emailVerified: user.emailVerified !== false,
      profileExtra: user.profileExtra,
      provisionedBy: actor?.email,
      ensureSignIn: true,
    })
    if (!authResult.ok) {
      return { ok: false, message: authResult.error }
    }
  }

  updateAdminUser(userId, {
    passwordHash,
    profileExtra: {
      ...user.profileExtra,
      authServerSynced: true,
      passwordResetBy: actor?.email,
      passwordResetAt: new Date().toISOString(),
    },
  })
  appendAuditLog({
    entity: 'user',
    entityId: String(userId),
    action: 'owner.account.password_reset',
    meta: { email: user.email, actor: actor?.email },
  })
  await flushAdminDirectoryToServerNow()
  return { ok: true, message: `Password updated for ${user.email}.` }
}
