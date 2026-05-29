import type { GeoAiAgentIntentType } from '../geoAiAgentIntent'
import type { SubscriptionPlanId } from '../geoEnterpriseUserModel'

export type GeoSubscriptionFeature =
  | 'MAP_VIEW'
  | 'POI_SEARCH_BASIC'
  | 'POI_SEARCH'
  | 'AI_QUERY'
  | 'AOI_ANALYSIS'
  | 'VOICE_AI'
  | 'EXPORT'
  | 'API_ACCESS'

const FREE: GeoSubscriptionFeature[] = ['MAP_VIEW', 'POI_SEARCH_BASIC', 'AI_QUERY']
const PRO: GeoSubscriptionFeature[] = [
  ...FREE,
  'POI_SEARCH',
  'AOI_ANALYSIS',
  'VOICE_AI',
  'EXPORT',
]

export const CLIENT_PLAN_LIMITS: Record<
  SubscriptionPlanId,
  {
    ai_queries_per_day: number
    aoi_analysis: boolean
    voice_ai: boolean
    export: boolean
  }
> = {
  free: {
    ai_queries_per_day: 10,
    aoi_analysis: false,
    voice_ai: false,
    export: false,
  },
  pro: {
    ai_queries_per_day: 9999,
    aoi_analysis: true,
    voice_ai: true,
    export: true,
  },
  enterprise: {
    ai_queries_per_day: 999999,
    aoi_analysis: true,
    voice_ai: true,
    export: true,
  },
}

export function planAllowsFeature(plan: SubscriptionPlanId, feature: GeoSubscriptionFeature): boolean {
  if (plan === 'enterprise') return true
  const rules = plan === 'pro' ? PRO : FREE
  return rules.includes(feature)
}

export function featureForGeoAiIntent(intent: GeoAiAgentIntentType): GeoSubscriptionFeature | null {
  switch (intent) {
    case 'spatial_analysis':
    case 'zonal_stats':
      return 'AOI_ANALYSIS'
    case 'places_poi':
      return 'POI_SEARCH'
    case 'route':
      return 'POI_SEARCH'
    case 'map_place':
      return 'POI_SEARCH_BASIC'
    default:
      return null
  }
}

export type GeoSubscriptionBlockReason = {
  feature: GeoSubscriptionFeature
  message: string
  messageAr?: string
  upgradePlan: 'pro' | 'enterprise'
}

export function buildUpgradeMessage(feature: GeoSubscriptionFeature): GeoSubscriptionBlockReason {
  const upgradePlan = feature === 'API_ACCESS' ? 'enterprise' : 'pro'
  const messages: Record<GeoSubscriptionFeature, { en: string; ar?: string }> = {
    MAP_VIEW: { en: 'Map view is available on all plans.' },
    POI_SEARCH_BASIC: { en: 'Upgrade to Pro for extended place search.' },
    POI_SEARCH: {
      en: 'Upgrade to **Pro** for unlimited POI search, routes, and nearby places.',
      ar: 'قم بالترقية إلى **Pro** للبحث غير المحدود عن الأماكن والمسارات.',
    },
    AI_QUERY: {
      en: 'You reached the **Free** daily AI limit (10 queries). Upgrade to **Pro** for unlimited GeoAI.',
      ar: 'وصلت إلى حد الاستعلامات اليومية في الخطة المجانية. قم بالترقية إلى **Pro**.',
    },
    AOI_ANALYSIS: {
      en: 'Upgrade to **Pro** to run AOI analysis (NDVI, zonal stats, density).',
      ar: 'قم بالترقية إلى **Pro** لتشغيل تحليل AOI (NDVI، إحصاءات، كثافة).',
    },
    VOICE_AI: {
      en: 'Upgrade to **Pro** to use Voice AI (Whisper).',
      ar: 'قم بالترقية إلى **Pro** لاستخدام الصوت مع GeoAI.',
    },
    EXPORT: {
      en: 'Upgrade to **Pro** to export GeoJSON and CSV results.',
      ar: 'قم بالترقية إلى **Pro** لتصدير النتائج.',
    },
    API_ACCESS: {
      en: 'Contact sales for **Enterprise** API access and webhooks.',
      ar: 'تواصل مع المبيعات للحصول على وصول API في خطة Enterprise.',
    },
  }
  const m = messages[feature]
  return {
    feature,
    message: m.en,
    messageAr: m.ar,
    upgradePlan,
  }
}
