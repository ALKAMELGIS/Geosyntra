/** Admin directory user row — mirrors backend `users` table shape for SaaS admin UI. */

export type AdminUserStatus = 'Active' | 'Suspended' | 'Pending Verification'
export type AdminUserPlan = 'Free' | 'Trial' | 'Pro' | 'Enterprise'

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
  profileExtra?: Record<string, unknown>
}

export const ADMIN_USER_PLANS: AdminUserPlan[] = ['Free', 'Trial', 'Pro', 'Enterprise']
export const ADMIN_USER_STATUSES: AdminUserStatus[] = ['Active', 'Suspended', 'Pending Verification']
export const ADMIN_USER_ROLES = ['Admin', 'Manager', 'Admin Manager', 'Analyst', 'Editor', 'Viewer'] as const

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
      : 'Active'
  const planRaw = String(r.plan ?? 'Free')
  const plan = ADMIN_USER_PLANS.includes(planRaw as AdminUserPlan) ? (planRaw as AdminUserPlan) : 'Free'
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
    profileExtra:
      r.profileExtra && typeof r.profileExtra === 'object' ? (r.profileExtra as Record<string, unknown>) : undefined,
  }
}
