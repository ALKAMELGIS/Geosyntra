/**
 * Helpers for `/api/rbac/permissions/matrix` rows — sort order + Owner create-account UI.
 */
import { apiPermissionsMatrix, type RbacPermissionsMatrixRow } from '../rbacApi'
import { permissionsForRoleSlug, roleSlugFromDisplay } from '../rbacPermissions'
import {
  OWNER_CREATABLE_ROLES,
  RBAC_MATRIX_ROLE_SLUGS,
  type RbacRoleOption,
} from './rbacRoleCatalog'

export type RbacMatrixRow = RbacPermissionsMatrixRow

const MATRIX_SORT_ORDER: Record<string, number> = Object.fromEntries(
  RBAC_MATRIX_ROLE_SLUGS.map((slug, i) => [slug, i]),
)

export function sortRbacMatrixRows(rows: RbacMatrixRow[]): RbacMatrixRow[] {
  return [...rows].sort((a, b) => {
    const ra = MATRIX_SORT_ORDER[roleSlugFromDisplay(a.role)] ?? 99
    const rb = MATRIX_SORT_ORDER[roleSlugFromDisplay(b.role)] ?? 99
    if (ra !== rb) return ra - rb
    return a.role.localeCompare(b.role)
  })
}

export function permissionsForRoleOption(option: RbacRoleOption): string[] {
  return permissionsForRoleSlug(option.slug)
}

/** Load assignable roles from live matrix; fallback to static Owner catalog. */
export async function loadRoleOptionsFromPermissionsMatrix(): Promise<RbacRoleOption[]> {
  const matrix = await apiPermissionsMatrix()
  if (!matrix.length) return [...OWNER_CREATABLE_ROLES]

  const slugs = new Set<string>()
  for (const row of matrix) {
    const slug = roleSlugFromDisplay(row.role)
    if (slug === 'user' || slug === 'super_admin') continue
    slugs.add(slug)
  }

  const ordered = RBAC_MATRIX_ROLE_SLUGS.filter(s => slugs.has(s))
  const extras = [...slugs].filter(s => !RBAC_MATRIX_ROLE_SLUGS.includes(s as (typeof RBAC_MATRIX_ROLE_SLUGS)[number]))

  return [...ordered, ...extras].map(slug => {
    const hit = OWNER_CREATABLE_ROLES.find(r => r.slug === slug)
    return hit ?? { slug, label: slug.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }
  })
}
