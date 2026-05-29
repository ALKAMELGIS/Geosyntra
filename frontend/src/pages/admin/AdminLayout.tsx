import { useEffect } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { bootstrapAdminDirectory } from '../../lib/admin/adminDirectoryBootstrap'
import { isUserManagementApiLive } from '../../lib/admin/adminUserManagement'
import { isPlatformOwnerUser, readCurrentUser } from '../../lib/auth'
import './admin.css'

const NAV = [
  { to: '/settings/admin/users', end: true, label: 'User Management', icon: 'fa-users-gear' },
  { to: '/settings/admin/overview', end: true, label: 'Overview', icon: 'fa-chart-line' },
  { to: '/settings/admin/team', end: false, label: 'Team & invites', icon: 'fa-user-plus' },
  { to: '/settings/admin/roles', end: false, label: 'Roles & permissions', icon: 'fa-shield-halved' },
  { to: '/settings/admin/audit', end: false, label: 'Audit log', icon: 'fa-list-check' },
  { to: '/settings/admin/tokens', end: false, label: 'API Tokens', icon: 'fa-key', ownerOnly: true },
  { to: '', end: false, label: 'Subscriptions', icon: 'fa-credit-card', soon: true },
] as const

function canAccessUserManagement(): boolean {
  return isPlatformOwnerUser(readCurrentUser())
}

export default function AdminLayout() {
  const allowed = canAccessUserManagement()
  const me = readCurrentUser()
  const isOwner = isPlatformOwnerUser(me)

  useEffect(() => {
    if (!allowed) return
    void bootstrapAdminDirectory()
  }, [allowed])

  if (!allowed) {
    return (
      <div className="admin-forbidden">
        <h1>Owner access required</h1>
        <p>
          User Management and related admin tools are restricted to the platform <strong>Owner</strong> role.
        </p>
        <p className="admin-forbidden__hint">
          {me
            ? `Signed in as ${me.email} (${me.role}). Sign in with an Owner account to continue.`
            : 'Use Sign in from the home page, or configure RBAC_BOOTSTRAP_EMAIL on the server for the first Owner.'}
        </p>
        <div className="admin-forbidden__actions">
          <Link to="/" className="admin-btn admin-btn--primary">
            Back to home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar" aria-label="Settings — user management">
        <div className="admin-sidebar__brand">Settings</div>
        {isOwner ? <div className="admin-sidebar__section-label">Owner settings</div> : null}
        {isOwner ? (
          <NavLink
            to="/settings/admin/users?create=1"
            end={false}
            className={({ isActive }) =>
              `admin-nav-link admin-nav-link--owner-create${isActive ? ' admin-nav-link--active' : ''}`
            }
          >
            <i className="fa-solid fa-user-plus" aria-hidden />
            Create account
          </NavLink>
        ) : null}
        <p className="admin-sidebar__tagline">
          Lifecycle: Sign up → verify email → approve → active
          {isUserManagementApiLive() ? ' · server RBAC' : ' · local directory'}
        </p>
        {NAV.map(item => {
          if ('soon' in item && item.soon) {
            return (
              <span key={item.label} className="admin-nav-link admin-nav-link--soon">
                <i className={`fa-solid ${item.icon}`} aria-hidden />
                {item.label}
              </span>
            )
          }
          if ('ownerOnly' in item && item.ownerOnly && !isOwner) return null
          return (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `admin-nav-link${isActive ? ' admin-nav-link--active' : ''}`
              }
            >
              <i className={`fa-solid ${item.icon}`} aria-hidden />
              {item.label}
            </NavLink>
          )
        })}
      </aside>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  )
}
