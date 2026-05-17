import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { apiVerifyEmail, isAuthApiConfigured } from '../../../lib/onboarding/authApi'
import { completeVerifiedSignIn, verifyEmailLocal } from '../../../lib/onboarding/localAuth'
import { redirectToHomeWizard } from '../../../lib/homeWizardEntry'
import { useAuth } from '../../../state/auth'
import { SaasButton } from '../../../components/saas/SaasEntryShell'
import '../../home/home-onboarding.css'

export default function VerifyEmailPage() {
  const [params] = useSearchParams()
  const { login } = useAuth()
  const token = String(params.get('token') || '').trim()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

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
        setStatus('error')
        setMessage(result.error)
        return
      }
      const session = await completeVerifiedSignIn(result.user)
      if (!session.ok) {
        setStatus('error')
        setMessage('error' in session ? session.error : 'Could not start session.')
        return
      }
      login(session.user)
      setStatus('success')
      setMessage('Your email is verified. Opening your workspace…')
      window.setTimeout(() => {
        redirectToHomeWizard({ wizard: 'pricing' })
      }, 1200)
    })()
    return () => {
      cancelled = true
    }
  }, [token, login])

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
