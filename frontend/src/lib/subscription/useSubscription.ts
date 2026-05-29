import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../state/auth'
import { readWorkspaceState, trialDaysRemaining } from '../onboarding/workspaceState'
import { apiBillingMe, isBillingApiConfigured } from './subscriptionApi'
import type { BillingSubscription, BillingUsage, SubscriptionDisplayStatus } from './subscriptionTypes'
import { DISPLAY_STATUS_LABELS } from './subscriptionTypes'

export function useSubscription() {
  const { user } = useAuth()
  const [subscription, setSubscription] = useState<BillingSubscription | null>(null)
  const [usage, setUsage] = useState<BillingUsage | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!user) {
      setSubscription(null)
      setUsage(null)
      setLoading(false)
      return
    }
    setLoading(true)
    if (isBillingApiConfigured()) {
      const result = await apiBillingMe()
      if (result.ok) {
        setSubscription(result.subscription)
        setUsage(result.usage)
        setLoading(false)
        return
      }
    }
    const ws = readWorkspaceState(user.email)
    const days = trialDaysRemaining(ws)
    const display: SubscriptionDisplayStatus =
      ws?.lifecycle === 'trialing' && days !== null && days > 0
        ? 'trialing'
        : ws?.lifecycle === 'expired'
          ? 'trial_expired'
          : ws?.subscriptionPlan === 'pro'
            ? 'pro'
            : ws?.subscriptionPlan === 'enterprise'
              ? 'enterprise'
              : 'active'
    setSubscription({
      user_id: String(user.id),
      plan: ws?.subscriptionPlan ?? 'free',
      status: ws?.lifecycle === 'trialing' ? 'trialing' : 'active',
      display_status: display,
      trial_days_remaining: days,
      trial_started_at: ws?.trialStartedAt ?? null,
      trial_ends_at: ws?.trialEndsAt ?? null,
      billing_plan_id: ws?.billingPlanId ?? null,
      limits: {},
      billing_provider: null,
      current_period_end: ws?.subscriptionExpiresAt ?? null,
      can_use_paid_features:
        display === 'trialing' || display === 'pro' || display === 'enterprise',
    })
    setUsage({ ai_queries: 0, grounding_calls: 0, exports: 0 })
    setLoading(false)
  }, [user])

  useEffect(() => {
    void refresh()
    const onWs = () => void refresh()
    window.addEventListener('geosyntra-workspace-change', onWs)
    return () => window.removeEventListener('geosyntra-workspace-change', onWs)
  }, [refresh])

  const displayStatus = subscription?.display_status ?? 'active'
  const statusLabel = DISPLAY_STATUS_LABELS[displayStatus] ?? displayStatus

  return {
    subscription,
    usage,
    loading,
    refresh,
    displayStatus,
    statusLabel,
    trialDaysLeft: subscription?.trial_days_remaining ?? null,
    canUsePaidFeatures: subscription?.can_use_paid_features ?? false,
    isTrialExpired: displayStatus === 'trial_expired',
    isPaymentPending: displayStatus === 'payment_pending',
    isPro: displayStatus === 'pro' || subscription?.plan === 'pro',
    isEnterprise: displayStatus === 'enterprise' || subscription?.plan === 'enterprise',
  }
}
