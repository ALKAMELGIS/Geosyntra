/**
 * GeoAI Enterprise user profile — stored under `user.profileExtra.geoEnterpriseV1`.
 * Directory `role` (Admin / Manager / Analyst / …) stays the source of truth for legacy auth;
 * enterprise fields extend UX, quotas, and future RBAC checks.
 */
import type { Role } from './authTypes'

export const GEO_ENTERPRISE_PROFILE_KEY = 'geoEnterpriseV1' as const

export type EnterpriseAccessRole = 'SUPER_ADMIN' | 'ADMIN' | 'ANALYST' | 'VIEWER' | 'CLIENT'

export type SubscriptionPlanId = 'free' | 'pro' | 'enterprise'

export const ENTERPRISE_ROLE_SHORT: Record<EnterpriseAccessRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  ANALYST: 'Analyst',
  VIEWER: 'Viewer',
  CLIENT: 'Client',
}

export type GeoPermission =
  | 'maps.view'
  | 'geoai.run'
  | 'export.reports'
  | 'aoi.upload'
  | 'layers.manage'
  | 'symbology.reclassify'
  | 'timeseries.analysis'
  | 'api.access'

export const GEO_PERMISSION_LABELS: Record<GeoPermission, string> = {
  'maps.view': 'View maps',
  'geoai.run': 'Run GeoAI analysis (NDVI / NDWI / …)',
  'export.reports': 'Export reports (Excel / PDF)',
  'aoi.upload': 'Upload AOI',
  'layers.manage': 'Manage layers',
  'symbology.reclassify': 'Reclassify index',
  'timeseries.analysis': 'Time series analysis',
  'api.access': 'API access',
}

export const ALL_GEO_PERMISSIONS = Object.keys(GEO_PERMISSION_LABELS) as GeoPermission[]

export const SUBSCRIPTION_PLAN_LABELS: Record<SubscriptionPlanId, string> = {
  free: 'Free',
  pro: 'Pro',
  enterprise: 'Enterprise',
}

export const ENTERPRISE_ROLE_LABELS: Record<EnterpriseAccessRole, string> = {
  SUPER_ADMIN: 'Super Admin — full platform control',
  ADMIN: 'Admin — users, plans, billing',
  ANALYST: 'Analyst — GeoAI & spatial analysis',
  VIEWER: 'Viewer — maps read-only',
  CLIENT: 'Client — limited reports & exports',
}

/** Maps enterprise RBAC labels to persisted directory roles (existing auth). */
export function directoryRoleFromEnterpriseRole(er: EnterpriseAccessRole): Role {
  switch (er) {
    case 'SUPER_ADMIN':
      return 'Admin'
    case 'ADMIN':
      return 'Manager'
    case 'ANALYST':
      return 'Analyst'
    case 'VIEWER':
      return 'Viewer'
    case 'CLIENT':
      return 'User'
    default:
      return 'Viewer'
  }
}

