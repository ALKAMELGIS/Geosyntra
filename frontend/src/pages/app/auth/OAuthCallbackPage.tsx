import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { navigateToHomeStart } from '../../../lib/hashRouterInPageNav'
import { SAAS_ROUTES } from '../../../lib/saasRoutes'
import { validateServerSession } from '../../../lib/authSession'
import { useAuth } from '../../../state/auth'
import { isPlatformOwnerUser } from '../../../lib/auth'
import { ensurePlatformOwnerWorkspace } from '../../../lib/onboarding/activateWorkspace'
import '../../../components/auth/oauth-glass.css'

const ERROR_MESSAGES: Record<string, string> = {
  oauth_cancelled: 'Sign-in was cancelled.',
  invalid_oauth_token: 'Invalid or expired sign-in token. Please try again.',
  oauth_not_configured: 'This sign-in provider is not configured yet.',
  provider_api_failure: 'The identity provider is temporarily unavailable.',
  oauth_email_conflict: 'This email is already linked to another account.',
  apple_oauth_placeholder: 'Apple sign-in is coming soon.',
  network_error: 'Network error. Check your connection and try again.',
}

export default function OAuthCallbackPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [message, setMessage] = useState('Completing sign-in…')
  const [tone, setTone] = useState<'info' | 'error'>('info')

  useEffect(() => {
    let cancelled = false
    const hash = window.location.hash || ''
    const qIdx = hash.indexOf('?')
    const qs = qIdx >= 0 ? hash.slice(qIdx + 1) : window.location.search.replace(/^\?/, '')
    const params = new URLSearchParams(qs)
    const ok = params.get('ok')
    const error = params.get('error') || ''

    void (async () => {
      if (ok === '0' || error) {
        if (!cancelled) {
          setTone('error')
          setMessage(ERROR_MESSAGES[error] || params.get('message') || 'Sign-in failed.')
        }
        return
      }

      const user = await validateServerSession()
      if (cancelled) return
      if (!user) {
        setTone('error')
        setMessage('Session could not be established. Try signing in again.')
        return
      }
      login(user)
      if (isPlatformOwnerUser(user)) {
        ensurePlatformOwnerWorkspace(user)
      }
      setTone('info')
      setMessage('Success! Opening Start…')
      window.setTimeout(() => {
        navigateToHomeStart(navigate, { replace: true })
      }, 600)
    })()

    return () => {
      cancelled = true
    }
  }, [login, navigate])

  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'grid',
        placeItems: 'center',
        padding: '2rem',
      }}
    >
      <motion.div
        className={`oauth-glass-toast oauth-glass-toast--${tone === 'error' ? 'error' : 'success'}`}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ maxWidth: 420, textAlign: 'center' }}
      >
        {tone === 'info' ? <span className="oauth-glass-btn__spinner" aria-hidden /> : null}
        <p style={{ margin: '0.75rem 0 0' }}>{message}</p>
        {tone === 'error' ? (
          <button
            type="button"
            className="oauth-glass-btn oauth-glass-btn--github"
            style={{ marginTop: '1rem' }}
            onClick={() => navigate(SAAS_ROUTES.authLogin, { replace: true })}
          >
            Back to sign in
          </button>
        ) : null}
      </motion.div>
    </div>
  )
}
