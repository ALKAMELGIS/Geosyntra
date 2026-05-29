/** Admin directory user row — mirrors backend `users` table shape for SaaS admin UI. */

export type AdminUserStatus = 'Active' | 'Suspended' | 'Pending Verification' | 'Pending Approval'
export type AdminUserPlan =
  | 'Free'
  | 'Trial'
  | 'Basic'
  | 'Pro'
  | 'Professional'
  | 'Enterprise'
  | 'Internal Team'

/** Limits & RBAC overrides set when an Owner provisions an account. */
export type OwnerProvisionedLimits = {
  storageLimitGb: number
  workspaceAccess: 'full' | 'assigned' | 'none'
  aoiLimit: number
  apiAccess: {
    sentinelHub: boolean
    geoAi: boolean
    exports: boolean
    adminApi: boolean
  }
  specialPermissions: string[]
}

export const DEFAULT_OWNER_PROVISIONED_LIMITS: OwnerProvisionedLimits = {
  storageLimitGb: 25,
  workspaceAccess: 'assigned',
  aoiLimit: 10,
  apiAccess: { sentinelHub: true, geoAi: true, exports: true, adminApi: false },
  specialPermissions: [],
}

export type AdminDirectoryUser = {
  id: number
  name: string
  email: string
  role: string
  status: AdminUserStatus
  plan: AdminUserPlan
  emailVerified: boolean
  organization?: string
  country?: string
  lastLogin?: string
  createdAt?: string
  passwordHash?: string
  verificationToken?: string
  verificationTokenExpires?: string
  profileExtra?: Record<string, unknown>
}

export const ADMIN_USER_PLANS: AdminUserPlan[] = [
  'Free',
  'Trial',
  'Basic',
  'Pro',
  'Professional',
  'Enterprise',
  'Internal Team',
]

/** Owner-facing subscription labels mapped to directory plan values. */
export const OWNER_SUBSCRIPTION_OPTIONS = [
  { label: 'Free Trial', plan: 'Trial' as AdminUserPlan },
  { label: 'Basic', plan: 'Basic' as AdminUserPlan },
  { label: 'Professional', plan: 'Professional' as AdminUserPlan },
  { label: 'Enterprise', plan: 'Enterprise' as AdminUserPlan },
  { label: 'Internal Team', plan: 'Internal Team' as AdminUserPlan },
] as const

export {
  ADMIN_USER_ROLES,
  OWNER_CREATABLE_ROLES,
  OWNER_CREATABLE_ROLE_SLUGS,
} from '../rbac/rbacRoleCatalog'

export const ADMIN_USER_STATUSES: AdminUserStatus[] = [
  'Active',
  'Suspended',
  'Pending Verification',
  'Pending Approval',
]

const PLAN_ALIASES: Record<string, AdminUserPlan> = {
  free: 'Free',
  trial: 'Trial',
  basic: 'Basic',
  pro: 'Pro',
  professional: 'Professional',
  enterprise: 'Enterprise',
  internal: 'Internal Team',
  'internal team': 'Internal Team',
}

export function normalizeAdminUser(raw: unknown): AdminDirectoryUser | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const email = String(r.email ?? '').trim().toLowerCase()
  if (!email) return null
  const id = Number(r.id)
  const statusRaw = String(r.status ?? 'Active')
  const status = ADMIN_USER_STATUSES.includes(statusRaw as AdminUserStatus)
    ? (statusRaw as AdminUserStatus)
    : r.emailVerified === false
      ? 'Pending Verification'
      : statusRaw.toLowerCase().includes('pending') && statusRaw.toLowerCase().includes('approval')
        ? 'Pending Approval'
        : 'Active'
  const planRaw = String(r.plan ?? 'Free').trim()
  const planKey = planRaw.toLowerCase()
  const plan = ADMIN_USER_PLANS.includes(planRaw as AdminUserPlan)
    ? (planRaw as AdminUserPlan)
    : (PLAN_ALIASES[planKey] ?? 'Free')
  return {
    id: Number.isFinite(id) && id > 0 ? id : Date.now(),
    name: String(r.name ?? email),
    email,
    role: String(r.role ?? 'Viewer'),
    status,
    plan,
    emailVerified: r.emailVerified !== false && status !== 'Pending Verification',
    organization: typeof r.organization === 'string' ? r.organization : undefined,
    country: typeof r.country === 'string' ? r.country : undefined,
    lastLogin: typeof r.lastLogin === 'string' ? r.lastLogin : undefined,
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : undefined,
    passwordHash: typeof r.passwordHash === 'string' ? r.passwordHash : undefined,
    verificationToken: typeof r.verificationToken === 'string' ? r.verificationToken : undefined,
    verificationTokenExpires:
      typeof r.verificationTokenExpires === 'string' ? r.verificationTokenExpires : undefined,
    profileExtra:
      r.profileExtra && typeof r.profileExtra === 'object' ? (r.profileExtra as Record<string, unknown>) : undefined,
  }
}
