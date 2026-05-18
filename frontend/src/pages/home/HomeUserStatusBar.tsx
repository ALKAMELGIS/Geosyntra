import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../state/auth'
import { displayFirstName, displayHeaderName } from '../../lib/onboarding/localAuth'
import { readWorkspaceState, trialDaysRemaining } from '../../lib/onboarding/workspaceState'
import { SUBSCRIPTION_PLAN_LABELS } from '../../lib/geoEnterpriseUserModel'
import { accountProfileInitials } from '../../lib/account/geosyntraAccountProfile'
import { homeWizardSearch } from '../../lib/homeWizardEntry'
import { SAAS_ROUTES } from '../../lib/saasRoutes'
import { useHomeOnboarding } from './onboarding/HomeOnboardingContext'
import { useGeosyntraAccountProfile } from './profile/useGeosyntraAccountProfile'
import './profile/home-profile.css'

function trialPlanLabel(days: number | null | undefined): string {
  if (days == null) return 'Free Trial'
  return `Free Trial · ${days} day${days === 1 ? '' : 's'}`
}

function AccountPanel({
  children,
  variant = 'default',
}: {
  children: ReactNode
  variant?: 'default' | 'setup' | 'guest'
}) {
  return (
    <div className="home-user-status home-user-status--panel" role="region" aria-label="Account menu">
      <div className="home-user-status__glow" aria-hidden />
      <div
        className={`home-user-status__card home-user-status__card--glass${variant === 'setup' ? ' home-user-status__card--setup' : ''}${variant === 'guest' ? ' home-user-status__card--guest' : ''}`}
      >
        {children}
      </div>
    </div>
  )
}

function NavAuthTrigger({
  state,
  menuOpen,
  onToggle,
  avatarUrl,
  initials,
  displayName,
}: {
  state: 'guest' | 'signed-in'
  menuOpen: boolean
  onToggle: () => void
  avatarUrl?: string
  initials?: string
  displayName?: string
}) {
  const isGuest = state === 'guest'
  const ariaLabel = isGuest
    ? menuOpen
      ? 'Close sign-in menu'
      : 'Sign in to GeoSyntra'
    : menuOpen
      ? 'Close account menu'
      : `Account menu for ${displayName ?? 'your account'}`

  return (
    <button
      type="button"
      className={
        'home-nav-auth__trigger' +
        (isGuest ? ' home-nav-auth__trigger--guest' : ' home-nav-auth__trigger--signed-in') +
        (menuOpen ? ' home-nav-auth__trigger--open' : '')
      }
      data-auth-state={state}
      aria-label={ariaLabel}
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      onClick={onToggle}
    >
      <span className="home-nav-auth__portrait" aria-hidden>
        {avatarUrl ? (
          <img className="home-nav-auth__portrait-img" src={avatarUrl} alt="" />
        ) : isGuest ? (
          <i className="fa-regular fa-user home-nav-auth__portrait-icon" aria-hidden />
        ) : (
          <span className="home-nav-auth__portrait-initials">{initials}</span>
        )}
        {!isGuest ? <span className="home-nav-auth__live" title="Signed in" /> : null}
      </span>
      {isGuest ? <span className="home-nav-auth__label">Sign in</span> : null}
      <i className="fa-solid fa-chevron-down home-nav-auth__chevron" aria-hidden />
    </button>
  )
}

export function HomeUserStatusBar() {
  const navigate = useNavigate()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const { user, logout } = useAuth()
  const { openWizard, enterWorkspace, workspaceReady, trialDaysLeft, refreshWorkspace } = useHomeOnboarding()
  const [tick, setTick] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
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

  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc, true)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const toggleMenu = () => setMenuOpen(v => !v)

  const openSignIn = () => {
    setMenuOpen(false)
    navigate({ pathname: SAAS_ROUTES.home, search: homeWizardSearch({ wizard: 'auth', authMode: 'signin' }) })
  }

  const openSignUp = () => {
    setMenuOpen(false)
    navigate({ pathname: SAAS_ROUTES.home, search: homeWizardSearch({ wizard: 'auth', authMode: 'signup' }) })
  }

  const onSignOut = () => {
    setMenuOpen(false)
    logout()
    navigate({ pathname: SAAS_ROUTES.home, search: homeWizardSearch({ wizard: 'auth', authMode: 'signin' }) })
  }

  if (!user) {
    return (
      <div ref={rootRef} className="home-user-toolbar home-user-toolbar--nav-auth">
        <div className="home-user-toolbar__rail" role="group" aria-label="Account">
          <NavAuthTrigger state="guest" menuOpen={menuOpen} onToggle={toggleMenu} />
        </div>
        {menuOpen ? (
          <div className="home-user-toolbar__dropdown">
            <AccountPanel variant="guest">
              <div className="home-user-status__auth-panel">
                <p className="home-user-status__auth-eyebrow">Workspace access</p>
                <p className="home-user-status__auth-lede">Sign in or create an account to unlock spatial intelligence tools.</p>
                <div className="home-user-status__auth-actions">
                  <button
                    type="button"
                    className="home-user-status__auth-btn home-user-status__auth-btn--sign-in"
                    onClick={openSignIn}
                  >
                    <i className="fa-regular fa-right-to-bracket home-user-status__auth-btn-icon" aria-hidden />
                    <span className="home-user-status__auth-btn-label">Sign in</span>
                  </button>
                  <button
                    type="button"
                    className="home-user-status__auth-btn home-user-status__auth-btn--register"
                    onClick={openSignUp}
                  >
                    <i className="fa-regular fa-user-plus home-user-status__auth-btn-icon" aria-hidden />
                    <span className="home-user-status__auth-btn-label">Create account</span>
                  </button>
                </div>
              </div>
            </AccountPanel>
          </div>
        ) : null}
      </div>
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
    setMenuOpen(false)
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
    <div ref={rootRef} className="home-user-toolbar home-user-toolbar--nav-auth">
      <div className="home-user-toolbar__rail" role="group" aria-label="Account">
        <NavAuthTrigger
          state="signed-in"
          menuOpen={menuOpen}
          onToggle={toggleMenu}
          avatarUrl={avatarUrl}
          initials={initials}
          displayName={displayName}
        />
      </div>

      {menuOpen ? (
        <div className="home-user-toolbar__dropdown">
          <AccountPanel variant={variant}>
            <button
              type="button"
              className="home-user-status__identity"
              onClick={() => {
                setMenuOpen(false)
                navigate(SAAS_ROUTES.accountProfile)
              }}
              title="Open full profile"
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
            <div className="home-user-status__rail" aria-hidden />
            <div className="home-user-status__actions">{actions}</div>
            <div className="home-user-status__footer">
              <button type="button" className="home-user-status__signout" onClick={onSignOut}>
                Sign Out
              </button>
            </div>
          </AccountPanel>
        </div>
      ) : null}
    </div>
  )
}
