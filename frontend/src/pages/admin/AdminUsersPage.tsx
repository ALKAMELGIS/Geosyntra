import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ADMIN_USER_PLANS,
  ADMIN_USER_ROLES,
  ADMIN_USER_STATUSES,
  type AdminDirectoryUser,
  type AdminUserPlan,
  type AdminUserStatus,
} from '../../lib/admin/adminUserModel'
import {
  applyUserManagementAction,
  isUserManagementApiLive,
  loadUserManagementDirectory,
  saveAdminUserEdits,
} from '../../lib/admin/adminUserManagement'
import {
  adminResendVerificationLink,
  adminUserStats,
  countDirectoryOwners,
  deleteAdminUser,
  exportAdminUsersCsv,
  updateAdminUser,
} from '../../lib/admin/adminUserStore'
import { rbacRoleDisplayLabel, rbacRoleSlugFromLabel } from '../../lib/rbac/rbacRoleCatalog'
import { AdminDirectoryDataPanel } from './components/AdminDirectoryDataPanel'
import { appConfirm } from '../../lib/appDialog'
import { currentUserHasPermission, isPlatformOwnerUser, readCurrentUser } from '../../lib/auth'
import { RBAC_PERMISSIONS } from '../../lib/rbacPermissions'
import { CreateOwnerAccountModal } from './components/CreateOwnerAccountModal'
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

