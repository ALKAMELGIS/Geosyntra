import { useAuth } from '../../../../state/auth'
import { displayFirstName } from '../../../../lib/onboarding/localAuth'
import { SaasButton } from '../../../../components/saas/SaasEntryShell'
import { useHomeOnboarding } from '../HomeOnboardingContext'

export function WizardIdentityStep() {
  const { user } = useAuth()
  const { setStep } = useHomeOnboarding()
  const first = displayFirstName(user)

  return (
    <div className="home-wizard-step home-wizard-step--identity">
      <p className="home-wizard-step__eyebrow">Step 2 · Your workspace</p>
      <h2 className="home-wizard-step__title">
        Welcome, {first} <span aria-hidden>👋</span>
      </h2>
      <p className="home-wizard-step__lede">
        Your session is active. Next, pick a plan — billing and activation stay inside this flow, with no
        page redirects.
      </p>
      <div className="home-wizard-identity-card" role="status">
        <span className="home-wizard-identity-card__pulse" aria-hidden />
        <div>
          <strong>{user?.name ?? first}</strong>
          <span>{user?.email}</span>
        </div>
        <span className="home-wizard-identity-card__live">Live session</span>
      </div>
      <div className="home-wizard-step__actions">
        <SaasButton size="lg" variant="primary" onClick={() => setStep('pricing')}>
          Continue to plans
        </SaasButton>
        <button type="button" className="home-wizard-back" onClick={() => setStep('auth')}>
          ← Back to account
        </button>
      </div>
    </div>
  )
}
