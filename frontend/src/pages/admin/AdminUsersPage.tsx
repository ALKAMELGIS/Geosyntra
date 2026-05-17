import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ADMIN_USER_PLANS,
  ADMIN_USER_ROLES,
  ADMIN_USER_STATUSES,
  type AdminDirectoryUser,
} from '../../lib/admin/adminUserModel'
import {
  adminResendVerificationLink,
  adminUserStats,
  exportAdminUsersCsv,
  hydrateAdminUsersFromServer,
  listAdminUsers,
  updateAdminUser,
} from '../../lib/admin/adminUserStore'
import { UserDetailDrawer } from './components/UserDetailDrawer'

function statusBadge(status: string, verified: boolean) {
  if (!verified || status === 'Pending Verification') {
    return <span className="admin-badge admin-badge--pending">Pending</span>
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
  const [users, setUsers] = useState<AdminDirectoryUser[]>(() => listAdminUsers())
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [planFilter, setPlanFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [verifiedFilter, setVerifiedFilter] = useState('all')
  const [selected, setSelected] = useState<AdminDirectoryUser | null>(null)
  const [verifyLink, setVerifyLink] = useState<string | null>(null)

  const refresh = useCallback(() => setUsers(listAdminUsers()), [])

  useEffect(() => {
    void hydrateAdminUsersFromServer().then(refresh)
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
          <h1>Users</h1>
          <p className="admin-topbar__sub">
            {stats.total} accounts · {stats.pending} pending verification
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
          <button type="button" className="admin-btn" onClick={exportCsv}>
            Export CSV
          </button>
        </div>
      </header>

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
                          const link = adminResendVerificationLink(u.id)
                          if (link) setVerifyLink(link)
                          refresh()
                        }}
                      >
                        Resend verify
                      </button>
                    ) : null}
                    {u.status === 'Active' ? (
                      <button type="button" onClick={() => patchUser(u.id, { status: 'Suspended' })}>
                        Suspend
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => patchUser(u.id, { status: 'Active', emailVerified: true })}
                      >
                        Activate
                      </button>
                    )}
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
            const link = adminResendVerificationLink(selected.id)
            if (link) setVerifyLink(link)
            refresh()
          }}
        />
      ) : null}
    </>
  )
}
