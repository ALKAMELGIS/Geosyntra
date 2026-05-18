import { Link, NavLink, Outlet } from 'react-router-dom'
import { currentUserHasPermission, readCurrentUser } from '../../lib/auth'
import { RBAC_PERMISSIONS } from '../../lib/rbacPermissions'
import { isUserManagementApiLive } from '../../lib/admin/adminUserManagement'
import './admin.css'

const NAV = [
  { to: '/settings/admin/users', end: true, label: 'User Management', icon: 'fa-users-gear' },
  { to: '/settings/admin/overview', end: true, label: 'Overview', icon: 'fa-chart-line' },
  { to: '/settings/admin/team', end: false, label: 'Team & invites', icon: 'fa-user-plus' },
  { to: '/settings/admin/roles', end: false, label: 'Roles & permissions', icon: 'fa-shield-halved' },
  { to: '/settings/admin/audit', end: false, label: 'Audit log', icon: 'fa-list-check' },
  { to: '', end: false, label: 'Subscriptions', icon: 'fa-credit-card', soon: true },
] as const

function canAccessUserManagement(): boolean {
  return (
    currentUserHasPermission(RBAC_PERMISSIONS.USERS_READ) ||
    currentUserHasPermission(RBAC_PERMISSIONS.ADMIN_PANEL) ||
    currentUserHasPermission(RBAC_PERMISSIONS.USERS_MANAGE)
  )
}

export default function AdminLayout() {
  const allowed = canAccessUserManagement()
  const me = readCurrentUser()

  if (!allowed) {
    return (
      <div className="admin-forbidden">
        <h1>User management access required</h1>
        <p>
          Sign in with a Manager, Analyst, or Admin account, or accept a team invitation. Public sign-up creates a{' '}
          <strong>User</strong> role that must be approved here before workspace access.
        </p>
        <p className="admin-forbidden__hint">
          {me
            ? `Signed in as ${me.email} (${me.role}). Ask an administrator to assign a role with user-management access.`
            : 'Use Sign in from the home page, or configure RBAC_BOOTSTRAP_EMAIL on the server for the first Super Admin.'}
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
        <p className="admin-sidebar__tagline">
          Lifecycle: Sign up → verify email → approve → active
          {isUserManagementApiLive() ? ' · server RBAC' : ' · local directory'}
        </p>
        {NAV.map(item =>
          'soon' in item && item.soon ? (
            <span key={item.label} className="admin-nav-link admin-nav-link--soon">
              <i className={`fa-solid ${item.icon}`} aria-hidden />
              {item.label}
            </span>
          ) : (
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
          ),
        )}
      </aside>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  )
}
