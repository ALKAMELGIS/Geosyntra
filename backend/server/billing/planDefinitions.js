/**
 * GeoAI subscription tiers — source of truth for middleware and /api/billing/me.
 */

export const SUBSCRIPTION_PLANS = ['free', 'pro', 'enterprise']

/** Feature slugs checked by checkPlan(feature). */
export const GEO_FEATURES = {
  MAP_VIEW: 'MAP_VIEW',
  POI_SEARCH_BASIC: 'POI_SEARCH_BASIC',
  POI_SEARCH: 'POI_SEARCH',
  AI_QUERY: 'AI_QUERY',
  AOI_ANALYSIS: 'AOI_ANALYSIS',
  LAYER_COMPARE: 'LAYER_COMPARE',
  VOICE_AI: 'VOICE_AI',
  EXPORT: 'EXPORT',
  API_ACCESS: 'API_ACCESS',
  TEAM_WORKSPACE: 'TEAM_WORKSPACE',
  CUSTOM_DATASETS: 'CUSTOM_DATASETS',
  ADVANCED_ANALYTICS: 'ADVANCED_ANALYTICS',
}

const FREE_FEATURES = [
  GEO_FEATURES.MAP_VIEW,
  GEO_FEATURES.POI_SEARCH_BASIC,
  GEO_FEATURES.AI_QUERY,
]

const PRO_FEATURES = [
  ...FREE_FEATURES,
  GEO_FEATURES.POI_SEARCH,
  GEO_FEATURES.AOI_ANALYSIS,
  GEO_FEATURES.LAYER_COMPARE,
  GEO_FEATURES.VOICE_AI,
  GEO_FEATURES.EXPORT,
]

export const PLAN_FEATURE_RULES = {
  free: FREE_FEATURES,
  pro: PRO_FEATURES,
  enterprise: ['ALL'],
}

export const PLAN_LIMITS = {
  free: {
    ai_queries_per_day: 10,
    aoi_analysis: false,
    voice_ai: false,
    layer_compare: false,
    export: false,
    poi_search: 'basic',
    storage_gb: 0.5,
  },
  pro: {
    ai_queries_per_day: 9999,
    aoi_analysis: true,
    voice_ai: true,
    layer_compare: true,
    export: true,
    poi_search: 'unlimited',
    storage_gb: 5,
  },
  enterprise: {
    ai_queries_per_day: 999999,
    aoi_analysis: true,
    voice_ai: true,
    layer_compare: true,
    export: true,
    poi_search: 'unlimited',
    storage_gb: 512,
    api_access: true,
    team_workspace: true,
    custom_datasets: true,
    advanced_analytics: true,
  },
}

export function normalizePlanId(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase()
  if (raw === 'pro' || raw === 'trial_pro') return 'pro'
  if (raw === 'enterprise' || raw === 'ent') return 'enterprise'
  return 'free'
}

export function planAllowsFeature(plan, feature) {
  const p = normalizePlanId(plan)
  if (p === 'enterprise') return true
  const rules = PLAN_FEATURE_RULES[p] || PLAN_FEATURE_RULES.free
  return rules.includes('ALL') || rules.includes(feature)
}

export function limitsForPlan(plan) {
  const p = normalizePlanId(plan)
  return { ...(PLAN_LIMITS[p] || PLAN_LIMITS.free) }
}

export function subscriptionPayload(plan, status = 'active', extras = {}) {
  const p = normalizePlanId(plan)
  return {
    plan: p,
    status,
    limits: limitsForPlan(p),
    billing_provider: extras.billing_provider ?? null,
    stripe_customer_id: extras.stripe_customer_id ?? null,
    stripe_subscription_id: extras.stripe_subscription_id ?? null,
    current_period_end: extras.current_period_end ?? null,
  }
}
