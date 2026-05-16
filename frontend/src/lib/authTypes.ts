export type Role = 'Admin' | 'Manager' | 'Admin Manager' | 'Analyst' | 'Editor' | 'Viewer' | 'User'

export type CurrentUser = {
  id: number
  name: string
  email: string
  role: Role | string
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
  if (!raw) return 'Viewer'
  if (raw === 'admin') return 'Admin'
  if (raw === 'manager') return 'Manager'
  if (raw === 'admin manager' || raw === 'admin_manager' || raw === 'admin-manager') return 'Admin Manager'
  if (raw === 'editor') return 'Editor'
  if (raw === 'viewer') return 'Viewer'
  if (raw === 'analyst') return 'Analyst'
  if (raw === 'user') return 'User'
  if (raw.includes('admin') && raw.includes('manager')) return 'Admin Manager'
  return 'Viewer'
}
