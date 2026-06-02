import type { GeoAiAgentIntentType } from '../geoAiAgentIntent'
import type { SubscriptionPlanId } from '../geoEnterpriseUserModel'
import {
  buildUpgradeMessage,
  CLIENT_PLAN_LIMITS,
  featureForGeoAiIntent,
  planAllowsFeature,
  type GeoSubscriptionFeature,
} from './planFeatures'
import type { BillingUsage } from './subscriptionApi'

export function canUseSubscriptionFeature(
  plan: SubscriptionPlanId,
  usage: BillingUsage,
  feature: GeoSubscriptionFeature,
): boolean {
  if (!planAllowsFeature(plan, feature)) return false
  if (feature === 'AI_QUERY' && plan === 'free') {
    return usage.ai_queries < CLIENT_PLAN_LIMITS.free.ai_queries_per_day
  }
  return true
}

export function checkGeoAiSubscriptionAccess(
  plan: SubscriptionPlanId,
  usage: BillingUsage,
  intent: GeoAiAgentIntentType,
  opts?: { voice?: boolean },
): { allowed: true } | { allowed: false; message: string; messageAr?: string } {
  if (opts?.voice && !canUseSubscriptionFeature(plan, usage, 'VOICE_AI')) {
    const block = buildUpgradeMessage('VOICE_AI')
    return { allowed: false, message: block.message, messageAr: block.messageAr }
  }

  const feature = featureForGeoAiIntent(intent)
  if (!feature) {
    if ((intent === 'general' || intent === 'rs_toolbox') && !canUseSubscriptionFeature(plan, usage, 'AI_QUERY')) {
      const block = buildUpgradeMessage('AI_QUERY')
      return { allowed: false, message: block.message, messageAr: block.messageAr }
    }
    return { allowed: true }
  }

  if (!canUseSubscriptionFeature(plan, usage, feature)) {
    const block = buildUpgradeMessage(feature)
    return { allowed: false, message: block.message, messageAr: block.messageAr }
  }

  return { allowed: true }
}
