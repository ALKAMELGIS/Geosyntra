import type { CurrentUser } from '../../lib/auth'
import { normalizeEmail } from '../../lib/auth'
import { readGeosyntraAccountProfile } from '../../lib/account/geosyntraAccountProfile'
import {
  ensureUserProfileDefaults,
  readUserProfileExtended,
  type UserProfileExtended,
} from '../../lib/account/userProfileStore'
import { getAdminUserByEmail } from '../../lib/admin/adminUserStore'
import { SUBSCRIPTION_PLAN_LABELS } from '../../lib/geoEnterpriseUserModel'
import { readWorkspaceState } from '../../lib/onboarding/workspaceState'
import type { ProfileRoleLabel, ProfileViewModel } from './types'

function mapRole(role: string): ProfileRoleLabel {
  const r = role.trim()
  if (r === 'Admin' || r === 'Manager') return r
  if (r === 'Admin Manager') return 'Manager'
  if (r === 'Analyst' || r === 'Editor' || r === 'Viewer') return r
  return 'Participant'
}

function computeCompleteness(input: {
  avatarUrl?: string
  phone: string
  country: string
  organization: string
  emailVerified: boolean
}): { percent: number; missing: string[] } {
  const checks: Array<{ label: string; ok: boolean }> = [
    { label: 'Profile photo', ok: Boolean(input.avatarUrl) },
    { label: 'Phone number', ok: Boolean(input.phone.trim()) },
    { label: 'Country', ok: Boolean(input.country.trim()) },
    { label: 'Organization', ok: Boolean(input.organization.trim()) },
    { label: 'Verified email', ok: input.emailVerified },
  ]
  const done = checks.filter(c => c.ok).length
  const missing = checks.filter(c => !c.ok).map(c => c.label)
  return { percent: Math.round((done / checks.length) * 100), missing }
}

export function buildProfileViewModel(user: CurrentUser, extended?: UserProfileExtended): ProfileViewModel {
  const email = normalizeEmail(user.email)
  const directory = getAdminUserByEmail(email)
  const ws = readWorkspaceState(email)
  const avatarProfile = readGeosyntraAccountProfile(email)
  const ext = extended ?? ensureUserProfileDefaults(email, user.name)

  const emailVerified = directory?.emailVerified ?? true
  const status =
    directory?.status === 'Suspended'
      ? 'Suspended'
      : !emailVerified || directory?.status === 'Pending Verification'
        ? 'Pending'
        : 'Active'

  const phone = ext.phone ?? (typeof directory?.profileExtra?.phone === 'string' ? directory.profileExtra.phone : '')
  const country = ext.country ?? directory?.country ?? ''
  const organization = ext.organization ?? directory?.organization ?? ws?.displayName ?? ''

  const { percent, missing } = computeCompleteness({
    avatarUrl: avatarProfile.avatarDataUrl,
    phone,
    country,
    organization,
    emailVerified,
  })

  const lastUpdatedAt =
    ext.updatedAt ?? avatarProfile.updatedAt ?? directory?.lastLogin ?? new Date().toISOString()

  return {
    userId: user.id,
    fullName: user.name,
    email,
    role: mapRole(String(user.role)),
    rawRole: String(user.role),
    status,
    emailVerified,
    avatarUrl: avatarProfile.avatarDataUrl,
    phone,
    country,
    organization,
    accountCreatedAt: directory?.createdAt ?? new Date(user.id).toISOString(),
    lastLoginAt: directory?.lastLogin ?? lastUpdatedAt,
    lastUpdatedAt,
    completenessPercent: percent,
    completenessMissing: missing,
    sessions: ext.sessions ?? [],
    activity: ext.activity ?? [],
    twoFactorEnabled: ext.twoFactorEnabled ?? false,
    notifyEmail: ext.notifyEmail ?? true,
    notifyProduct: ext.notifyProduct ?? true,
    notifySecurity: ext.notifySecurity ?? true,
    language: ext.language ?? 'en',
    planLabel: ws ? SUBSCRIPTION_PLAN_LABELS[ws.subscriptionPlan] : directory?.plan ?? 'Trial',
    workspaceLabel: ws?.workspaceReady
      ? ws.displayName?.trim() || ws.workspaceId || 'Workspace ready'
      : 'Setup in progress',
  }
}
