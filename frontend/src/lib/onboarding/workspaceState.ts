import type { BillingPlanId } from './pricingPlans'
import type { SubscriptionPlanId } from '../geoEnterpriseUserModel'
import { defaultEnterpriseProfile, GEO_ENTERPRISE_PROFILE_KEY, type GeoEnterpriseProfileV1 } from '../geoEnterpriseUserModel'
import { normalizeEmail } from '../auth'
import { USER_PROFILES_STORAGE_KEY } from '../userProfilePersistence'

export const WORKSPACE_STATE_KEY = 'geosyntra_workspace_v1'

export type WorkspaceLifecycle = 'none' | 'trialing' | 'active' | 'expired'

export type WorkspaceStateV1 = {
  email: string
  displayName: string
  lifecycle: WorkspaceLifecycle
  billingPlanId: BillingPlanId
  subscriptionPlan: SubscriptionPlanId
  trialStartedAt: string
  trialEndsAt: string
  subscriptionExpiresAt: string
  workspaceId: string
  workspaceReady: boolean
  paymentCompleted: boolean
  updatedAt: string
}

function readAll(): Record<string, WorkspaceStateV1> {
  try {
    const raw = localStorage.getItem(WORKSPACE_STATE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, WorkspaceStateV1>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeAll(all: Record<string, WorkspaceStateV1>): void {
  localStorage.setItem(WORKSPACE_STATE_KEY, JSON.stringify(all))
  window.dispatchEvent(new Event('storage'))
  window.dispatchEvent(new CustomEvent('geosyntra-workspace-change'))
}

export function readWorkspaceState(email: string): WorkspaceStateV1 | null {
  const key = normalizeEmail(email)
  if (!key) return null
  return readAll()[key] ?? null
}

export function writeWorkspaceState(state: WorkspaceStateV1): WorkspaceStateV1 {
  const key = normalizeEmail(state.email)
  const all = readAll()
  all[key] = { ...state, updatedAt: new Date().toISOString() }
  writeAll(all)
  return all[key]
}

export function trialDaysRemaining(state: WorkspaceStateV1 | null): number | null {
  if (!state?.trialEndsAt || state.lifecycle !== 'trialing') return null
  const ms = new Date(state.trialEndsAt).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)))
}

export function persistGeoEnterpriseProfile(email: string, patch: Partial<GeoEnterpriseProfileV1>): void {
  const key = normalizeEmail(email)
  try {
    const raw = localStorage.getItem(USER_PROFILES_STORAGE_KEY)
    const all: Record<string, Record<string, unknown>> = raw ? JSON.parse(raw) : {}
    const row = all[key] && typeof all[key] === 'object' ? all[key] : {}
    const prev =
      row[GEO_ENTERPRISE_PROFILE_KEY] && typeof row[GEO_ENTERPRISE_PROFILE_KEY] === 'object'
        ? (row[GEO_ENTERPRISE_PROFILE_KEY] as Partial<GeoEnterpriseProfileV1>)
        : {}
    const names = String(row.firstName ?? prev.firstName ?? '').trim()
    const merged = defaultEnterpriseProfile({ ...prev, ...patch, firstName: patch.firstName ?? names })
    all[key] = { ...row, [GEO_ENTERPRISE_PROFILE_KEY]: merged }
    localStorage.setItem(USER_PROFILES_STORAGE_KEY, JSON.stringify(all))
    window.dispatchEvent(new Event('storage'))
  } catch {
    /* ignore */
  }

  try {
    const adminRaw = localStorage.getItem('adminUsers')
    if (!adminRaw) return
    const users = JSON.parse(adminRaw) as Array<Record<string, unknown>>
    if (!Array.isArray(users)) return
    const next = users.map(u => {
      if (normalizeEmail(String(u.email ?? '')) !== key) return u
      const pe =
        u.profileExtra && typeof u.profileExtra === 'object'
          ? (u.profileExtra as Record<string, unknown>)
          : {}
      const prev =
        pe[GEO_ENTERPRISE_PROFILE_KEY] && typeof pe[GEO_ENTERPRISE_PROFILE_KEY] === 'object'
          ? (pe[GEO_ENTERPRISE_PROFILE_KEY] as Partial<GeoEnterpriseProfileV1>)
          : {}
      const merged = defaultEnterpriseProfile({ ...prev, ...patch })
      return { ...u, profileExtra: { ...pe, [GEO_ENTERPRISE_PROFILE_KEY]: merged } }
    })
    localStorage.setItem('adminUsers', JSON.stringify(next))
  } catch {
    /* ignore */
  }
}