function normalizeDirectoryRole(value: unknown): Role {
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

export function enterpriseRoleFromDirectoryRole(role: unknown): EnterpriseAccessRole {
  const r = normalizeDirectoryRole(role)
  if (r === 'Admin') return 'SUPER_ADMIN'
  if (r === 'Manager') return 'ADMIN'
  if (r === 'Analyst') return 'ANALYST'
  if (r === 'Viewer') return 'VIEWER'
  if (r === 'User' || r === 'Editor') return 'CLIENT'
  return 'VIEWER'
}

export type GeoEnterpriseProfileV1 = {
  firstName: string
  lastName: string
  phone: string
  country: string
  organization: string
  enterpriseRole: EnterpriseAccessRole
  subscriptionPlan: SubscriptionPlanId
  /** Human-readable workspace label (stable id derived on create). */
  workspaceLabel: string
  workspaceId: string
  monthlyAnalysisQuota: number
  exportLimitMb: number
  storageLimitMb: number
  apiCallsLimit: number
  /** ISO date or empty = no expiry */
  subscriptionExpiresAt: string
  usedAnalysisCount: number
  usedExportCount: number
  usedApiCalls: number
  /** Last 8 chars of generated key; full key shown once at creation. */
  apiKeySuffix: string
  apiKeyCreatedAt: string
}

export const SUBSCRIPTION_DEFAULTS: Record<
  SubscriptionPlanId,
  Pick<
    GeoEnterpriseProfileV1,
    'monthlyAnalysisQuota' | 'exportLimitMb' | 'storageLimitMb' | 'apiCallsLimit'
  >
> = {
  free: { monthlyAnalysisQuota: 50, exportLimitMb: 100, storageLimitMb: 512, apiCallsLimit: 500 },
  pro: { monthlyAnalysisQuota: 500, exportLimitMb: 2048, storageLimitMb: 8192, apiCallsLimit: 10000 },
  enterprise: { monthlyAnalysisQuota: 50000, exportLimitMb: 51200, storageLimitMb: 512000, apiCallsLimit: 500000 },
}

export function defaultEnterpriseProfile(partial?: Partial<GeoEnterpriseProfileV1>): GeoEnterpriseProfileV1 {
  const plan: SubscriptionPlanId = partial?.subscriptionPlan ?? 'free'
  const q = SUBSCRIPTION_DEFAULTS[plan]
  const wid =
    partial?.workspaceId ||
    (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? `ws_${crypto.randomUUID().slice(0, 8)}` : `ws_${Date.now()}`)
  return {
    firstName: partial?.firstName?.trim() ?? '',
    lastName: partial?.lastName?.trim() ?? '',
    phone: partial?.phone?.trim() ?? '',
    country: partial?.country?.trim() ?? '',
    organization: partial?.organization?.trim() ?? '',
    enterpriseRole: partial?.enterpriseRole ?? 'VIEWER',
    subscriptionPlan: plan,
    workspaceLabel: partial?.workspaceLabel?.trim() || 'Primary workspace',
    workspaceId: wid,
    monthlyAnalysisQuota: partial?.monthlyAnalysisQuota ?? q.monthlyAnalysisQuota,
    exportLimitMb: partial?.exportLimitMb ?? q.exportLimitMb,
    storageLimitMb: partial?.storageLimitMb ?? q.storageLimitMb,
    apiCallsLimit: partial?.apiCallsLimit ?? q.apiCallsLimit,
    subscriptionExpiresAt: partial?.subscriptionExpiresAt ?? '',
    usedAnalysisCount: partial?.usedAnalysisCount ?? 0,
    usedExportCount: partial?.usedExportCount ?? 0,
    usedApiCalls: partial?.usedApiCalls ?? 0,
    apiKeySuffix: partial?.apiKeySuffix ?? '',
    apiKeyCreatedAt: partial?.apiKeyCreatedAt ?? '',
  }
}

export function buildDisplayName(first: string, last: string, email: string): string {
  const f = first.trim()
  const l = last.trim()
  if (f && l) return `${f} ${l}`
  if (f) return f
  if (l) return l
  return email.trim() || 'User'
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v)
}

