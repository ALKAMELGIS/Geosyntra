/**
 * RBAC roles aligned with backend `rbac/permissions.js` MATRIX keys and
 * `Roles & permissions` (`/api/rbac/permissions/matrix`).
 */
import { GEOSYNTRA_ROLE_HIERARCHY } from './geosyntraRoles'
import { roleSlugFromDisplay } from '../rbacPermissions'

/** Slugs present in the server permissions matrix (authority high → low). */
export const RBAC_MATRIX_ROLE_SLUGS = [
  'owner',
  'admin',
  'manager',
  'analyst',
  'ai_operator',
  'viewer',
  'trial_user',
] as const

export type RbacMatrixRoleSlug = (typeof RBAC_MATRIX_ROLE_SLUGS)[number]

/** Matrix keys not offered in assign-role dropdowns (legacy / bootstrap only). */
export const RBAC_LEGACY_ROLE_SLUGS = ['user', 'super_admin'] as const

export type RbacRoleOption = {
  slug: string
  label: string
  shortLabel?: string
}

const SLUG_LABEL: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Manager',
  analyst: 'Analyst',
  ai_operator: 'AI Operator',
  viewer: 'Viewer',
  trial_user: 'Trial User',
  user: 'Viewer',
  super_admin: 'Super Admin',
}

function labelForSlug(slug: string): string {
  const key = roleSlugFromDisplay(slug)
  const fromHierarchy = GEOSYNTRA_ROLE_HIERARCHY.find(r => r.slug === key)
  if (fromHierarchy) return fromHierarchy.label
  return SLUG_LABEL[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export function matrixRowDisplayLabel(roleSlug: string): string {
  return labelForSlug(roleSlug)
}

export function rbacRoleDisplayLabel(role: string): string {
  return labelForSlug(roleSlugFromDisplay(role))
}

export function rbacRoleSlugFromLabel(label: string): string {
  return roleSlugFromDisplay(label)
}

function toRoleOption(slug: string): RbacRoleOption {
  return { slug: roleSlugFromDisplay(slug), label: labelForSlug(slug) }
}

/** All matrix roles for display lists. */
export const ADMIN_USER_ROLES: RbacRoleOption[] = RBAC_MATRIX_ROLE_SLUGS.map(toRoleOption)

/** Roles an Owner may assign when provisioning accounts. */
export const OWNER_CREATABLE_ROLE_SLUGS: RbacMatrixRoleSlug[] = [...RBAC_MATRIX_ROLE_SLUGS]

export const OWNER_CREATABLE_ROLES: RbacRoleOption[] = OWNER_CREATABLE_ROLE_SLUGS.map(toRoleOption)

export function adminRoleSelectOptions(existingRole?: string): RbacRoleOption[] {
  const base = [...OWNER_CREATABLE_ROLES]
  if (!existingRole?.trim()) return base
  const slug = roleSlugFromDisplay(existingRole)
  if (base.some(r => r.slug === slug)) return base
  return [...base, { slug, label: rbacRoleDisplayLabel(existingRole) }]
}

/** Team invite dropdown — excludes Owner. */
export function inviteRoleOptions(): RbacRoleOption[] {
  return OWNER_CREATABLE_ROLES.filter(r => r.slug !== 'owner')
}
