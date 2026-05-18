/** Canonical RBAC roles (stored in DB with these display labels). */
export const RBAC_ROLES = Object.freeze({
  USER: 'User',
  ANALYST: 'Analyst',
  MANAGER: 'Manager',
  ADMIN: 'Admin',
  SUPER_ADMIN: 'Super Admin',
})

/** Default role for public self-registration (never Admin/Manager). */
export const PUBLIC_SIGNUP_ROLE = RBAC_ROLES.USER

/** Roles assignable only by admin+ via invite or admin user create. */
export const STAFF_ROLES = [
  RBAC_ROLES.ANALYST,
  RBAC_ROLES.MANAGER,
  RBAC_ROLES.ADMIN,
  RBAC_ROLES.SUPER_ADMIN,
]

const ROLE_RANK = {
  user: 10,
  analyst: 20,
  manager: 30,
  admin: 40,
  super_admin: 50,
}

export function normalizeRbacRole(value) {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
  if (!raw) return 'user'
  if (raw === 'super_admin' || raw === 'superadmin' || raw === 'super') return 'super_admin'
  if (raw === 'admin') return 'admin'
  if (raw === 'manager' || raw === 'admin_manager' || raw === 'admin-manager') return 'manager'
  if (raw === 'analyst') return 'analyst'
  if (raw === 'user' || raw === 'viewer') return 'user'
  if (raw === 'editor') return 'analyst'
  return 'user'
}

export function rbacRoleToDisplay(slug) {
  const s = normalizeRbacRole(slug)
  if (s === 'super_admin') return RBAC_ROLES.SUPER_ADMIN
  if (s === 'admin') return RBAC_ROLES.ADMIN
  if (s === 'manager') return RBAC_ROLES.MANAGER
  if (s === 'analyst') return RBAC_ROLES.ANALYST
  return RBAC_ROLES.USER
}

export function displayRoleToSlug(display) {
  return normalizeRbacRole(display)
}

export function roleRank(slug) {
  return ROLE_RANK[normalizeRbacRole(slug)] ?? 0
}

/** Prevent privilege escalation when actor assigns targetRole. */
export function canAssignRole(actorSlug, targetSlug) {
  const actor = normalizeRbacRole(actorSlug)
  const target = normalizeRbacRole(targetSlug)
  if (actor === 'super_admin') return true
  if (actor === 'admin') return roleRank(target) < roleRank('super_admin')
  if (actor === 'manager') return ['user', 'analyst', 'manager'].includes(target)
  return false
}

export function isStaffRole(slug) {
  const s = normalizeRbacRole(slug)
  return s !== 'user'
}

export const USER_STATUSES = Object.freeze({
  PENDING_VERIFICATION: 'Pending Verification',
  PENDING_APPROVAL: 'Pending Approval',
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
})
