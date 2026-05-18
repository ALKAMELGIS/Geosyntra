import { FormEvent, useCallback, useEffect, useState } from 'react'
import { apiApproveUser, apiCreateInvite, apiRbacUsers, type RbacPublicUser } from '../../lib/rbacApi'
import { currentUserHasPermission } from '../../lib/auth'
import { RBAC_PERMISSIONS } from '../../lib/rbacPermissions'

const INVITE_ROLES = [
  { slug: 'manager', label: 'Manager' },
  { slug: 'analyst', label: 'Analyst' },
  { slug: 'admin', label: 'Admin' },
]

export default function AdminTeamPage() {
  const [users, setUsers] = useState<RbacPublicUser[]>([])
  const [email, setEmail] = useState('')
  const [roleSlug, setRoleSlug] = useState('manager')
  const [message, setMessage] = useState('')
  const [devLink, setDevLink] = useState('')
  const canInvite = currentUserHasPermission(RBAC_PERMISSIONS.INVITES_CREATE)
  const canApprove = currentUserHasPermission(RBAC_PERMISSIONS.USERS_APPROVE)

  const refresh = useCallback(() => {
    void apiRbacUsers().then(setUsers)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function onInvite(e: FormEvent) {
    e.preventDefault()
    setMessage('')
    setDevLink('')
    const result = await apiCreateInvite({ email: email.trim(), roleSlug })
    if (!result.ok) {
      setMessage(result.error)
      return
    }
    setMessage('Invitation sent.')
    if (result.devInviteLink) setDevLink(result.devInviteLink)
    setEmail('')
    refresh()
  }

  async function approve(id: number) {
    const ok = await apiApproveUser(id)
    setMessage(ok ? 'User approved.' : 'Could not approve user.')
    refresh()
  }

  const pending = users.filter(u => u.status === 'Pending Approval')

  return (
    <div className="admin-page">
      <header className="admin-page__header">
        <h1>Team & invitations</h1>
        <p className="admin-page__lead">Invite managers and analysts. Approve new signups before they can sign in.</p>
      </header>

      {message ? <p className="admin-hint">{message}</p> : null}
      {devLink ? (
        <p className="admin-hint">
          Dev invite link:{' '}
          <a href={devLink} className="admin-link">
            {devLink}
          </a>
        </p>
      ) : null}

      {canInvite ? (
        <section className="admin-card">
          <h2>Invite team member</h2>
          <form className="admin-form-row" onSubmit={onInvite}>
            <input
              type="email"
              placeholder="colleague@company.com"
              value={email}
              onChange={ev => setEmail(ev.target.value)}
              required
              className="admin-input"
            />
            <select value={roleSlug} onChange={ev => setRoleSlug(ev.target.value)} className="admin-input">
              {INVITE_ROLES.map(r => (
                <option key={r.slug} value={r.slug}>
                  {r.label}
                </option>
              ))}
            </select>
            <button type="submit" className="admin-btn admin-btn--primary">
              Send invite
            </button>
          </form>
          <p className="admin-hint">Public signup always creates a User role. Staff accounts are invite-only.</p>
        </section>
      ) : null}

      {canApprove ? (
        <section className="admin-card">
          <h2>Pending approval ({pending.length})</h2>
          {pending.length === 0 ? (
            <p className="admin-hint">No accounts awaiting approval.</p>
          ) : (
            <ul className="admin-list">
              {pending.map(u => (
                <li key={u.id} className="admin-list__item">
                  <span>
                    {u.name} — {u.email}
                  </span>
                  <button type="button" className="admin-btn admin-btn--primary" onClick={() => void approve(u.id)}>
                    Approve
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  )
}
