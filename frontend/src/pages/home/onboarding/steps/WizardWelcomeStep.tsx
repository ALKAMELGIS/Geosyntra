import { useEffect, useState } from 'react'
import { homeOAuthSignIn, homeSignIn, homeSignUp, type OAuthProvider } from '../../../../lib/onboarding/localAuth'
import { SaasButton } from '../../../../components/saas/SaasEntryShell'
import { useAuth } from '../../../../state/auth'
import { useHomeOnboarding } from '../HomeOnboardingContext'

const OAUTH: { id: OAuthProvider; label: string; icon: string }[] = [
  { id: 'google', label: 'Google', icon: 'fa-brands fa-google' },
  { id: 'apple', label: 'Apple', icon: 'fa-brands fa-apple' },
  { id: 'github', label: 'GitHub', icon: 'fa-brands fa-github' },
]

export function WizardWelcomeStep() {
  const { login } = useAuth()
  const { setStep, refreshWorkspace, authMode, setAuthMode } = useHomeOnboarding()
  const [mode, setMode] = useState<'signup' | 'signin'>(authMode)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setMode(authMode)
  }, [authMode])

  const afterAuth = (user: Parameters<typeof login>[0]) => {
    login(user)
    refreshWorkspace()
    setStep('pricing')
  }

  const submit = async () => {
    setError('')
    setBusy(true)
    try {
      const result =
        mode === 'signup'
          ? await homeSignUp({ name, email, password })
          : await homeSignIn({ email, password })
      if (!result.ok) {
        setError('error' in result ? result.error : 'Sign in failed.')
        return
      }
      afterAuth(result.user)
    } finally {
      setBusy(false)
    }
  }

  const oauth = async (provider: OAuthProvider) => {
    setError('')
    setBusy(true)
    try {
      const result = await homeOAuthSignIn(provider)
      if (!result.ok) {
        setError('error' in result ? result.error : 'Sign in failed.')
        return
      }
      afterAuth(result.user)
    } finally {
      setBusy(false)
    }
  }

  const switchMode = (next: 'signup' | 'signin') => {
    setMode(next)
    setAuthMode(next)
  }

  return (
    <div className="home-wizard-step home-wizard-step--welcome">
      <div className="home-wizard-welcome__hero">
        <p className="home-wizard-step__eyebrow">Step 1 · Welcome</p>
        <h2 className="home-wizard-step__title">Spatial intelligence, without limits</h2>
        <p className="home-wizard-step__lede">
          Create your GeoSyntra workspace in minutes. Sign in once — plans and secure checkout stay in this
          overlay on Home.
        </p>
      </div>

      <div className="home-wizard-welcome__auth">
        <div className="home-wizard-oauth" role="group" aria-label="Social sign in">
          {OAUTH.map(p => (
            <button
              key={p.id}
              type="button"
              className="home-wizard-oauth__btn"
              disabled={busy}
              onClick={() => void oauth(p.id)}
            >
              <i className={p.icon} aria-hidden />
              {p.label}
            </button>
          ))}
        </div>

        <p className="home-wizard-oauth__sep">
          <span>or continue with email</span>
        </p>

        <div className="home-wizard-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'signup'} onClick={() => switchMode('signup')}>
            Sign up
          </button>
          <button type="button" role="tab" aria-selected={mode === 'signin'} onClick={() => switchMode('signin')}>
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
          <SaasButton
            size="lg"
            variant="primary"
            className="home-wizard-form__submit"
            onClick={() => void submit()}
          >
            {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </SaasButton>
        </form>
      </div>
    </div>
  )
}
