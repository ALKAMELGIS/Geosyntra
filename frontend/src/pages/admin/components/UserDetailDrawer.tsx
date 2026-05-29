import { useState } from 'react'
import {
  ADMIN_USER_PLANS,
  ADMIN_USER_STATUSES,
  type AdminDirectoryUser,
  type AdminUserPlan,
  type AdminUserStatus,
  type OwnerProvisionedLimits,
} from '../../../lib/admin/adminUserModel'
import { adminRoleSelectOptions, rbacRoleSlugFromLabel } from '../../../lib/rbac/rbacRoleCatalog'
import {
  needsCrossDeviceSignInRepair,
  ownerResetAccountPassword,
  repairAuthServerSignInForUser,
} from '../../../lib/admin/ownerAccountProvisioning'
import { readCurrentUser } from '../../../lib/auth'

type TabId = 'overview' | 'activity' | 'subscription' | 'permissions' | 'sessions'

export type UserDetailDrawerProps = {
  user: AdminDirectoryUser
  isOwner?: boolean
  onClose: () => void
  onPatch: (patch: Partial<AdminDirectoryUser>) => void
  onResendVerification: () => void
  onPasswordReset?: (message: string) => void
}

export function UserDetailDrawer({
  user,
  isOwner = false,
  onClose,
  onPatch,
  onResendVerification,
  onPasswordReset,
}: UserDetailDrawerProps) {
  const [tab, setTab] = useState<TabId>('overview')
  const [resetBusy, setResetBusy] = useState(false)
  const [repairBusy, setRepairBusy] = useState(false)
  const limits = user.profileExtra?.limits as OwnerProvisionedLimits | undefined
  const crossDeviceRepair = needsCrossDeviceSignInRepair(user)

  return (
    <div className="admin-drawer-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="admin-drawer"
        role="dialog"
        aria-label={`User ${user.name}`}
        onClick={e => e.stopPropagation()}
      >
        <header className="admin-drawer__header">
          <div>
            <h2 className="admin-drawer__title">{user.name}</h2>
            <p className="admin-drawer__email">{user.email}</p>
          </div>
          <button type="button" className="admin-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="admin-tabs">
          {(
            [
              ['overview', 'Overview'],
              ['activity', 'Activity'],
              ['subscription', 'Subscription'],
              ['permissions', 'Permissions'],
              ['sessions', 'Sessions'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`admin-tab${tab === id ? ' admin-tab--active' : ''}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'overview' ? (
          <dl className="admin-kv">
            <dt>Status</dt>
            <dd>
              <select
                value={user.status}
                onChange={e => onPatch({ status: e.target.value as AdminUserStatus })}
              >
                {ADMIN_USER_STATUSES.map(s => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </dd>
            <dt>Plan</dt>
            <dd>
              <select value={user.plan} onChange={e => onPatch({ plan: e.target.value as AdminUserPlan })}>
                {ADMIN_USER_PLANS.map(p => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </dd>
            <dt>Role</dt>
            <dd>
              <select
                value={rbacRoleSlugFromLabel(user.role)}
                onChange={e => onPatch({ role: e.target.value })}
              >
                {adminRoleSelectOptions(user.role).map(r => (
                  <option key={r.slug} value={r.slug}>
                    {r.label}
                  </option>
                ))}
              </select>
            </dd>
            <dt>Email verified</dt>
            <dd>{user.emailVerified ? 'Yes' : 'No'}</dd>
            <dt>Last login</dt>
            <dd>{user.lastLogin ?? '—'}</dd>
            <dt>Created</dt>
            <dd>{user.createdAt ?? '—'}</dd>
            {!user.emailVerified ? (
              <>
                <dt>Verification</dt>
                <dd>
                  <button type="button" className="admin-btn admin-btn--primary" onClick={onResendVerification}>
                    Resend verification link
                  </button>
                </dd>
              </>
            ) : null}
            {isOwner && crossDeviceRepair ? (
              <>
                <dt>Cross-device sign-in</dt>
                <dd>
                  <p className="admin-hint" style={{ margin: '0 0 0.5rem', maxWidth: '28rem' }}>
                    This account may only exist in the admin browser. Enter the user&apos;s password to register
                    sign-in on the server so they can log in from other devices.
                  </p>
                  <button
                    type="button"
                    className="admin-btn admin-btn--primary"
                    disabled={repairBusy}
                    onClick={() => {
                      const next = window.prompt(
                        `Password for ${user.email} (min 8 characters) — will enable sign-in on all devices:`,
                        '',
                      )
                      if (!next) return
                      setRepairBusy(true)
                      void repairAuthServerSignInForUser(user.id, next, readCurrentUser()).then(result => {
                        setRepairBusy(false)
                        onPasswordReset?.(result.message)
                        if (result.ok) {
                          onPatch({
                            profileExtra: {
                              ...user.profileExtra,
                              authServerSynced: true,
                            },
                          })
                        }
                      })
                    }}
                  >
                    {repairBusy ? 'Syncing…' : 'Enable sign-in on all devices'}
                  </button>
                </dd>
              </>
            ) : null}
            {isOwner ? (
              <>
                <dt>Password</dt>
                <dd>
                  <button
                    type="button"
                    className="admin-btn"
                    disabled={resetBusy}
                    onClick={() => {
                      const next = window.prompt('New temporary password (min 8 characters):', '')
                      if (!next) return
                      setResetBusy(true)
                      void ownerResetAccountPassword(user.id, next, readCurrentUser()).then(result => {
                        setResetBusy(false)
                        onPasswordReset?.(result.message)
                        if (result.ok) {
                          onPatch({
                            profileExtra: {
                              ...user.profileExtra,
                              authServerSynced: true,
                            },
                          })
                        }
                      })
                    }}
                  >
                    {resetBusy ? 'Updating…' : 'Reset password'}
                  </button>
                </dd>
              </>
            ) : null}
            {limits ? (
              <>
                <dt>Storage</dt>
                <dd>{limits.storageLimitGb} GB</dd>
                <dt>AOI limit</dt>
                <dd>{limits.aoiLimit}</dd>
                <dt>Workspace</dt>
                <dd>{limits.workspaceAccess}</dd>
              </>
            ) : null}
          </dl>
        ) : null}

        {tab === 'activity' ? (
          <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
            Login history and in-app actions will appear here when audit log sync is enabled.
          </p>
        ) : null}

        {tab === 'subscription' ? (
          <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
            Stripe customer ID, invoices, and plan changes — connect billing in a future release.
          </p>
        ) : null}

        {tab === 'permissions' ? (
          limits ? (
            <ul className="admin-perm-list">
              <li>Sentinel Hub: {limits.apiAccess.sentinelHub ? 'allowed' : 'denied'}</li>
              <li>Geo-AI: {limits.apiAccess.geoAi ? 'allowed' : 'denied'}</li>
              <li>Exports: {limits.apiAccess.exports ? 'allowed' : 'denied'}</li>
              <li>Admin API: {limits.apiAccess.adminApi ? 'allowed' : 'denied'}</li>
              {user.profileExtra?.ownerOverride ? <li>Owner override enabled</li> : null}
            </ul>
          ) : (
            <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
              Role-based permissions from directory role. Provision limits via Create account (Owner).
            </p>
          )
        ) : null}

        {tab === 'sessions' ? (
          <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
            Active devices and force logout — requires server session store.
          </p>
        ) : null}
      </aside>
    </div>
  )
}
