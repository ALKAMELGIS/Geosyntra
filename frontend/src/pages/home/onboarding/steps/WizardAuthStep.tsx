import { useState } from 'react'
import { homeSignIn, homeSignUp } from '../../../../lib/onboarding/localAuth'
import { SaasButton } from '../../../../components/saas/SaasEntryShell'
import { useAuth } from '../../../../state/auth'
import { useHomeOnboarding } from '../HomeOnboardingContext'

export function WizardAuthStep() {
  const { login } = useAuth()
  const { setStep, refreshWorkspace } = useHomeOnboarding()
  const [mode, setMode] = useState<'signup' | 'signin'>('signup')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setError('')
    setBusy(true)
    try {
      const result =
        mode === 'signup'
          ? await homeSignUp({ name, email, password })
          : await homeSignIn({ email, password })
      if (!result.ok) {
        setError(result.error)
        return
      }
      login(result.user)
      refreshWorkspace()
      setStep('pricing')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="home-wizard-step home-wizard-step--auth">
      <p className="home-wizard-step__eyebrow">Step 1 · Account</p>
      <h2 className="home-wizard-step__title">{mode === 'signup' ? 'Create your workspace' : 'Welcome back'}</h2>
      <p className="home-wizard-step__lede">
        One account for Layer Live, GeoAI, and publication-ready reporting — no page redirects.
      </p>

      <div className="home-wizard-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={mode === 'signup'} onClick={() => setMode('signup')}>
          Sign up
        </button>
        <button type="button" role="tab" aria-selected={mode === 'signin'} onClick={() => setMode('signin')}>
          Sign in
        </button>
      </div>

      <form
        className="home-wizard-form"
        onSubmit={e => {
          e.preventDefault()
          void submit()
        }}
      >
        {mode === 'signup' ? (
          <label>
            Full name
            <input value={name} onChange={e => setName(e.target.value)} autoComplete="name" required />
          </label>
        ) : null}
        <label>
          Email
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            required
          />
        </label>
        {error ? <p className="home-wizard-form__error">{error}</p> : null}
        <SaasButton size="lg" variant="primary" className="home-wizard-form__submit" onClick={() => void submit()}>
          {busy ? 'Please wait…' : mode === 'signup' ? 'Continue' : 'Sign in & continue'}
        </SaasButton>
      </form>
    </div>
  )
}
