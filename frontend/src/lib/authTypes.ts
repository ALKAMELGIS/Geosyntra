export type Role =
  | 'Owner'
  | 'Super Admin'
  | 'Admin'
  | 'Manager'
  | 'Admin Manager'
  | 'Analyst'
  | 'Editor'
  | 'Viewer'
  | 'AI Operator'
  | 'Trial User'
  | 'User'

export type CurrentUser = {
  id: number
  name: string
  email: string
  role: Role | string
  roleSlug?: string
  status?: string
  permissions?: string[]
  scope?: string
  managedById?: number
}

export const normalizeEmail = (value: unknown): string => {
  let v = String(value ?? '')
  try {
    v = v.normalize('NFKC')
  } catch {
    /* ignore */
  }
  return v.replace(/[\u200B-\u200D\uFEFF]/g, '').trim().toLowerCase()
}

export const normalizeRole = (value: unknown): Role => {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return 'User'
  if (raw === 'owner') return 'Owner'
  if (raw === 'super_admin' || raw === 'super admin' || raw === 'superadmin') return 'Owner'
  if (raw === 'admin') return 'Admin'
  if (raw === 'manager') return 'Manager'
  if (raw === 'admin manager' || raw === 'admin_manager' || raw === 'admin-manager') return 'Admin Manager'
  if (raw === 'editor') return 'Editor'
  if (raw === 'viewer') return 'Viewer'
  if (raw === 'analyst') return 'Analyst'
  if (raw === 'ai_operator' || raw === 'ai operator') return 'AI Operator'
  if (raw === 'trial_user' || raw === 'trial user') return 'Trial User'
  if (raw === 'user') return 'Viewer'
  if (raw.includes('admin') && raw.includes('manager')) return 'Admin Manager'
  return 'User'
}
