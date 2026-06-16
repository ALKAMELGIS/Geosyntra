import { useEffect, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  homeSignIn,
  homeSignUp,
  isStaticLocalAuthMode,
  resendVerificationLocal,
} from '../../../../lib/onboarding/localAuth'
import {
  apiForgotPassword,
  apiForgotUsername,
  apiResendVerification,
  isAuthApiConfigured,
} from '../../../../lib/onboarding/authApi'
import {
  lookupLocalUsernameHint,
  requestLocalPasswordReset,
} from '../../../../lib/onboarding/localAuthRecovery'
import { scheduleAdminDirectorySync } from '../../../../lib/adminDirectoryPersistence'
import { SaasButton } from '../../../../components/saas/SaasEntryShell'
import { isPlatformOwnerUser } from '../../../../lib/auth'
import {
  readKeepSignedInPreference,
  readSavedLoginCredentials,
  writeKeepSignedInPreference,
} from '../../../../lib/authKeepSignedIn'
import {
  activatePreAuthorizedWorkspace,
  ensurePlatformOwnerWorkspace,
} from '../../../../lib/onboarding/activateWorkspace'
import { isUserEmailVerified } from '../../../../lib/onboarding/onboardingPlanFlow'
import {
  activateTrialWorkspace,
  resolveAuthPlanRoute,
} from '../../../../lib/onboarding/planSubscriptionFlow'
import { useAuth } from '../../../../state/auth'
import { useHomeOnboarding } from '../HomeOnboardingContext'
import { WizardWelcomeBrandMark } from '../WizardWelcomeBrandMark'
import { DEFAULT_SIGNUP_PLAN_ID } from '../../../../lib/onboarding/signupPlans'
import type { BillingPlanId } from '../../../../lib/onboarding/pricingPlans'
import { signupPlanIdForEmail } from '../../../../lib/onboarding/onboardingPlanFlow'
import { navigateToHomeStart } from '../../../../lib/hashRouterInPageNav'
import { WizardPlanSelect } from '../WizardPlanSelect'
import { OAuthGlassPanel } from '../../../../components/auth/OAuthGlassPanel'

const RESEND_SECONDS = 60

function readInitialSignInFields(): { email: string; password: string } {
  const saved = readSavedLoginCredentials()
  return {
    email: saved?.email ?? '',
    password: saved?.password ?? '',
  }
}

