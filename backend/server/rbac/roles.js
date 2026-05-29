/** Canonical RBAC roles (stored in DB with these display labels). */
export const RBAC_ROLES = Object.freeze({
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  ANALYST: 'Analyst',
  VIEWER: 'Viewer',
  AI_OPERATOR: 'AI Operator',
  TRIAL_USER: 'Trial User',
  /** @deprecated legacy label — maps to Viewer */
  USER: 'User',
  /** @deprecated legacy label — maps to Owner */
  SUPER_ADMIN: 'Super Admin',
})

export const PUBLIC_SIGNUP_ROLE_SLUG = 'trial_user'

/** Default role for public self-registration. */
export const PUBLIC_SIGNUP_ROLE = RBAC_ROLES.TRIAL_USER

/** Roles assignable only by admin+ via invite or admin user create. */
export const STAFF_ROLES = [
  RBAC_ROLES.ANALYST,
  RBAC_ROLES.MANAGER,
  RBAC_ROLES.ADMIN,
  RBAC_ROLES.OWNER,
  RBAC_ROLES.AI_OPERATOR,
]

const ROLE_RANK = {
  trial_user: 6,
  viewer: 14,
  user: 14,
  ai_operator: 18,
  analyst: 20,
  manager: 30,
  admin: 40,
  owner: 50,
  super_admin: 50,
}

const SIGNUP_BLOCKED_SLUGS = new Set(['owner', 'super_admin', 'admin'])
const SIGNUP_ALLOWED_SLUGS = new Set(['trial_user', 'viewer', 'analyst', 'manager', 'ai_operator'])

export function normalizeRbacRole(value) {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
  if (!raw) return 'trial_user'
  if (raw === 'super_admin' || raw === 'superadmin' || raw === 'super') return 'super_admin'
  if (raw === 'owner') return 'owner'
  if (raw === 'admin') return 'admin'
  if (raw === 'manager' || raw === 'admin_manager' || raw === 'admin-manager') return 'manager'
  if (raw === 'analyst' || raw === 'editor') return 'analyst'
  if (raw === 'viewer' || raw === 'user') return 'viewer'
  if (raw === 'ai_operator' || raw === 'ai' || raw === 'aioperator') return 'ai_operator'
  if (raw === 'trial_user' || raw === 'trial') return 'trial_user'
  return 'trial_user'
}

export function rbacRoleToDisplay(slug) {
  const s = normalizeRbacRole(slug)
  if (s === 'super_admin') return RBAC_ROLES.SUPER_ADMIN
  if (s === 'owner') return RBAC_ROLES.OWNER
  if (s === 'admin') return RBAC_ROLES.ADMIN
  if (s === 'manager') return RBAC_ROLES.MANAGER
  if (s === 'analyst') return RBAC_ROLES.ANALYST
  if (s === 'viewer') return RBAC_ROLES.VIEWER
  if (s === 'ai_operator') return RBAC_ROLES.AI_OPERATOR
  if (s === 'trial_user') return RBAC_ROLES.TRIAL_USER
  return RBAC_ROLES.TRIAL_USER
}

export function displayRoleToSlug(display) {
  return normalizeRbacRole(display)
}

export function roleRank(slug) {
  return ROLE_RANK[normalizeRbacRole(slug)] ?? 0
}

/** Roles that need admin approval before login after email verification. */
export function roleRequiresApprovalAfterVerify(slug) {
  const s = normalizeRbacRole(slug)
  return s === 'viewer' || s === 'manager' || s === 'ai_operator'
}

/** Self-service sign up — Owner/Admin cannot be chosen; unknown values fall back to Trial. */
export function resolveSignupRole(requested) {
  const slug = normalizeRbacRole(requested || PUBLIC_SIGNUP_ROLE_SLUG)
  if (SIGNUP_BLOCKED_SLUGS.has(slug)) {
    return { ok: false, error: 'role_not_self_assignable' }
  }
  const resolved = SIGNUP_ALLOWED_SLUGS.has(slug) ? slug : PUBLIC_SIGNUP_ROLE_SLUG
  return { ok: true, slug: resolved, display: rbacRoleToDisplay(resolved) }
}

/** Prevent privilege escalation when actor assigns targetRole. */
export function canAssignRole(actorSlug, targetSlug) {
  const actor = normalizeRbacRole(actorSlug)
  const target = normalizeRbacRole(targetSlug)
  if (actor === 'owner' || actor === 'super_admin') return true
  if (actor === 'admin') return roleRank(target) < roleRank('owner')
  if (actor === 'manager') {
    return ['trial_user', 'viewer', 'analyst', 'manager', 'ai_operator'].includes(target)
  }
  return false
}

export function isStaffRole(slug) {
  const s = normalizeRbacRole(slug)
  return s !== 'trial_user' && s !== 'viewer'
}

export const USER_STATUSES = Object.freeze({
  PENDING_VERIFICATION: 'Pending Verification',
  PENDING_APPROVAL: 'Pending Approval',
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
})
