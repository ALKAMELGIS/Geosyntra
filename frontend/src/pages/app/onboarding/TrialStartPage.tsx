import { startTransition } from 'react'
import { useNavigate } from 'react-router-dom'
import { SAAS_ROUTES } from '../../../lib/saasRoutes'
import '../saas-flow-page.css'

/** Onboarding entry — trial start (links to auth or dashboard when session exists). */
export default function TrialStartPage() {
  const navigate = useNavigate()
  return (
    <div className="saas-flow-page">
      <div className="saas-flow-page__card">
        <h1 className="saas-flow-page__title">Get started</h1>
        <p className="saas-flow-page__hint">Create an account or sign in to open the workspace.</p>
        <div className="saas-flow-page__actions">
          <button
            type="button"
            className="saas-flow-page__btn"
            onClick={() => startTransition(() => navigate(SAAS_ROUTES.authRegister))}
          >
            Create account
          </button>
          <button
            type="button"
            className="saas-flow-page__btn saas-flow-page__btn--ghost"
            onClick={() => startTransition(() => navigate(SAAS_ROUTES.authLogin))}
          >
            Sign in
          </button>
        </div>
      </div>
    </div>
  )
}
