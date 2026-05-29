import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { apiResetPassword, isAuthApiConfigured } from '../../../lib/onboarding/authApi'
import { resetLocalPassword } from '../../../lib/onboarding/localAuthRecovery'
import { redirectToHomeWizard } from '../../../lib/homeWizardEntry'
import { SaasButton } from '../../../components/saas/SaasEntryShell'
import '../../home/home-onboarding.css'

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
}

export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = String(params.get('token') || '').trim()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    setError('')
    if (!token) {
      setError('Missing reset token. Request a new password reset from the sign-in screen.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    try {
      const result = isAuthApiConfigured()
        ? await apiResetPassword(token, password)
        : await resetLocalPassword(token, password, readAdminUsers, writeAdminUsers)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setDone(true)
    } finally {
      setBusy(false)
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
        {done ? (
          <>
            <motion.span className="home-verify-email__check" aria-hidden>
              ✓
            </motion.span>
            <h1>Password updated</h1>
            <p>Your password was reset successfully. Sign in with your new password.</p>
            <SaasButton size="lg" variant="primary" onClick={() => redirectToHomeWizard({ authMode: 'signin' })}>
              Back to sign in
            </SaasButton>
          </>
        ) : (
          <>
            <h1>Choose a new password</h1>
            <p>Enter a new password for your GeoSyntra account (at least 8 characters).</p>
            {!token ? <p className="home-wizard-form__error">This reset link is incomplete. Request a new one from sign in.</p> : null}
            <label className="home-wizard-form__label" htmlFor="reset-password">
              New password
            </label>
            <input
              id="reset-password"
              className="home-wizard-form__input"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={busy || !token}
            />
            <label className="home-wizard-form__label" htmlFor="reset-password-confirm">
              Confirm password
            </label>
            <input
              id="reset-password-confirm"
              className="home-wizard-form__input"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              disabled={busy || !token}
            />
            {error ? <p className="home-wizard-form__error">{error}</p> : null}
            <SaasButton size="lg" variant="primary" disabled={busy || !token} onClick={() => void submit()}>
              {busy ? 'Updating…' : 'Update password'}
            </SaasButton>
            <SaasButton size="md" variant="ghost" onClick={() => redirectToHomeWizard({ authMode: 'signin' })}>
              Back to sign in
            </SaasButton>
          </>
        )}
      </motion.div>
    </div>
  )
}
