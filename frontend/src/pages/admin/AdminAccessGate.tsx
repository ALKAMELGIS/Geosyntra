import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../state/auth'
import { SAAS_ROUTES } from '../../lib/saasRoutes'
import { homeWizardSearch } from '../../lib/homeWizardEntry'
import './admin-access-gate.css'

export function AdminAccessGate() {
  const { logout } = useAuth()
  const navigate = useNavigate()

  const onSwitchAccount = () => {
    logout()
    navigate({
      pathname: SAAS_ROUTES.home,
      search: homeWizardSearch({ wizard: 'auth', authMode: 'signin' }),
    })
  }

  return (
    <div className="admin-access-gate" role="region" aria-labelledby="admin-access-gate-title">
        <div className="admin-access-gate__card">
        <div className="admin-access-gate__icon-wrap" aria-hidden>
          <i className="fa-solid fa-shield-halved admin-access-gate__icon" />
        </div>
        <h1 id="admin-access-gate-title" className="admin-access-gate__title">
          Admin access required
        </h1>
        <p className="admin-access-gate__lead">
          This control panel is limited to <strong>Admin</strong> and <strong>Manager</strong> accounts.
          You are signed in with a standard user role.
        </p>
        <ul className="admin-access-gate__hints">
          <li>Ask your organization admin to grant the Admin role, or</li>
          <li>Sign in with a different account that has admin permissions.</li>
        </ul>
        <div className="admin-access-gate__actions">
          <Link to={SAAS_ROUTES.dashboardDefault} className="admin-access-gate__btn admin-access-gate__btn--primary">
            <i className="fa-solid fa-arrow-left" aria-hidden />
            Back to workspace
          </Link>
          <button type="button" className="admin-access-gate__btn admin-access-gate__btn--ghost" onClick={onSwitchAccount}>
            <i className="fa-solid fa-right-to-bracket" aria-hidden />
            Switch account
          </button>
        </div>
      </div>
    </div>
  )
}
