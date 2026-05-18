import { normalizeRbacRole, roleRank } from './roles.js'

/** Permission slugs checked by middleware and frontend. */
export const PERMISSIONS = Object.freeze({
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
  AOI_READ: 'aoi.read',
  AOI_WRITE: 'aoi.write',
  ANALYTICS_RUN: 'analytics.run',
  REPORTS_WRITE: 'reports.write',
  AI_RUN: 'ai.run',
})

const MATRIX = {
  trial_user: [PERMISSIONS.APP_ACCESS, PERMISSIONS.AOI_READ],
  viewer: [PERMISSIONS.APP_ACCESS, PERMISSIONS.AOI_READ, PERMISSIONS.ADMIN_PANEL, PERMISSIONS.USERS_READ],
  user: [PERMISSIONS.APP_ACCESS, PERMISSIONS.AOI_READ, PERMISSIONS.ADMIN_PANEL, PERMISSIONS.USERS_READ],
  analyst: [
    PERMISSIONS.APP_ACCESS,
    PERMISSIONS.AOI_READ,
    PERMISSIONS.AOI_WRITE,
    PERMISSIONS.ANALYTICS_RUN,
    PERMISSIONS.REPORTS_WRITE,
    PERMISSIONS.ADMIN_PANEL,
    PERMISSIONS.USERS_READ,
    PERMISSIONS.AUDIT_READ,
  ],
  ai_operator: [
    PERMISSIONS.APP_ACCESS,
    PERMISSIONS.AOI_READ,
    PERMISSIONS.ANALYTICS_RUN,
    PERMISSIONS.AI_RUN,
    PERMISSIONS.ADMIN_PANEL,
    PERMISSIONS.USERS_READ,
  ],
  manager: [
    PERMISSIONS.APP_ACCESS,
    PERMISSIONS.AOI_READ,
    PERMISSIONS.AOI_WRITE,
    PERMISSIONS.ANALYTICS_RUN,
    PERMISSIONS.REPORTS_WRITE,
    PERMISSIONS.ADMIN_PANEL,
    PERMISSIONS.USERS_READ,
    PERMISSIONS.USERS_MANAGE,
    PERMISSIONS.USERS_APPROVE,
    PERMISSIONS.USERS_SUSPEND,
    PERMISSIONS.INVITES_CREATE,
    PERMISSIONS.AUDIT_READ,
  ],
  admin: [
    PERMISSIONS.APP_ACCESS,
    PERMISSIONS.AOI_READ,
    PERMISSIONS.AOI_WRITE,
    PERMISSIONS.ANALYTICS_RUN,
    PERMISSIONS.REPORTS_WRITE,
    PERMISSIONS.ADMIN_PANEL,
    PERMISSIONS.USERS_READ,
    PERMISSIONS.USERS_MANAGE,
    PERMISSIONS.USERS_APPROVE,
    PERMISSIONS.USERS_SUSPEND,
    PERMISSIONS.ROLES_ASSIGN,
    PERMISSIONS.INVITES_CREATE,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.SETTINGS_MANAGE,
    PERMISSIONS.AI_RUN,
  ],
  owner: Object.values(PERMISSIONS),
  super_admin: Object.values(PERMISSIONS),
}

export function permissionsForRole(roleSlug) {
  const slug = normalizeRbacRole(roleSlug)
  return MATRIX[slug] ?? MATRIX.trial_user
}

export function hasPermission(roleSlug, permission) {
  const perms = permissionsForRole(roleSlug)
  return perms.includes(permission)
}

export function canAccessAdminPanel(roleSlug) {
  return hasPermission(roleSlug, PERMISSIONS.ADMIN_PANEL)
}

export function permissionsMatrixExport() {
  return Object.entries(MATRIX).map(([role, permissions]) => ({
    role,
    permissions,
    rank: roleRank(role),
  }))
}