function formatLastLogin(iso: string | null | undefined): string {
  if (!iso) return 'Never'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

type RowEditDraft = {
  name: string
  status: AdminUserStatus
  plan: AdminUserPlan
  role: string
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminDirectoryUser[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [planFilter, setPlanFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [verifiedFilter, setVerifiedFilter] = useState('all')
  const [selected, setSelected] = useState<AdminDirectoryUser | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<RowEditDraft | null>(null)
  const [verifyLink, setVerifyLink] = useState<string | null>(null)
  const [flash, setFlash] = useState('')
  const [savingId, setSavingId] = useState<number | null>(null)
  const [createAccountOpen, setCreateAccountOpen] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()

  const me = readCurrentUser()
  const isOwner = isPlatformOwnerUser(me)
  const canApprove = currentUserHasPermission(RBAC_PERMISSIONS.USERS_APPROVE)
  const canSuspend = currentUserHasPermission(RBAC_PERMISSIONS.USERS_SUSPEND)
  const canAssignRole =
    currentUserHasPermission(RBAC_PERMISSIONS.ROLES_ASSIGN) || isPlatformOwnerUser(me)
  const canManageAccounts =
    isPlatformOwnerUser(me) ||
    currentUserHasPermission(RBAC_PERMISSIONS.USERS_MANAGE) ||
    canApprove ||
    canSuspend ||
    canAssignRole

  const refresh = useCallback(() => {
    void loadUserManagementDirectory().then(setUsers)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (isOwner && searchParams.get('create') === '1') {
      setCreateAccountOpen(true)
    }
  }, [isOwner, searchParams])

  const openCreateAccount = useCallback(() => {
    setCreateAccountOpen(true)
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('create', '1')
      return next
    })
  }, [setSearchParams])

  const closeCreateAccount = useCallback(() => {
    setCreateAccountOpen(false)
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete('create')
      return next
    })
  }, [setSearchParams])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter(u => {
      if (statusFilter !== 'all' && u.status !== statusFilter) return false
      if (planFilter !== 'all' && u.plan !== planFilter) return false
      if (roleFilter !== 'all' && rbacRoleSlugFromLabel(u.role) !== roleFilter) return false
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

  const runAction = async (
    user: AdminDirectoryUser,
    action: Parameters<typeof applyUserManagementAction>[1],
    roleSlug?: string,
  ) => {
    const result = await applyUserManagementAction(user, action, roleSlug)
    setFlash(result.message)
    refresh()
  }

  const handleSuspend = async (user: AdminDirectoryUser) => {
    const ok = await appConfirm(`Suspend ${user.name} (${user.email})? They will not be able to sign in.`, {
      title: 'Suspend account',
      confirmLabel: 'Suspend',
      cancelLabel: 'Cancel',
      danger: true,
    })
    if (ok) await runAction(user, 'suspend')
  }

  const handleReactivate = async (user: AdminDirectoryUser) => {
    await runAction(user, 'reactivate')
  }

  const handleApprove = async (user: AdminDirectoryUser) => {
    await runAction(user, 'approve')
  }

  const handleResendVerify = async (user: AdminDirectoryUser) => {
    const link = await adminResendVerificationLink(user.id)
    if (link) {
      setVerifyLink(link)
      setFlash('Verification link generated.')
    } else {
      setFlash('Could not generate verification link.')
    }
    refresh()
  }

  const startRowEdit = (user: AdminDirectoryUser) => {
    setEditingId(user.id)
    setEditDraft({
      name: user.name,
      status: user.status,
      plan: user.plan,
      role: rbacRoleSlugFromLabel(user.role),
    })
    setSelected(null)
  }

  const cancelRowEdit = () => {
    setEditingId(null)
    setEditDraft(null)
  }

  const saveRowEdit = async (user: AdminDirectoryUser) => {
    if (!editDraft) return
    setSavingId(user.id)
    try {
      const result = await saveAdminUserEdits(user, {
        name: editDraft.name.trim() || user.name,
        status: editDraft.status,
        plan: editDraft.plan,
        role: editDraft.role,
      })
      setFlash(result.message)
      if (result.ok) {
        cancelRowEdit()
        refresh()
      }
    } finally {
      setSavingId(null)
    }
  }

  const removeUser = async (user: AdminDirectoryUser) => {
    if (me && me.email.toLowerCase() === user.email.toLowerCase()) {
      setFlash('You cannot delete your own account while signed in.')
      return
    }
    const ok = await appConfirm(
      `Remove ${user.name} (${user.email}) from the user directory?`,
      {
        title: 'Remove user',
        detail: 'The account is removed from the server and will not return after refresh.',
        confirmLabel: 'Remove',
        cancelLabel: 'Cancel',
        danger: true,
      },
    )
    if (!ok) return
    const role = user.role.trim().toLowerCase()
    if ((role === 'owner' || role === 'super admin') && countDirectoryOwners(users) <= 1) {
      setFlash('Cannot remove the last Owner account from the directory.')
      return
    }
    const result = await deleteAdminUser(user.id, user.email)
    if (result.ok) {
      setFlash(`${user.email} was permanently removed and will not reappear after refresh.`)
      if (selected?.id === user.id) setSelected(null)
      if (editingId === user.id) cancelRowEdit()
      setUsers(prev => prev.filter(u => u.email.toLowerCase() !== user.email.toLowerCase()))
      refresh()
      return
    }
    if (result.reason === 'last_owner') {
      setFlash('Cannot remove the last Owner account from the directory.')
      return
    }
    if (result.reason === 'server_rejected') {
      setFlash('Server blocked this deletion (protected account, last owner, or your own account).')
      return
    }
    if (result.reason === 'server_unreachable') {
      setFlash('Could not delete on server — check API connection and try again.')
      return
    }
    setFlash('Could not remove user — missing email.')
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
    <div className="admin-page admin-page--users">
      <header className="admin-topbar">
        <div>
          <h1>User management</h1>
          <p className="admin-topbar__sub">
            {stats.total} accounts · {pendingApproval.length} awaiting approval · {pendingVerify.length}{' '}
            pending verification
            {isUserManagementApiLive() ? ' · server RBAC' : ''}
          </p>
        </div>
        <div className="admin-topbar__actions">
          {isOwner ? (
            <button type="button" className="admin-btn admin-btn--primary" onClick={openCreateAccount}>
              Create account
            </button>
          ) : null}
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

      <AdminDirectoryDataPanel onSynced={refresh} />

      <section className="admin-lifecycle" aria-label="Account lifecycle">
        <span className="admin-lifecycle__step admin-lifecycle__step--current">1. Sign up</span>
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

      {flash ? (
        <div className="admin-flash" role="status">
          <span>{flash}</span>
          <button
            type="button"
            className="admin-flash__dismiss"
            aria-label="Dismiss message"
            onClick={() => setFlash('')}
          >
            ×
          </button>
        </div>
      ) : null}

      {verifyLink ? (
        <p className="admin-verify-banner">
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
            <option key={r.slug} value={r.slug}>
              {r.label}
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
            {filtered.length === 0 ? (
              <tr className="admin-table__empty">
                <td colSpan={6}>No users match the current filters.</td>
              </tr>
            ) : null}
            {filtered.map(u => {
              const isEditing = editingId === u.id && editDraft != null
              return (
                <tr key={u.id} className={isEditing ? 'admin-table__row--editing' : undefined}>
                  <td>
                    <div className="admin-user-cell">
                      <span className="admin-avatar" aria-hidden>
                        {initials(isEditing ? editDraft.name : u.name)}
                      </span>
                      <div>
                        {isEditing ? (
                          <input
                            className="admin-table__inline-input"
                            value={editDraft.name}
                            onChange={e => setEditDraft(d => (d ? { ...d, name: e.target.value } : d))}
                            aria-label="Display name"
                          />
                        ) : (
                          <div>{u.name}</div>
                        )}
                        <div className="admin-muted">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    {isEditing ? (
                      <select
                        className="admin-table__inline-select"
                        value={editDraft.status}
                        onChange={e =>
                          setEditDraft(d =>
                            d ? { ...d, status: e.target.value as AdminUserStatus } : d,
                          )
                        }
                        aria-label="Status"
                      >
                        {ADMIN_USER_STATUSES.map(s => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    ) : (
                      statusBadge(u.status, u.emailVerified)
                    )}
                  </td>
                  <td>
                    {isEditing ? (
                      <select
                        className="admin-table__inline-select"
                        value={editDraft.plan}
                        onChange={e =>
                          setEditDraft(d => (d ? { ...d, plan: e.target.value as AdminUserPlan } : d))
                        }
                        aria-label="Plan"
                      >
                        {ADMIN_USER_PLANS.map(p => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    ) : (
                      u.plan
                    )}
                  </td>
                  <td>
                    {isEditing ? (
                      <select
                        className="admin-table__inline-select"
                        value={editDraft.role}
                        onChange={e => setEditDraft(d => (d ? { ...d, role: e.target.value } : d))}
                        aria-label="Role"
                        disabled={!canAssignRole}
                      >
                        {ADMIN_USER_ROLES.map(r => (
                          <option key={r.slug} value={r.slug}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      rbacRoleDisplayLabel(u.role)
                    )}
                  </td>
                  <td className="admin-muted">{formatLastLogin(u.lastLogin)}</td>
                  <td className="admin-actions-cell">
                    <div className="admin-row-actions admin-row-actions--icons">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            className="admin-icon-btn admin-icon-btn--primary"
                            title="Save"
                            aria-label="Save changes"
                            disabled={savingId === u.id}
                            onClick={() => void saveRowEdit(u)}
                          >
                            <i className="fa-solid fa-floppy-disk" aria-hidden />
                          </button>
                          <button
                            type="button"
                            className="admin-icon-btn"
                            title="Cancel"
                            aria-label="Cancel editing"
                            disabled={savingId === u.id}
                            onClick={cancelRowEdit}
                          >
                            <i className="fa-solid fa-xmark" aria-hidden />
                          </button>
                          <button
                            type="button"
                            className="admin-icon-btn admin-icon-btn--danger"
                            title="Delete user"
                            aria-label="Delete user"
                            onClick={() => void removeUser(u)}
                          >
                            <i className="fa-solid fa-trash" aria-hidden />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="admin-icon-btn"
                            title="View details"
                            aria-label="View user"
                            onClick={() => setSelected(u)}
                          >
                            <i className="fa-solid fa-eye" aria-hidden />
                          </button>
                          <button
                            type="button"
                            className="admin-icon-btn"
                            title="Edit"
                            aria-label="Edit user"
                            onClick={() => startRowEdit(u)}
                          >
                            <i className="fa-solid fa-pen" aria-hidden />
                          </button>
                          <button
                            type="button"
                            className="admin-icon-btn admin-icon-btn--danger"
                            title="Delete"
                            aria-label="Delete user"
                            onClick={() => void removeUser(u)}
                          >
                            <i className="fa-solid fa-trash" aria-hidden />
                          </button>
                        </>
                      )}
                    </div>
                    {!isEditing && canManageAccounts ? (
                      <div className="admin-row-actions admin-row-actions--secondary">
                        {!u.emailVerified ? (
                          <button type="button" onClick={() => void handleResendVerify(u)}>
                            Resend verify
                          </button>
                        ) : null}
                        {(canApprove || canManageAccounts) && u.status === 'Pending Approval' ? (
                          <button
                            type="button"
                            className="admin-action-pill--approve"
                            onClick={() => void handleApprove(u)}
                          >
                            Approve
                          </button>
                        ) : null}
                        {canManageAccounts && u.status === 'Active' ? (
                          <button
                            type="button"
                            className="admin-action-pill--warn"
                            onClick={() => void handleSuspend(u)}
                          >
                            Suspend
                          </button>
                        ) : null}
                        {canManageAccounts && u.status === 'Suspended' ? (
                          <button
                            type="button"
                            className="admin-action-pill--reactivate"
                            onClick={() => void handleReactivate(u)}
                          >
                            Reactivate
                          </button>
                        ) : null}
                        {(canApprove || canManageAccounts) &&
                        u.status === 'Pending Verification' &&
                        u.emailVerified ? (
                          <button
                            type="button"
                            className="admin-action-pill--approve"
                            onClick={() => void handleApprove(u)}
                          >
                            Activate
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {selected ? (
        <UserDetailDrawer
          user={selected}
          isOwner={isOwner}
          onClose={() => setSelected(null)}
          onPatch={patch => patchUser(selected.id, patch)}
          onResendVerification={() => void handleResendVerify(selected)}
          onPasswordReset={message => setFlash(message)}
        />
      ) : null}

      {createAccountOpen && isOwner ? (
        <CreateOwnerAccountModal
          onClose={closeCreateAccount}
          onCreated={(message, activationLink) => {
            setFlash(message)
            if (activationLink) setVerifyLink(activationLink)
            refresh()
          }}
        />
      ) : null}
    </div>
  )
}
