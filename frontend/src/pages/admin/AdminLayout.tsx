import { NavLink, Outlet } from 'react-router-dom'
import { currentUserHasPermission } from '../../lib/auth'
import { RBAC_PERMISSIONS } from '../../lib/rbacPermissions'
import './admin.css'

const NAV = [
  { to: '/settings/admin', end: true, label: 'Dashboard', icon: 'fa-chart-line' },
  { to: '/settings/admin/users', end: false, label: 'Users', icon: 'fa-users' },
  { to: '/settings/admin/team', end: false, label: 'Team & invites', icon: 'fa-user-plus' },
  { to: '/settings/admin/roles', end: false, label: 'Roles & Permissions', icon: 'fa-shield-halved' },
  { to: '/settings/admin/audit', end: false, label: 'Audit Logs', icon: 'fa-list-check' },
  { to: '', end: false, label: 'Subscriptions', icon: 'fa-credit-card', soon: true },
] as const

export default function AdminLayout() {
  const allowed = currentUserHasPermission(RBAC_PERMISSIONS.ADMIN_PANEL)

  if (!allowed) {
    return (
      <div className="admin-forbidden">
        <h1>Admin access required</h1>
        <p>Sign in with a Manager, Analyst, or Admin account — or accept a team invitation.</p>
      </div>
    )
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar" aria-label="Admin navigation">
        <div className="admin-sidebar__brand">GeoSyntra Admin</div>
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
