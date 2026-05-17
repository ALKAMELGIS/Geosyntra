import { useEffect, useState } from 'react'
import { useAuth } from '../../state/auth'
import { displayFirstName, displayHeaderName } from '../../lib/onboarding/localAuth'
import { readWorkspaceState, trialDaysRemaining } from '../../lib/onboarding/workspaceState'
import { SUBSCRIPTION_PLAN_LABELS } from '../../lib/geoEnterpriseUserModel'
import { accountProfileInitials } from '../../lib/account/geosyntraAccountProfile'
import { SaasButton } from '../../components/saas/SaasEntryShell'
import { useHomeOnboarding } from './onboarding/HomeOnboardingContext'
import { HomeProfileSheet } from './profile/HomeProfileSheet'
import { useGeosyntraAccountProfile } from './profile/useGeosyntraAccountProfile'
import './profile/home-profile.css'

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

  const openDashboard = () => {
    refreshWorkspace()
    if (workspaceReady || ws?.workspaceReady) {
      enterWorkspace()
    } else {
      openWizard({ step: 'pricing' })
    }
  }

  const profileTrigger = (
    <button
      type="button"
      className="home-user-status__profile-trigger"
      onClick={() => setProfileOpen(true)}
      aria-haspopup="dialog"
      aria-expanded={profileOpen}
      title="Open account profile"
    >
      {avatarUrl ? (
        <img className="home-user-status__avatar-mini" src={avatarUrl} alt="" />
      ) : (
        <span className="home-user-status__avatar-mini home-user-status__avatar-mini--initials" aria-hidden>
          {initials}
        </span>
      )}
      <span className="home-user-status__text">
        <span className="home-user-status__welcome">Welcome, {headerName || first}</span>
        <span className="home-user-status__meta">
          {!ws && !workspaceReady
            ? 'Live session · finish setup'
            : ws?.lifecycle === 'trialing' && days != null
              ? `Trial Active · ${days} day${days === 1 ? '' : 's'} left`
              : `${ws ? SUBSCRIPTION_PLAN_LABELS[ws.subscriptionPlan] : 'Pro'} · Workspace ready`}
        </span>
      </span>
    </button>
  )

  if (!ws && !workspaceReady) {
    return (
      <>
        <div className="home-user-status">
          <span className="home-user-status__live" title="Live session" aria-hidden />
          {profileTrigger}
          <SaasButton
            size="sm"
            variant="primary"
            className="home-user-status__enter"
            onClick={() => openWizard({ step: 'pricing' })}
          >
            Continue
          </SaasButton>
        </div>
        <HomeProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)} />
      </>
    )
  }

  const isTrial = ws?.lifecycle === 'trialing'
  const planLabel = ws ? SUBSCRIPTION_PLAN_LABELS[ws.subscriptionPlan] : 'Pro'

  return (
    <>
      <div className="home-user-status">
        <span className="home-user-status__live" title="Live session" aria-hidden />
        {profileTrigger}
        {isTrial ? (
          <span className="home-user-status__chip">Free Trial · 14 days</span>
        ) : (
          <span className="home-user-status__chip home-user-status__chip--pro">{planLabel}</span>
        )}
        <SaasButton size="sm" variant="primary" className="home-user-status__enter" onClick={openDashboard}>
          {workspaceReady || ws?.workspaceReady ? 'Open workspace' : 'Finish setup'}
        </SaasButton>
      </div>
      <HomeProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)} />
    </>
  )
}
