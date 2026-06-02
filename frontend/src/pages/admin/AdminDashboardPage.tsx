import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminUserStats, hydrateAdminUsersFromServer, listAdminUsers } from '../../lib/admin/adminUserStore'
import { isAuthApiConfigured } from '../../lib/onboarding/authApi'

export default function AdminDashboardPage() {
  const [, setTick] = useState(0)

  useEffect(() => {
    void hydrateAdminUsersFromServer().then(() => setTick(n => n + 1))
  }, [])

  const stats = adminUserStats(listAdminUsers())

  return (
    <>
      <header className="admin-topbar">
        <div>
          <h1>Admin dashboard</h1>
          <p className="admin-topbar__sub">
            Users, subscriptions, and access control for GeoSyntra.
            {!isAuthApiConfigured() ? ' Running in browser-local directory mode (GitHub Pages).' : ''}
          </p>
        </div>
        <div className="admin-topbar__actions">
          <Link to="/settings/admin/users" className="admin-btn admin-btn--primary">
            User management
          </Link>
        </div>
      </header>

      <div className="admin-stats">
        <div className="admin-stat-card">
          <div className="admin-stat-card__label">Total users</div>
          <div className="admin-stat-card__value">{stats.total}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-card__label">Verified</div>
          <div className="admin-stat-card__value">{stats.verified}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-card__label">Pending verification</div>
          <div className="admin-stat-card__value">{stats.pending}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-card__label">Active subscriptions</div>
          <div className="admin-stat-card__value">—</div>
        </div>
      </div>

      <p style={{ fontSize: '0.85rem', color: 'rgba(148,163,184,0.9)' }}>
        Subscriptions, organizations, audit logs, and billing analytics are scaffolded in the sidebar and
        will connect to Stripe and the backend directory API next.
      </p>
    </>
  )
}
