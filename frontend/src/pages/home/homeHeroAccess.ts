import { isPlatformOwnerUser, type CurrentUser } from '../../lib/auth'
import { syncTrialExpiry, requiresUpgradeToPaid } from '../../lib/onboarding/planSubscriptionFlow'
import { readWorkspaceState, trialDaysRemaining } from '../../lib/onboarding/workspaceState'

export type HomeHeroAccessMode = 'start' | 'trial'

/** Subscribed / trialing / platform-owner users see Start; guests and setup users see trial CTA. */
export function resolveHomeHeroAccessMode(user: CurrentUser | null): HomeHeroAccessMode {
  if (!user) return 'trial'
  if (isPlatformOwnerUser(user)) return 'start'
  if (requiresUpgradeToPaid(user.email)) return 'trial'
  const ws = syncTrialExpiry(user.email) ?? readWorkspaceState(user.email)
  if (!ws) return 'trial'
  if (ws.workspaceReady && ws.lifecycle !== 'expired') return 'start'
  if (ws.lifecycle === 'active') return 'start'
  if (ws.lifecycle === 'trialing') {
    const days = trialDaysRemaining(ws)
    return days === null || days > 0 ? 'start' : 'trial'
  }
  return 'trial'
}