export function readEnterpriseProfile(profileExtra: unknown): GeoEnterpriseProfileV1 | null {
  if (!isRecord(profileExtra)) return null
  const raw = profileExtra[GEO_ENTERPRISE_PROFILE_KEY]
  if (!isRecord(raw)) return null
  const plan = (['free', 'pro', 'enterprise'] as const).includes(raw.subscriptionPlan as SubscriptionPlanId)
    ? (raw.subscriptionPlan as SubscriptionPlanId)
    : 'free'
  const er = (['SUPER_ADMIN', 'ADMIN', 'ANALYST', 'VIEWER', 'CLIENT'] as const).includes(raw.enterpriseRole as EnterpriseAccessRole)
    ? (raw.enterpriseRole as EnterpriseAccessRole)
    : 'VIEWER'
  return defaultEnterpriseProfile({
    ...raw,
    subscriptionPlan: plan,
    enterpriseRole: er,
    firstName: typeof raw.firstName === 'string' ? raw.firstName : '',
    lastName: typeof raw.lastName === 'string' ? raw.lastName : '',
    phone: typeof raw.phone === 'string' ? raw.phone : '',
    country: typeof raw.country === 'string' ? raw.country : '',
    organization: typeof raw.organization === 'string' ? raw.organization : '',
    workspaceLabel: typeof raw.workspaceLabel === 'string' ? raw.workspaceLabel : undefined,
    workspaceId: typeof raw.workspaceId === 'string' ? raw.workspaceId : undefined,
    monthlyAnalysisQuota: typeof raw.monthlyAnalysisQuota === 'number' ? raw.monthlyAnalysisQuota : undefined,
    exportLimitMb: typeof raw.exportLimitMb === 'number' ? raw.exportLimitMb : undefined,
    storageLimitMb: typeof raw.storageLimitMb === 'number' ? raw.storageLimitMb : undefined,
    apiCallsLimit: typeof raw.apiCallsLimit === 'number' ? raw.apiCallsLimit : undefined,
    subscriptionExpiresAt: typeof raw.subscriptionExpiresAt === 'string' ? raw.subscriptionExpiresAt : '',
    usedAnalysisCount: typeof raw.usedAnalysisCount === 'number' ? raw.usedAnalysisCount : undefined,
    usedExportCount: typeof raw.usedExportCount === 'number' ? raw.usedExportCount : undefined,
    usedApiCalls: typeof raw.usedApiCalls === 'number' ? raw.usedApiCalls : undefined,
    apiKeySuffix: typeof raw.apiKeySuffix === 'string' ? raw.apiKeySuffix : '',
    apiKeyCreatedAt: typeof raw.apiKeyCreatedAt === 'string' ? raw.apiKeyCreatedAt : '',
  })
}

export function mergeProfileExtraWithEnterprise(
  existing: Record<string, unknown> | undefined,
  geo: GeoEnterpriseProfileV1,
): Record<string, unknown> {
  const base = isRecord(existing) ? { ...existing } : {}
  base[GEO_ENTERPRISE_PROFILE_KEY] = { ...geo }
  return base
}

export function generateGeoApiKey(): { full: string; suffix: string } {
  const bytes = new Uint8Array(24)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  let b64 = ''
  if (typeof btoa !== 'undefined') {
    let bin = ''
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!)
    b64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  } else {
    b64 = Array.from(bytes)
      .map(x => x.toString(16).padStart(2, '0'))
      .join('')
  }
  const full = `geo_sk_${b64}`.slice(0, 48)
  const suffix = full.slice(-8)
  return { full, suffix }
}

/** Fine-grained capability checks aligned with enterprise roles (client-side guard). */
export function hasGeoCapability(permission: GeoPermission, role: unknown, profileExtra?: unknown): boolean {
  const geo = profileExtra !== undefined && profileExtra !== null ? readEnterpriseProfile(profileExtra) : null
  const er: EnterpriseAccessRole = geo?.enterpriseRole ?? enterpriseRoleFromDirectoryRole(role)
  const matrix: Record<EnterpriseAccessRole, GeoPermission[]> = {
    SUPER_ADMIN: [...ALL_GEO_PERMISSIONS],
    ADMIN: [
      'maps.view',
      'geoai.run',
      'export.reports',
      'aoi.upload',
      'layers.manage',
      'symbology.reclassify',
      'timeseries.analysis',
      'api.access',
    ],
    ANALYST: [
      'maps.view',
      'geoai.run',
      'export.reports',
      'aoi.upload',
      'layers.manage',
      'symbology.reclassify',
      'timeseries.analysis',
      'api.access',
    ],
    CLIENT: ['maps.view', 'export.reports', 'timeseries.analysis'],
    VIEWER: ['maps.view'],
  }
  return matrix[er].includes(permission)
}

/** Permissions implied by an enterprise role (for admin UI previews). */
export function listGeoPermissionsForEnterpriseRole(er: EnterpriseAccessRole): GeoPermission[] {
  return ALL_GEO_PERMISSIONS.filter(p => hasGeoCapability(p, directoryRoleFromEnterpriseRole(er)))
}
