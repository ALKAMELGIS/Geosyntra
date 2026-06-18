/** Mirrors backend/server/rbac/permissions.js — UI hints only; server enforces access. */
export const RBAC_PERMISSIONS = {
  APP_ACCESS: 'app.access',
  ADMIN_PANEL: 'admin.panel',
  USERS_READ: 'admin.users.read',
  USERS_MANAGE: 'admin.users.manage',
  USERS_APPROVE: 'admin.users.approve',
  USERS_SUSPEND: 'admin.users.suspend',
  ROLES_ASSIGN: 'admin.roles.assign',
  INVITES_CREATE: 'admin.invites.create',
  AUDIT_READ: 'admin.audit.read',
  SETTINGS_MANAGE: 'admin.settings.manage',
  TOKENS_READ: 'admin.tokens.read',
  TOKENS_MANAGE: 'admin.tokens.manage',
  AOI_READ: 'aoi.read',
  AOI_WRITE: 'aoi.write',
  ANALYTICS_RUN: 'analytics.run',
  REPORTS_WRITE: 'reports.write',
  AI_RUN: 'ai.run',
} as const

const ALL = Object.values(RBAC_PERMISSIONS)

/** Keep in sync with backend `permissions.js` MATRIX (offline fallback). */
const MATRIX: Record<string, string[]> = {
  trial_user: [RBAC_PERMISSIONS.APP_ACCESS, RBAC_PERMISSIONS.AOI_READ],
  viewer: [
    RBAC_PERMISSIONS.APP_ACCESS,
    RBAC_PERMISSIONS.AOI_READ,
    RBAC_PERMISSIONS.ADMIN_PANEL,
    RBAC_PERMISSIONS.USERS_READ,
  ],
  user: [
    RBAC_PERMISSIONS.APP_ACCESS,
    RBAC_PERMISSIONS.AOI_READ,
    RBAC_PERMISSIONS.ADMIN_PANEL,
    RBAC_PERMISSIONS.USERS_READ,
  ],
  analyst: [
    RBAC_PERMISSIONS.APP_ACCESS,
    RBAC_PERMISSIONS.AOI_READ,
    RBAC_PERMISSIONS.AOI_WRITE,
    RBAC_PERMISSIONS.ANALYTICS_RUN,
    RBAC_PERMISSIONS.REPORTS_WRITE,
    RBAC_PERMISSIONS.ADMIN_PANEL,
    RBAC_PERMISSIONS.USERS_READ,
    RBAC_PERMISSIONS.AUDIT_READ,
  ],
  ai_operator: [
    RBAC_PERMISSIONS.APP_ACCESS,
    RBAC_PERMISSIONS.AOI_READ,
    RBAC_PERMISSIONS.ANALYTICS_RUN,
    RBAC_PERMISSIONS.AI_RUN,
    RBAC_PERMISSIONS.ADMIN_PANEL,
    RBAC_PERMISSIONS.USERS_READ,
  ],
  manager: [
    RBAC_PERMISSIONS.APP_ACCESS,
    RBAC_PERMISSIONS.AOI_READ,
    RBAC_PERMISSIONS.AOI_WRITE,
    RBAC_PERMISSIONS.ANALYTICS_RUN,
    RBAC_PERMISSIONS.REPORTS_WRITE,
    RBAC_PERMISSIONS.ADMIN_PANEL,
    RBAC_PERMISSIONS.USERS_READ,
    RBAC_PERMISSIONS.USERS_MANAGE,
    RBAC_PERMISSIONS.USERS_APPROVE,
    RBAC_PERMISSIONS.USERS_SUSPEND,
    RBAC_PERMISSIONS.INVITES_CREATE,
    RBAC_PERMISSIONS.AUDIT_READ,
  ],
  admin: [
    RBAC_PERMISSIONS.APP_ACCESS,
    RBAC_PERMISSIONS.AOI_READ,
    RBAC_PERMISSIONS.AOI_WRITE,
    RBAC_PERMISSIONS.ANALYTICS_RUN,
    RBAC_PERMISSIONS.REPORTS_WRITE,
    RBAC_PERMISSIONS.ADMIN_PANEL,
    RBAC_PERMISSIONS.USERS_READ,
    RBAC_PERMISSIONS.USERS_MANAGE,
    RBAC_PERMISSIONS.USERS_APPROVE,
    RBAC_PERMISSIONS.USERS_SUSPEND,
    RBAC_PERMISSIONS.ROLES_ASSIGN,
    RBAC_PERMISSIONS.INVITES_CREATE,
    RBAC_PERMISSIONS.AUDIT_READ,
    RBAC_PERMISSIONS.SETTINGS_MANAGE,
    RBAC_PERMISSIONS.TOKENS_READ,
    RBAC_PERMISSIONS.AI_RUN,
  ],
  owner: ALL,
  super_admin: ALL,
}

const DEFAULT_SYSTEM_OWNER_EMAILS = ['admin@geosyntra.com'] as const

function parseEnvSystemOwnerEmails(): string[] {
  const raw = import.meta.env.VITE_RBAC_SYSTEM_OWNER_EMAILS
  if (typeof raw !== 'string' || !raw.trim()) return []
  return raw
    .split(/[,;\s]+/)
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
}

/** Built-in + VITE_RBAC_SYSTEM_OWNER_EMAILS — mirrors backend listSystemOwnerEmails(). */
export function listSystemOwnerEmails(): readonly string[] {
  return [...new Set([...DEFAULT_SYSTEM_OWNER_EMAILS, ...parseEnvSystemOwnerEmails()])]
}

export const SYSTEM_OWNER_EMAILS = DEFAULT_SYSTEM_OWNER_EMAILS

export function isSystemOwnerEmail(email: string): boolean {
  const em = String(email || '').trim().toLowerCase()
  return listSystemOwnerEmails().includes(em)
}

export function roleSlugFromDisplay(role: unknown): string {
  const raw = String(role ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
  if (raw === 'super_admin' || raw === 'super admin' || raw === 'superadmin') return 'super_admin'
  if (raw === 'owner') return 'owner'
  if (raw === 'admin') return 'admin'
  if (raw === 'manager' || raw === 'admin_manager' || raw === 'admin manager') return 'manager'
  if (raw === 'analyst' || raw === 'editor') return 'analyst'
  if (raw === 'ai_operator' || raw === 'ai operator') return 'ai_operator'
  if (raw === 'trial_user' || raw === 'trial user' || raw === 'trial') return 'trial_user'
  if (raw === 'viewer' || raw === 'user') return 'viewer'
  return 'trial_user'
}

export function permissionsForRoleSlug(slug: string): string[] {
  const key = roleSlugFromDisplay(slug)
  return MATRIX[key] ?? MATRIX.trial_user
}

export function rbacHasPermission(permission: string, role: unknown, serverPermissions?: string[]): boolean {
  if (Array.isArray(serverPermissions) && serverPermissions.length > 0) {
    return serverPermissions.includes(permission)
  }
  return permissionsForRoleSlug(roleSlugFromDisplay(role)).includes(permission)
}
