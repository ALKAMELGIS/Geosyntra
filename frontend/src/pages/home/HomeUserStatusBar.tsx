import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../state/auth'
import { displayFirstName, displayHeaderName } from '../../lib/onboarding/localAuth'
import { readWorkspaceState, trialDaysRemaining } from '../../lib/onboarding/workspaceState'
import { SUBSCRIPTION_PLAN_LABELS } from '../../lib/geoEnterpriseUserModel'
import { accountProfileInitials } from '../../lib/account/geosyntraAccountProfile'
import { homeWizardSearch } from '../../lib/homeWizardEntry'
import { SAAS_ROUTES } from '../../lib/saasRoutes'
import { useHomeOnboarding } from './onboarding/HomeOnboardingContext'
import { HomeProfileSheet } from './profile/HomeProfileSheet'
import { useGeosyntraAccountProfile } from './profile/useGeosyntraAccountProfile'
import './profile/home-profile.css'

function trialPlanLabel(days: number | null | undefined): string {
  if (days == null) return 'Free Trial'
  return `Free Trial · ${days} day${days === 1 ? '' : 's'}`
}

function GlassCardShell({
  children,
  variant = 'default',
}: {
  children: ReactNode
  variant?: 'default' | 'setup' | 'guest'
}) {
  return (
    <div className="home-user-status" role="region" aria-label="Account">
      <div className="home-user-status__glow" aria-hidden />
      <div
        className={`home-user-status__card home-user-status__card--glass${variant === 'setup' ? ' home-user-status__card--setup' : ''}${variant === 'guest' ? ' home-user-status__card--guest' : ''}`}
      >
        {children}
      </div>
    </div>
  )
}

export function HomeUserStatusBar() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { openWizard, enterWorkspace, workspaceReady, trialDaysLeft, refreshWorkspace } = useHomeOnboarding()
  const [tick, setTick] = useState(0)
  const [profileOpen, setProfileOpen] = useState(false)
  const { profile } = useGeosyntraAccountProfile(user?.email)

  useEffect(() => {
    const refresh = () => setTick(t => t + 1)
    window.addEventListener('storage', refresh)
    window.addEventListener('geosyntra-workspace-change', refresh)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener('geosyntra-workspace-change', refresh)
    }
  }, [])

  void tick

  const openSignIn = () => {
    navigate({ pathname: SAAS_ROUTES.home, search: homeWizardSearch({ wizard: 'auth', authMode: 'signin' }) })
  }

  const openSignUp = () => {
    navigate({ pathname: SAAS_ROUTES.home, search: homeWizardSearch({ wizard: 'auth', authMode: 'signup' }) })
  }

  const onSignOut = () => {
    logout()
    navigate({ pathname: SAAS_ROUTES.home, search: homeWizardSearch({ wizard: 'auth', authMode: 'signin' }) })
  }

  if (!user) {
    return (
      <GlassCardShell variant="guest">
        <div className="home-user-status__guest-head">
          <div className="home-user-status__avatar-ring home-user-status__avatar-ring--guest" aria-hidden>
            <div className="home-user-status__avatar home-user-status__avatar--icon">
              <i className="fa-solid fa-user" aria-hidden />
            </div>
          </div>
          <div className="home-user-status__copy">
            <span className="home-user-status__welcome">
              <span className="home-user-status__name">GeoSyntra Account</span>
            </span>
            <span className="home-user-status__meta">Sign in to access your workspace</span>
          </div>
        </div>
        <div className="home-user-status__rail" aria-hidden />
        <div className="home-user-status__auth-actions">
          <button type="button" className="home-user-status__auth-btn home-user-status__auth-btn--primary" onClick={openSignIn}>
            Sign In
          </button>
          <button type="button" className="home-user-status__auth-btn home-user-status__auth-btn--glass" onClick={openSignUp}>
            Create Account
          </button>
        </div>
      </GlassCardShell>
    )
  }

  const ws = readWorkspaceState(user.email)
  const days = trialDaysLeft ?? trialDaysRemaining(ws)
  const first = displayFirstName(user)
  const headerName = displayHeaderName(user)
  const avatarUrl = profile.avatarDataUrl
  const initials = accountProfileInitials(headerName || first || user.email)
  const displayName = headerName || first

  const openDashboard = () => {
    refreshWorkspace()
    if (workspaceReady || ws?.workspaceReady) {
      enterWorkspace()
    } else {
      openWizard({ step: 'pricing' })
    }
  }

  const metaLine =
    !ws && !workspaceReady
      ? 'Live session · finish setup'
      : ws?.lifecycle === 'trialing' && days != null
        ? `Trial active · ${days} day${days === 1 ? '' : 's'} remaining`
        : `${ws ? SUBSCRIPTION_PLAN_LABELS[ws.subscriptionPlan] : 'Pro'} · workspace ready`

  const isTrial = ws?.lifecycle === 'trialing'
  const planLabel = ws ? SUBSCRIPTION_PLAN_LABELS[ws.subscriptionPlan] : 'Pro'
  const ready = Boolean(workspaceReady || ws?.workspaceReady)
  const ctaLabel = ready ? 'Open workspace' : 'Finish setup'
  const variant = !ws && !workspaceReady ? 'setup' : 'default'

  const identity = (
    <button
      type="button"
      className="home-user-status__identity"
      onClick={() => setProfileOpen(true)}
      aria-haspopup="dialog"
      aria-expanded={profileOpen}
      title="Open account profile"
    >
      <span className="home-user-status__avatar-ring" aria-hidden>
        <span className="home-user-status__live" title="Live session" />
        {avatarUrl ? (
          <img className="home-user-status__avatar" src={avatarUrl} alt="" />
        ) : (
          <span className="home-user-status__avatar home-user-status__avatar--initials">{initials}</span>
        )}
      </span>
      <span className="home-user-status__copy">
        <span className="home-user-status__welcome">
          Welcome, <span className="home-user-status__name">{displayName}</span>
        </span>
        <span className="home-user-status__meta">{metaLine}</span>
      </span>
    </button>
  )

  const actions = !ws && !workspaceReady ? (
    <>
      <span className="home-user-status__plan home-user-status__plan--setup">Setup in progress</span>
      <button type="button" className="home-user-status__cta" onClick={() => openWizard({ step: 'pricing' })}>
        Continue
        <i className="fa-solid fa-arrow-right home-user-status__cta-icon" aria-hidden />
      </button>
    </>
  ) : (
    <>
      {isTrial ? (
        <span className="home-user-status__plan home-user-status__plan--trial">
          <i className="fa-solid fa-sparkles home-user-status__plan-icon" aria-hidden />
          {trialPlanLabel(days)}
        </span>
      ) : (
        <span className="home-user-status__plan home-user-status__plan--pro">
          <i className="fa-solid fa-layer-group home-user-status__plan-icon" aria-hidden />
          {planLabel}
        </span>
      )}
      <button type="button" className="home-user-status__cta" onClick={openDashboard}>
        {ctaLabel}
        <i className="fa-solid fa-arrow-right home-user-status__cta-icon" aria-hidden />
      </button>
    </>
  )

  return (
    <>
      <GlassCardShell variant={variant}>
        {identity}
        <div className="home-user-status__rail" aria-hidden />
        <div className="home-user-status__actions">{actions}</div>
        <div className="home-user-status__footer">
          <button type="button" className="home-user-status__signout" onClick={onSignOut}>
            Sign Out
          </button>
        </div>
      </GlassCardShell>
      <HomeProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)} />
    </>
  )
}
