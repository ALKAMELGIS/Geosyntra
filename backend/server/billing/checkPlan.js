import { verifyAccessToken } from '../rbac/jwt.js'
import { GEO_FEATURES, planAllowsFeature, subscriptionPayload } from './planDefinitions.js'

/**
 * Attach req.subscription + req.usage from subscription store.
 */
export function attachSubscription(getSubscriptionStore) {
  return (req, res, next) => {
    try {
      const store = getSubscriptionStore()
      const user = req.authUser
      if (!user) {
        req.subscription = { plan: 'free', status: 'active', limits: store.getSubscriptionForUser({}).limits }
        req.usage = { ai_queries: 0, grounding_calls: 0, exports: 0 }
        return next()
      }
      req.subscription = store.getSubscriptionForUser(user)
      req.usage = store.getUsage(user.id)
      return next()
    } catch (err) {
      console.error('[billing] attachSubscription', err)
      return res.status(500).json({ ok: false, error: 'subscription_error' })
    }
  }
}

/**
 * @param {string} feature — GEO_FEATURES value
 * @param {{ incrementUsage?: 'ai_queries' | 'grounding_calls' | 'exports' }} [opts]
 */
export function checkPlan(feature, opts = {}) {
  return (req, res, next) => {
    const sub = req.subscription
    if (!sub) {
      return res.status(500).json({ ok: false, error: 'subscription_not_loaded' })
    }
    const display = sub.display_status || sub.status
    const plan = sub.plan || 'free'
    const needsUpgrade = !planAllowsFeature('free', feature) && !planAllowsFeature(plan, feature)

    if (display === 'trial_expired' && needsUpgrade) {
      return res.status(403).json({
        ok: false,
        error: 'trial_expired',
        message: 'Your free trial has ended. Upgrade to Pro to restore paid features.',
        plan,
        display_status: display,
        requiredFeature: feature,
        upgradeUrl: '/#/home?wizard=pricing&upgrade=1',
      })
    }
    if (display === 'payment_pending' && needsUpgrade) {
      return res.status(403).json({
        ok: false,
        error: 'payment_pending',
        message: 'Payment is pending confirmation. Pro features unlock after your payment is verified.',
        plan,
        display_status: display,
        requiredFeature: feature,
      })
    }
    if (
      sub.status &&
      sub.status !== 'active' &&
      sub.status !== 'trialing' &&
      needsUpgrade
    ) {
      return res.status(403).json({
        ok: false,
        error: 'subscription_inactive',
        message: 'Your subscription is not active. Renew or upgrade to continue.',
        plan,
        display_status: display,
        requiredFeature: feature,
      })
    }
    if (!planAllowsFeature(plan, feature)) {
      return res.status(403).json({
        ok: false,
        error: 'upgrade_required',
        message: 'Upgrade required to access this feature.',
        plan,
        requiredFeature: feature,
        upgradeUrl: '/#/home?wizard=pricing&upgrade=1',
      })
    }

    if (feature === GEO_FEATURES.AI_QUERY && plan === 'free') {
      const limit = sub.limits?.ai_queries_per_day ?? 10
      const used = req.usage?.ai_queries ?? 0
      if (used >= limit) {
        return res.status(403).json({
          ok: false,
          error: 'quota_exceeded',
          message: `Daily AI query limit reached (${limit}/day). Upgrade to Pro for unlimited GeoAI.`,
          plan,
          requiredFeature: feature,
          usage: { ai_queries: used, limit },
        })
      }
    }

    if (opts.incrementUsage && req.authUser?.id) {
      try {
        const store = req.subscriptionStore
        if (store?.incrementUsage) {
          req.usage = store.incrementUsage(req.authUser.id, opts.incrementUsage)
        }
      } catch (e) {
        console.warn('[billing] incrementUsage failed', e)
      }
    }

    next()
  }
}

/**
 * Authenticate when Bearer token present; otherwise treat as anonymous Free tier.
 */
export function optionalAuthOrFree(getStore, getSubscriptionStore) {
  return (req, res, next) => {
    const header = String(req.headers.authorization || '')
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
    if (!token) {
      req.subscription = subscriptionPayload('free')
      req.usage = { ai_queries: 0, grounding_calls: 0, exports: 0 }
      req.subscriptionStore = getSubscriptionStore()
      return next()
    }
    const verified = verifyAccessToken(token)
    if (!verified.ok) {
      return res.status(401).json({ ok: false, error: verified.error || 'invalid_token' })
    }
    const userId = Number(verified.payload.sub)
    const user = getStore().getUserById?.(userId)
    if (!user) {
      return res.status(401).json({ ok: false, error: 'user_not_found' })
    }
    req.authUser = user
    const store = getSubscriptionStore()
    req.subscriptionStore = store
    req.subscription = store.getSubscriptionForUser(user)
    req.usage = store.getUsage(userId)
    next()
  }
}

export function checkPlanForGroundingTool(req, res, next) {
  const tool = String(req.body?.tool || '').trim()
  const feature =
    tool === 'geocode' || tool === 'elevation'
      ? GEO_FEATURES.POI_SEARCH_BASIC
      : GEO_FEATURES.POI_SEARCH
  return checkPlan(feature, { incrementUsage: 'grounding_calls' })(req, res, next)
}

export { GEO_FEATURES }
