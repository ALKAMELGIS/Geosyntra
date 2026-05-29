import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import type { CurrentUser } from '../../lib/auth'
import { homeOAuthSignIn, type OAuthProvider } from '../../lib/onboarding/localAuth'
import {
  isGitHubOAuthConfigured,
  isGoogleOAuthConfigured,
  isLinkedInOAuthConfigured,
  invalidateOAuthPublicConfig,
  loadOAuthPublicConfig,
  resolveOAuthPopupRedirectUri,
  type OAuthHandshakeProvider,
} from '../../lib/oauthSignIn'
import './oauth-glass.css'

export type OAuthGlassProvider = Extract<OAuthHandshakeProvider, 'google' | 'linkedin' | 'github'>

type ProviderDef = {
  id: OAuthGlassProvider
  label: string
  icon: string
  modifier: string
  disabled?: boolean
  hint?: string
}

const PROVIDERS: ProviderDef[] = [
  { id: 'google', label: 'Continue with Google', icon: 'fa-brands fa-google', modifier: 'google' },
  { id: 'linkedin', label: 'Continue with LinkedIn', icon: 'fa-brands fa-linkedin-in', modifier: 'linkedin' },
  { id: 'github', label: 'Continue with GitHub', icon: 'fa-brands fa-github', modifier: 'github' },
]

type OAuthGlassPanelProps = {
  busy?: boolean
  rememberLogin?: boolean
  onNotify?: (message: string, tone: 'error' | 'success') => void
  onSuccess?: (user: CurrentUser) => void
}

function isConfigured(id: OAuthGlassProvider): boolean {
  if (id === 'google') return isGoogleOAuthConfigured()
  if (id === 'linkedin') return isLinkedInOAuthConfigured()
  if (id === 'github') return isGitHubOAuthConfigured()
  return false
}

export function OAuthGlassPanel({ busy, rememberLogin = true, onNotify, onSuccess }: OAuthGlassPanelProps) {
  const [loadingId, setLoadingId] = useState<OAuthGlassProvider | null>(null)
  const [oauthReady, setOauthReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      await loadOAuthPublicConfig()
      if (!cancelled) setOauthReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const visible = useMemo(
    () => (oauthReady ? PROVIDERS.filter(p => isConfigured(p.id)) : []),
    [oauthReady],
  )

  const start = async (provider: OAuthGlassProvider) => {
    if (!isConfigured(provider)) {
      onNotify?.(`${provider} sign-in is not configured on the server yet.`, 'error')
      return
    }
    setLoadingId(provider)
    try {
      void rememberLogin
      invalidateOAuthPublicConfig()
      await loadOAuthPublicConfig()
      const result = await homeOAuthSignIn(provider as OAuthProvider)
      if (result.ok && 'user' in result && result.user) {
        onSuccess?.(result.user)
        return
      }
      if (result.error) {
        const redirect = resolveOAuthPopupRedirectUri(provider as OAuthProvider)
        const hint =
          provider === 'google'
            ? ` Register redirect URI and JavaScript origin in Google Cloud (Credentials → your OAuth client): ${redirect} and http://localhost:5173`
            : provider === 'linkedin'
              ? ` Register the same redirect URL in LinkedIn Developer → Auth: ${redirect}`
              : ''
        onNotify?.(`${result.error}${hint}`, 'error')
      }
    } catch {
      onNotify?.('Could not start sign-in. Check your network connection.', 'error')
    } finally {
      setLoadingId(null)
    }
  }

  return (
    <div className="oauth-glass-panel oauth-glass-panel--icons" role="group" aria-label="Social sign-in">
      {visible.map((p, index) => {
        const configured = isConfigured(p.id)
        const loading = busy || loadingId === p.id
        return (
          <motion.button
            key={p.id}
            type="button"
            className={`oauth-glass-icon oauth-glass-icon--${p.modifier}`}
            disabled={loading || p.disabled || !configured}
            aria-label={p.label}
            title={p.hint || (configured ? p.label : `${p.label} — not configured`)}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05, duration: 0.28 }}
            whileHover={loading ? undefined : { y: -2, scale: 1.04 }}
            whileTap={loading ? undefined : { scale: 0.96 }}
            onClick={() => void start(p.id)}
          >
            {loading ? (
              <span className="oauth-glass-icon__spinner" aria-hidden />
            ) : (
              <i className={p.icon} aria-hidden />
            )}
          </motion.button>
        )
      })}
    </div>
  )
}
