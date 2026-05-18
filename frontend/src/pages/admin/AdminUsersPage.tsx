import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ADMIN_USER_PLANS,
  ADMIN_USER_ROLES,
  ADMIN_USER_STATUSES,
  type AdminDirectoryUser,
} from '../../lib/admin/adminUserModel'
import {
  applyUserManagementAction,
  isUserManagementApiLive,
  loadUserManagementDirectory,
} from '../../lib/admin/adminUserManagement'
import {
  adminResendVerificationLink,
  adminUserStats,
  exportAdminUsersCsv,
  updateAdminUser,
} from '../../lib/admin/adminUserStore'
import { currentUserHasPermission } from '../../lib/auth'
import { RBAC_PERMISSIONS } from '../../lib/rbacPermissions'
import { UserDetailDrawer } from './components/UserDetailDrawer'

function statusBadge(status: string, verified: boolean) {
  if (status === 'Pending Approval') {
    return <span className="admin-badge admin-badge--pending">Awaiting approval</span>
  }
  if (!verified || status === 'Pending Verification') {
    return <span className="admin-badge admin-badge--pending">Pending verify</span>
  }
  if (status === 'Suspended') {
    return <span className="admin-badge admin-badge--suspended">Suspended</span>
  }
  return <span className="admin-badge admin-badge--active">Active</span>
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts[0]![0]! + (parts[1]?.[0] ?? '')).toUpperCase()
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminDirectoryUser[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [planFilter, setPlanFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [verifiedFilter, setVerifiedFilter] = useState('all')
  const [selected, setSelected] = useState<AdminDirectoryUser | null>(null)
  const [verifyLink, setVerifyLink] = useState<string | null>(null)
  const [flash, setFlash] = useState('')

  const canApprove = currentUserHasPermission(RBAC_PERMISSIONS.USERS_APPROVE)
  const canSuspend = currentUserHasPermission(RBAC_PERMISSIONS.USERS_SUSPEND)
  const canAssignRole = currentUserHasPermission(RBAC_PERMISSIONS.ROLES_ASSIGN)

  const refresh = useCallback(() => {
    void loadUserManagementDirectory().then(setUsers)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter(u => {
      if (statusFilter !== 'all' && u.status !== statusFilter) return false
      if (planFilter !== 'all' && u.plan !== planFilter) return false
      if (roleFilter !== 'all' && u.role !== roleFilter) return false
      if (verifiedFilter === 'verified' && !u.emailVerified) return false
      if (verifiedFilter === 'unverified' && u.emailVerified) return false
      if (!q) return true
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    })
  }, [users, search, statusFilter, planFilter, roleFilter, verifiedFilter])

  const stats = adminUserStats(users)

  const patchUser = (id: number, patch: Partial<AdminDirectoryUser>) => {
    const next = updateAdminUser(id, patch)
    refresh()
    if (selected?.id === id && next) setSelected(next)
  }

  const runAction = async (user: AdminDirectoryUser, action: Parameters<typeof applyUserManagementAction>[1], roleSlug?: string) => {
    const result = await applyUserManagementAction(user, action, roleSlug)
    setFlash(result.message)
    refresh()
  }

  const pendingApproval = users.filter(u => u.status === 'Pending Approval')
  const pendingVerify = users.filter(u => u.status === 'Pending Verification' || !u.emailVerified)

  const exportCsv = () => {
    const blob = new Blob([exportAdminUsersCsv(filtered)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'geosyntra-users.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <header className="admin-topbar">
        <div>
          <h1>User management</h1>
          <p className="admin-topbar__sub">
            {stats.total} accounts · {pendingApproval.length} awaiting approval · {pendingVerify.length} pending
            verification
            {isUserManagementApiLive() ? ' · server RBAC' : ''}
          </p>
        </div>
        <div className="admin-topbar__actions">
          <input
            className="admin-search"
            placeholder="Search name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search users"
          />
          <Link to="/settings/admin/team" className="admin-btn">
            Invites
          </Link>
          <button type="button" className="admin-btn" onClick={exportCsv}>
            Export CSV
          </button>
        </div>
      </header>

      <section className="admin-lifecycle" aria-label="Account lifecycle">
        <span className="admin-lifecycle__step">1. Sign up</span>
        <span className="admin-lifecycle__arrow" aria-hidden>
          →
        </span>
        <span className="admin-lifecycle__step">2. Verify email</span>
        <span className="admin-lifecycle__arrow" aria-hidden>
          →
        </span>
        <span className="admin-lifecycle__step">3. Admin approval</span>
        <span className="admin-lifecycle__arrow" aria-hidden>
          →
        </span>
        <span className="admin-lifecycle__step">4. Active workspace</span>
      </section>

      {flash ? <p className="admin-hint">{flash}</p> : null}

      {verifyLink ? (
        <p style={{ fontSize: '0.82rem', color: '#86efac', marginBottom: '0.75rem', wordBreak: 'break-all' }}>
          Verification link: <a href={verifyLink}>{verifyLink}</a>
        </p>
      ) : null}

      <div className="admin-filters">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Filter status">
          <option value="all">All statuses</option>
          {ADMIN_USER_STATUSES.map(s => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={planFilter} onChange={e => setPlanFilter(e.target.value)} aria-label="Filter plan">
          <option value="all">All plans</option>
          {ADMIN_USER_PLANS.map(p => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} aria-label="Filter role">
          <option value="all">All roles</option>
          {ADMIN_USER_ROLES.map(r => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select value={verifiedFilter} onChange={e => setVerifiedFilter(e.target.value)} aria-label="Filter verified">
          <option value="all">Verified + pending</option>
          <option value="verified">Verified only</option>
          <option value="unverified">Not verified</option>
        </select>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Status</th>
              <th>Plan</th>
              <th>Role</th>
              <th>Last login</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => (
              <tr key={u.id}>
                <td>
                  <div className="admin-user-cell">
                    <span className="admin-avatar" aria-hidden>
                      {initials(u.name)}
                    </span>
                    <div>
                      <div>{u.name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{u.email}</div>
                    </div>
                  </div>
                </td>
                <td>{statusBadge(u.status, u.emailVerified)}</td>
                <td>{u.plan}</td>
                <td>{u.role}</td>
                <td>{u.lastLogin ?? '—'}</td>
                <td>
                  <div className="admin-row-actions">
                    <button type="button" onClick={() => setSelected(u)}>
                      View
                    </button>
                    {!u.emailVerified ? (
                      <button
                        type="button"
                        onClick={() => {
                          void (async () => {
                            const link = await adminResendVerificationLink(u.id)
                            if (link) setVerifyLink(link)
                            refresh()
                          })()
                        }}
                      >
                        Resend verify
                      </button>
                    ) : null}
                    {canApprove && u.status === 'Pending Approval' ? (
                      <button type="button" onClick={() => void runAction(u, 'approve')}>
                        Approve
                      </button>
                    ) : null}
                    {canSuspend && u.status === 'Active' ? (
                      <button type="button" onClick={() => void runAction(u, 'suspend')}>
                        Suspend
                      </button>
                    ) : null}
                    {canSuspend && u.status === 'Suspended' ? (
                      <button type="button" onClick={() => void runAction(u, 'reactivate')}>
                        Reactivate
                      </button>
                    ) : null}
                    {canApprove && u.status === 'Pending Verification' && u.emailVerified ? (
                      <button type="button" onClick={() => void runAction(u, 'approve')}>
                        Activate
                      </button>
                    ) : null}
                    {!canSuspend && !canApprove && u.status !== 'Active' ? (
                      <button
                        type="button"
                        onClick={() => patchUser(u.id, { status: 'Active', emailVerified: true })}
                      >
                        Activate
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected ? (
        <UserDetailDrawer
          user={selected}
          onClose={() => setSelected(null)}
          onPatch={patch => patchUser(selected.id, patch)}
          onResendVerification={() => {
            void (async () => {
              const link = await adminResendVerificationLink(selected.id)
              if (link) setVerifyLink(link)
              refresh()
            })()
          }}
        />
      ) : null}
    </>
  )
}
