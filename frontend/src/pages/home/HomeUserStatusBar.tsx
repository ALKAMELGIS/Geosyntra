import { useEffect, useState } from 'react'
import { useAuth } from '../../state/auth'
import { displayFirstName, displayHeaderName } from '../../lib/onboarding/localAuth'
import { readWorkspaceState, trialDaysRemaining } from '../../lib/onboarding/workspaceState'
import { SUBSCRIPTION_PLAN_LABELS } from '../../lib/geoEnterpriseUserModel'
import { SaasButton } from '../../components/saas/SaasEntryShell'
import { useHomeOnboarding } from './onboarding/HomeOnboardingContext'

export function HomeUserStatusBar() {
  const { user } = useAuth()
  const { openWizard, enterWorkspace, workspaceReady, trialDaysLeft, refreshWorkspace } = useHomeOnboarding()
  const [tick, setTick] = useState(0)

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

  const openDashboard = () => {
    refreshWorkspace()
    if (workspaceReady || ws?.workspaceReady) {
      enterWorkspace()
    } else {
      openWizard({ step: 'identity' })
    }
  }

  if (!ws && !workspaceReady) {
    return (
      <div className="home-user-status">
        <span className="home-user-status__live" title="Live session" aria-hidden />
        <div className="home-user-status__text">
          <span className="home-user-status__welcome">Welcome, {headerName || first}</span>
          <span className="home-user-status__meta">Live session · finish setup</span>
        </div>
        <SaasButton size="sm" variant="primary" className="home-user-status__enter" onClick={() => openWizard({ step: 'identity' })}>
          Continue
        </SaasButton>
      </div>
    )
  }

  const isTrial = ws?.lifecycle === 'trialing'
  const planLabel = ws ? SUBSCRIPTION_PLAN_LABELS[ws.subscriptionPlan] : 'Pro'

  return (
    <div className="home-user-status">
      <span className="home-user-status__live" title="Live session" aria-hidden />
      <div className="home-user-status__text">
        <span className="home-user-status__welcome">Welcome, {first}</span>
        <span className="home-user-status__meta">
          {isTrial && days != null
            ? `Trial Active · ${days} day${days === 1 ? '' : 's'} left`
            : `${planLabel} · Workspace ready`}
        </span>
      </div>
      {isTrial ? (
        <span className="home-user-status__chip">Free Trial · 14 days</span>
      ) : (
        <span className="home-user-status__chip home-user-status__chip--pro">{planLabel}</span>
      )}
      <SaasButton size="sm" variant="primary" className="home-user-status__enter" onClick={openDashboard}>
        {workspaceReady || ws?.workspaceReady ? 'Open workspace' : 'Finish setup'}
      </SaasButton>
    </div>
  )
}
