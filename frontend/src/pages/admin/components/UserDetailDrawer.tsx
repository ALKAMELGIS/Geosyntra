import { useState } from 'react'
import {
  ADMIN_USER_PLANS,
  ADMIN_USER_ROLES,
  ADMIN_USER_STATUSES,
  type AdminDirectoryUser,
  type AdminUserPlan,
  type AdminUserStatus,
} from '../../../lib/admin/adminUserModel'

type TabId = 'overview' | 'activity' | 'subscription' | 'permissions' | 'sessions'

export type UserDetailDrawerProps = {
  user: AdminDirectoryUser
  onClose: () => void
  onPatch: (patch: Partial<AdminDirectoryUser>) => void
  onResendVerification: () => void
}

export function UserDetailDrawer({ user, onClose, onPatch, onResendVerification }: UserDetailDrawerProps) {
  const [tab, setTab] = useState<TabId>('overview')

  return (
    <div className="admin-drawer-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="admin-drawer"
        role="dialog"
        aria-label={`User ${user.name}`}
        onClick={e => e.stopPropagation()}
      >
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: 0 }}>{user.name}</h2>
            <p style={{ margin: '0.25rem 0 0', color: '#94a3b8', fontSize: '0.85rem' }}>{user.email}</p>
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
              <select value={user.role} onChange={e => onPatch({ role: e.target.value })}>
                {ADMIN_USER_ROLES.map(r => (
                  <option key={r} value={r}>
                    {r}
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
          <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
            Role-based permissions grid and per-user feature flags — coming with RBAC module.
          </p>
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
