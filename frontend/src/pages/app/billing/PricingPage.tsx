import { startTransition } from 'react'
import { useNavigate } from 'react-router-dom'
import { SAAS_ROUTES } from '../../../lib/saasRoutes'
import '../saas-flow-page.css'

export default function PricingPage() {
  const navigate = useNavigate()
  return (
    <div className="saas-flow-page">
      <div className="saas-flow-page__card">
        <h1 className="saas-flow-page__title">Pricing</h1>
        <p className="saas-flow-page__hint">Plan catalog will load from your billing service.</p>
        <div className="saas-flow-page__actions">
          <button
            type="button"
            className="saas-flow-page__btn"
            onClick={() => startTransition(() => navigate(SAAS_ROUTES.onboardingTrialStart))}
          >
            Start trial
          </button>
          <button
            type="button"
            className="saas-flow-page__btn saas-flow-page__btn--ghost"
            onClick={() => startTransition(() => navigate(SAAS_ROUTES.home))}
          >
            Back
          </button>
        </div>
      </div>
    </div>
  )
}
