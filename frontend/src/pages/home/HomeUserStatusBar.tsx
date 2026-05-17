import { useEffect, useState } from 'react'
import { useAuth } from '../../state/auth'
import { displayFirstName, displayHeaderName } from '../../lib/onboarding/localAuth'
import { readWorkspaceState, trialDaysRemaining } from '../../lib/onboarding/workspaceState'
import { SUBSCRIPTION_PLAN_LABELS } from '../../lib/geoEnterpriseUserModel'
import { accountProfileInitials } from '../../lib/account/geosyntraAccountProfile'
import { useHomeOnboarding } from './onboarding/HomeOnboardingContext'
import { HomeProfileSheet } from './profile/HomeProfileSheet'
import { useGeosyntraAccountProfile } from './profile/useGeosyntraAccountProfile'
import './profile/home-profile.css'

function trialPlanLabel(days: number | null | undefined): string {
  if (days == null) return 'Free Trial'
  return `Free Trial · ${days} day${days === 1 ? '' : 's'}`
}

export function HomeUserStatusBar() {
  const { user } = useAuth()
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
  if (!user) return null

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

  if (!ws && !workspaceReady) {
    return (
      <>
        <div className="home-user-status" role="region" aria-label="Account status">
          <div className="home-user-status__card home-user-status__card--setup">
            {identity}
            <div className="home-user-status__rail" aria-hidden />
            <div className="home-user-status__actions">
              <span className="home-user-status__plan home-user-status__plan--setup">Setup in progress</span>
              <button
                type="button"
                className="home-user-status__cta"
                onClick={() => openWizard({ step: 'pricing' })}
              >
                Continue
                <i className="fa-solid fa-arrow-right home-user-status__cta-icon" aria-hidden />
              </button>
            </div>
          </div>
        </div>
        <HomeProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)} />
      </>
    )
  }

  return (
    <>
      <div className="home-user-status" role="region" aria-label="Account status">
        <div className="home-user-status__card">
          {identity}
          <div className="home-user-status__rail" aria-hidden />
          <div className="home-user-status__actions">
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
          </div>
        </div>
      </div>
      <HomeProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)} />
    </>
  )
}