function readAdminUsers(): Array<Record<string, unknown>> {
  try {
    const raw = localStorage.getItem('adminUsers')
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeAdminUsers(users: Array<Record<string, unknown>>): void {
  localStorage.setItem('adminUsers', JSON.stringify(users))
  scheduleAdminDirectorySync()
}

export function WizardWelcomeStep() {
  const { login, logout } = useAuth()
  const navigate = useNavigate()
  const { setStep, refreshWorkspace, authMode, setAuthMode, closeWizard, selectPlan } = useHomeOnboarding()
  const [phase, setPhase] = useState<'form' | 'check-email' | 'forgot-username' | 'forgot-password'>('form')
  const [resetDevLink, setResetDevLink] = useState<string | null>(null)
  const [mode, setMode] = useState<'signup' | 'signin'>(authMode)
  const initialSignInFields = readInitialSignInFields()
  const [name, setName] = useState('')
  const [email, setEmail] = useState(initialSignInFields.email)
  const [password, setPassword] = useState(initialSignInFields.password)
  const [showPassword, setShowPassword] = useState(false)
  const [keepSignedIn, setKeepSignedIn] = useState(() => readKeepSignedInPreference())
  const [planId, setPlanId] = useState<BillingPlanId>(DEFAULT_SIGNUP_PLAN_ID)
  const [pendingEmail, setPendingEmail] = useState('')
  const [devLink, setDevLink] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const [resendIn, setResendIn] = useState(0)

  useEffect(() => {
    setMode(authMode)
  }, [authMode])

  const afterAuth = (user: Parameters<typeof login>[0]) => {
    if (!isUserEmailVerified(user)) {
      logout()
      showCheckEmail(user.email)
      setInfo('Confirm your email before accessing GeoSyntra. Use resend if you did not receive the message.')
      return
    }
    login(user)
    refreshWorkspace()
    const route = resolveAuthPlanRoute(user)
    if (route.kind === 'enter_workspace') {
      if (isPlatformOwnerUser(user)) {
        ensurePlatformOwnerWorkspace(user)
        refreshWorkspace()
      }
      closeWizard()
      navigateToHomeStart(navigate, { replace: true })
      return
    }
    if (route.kind === 'activate_provisioned') {
      activatePreAuthorizedWorkspace(user)
      refreshWorkspace()
      closeWizard()
      navigateToHomeStart(navigate, { replace: true })
      return
    }
    if (route.kind === 'activate_trial') {
      activateTrialWorkspace(user)
      refreshWorkspace()
      closeWizard()
      navigateToHomeStart(navigate, { replace: true })
      return
    }
    if (route.kind === 'open_payment') {
      selectPlan(route.planId)
      closeWizard()
      navigateToHomeStart(navigate, { replace: true })
      return
    }
    if (route.kind === 'enterprise_sales') {
      selectPlan('enterprise')
      closeWizard()
      navigateToHomeStart(navigate, { replace: true })
      setInfo('Enterprise requests go to our sales team. Your workspace activates after agreement.')
      return
    }
    if (route.kind === 'open_pricing') {
      selectPlan(route.upgrade ? 'pro' : signupPlanIdForEmail(user.email) ?? 'trial')
      closeWizard()
      navigateToHomeStart(navigate, { replace: true })
      return
    }
    selectPlan(route.upgrade ? 'pro' : signupPlanIdForEmail(user.email) ?? 'trial')
    closeWizard()
    navigateToHomeStart(navigate, { replace: true })
  }

  useEffect(() => {
    if (resendIn <= 0) return
    const t = window.setTimeout(() => setResendIn(s => Math.max(0, s - 1)), 1000)
    return () => window.clearTimeout(t)
  }, [resendIn])

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
        const result = await homeSignUp({ name, email, password, planId })
        if (!result.ok) {
          if ('needsVerification' in result && result.needsVerification) {
            showCheckEmail(normalizeEmailInput(email))
            if ('error' in result && result.error) setInfo(result.error)
            return
          }
          setError('error' in result ? result.error : 'Sign up failed.')
          return
        }
        if ('needsVerification' in result && result.needsVerification) {
          showCheckEmail(result.email, result.devVerificationLink)
          setInfo(
            'Account created. We sent a verification email — open the link to activate your account, then sign in.',
          )
          return
        }
        setError('Sign up did not complete. Please try again.')
        return
      }

      const result = await homeSignIn({ email, password, keepSignedIn })
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

  const switchMode = (next: 'signup' | 'signin') => {
    setMode(next)
    setAuthMode(next)
    setPhase('form')
    setError('')
    setInfo('')
    setShowPassword(false)
  }

  const backToSignIn = () => {
    setPhase('form')
    setError('')
    setInfo('')
    setResetDevLink(null)
    setAuthMode('signin')
    setMode('signin')
  }

  const submitUsernameLookup = async () => {
    const em = normalizeEmailInput(email)
    if (!em) {
      setError('Enter your email address.')
      return
    }
    setError('')
    setInfo('')
    setBusy(true)
    try {
      const result = isAuthApiConfigured()
        ? await apiForgotUsername(em)
        : lookupLocalUsernameHint(em, readAdminUsers)
      if (!result.ok) {
        setError(result.error)
        return
      }
      if (result.found && result.signInId) setEmail(result.signInId)
      setInfo(result.message)
    } finally {
      setBusy(false)
    }
  }

  const submitPasswordResetRequest = async () => {
    const em = normalizeEmailInput(email)
    if (!em) {
      setError('Enter your email address.')
      return
    }
    setError('')
    setInfo('')
    setResetDevLink(null)
    setBusy(true)
    try {
      const result = isAuthApiConfigured()
        ? await apiForgotPassword(em)
        : await requestLocalPasswordReset(em, readAdminUsers, writeAdminUsers)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setInfo(result.message)
      if (result.devResetLink) setResetDevLink(result.devResetLink)
    } finally {
      setBusy(false)
    }
  }

  const onForgotUsername = () => {
    setError('')
    setInfo('')
    setResetDevLink(null)
    setPhase('forgot-username')
    if (normalizeEmailInput(email)) void submitUsernameLookup()
  }

  const onForgotPassword = () => {
    setError('')
    setInfo('')
    setResetDevLink(null)
    setPhase('forgot-password')
    if (normalizeEmailInput(email)) void submitPasswordResetRequest()
  }

  const onKeepSignedInChange = (next: boolean) => {
    setKeepSignedIn(next)
    writeKeepSignedInPreference(next)
    if (!next) setPassword('')
  }

  const onRecoveryKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || busy) return
    e.preventDefault()
    if (phase === 'forgot-username') void submitUsernameLookup()
    else if (phase === 'forgot-password') void submitPasswordResetRequest()
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
          {phase === 'forgot-username' ? (
            <motion.div
              key="forgot-username"
              className="home-wizard-recovery"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
            >
              <h3 className="home-wizard-recovery__title">Forgot username?</h3>
              <p className="home-wizard-recovery__lede">
                GeoSyntra sign-in uses your account email. Enter it below and we will show how to sign in.
              </p>
              <label className="home-wizard-glass-field">
                <span className="home-wizard-glass-field__label">Email</span>
                <span className="home-wizard-glass-field__shell">
                  <i className="fa-regular fa-envelope home-wizard-glass-field__icon" aria-hidden />
                  <input
                    className="home-wizard-glass-field__input"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    onKeyDown={onRecoveryKeyDown}
                    autoComplete="email"
                    placeholder="you@company.com"
                  />
                </span>
              </label>
              {info ? <p className="home-wizard-form__info">{info}</p> : null}
              {error ? <p className="home-wizard-form__error">{error}</p> : null}
              <SaasButton
                size="lg"
                variant="primary"
                className="home-wizard-form__submit"
                disabled={busy}
                onClick={() => void submitUsernameLookup()}
              >
                {busy ? 'Looking up…' : 'Look up sign-in email'}
              </SaasButton>
              <button type="button" className="home-wizard-back" onClick={backToSignIn}>
                Back to sign in
              </button>
            </motion.div>
          ) : phase === 'forgot-password' ? (
            <motion.div
              key="forgot-password"
              className="home-wizard-recovery"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
            >
              <h3 className="home-wizard-recovery__title">Reset your password</h3>
              <p className="home-wizard-recovery__lede">
                We will email you a secure link to choose a new password (valid for 1 hour).
              </p>
              <label className="home-wizard-glass-field">
                <span className="home-wizard-glass-field__label">Email</span>
                <span className="home-wizard-glass-field__shell">
                  <i className="fa-regular fa-envelope home-wizard-glass-field__icon" aria-hidden />
                  <input
                    className="home-wizard-glass-field__input"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    onKeyDown={onRecoveryKeyDown}
                    autoComplete="email"
                    placeholder="you@company.com"
                  />
                </span>
              </label>
              {info ? <p className="home-wizard-form__info">{info}</p> : null}
              {error ? <p className="home-wizard-form__error">{error}</p> : null}
              {resetDevLink ? (
                <p className="home-wizard-check-email__dev">
                  <span>Dev reset link</span>
                  <a href={resetDevLink} target="_blank" rel="noreferrer">
                    {resetDevLink}
                  </a>
                </p>
              ) : null}
              <SaasButton
                size="lg"
                variant="primary"
                className="home-wizard-form__submit"
                disabled={busy}
                onClick={() => void submitPasswordResetRequest()}
              >
                {busy ? 'Sending…' : 'Send reset link'}
              </SaasButton>
              <button type="button" className="home-wizard-back" onClick={backToSignIn}>
                Back to sign in
              </button>
            </motion.div>
          ) : phase === 'check-email' ? (
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
                    We sent a verification email to <strong>{pendingEmail}</strong>. You must confirm your
                    email before your account is activated. After verifying, return here to sign in and choose
                    your plan.
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
              <div className="home-wizard-tabs" role="tablist">
                <button type="button" role="tab" aria-selected={mode === 'signup'} onClick={() => switchMode('signup')}>
                  Sign up
                </button>
                <button type="button" role="tab" aria-selected={mode === 'signin'} onClick={() => switchMode('signin')}>
                  Sign in
                </button>
              </div>

              <form
                className="home-wizard-form home-wizard-form--glass"
                onSubmit={e => {
                  e.preventDefault()
                  void submit()
                }}
              >
                {mode === 'signup' ? (
                  <>
                    <label className="home-wizard-glass-field">
                      <span className="home-wizard-glass-field__label">Full name</span>
                      <span className="home-wizard-glass-field__shell">
                        <i className="fa-regular fa-user home-wizard-glass-field__icon" aria-hidden />
                        <input
                          className="home-wizard-glass-field__input"
                          value={name}
                          onChange={e => setName(e.target.value)}
                          autoComplete="name"
                          placeholder="Full name"
                          required
                        />
                      </span>
                    </label>
                  </>
                ) : null}
                <label className="home-wizard-glass-field">
                  <span className="home-wizard-glass-field__label">Email</span>
                  <span className="home-wizard-glass-field__shell">
                    <i className="fa-regular fa-envelope home-wizard-glass-field__icon" aria-hidden />
                    <input
                      className="home-wizard-glass-field__input"
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      autoComplete={mode === 'signup' ? 'email' : 'username'}
                      placeholder="Email"
                      required
                    />
                  </span>
                </label>
                <label className="home-wizard-glass-field home-wizard-glass-field--password">
                  <span className="home-wizard-glass-field__label">Password</span>
                  <span className="home-wizard-glass-field__shell">
                    <i className="fa-solid fa-lock home-wizard-glass-field__icon" aria-hidden />
                    <input
                      className="home-wizard-glass-field__input"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      placeholder="Password"
                      required
                    />
                  </span>
                  <button
                    type="button"
                    className="home-wizard-password-toggle"
                    onClick={() => setShowPassword(v => !v)}
                    aria-pressed={showPassword}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <i className={showPassword ? 'fa-solid fa-eye-slash' : 'fa-regular fa-eye'} aria-hidden />
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </label>

                {mode === 'signin' ? (
                  <div className="home-wizard-auth-options">
                    <label className="home-wizard-keep-signed-in" htmlFor="home-wizard-keep-signed-in">
                      <input
                        id="home-wizard-keep-signed-in"
                        type="checkbox"
                        className="home-wizard-keep-signed-in__input"
                        checked={keepSignedIn}
                        onChange={e => onKeepSignedInChange(e.target.checked)}
                        disabled={busy}
                      />
                      <span className="home-wizard-keep-signed-in__label">Keep me signed in</span>
                    </label>
                  </div>
                ) : null}

                {mode === 'signup' ? (
                  <label className="home-wizard-form__label--plan home-wizard-glass-field">
                    <span className="home-wizard-glass-field__label">Plan</span>
                    <WizardPlanSelect value={planId} onChange={setPlanId} />
                  </label>
                ) : null}

                {info ? <p className="home-wizard-form__info">{info}</p> : null}
                {error ? <p className="home-wizard-form__error">{error}</p> : null}
                <SaasButton
                  size="lg"
                  variant="primary"
                  type="submit"
                  disabled={busy}
                  className="home-wizard-form__submit home-wizard-glass-submit"
                  aria-label={mode === 'signup' ? 'Create account' : 'Sign in'}
                >
                  {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
                </SaasButton>

                {mode === 'signin' ? (
                  <div className="home-wizard-forgot-row">
                    <button type="button" className="home-wizard-forgot-link" onClick={onForgotUsername}>
                      Forgot username?
                    </button>
                    <span className="home-wizard-forgot-sep">or</span>
                    <button type="button" className="home-wizard-forgot-link" onClick={onForgotPassword}>
                      Forgot password?
                    </button>
                  </div>
                ) : null}
              </form>

              <div className="home-wizard-oauth">
                <div className="home-wizard-oauth__divider">
                  <span>{mode === 'signup' ? 'or sign up with' : 'or continue with'}</span>
                </div>
                <OAuthGlassPanel
                  rememberLogin={keepSignedIn}
                  onNotify={(message, tone) => {
                    if (tone === 'error') {
                      setError(message)
                      setInfo('')
                    } else {
                      setInfo(message)
                      setError('')
                    }
                  }}
                  onSuccess={user => afterAuth(user)}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  )
}
