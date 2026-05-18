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
} as const

const MATRIX: Record<string, string[]> = {
  user: [RBAC_PERMISSIONS.APP_ACCESS],
  analyst: [
    RBAC_PERMISSIONS.APP_ACCESS,
    RBAC_PERMISSIONS.ADMIN_PANEL,
    RBAC_PERMISSIONS.USERS_READ,
    RBAC_PERMISSIONS.AUDIT_READ,
  ],
  manager: [
    RBAC_PERMISSIONS.APP_ACCESS,
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
    RBAC_PERMISSIONS.ADMIN_PANEL,
    RBAC_PERMISSIONS.USERS_READ,
    RBAC_PERMISSIONS.USERS_MANAGE,
    RBAC_PERMISSIONS.USERS_APPROVE,
    RBAC_PERMISSIONS.USERS_SUSPEND,
    RBAC_PERMISSIONS.ROLES_ASSIGN,
    RBAC_PERMISSIONS.INVITES_CREATE,
    RBAC_PERMISSIONS.AUDIT_READ,
    RBAC_PERMISSIONS.SETTINGS_MANAGE,
  ],
  super_admin: Object.values(RBAC_PERMISSIONS),
}

export function roleSlugFromDisplay(role: unknown): string {
  const raw = String(role ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
  if (raw === 'super_admin' || raw === 'super admin') return 'super_admin'
  if (raw === 'admin') return 'admin'
  if (raw === 'manager' || raw === 'admin_manager' || raw === 'admin manager') return 'manager'
  if (raw === 'analyst' || raw === 'editor') return 'analyst'
  if (raw === 'user' || raw === 'viewer') return 'user'
  return 'user'
}

export function permissionsForRoleSlug(slug: string): string[] {
  return MATRIX[roleSlugFromDisplay(slug)] ?? MATRIX.user
}

export function rbacHasPermission(permission: string, role: unknown, serverPermissions?: string[]): boolean {
  if (Array.isArray(serverPermissions) && serverPermissions.length > 0) {
    return serverPermissions.includes(permission)
  }
  return permissionsForRoleSlug(roleSlugFromDisplay(role)).includes(permission)
}
