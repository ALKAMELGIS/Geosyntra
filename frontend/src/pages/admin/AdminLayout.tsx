import { NavLink, Outlet } from 'react-router-dom'
import { readCurrentUser, hasPermission } from '../../lib/auth'
import './admin.css'

const NAV = [
  { to: '/settings/admin', end: true, label: 'Dashboard', icon: 'fa-chart-line' },
  { to: '/settings/admin/users', end: false, label: 'Users', icon: 'fa-users' },
  { to: '', end: false, label: 'Subscriptions', icon: 'fa-credit-card', soon: true },
  { to: '', end: false, label: 'Roles & Permissions', icon: 'fa-shield-halved', soon: true },
  { to: '', end: false, label: 'Audit Logs', icon: 'fa-list-check', soon: true },
] as const

export default function AdminLayout() {
  const user = readCurrentUser()
  const allowed =
    hasPermission('admin.users.manage', user?.role) || String(user?.role ?? '') === 'Admin'

  if (!allowed) {
    return (
      <div className="admin-forbidden">
        <h1>Admin access required</h1>
        <p>Sign in with an Admin or Manager account to open the control panel.</p>
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
