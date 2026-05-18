import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  homeOAuthSignIn,
  homeSignIn,
  homeSignUp,
  isStaticLocalAuthMode,
  resendVerificationLocal,
  type OAuthProvider,
} from '../../../../lib/onboarding/localAuth'
import { apiResendVerification, isAuthApiConfigured } from '../../../../lib/onboarding/authApi'
import { SaasButton } from '../../../../components/saas/SaasEntryShell'
import { useAuth } from '../../../../state/auth'
import { useHomeOnboarding } from '../HomeOnboardingContext'
import { WizardWelcomeBrandMark } from '../WizardWelcomeBrandMark'
import {
  DEFAULT_SIGNUP_ROLE_SLUG,
  GEOSYNTRA_ROLE_HIERARCHY,
  signupRoleBySlug,
  type GeosyntraRoleSlug,
} from '../../../../lib/rbac/geosyntraRoles'

const OAUTH: { id: OAuthProvider; label: string; icon: string }[] = [
  { id: 'google', label: 'Google', icon: 'fa-brands fa-google' },
  { id: 'apple', label: 'Apple', icon: 'fa-brands fa-apple' },
  { id: 'github', label: 'GitHub', icon: 'fa-brands fa-github' },
]

const RESEND_SECONDS = 60

export function WizardWelcomeStep() {
  const { login } = useAuth()
  const { setStep, refreshWorkspace, authMode, setAuthMode } = useHomeOnboarding()
  const [phase, setPhase] = useState<'form' | 'check-email'>('form')
  const [mode, setMode] = useState<'signup' | 'signin'>(authMode)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [roleSlug, setRoleSlug] = useState<GeosyntraRoleSlug>(DEFAULT_SIGNUP_ROLE_SLUG)
  const [pendingEmail, setPendingEmail] = useState('')
  const [devLink, setDevLink] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const [resendIn, setResendIn] = useState(0)

  useEffect(() => {
    setMode(authMode)
  }, [authMode])

  useEffect(() => {
    if (resendIn <= 0) return
    const t = window.setTimeout(() => setResendIn(s => Math.max(0, s - 1)), 1000)
    return () => window.clearTimeout(t)
  }, [resendIn])

  const afterAuth = (user: Parameters<typeof login>[0]) => {
    login(user)
    refreshWorkspace()
    setStep('pricing')
  }

  const showCheckEmail = (targetEmail: string, link?: string) => {
    setPendingEmail(targetEmail)
    setDevLink(link ?? null)
    setPhase('check-email')
    setResendIn(RESEND_SECONDS)
    setError('')
    setInfo('')
  }

  const submit = async () => {
    setError('')
    setInfo('')
    setBusy(true)
    try {
      if (mode === 'signup') {
        const chosen = signupRoleBySlug(roleSlug)
        if (!chosen?.selectableOnSignup) {
          setError('Owner and Admin roles cannot be selected during sign up. Choose another role.')
          return
        }
        const result = await homeSignUp({ name, email, password, roleSlug })
        if (!result.ok) {
          if ('needsVerification' in result && result.needsVerification) {
            showCheckEmail(normalizeEmailInput(email))
            setInfo('error' in result ? result.error : '')
            return
          }
          setError('error' in result ? result.error : 'Sign up failed.')
          return
        }
        if ('needsVerification' in result && result.needsVerification) {
          showCheckEmail(result.email, result.devVerificationLink)
          return
        }
        if ('user' in result) {
          afterAuth(result.user)
        }
        return
      }

      const result = await homeSignIn({ email, password })
      if (!result.ok) {
        setError('error' in result ? result.error : 'Sign in failed.')
        if (result.needsVerification) {
          showCheckEmail(normalizeEmailInput(email))
        }
        return
      }
      afterAuth(result.user)
    } finally {
      setBusy(false)
    }
  }

  const normalizeEmailInput = (value: string) => value.trim().toLowerCase()

  const resend = async () => {
    if (resendIn > 0 || !pendingEmail) return
    setError('')
    setInfo('')
    setBusy(true)
    try {
      const result = isAuthApiConfigured()
        ? await apiResendVerification(pendingEmail)
        : resendVerificationLocal(pendingEmail)
      if (!result.ok) {
        setError(result.error)
        if ('retryAfterSec' in result && result.retryAfterSec) {
          setResendIn(result.retryAfterSec)
        }
        return
      }
      setResendIn(RESEND_SECONDS)
      if (result.devVerificationLink) {
        setDevLink(result.devVerificationLink)
        setInfo(
          isStaticLocalAuthMode()
            ? 'This site runs without a mail server on GitHub Pages — open the verification link below.'
            : 'Development mode: use the verification link below.',
        )
      } else {
        setInfo('Verification email sent. Check your inbox.')
      }
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
    setPhase('form')
    setError('')
    setInfo('')
  }

  return (
    <motion.div className="home-wizard-step home-wizard-step--welcome" layout>
      <div className="home-wizard-welcome__hero">
        <p className="home-wizard-step__eyebrow">Step 1 · Welcome</p>
        <h2 className="home-wizard-step__title">Spatial intelligence, without limits</h2>
        <p className="home-wizard-step__lede">
          Create your GeoSyntra workspace in minutes. Sign in once — plans and secure checkout stay in this
          overlay on Home.
        </p>
        <WizardWelcomeBrandMark />
      </div>

      <motion.div className="home-wizard-welcome__auth">
        <AnimatePresence mode="wait">
          {phase === 'check-email' ? (
            <motion.div
              key="check-email"
              className="home-wizard-check-email"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
            >
              <motion.div
                className="home-wizard-check-email__icon"
                aria-hidden
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
              >
                <i className="fa-regular fa-envelope" />
              </motion.div>
              <h3 className="home-wizard-check-email__title">Check your email</h3>
              <p className="home-wizard-check-email__text">
                {isStaticLocalAuthMode() ? (
                  <>
                    Confirm <strong>{pendingEmail}</strong> using the verification link below (required on this
                    demo deployment). After activation, sign in and continue to your plan.
                  </>
                ) : (
                  <>
                    We sent a verification link to <strong>{pendingEmail}</strong>. Open it to activate your
                    account, then return here to sign in and choose your plan.
                  </>
                )}
              </p>
              {devLink ? (
                <p className="home-wizard-check-email__dev">
                  <span>Dev verification link</span>
                  <a href={devLink} target="_blank" rel="noreferrer">
                    {devLink}
                  </a>
                </p>
              ) : null}
              {info ? <p className="home-wizard-check-email__info">{info}</p> : null}
              {error ? <p className="home-wizard-form__error">{error}</p> : null}
              <SaasButton
                size="lg"
                variant="primary"
                className="home-wizard-form__submit"
                disabled={busy || resendIn > 0}
                onClick={() => void resend()}
              >
                {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend verification email'}
              </SaasButton>
              <button
                type="button"
                className="home-wizard-back"
                onClick={() => {
                  setPhase('form')
                  switchMode('signin')
                }}
              >
                Back to sign in
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="auth-form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
            >
              <motion.div className="home-wizard-oauth" role="group" aria-label="Social sign in">
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
              </motion.div>

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
                  <>
                    <label>
                      Full name
                      <input value={name} onChange={e => setName(e.target.value)} autoComplete="name" required />
                    </label>
                    <label>
                      Role
                      <select
                        value={roleSlug}
                        onChange={e => setRoleSlug(e.target.value as GeosyntraRoleSlug)}
                        aria-describedby="home-wizard-role-hint"
                      >
                        <optgroup label="Select your workspace role">
                          {GEOSYNTRA_ROLE_HIERARCHY.map(role => (
                            <option key={role.slug} value={role.slug} disabled={!role.selectableOnSignup}>
                              {role.label}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                      <span id="home-wizard-role-hint" className="home-wizard-form__hint">
                        {signupRoleBySlug(roleSlug)?.description ??
                          'Owner and Admin are assigned by your organization.'}
                        {signupRoleBySlug(roleSlug)?.requiresApproval
                          ? ' Admin approval is required after email verification.'
                          : null}
                      </span>
                    </label>
                  </>
                ) : null}
                <label>
                  Email
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />
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
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  )
}
