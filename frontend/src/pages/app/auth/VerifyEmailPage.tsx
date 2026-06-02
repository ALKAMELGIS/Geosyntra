import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { apiResendVerification, apiVerifyEmail, isAuthApiConfigured } from '../../../lib/onboarding/authApi'
import { completeVerifiedSignIn, verifyEmailLocal } from '../../../lib/onboarding/localAuth'
import { redirectToHomeWizard } from '../../../lib/homeWizardEntry'
import { signupPlanIdForEmail } from '../../../lib/onboarding/onboardingPlanFlow'
import { normalizeSignupPlanId } from '../../../lib/onboarding/signupPlans'
import {
  activateTrialWorkspace,
  openEnterpriseSales,
  postVerificationMessage,
  postVerificationWizardIntent,
} from '../../../lib/onboarding/planSubscriptionFlow'
import { useAuth } from '../../../state/auth'
import { SaasButton } from '../../../components/saas/SaasEntryShell'
import '../../home/home-onboarding.css'

export default function VerifyEmailPage() {
  const [params] = useSearchParams()
  const { login } = useAuth()
  const token = String(params.get('token') || '').trim()
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'expired'>('loading')
  const [message, setMessage] = useState('')
  const [resendEmail, setResendEmail] = useState('')
  const [resendBusy, setResendBusy] = useState(false)

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setMessage('Missing verification token.')
      return
    }
    let cancelled = false
    ;(async () => {
      let result = isAuthApiConfigured() ? await apiVerifyEmail(token) : await verifyEmailLocal(token)
      if (cancelled) return
      if (!result.ok && isAuthApiConfigured()) {
        const local = await verifyEmailLocal(token)
        if (local.ok) result = local
      }
      if (!result.ok) {
        if ('expired' in result && result.expired) {
          setStatus('expired')
          setMessage(result.error)
          return
        }
        setStatus('error')
        setMessage(result.error)
        return
      }
      const accessToken = 'accessToken' in result ? result.accessToken : undefined
      const pendingApproval = 'pendingApproval' in result && result.pendingApproval
      const session = await completeVerifiedSignIn(result.user, accessToken)
      if (!session.ok) {
        setStatus('error')
        setMessage('error' in session ? session.error : 'Could not start session.')
        return
      }
      login(session.user)
      setStatus('success')
      if (!pendingApproval) {
        const pendingPlan = normalizeSignupPlanId(signupPlanIdForEmail(session.user.email) ?? 'trial')
        setMessage(postVerificationMessage(pendingPlan))
        if (pendingPlan === 'trial') {
          activateTrialWorkspace(session.user)
        }
        if (pendingPlan === 'enterprise') {
          window.setTimeout(() => {
            openEnterpriseSales(session.user.email)
            redirectToHomeWizard({ wizard: 'pricing', authMode: 'signin', planId: 'enterprise' })
          }, 1400)
          return
        }
        window.setTimeout(() => {
          redirectToHomeWizard(postVerificationWizardIntent(pendingPlan))
        }, 1200)
        return
      }
      setMessage('Email verified. An administrator must approve your account before you can sign in.')
    })()
    return () => {
      cancelled = true
    }
  }, [token, login])

  const resend = async () => {
    const email = resendEmail.trim()
    if (!email) {
      setMessage('Enter your email to resend the verification link.')
      return
    }
    setResendBusy(true)
    try {
      const result = isAuthApiConfigured()
        ? await apiResendVerification(email)
        : { ok: false as const, error: 'Configure VITE_API_BASE_URL or use the link from sign up.' }
      if (!result.ok) {
        setMessage(result.error)
        return
      }
      setMessage('Verification email sent. Check your inbox.')
      setStatus('error')
    } finally {
      setResendBusy(false)
    }
  }

  return (
    <div className="home-verify-email">
      <motion.div
        className="home-verify-email__card"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        {status === 'loading' ? (
          <>
            <motion.span
              className="home-verify-email__pulse"
              aria-hidden
              animate={{ scale: [1, 1.08, 1], opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.6, repeat: Infinity }}
            />
            <h1>Verifying your email</h1>
            <p>Please wait while we activate your GeoSyntra account.</p>
          </>
        ) : null}
        {status === 'success' ? (
          <>
            <motion.span
              className="home-verify-email__check"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 18 }}
              aria-hidden
            >
              ✓
            </motion.span>
            <h1>Email verified</h1>
            <p>{message}</p>
          </>
        ) : null}
        {status === 'expired' ? (
          <>
            <h1>Link expired</h1>
            <p className="home-wizard-form__error">{message}</p>
            <label className="home-wizard-form__label" htmlFor="verify-resend-email">
              Email
            </label>
            <input
              id="verify-resend-email"
              className="home-wizard-form__input"
              type="email"
              value={resendEmail}
              onChange={e => setResendEmail(e.target.value)}
              placeholder="you@company.com"
            />
            <SaasButton size="lg" variant="primary" disabled={resendBusy} onClick={() => void resend()}>
              Resend verification email
            </SaasButton>
          </>
        ) : null}
        {status === 'error' ? (
          <>
            <h1>Verification failed</h1>
            <p className="home-wizard-form__error">{message}</p>
            <SaasButton size="lg" variant="primary" onClick={() => redirectToHomeWizard({ authMode: 'signup' })}>
              Back to sign up
            </SaasButton>
          </>
        ) : null}
      </motion.div>
    </div>
  )
}
