import { createAuthMiddleware } from '../rbac/middleware.js'
import { attachSubscription, checkPlan, GEO_FEATURES } from './checkPlan.js'
import { createSubscriptionStore } from './subscriptionStore.js'
import { DEFAULT_TRIAL_DAYS, displayStatus } from './subscriptionLifecycle.js'
import { normalizePlanId, PLAN_LIMITS } from './planDefinitions.js'

const BILLING_PLAN_MAP = {
  trial: 'free',
  pro: 'pro',
  enterprise: 'enterprise',
}

const PRO_AMOUNT_CENTS = Number(process.env.BILLING_PRO_AMOUNT_CENTS || 10000)
const MERCHANT_ACCOUNT_ID = String(process.env.BILLING_MERCHANT_ACCOUNT_ID || 'geosyntra_platform').trim()
const MERCHANT_LABEL = String(process.env.BILLING_MERCHANT_LABEL || 'GeoSyntra Platform').trim()

async function stripeCreateCheckoutSession({ secretKey, priceId, customerEmail, successUrl, cancelUrl, metadata }) {
  const body = new URLSearchParams()
  body.set('mode', 'subscription')
  body.set('success_url', successUrl)
  body.set('cancel_url', cancelUrl)
  if (customerEmail) body.set('customer_email', customerEmail)
  body.append('line_items[0][price]', priceId)
  body.append('line_items[0][quantity]', '1')
  body.set('payment_method_types[0]', 'card')
  body.append('payment_method_types[]', 'paypal')
  if (metadata?.merchant_account_id) {
    body.set('metadata[merchant_account_id]', String(metadata.merchant_account_id))
  }

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data?.error?.message || 'stripe_checkout_failed')
  }
  return data
}

async function stripeCreatePaymentIntent({ secretKey, amountCents, customerEmail, metadata }) {
  const body = new URLSearchParams()
  body.set('amount', String(amountCents))
  body.set('currency', 'usd')
  body.set('automatic_payment_methods[enabled]', 'true')
  if (customerEmail) body.set('receipt_email', customerEmail)
  const mergedMeta = { merchant_account_id: MERCHANT_ACCOUNT_ID, ...(metadata || {}) }
  for (const [k, v] of Object.entries(mergedMeta)) {
    body.set(`metadata[${k}]`, String(v))
  }

  const res = await fetch('https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data?.error?.message || 'stripe_payment_intent_failed')
  }
  return data
}

function billingUrls(deps) {
  const origin = String(deps.appOrigin || 'http://localhost:5173').replace(/\/+$/, '')
  const base = String(deps.appBasePath || '/').replace(/\/?$/, '/')
  const home = `${origin}${base === '/' ? '' : base}`
  return {
    home,
    successUrl: `${home}#/home?start=1&wizard=pricing&checkout=success&plan=pro`,
    cancelUrl: `${home}#/home?start=1&wizard=pricing&checkout=cancel`,
  }
}

function serializeSubscription(sub, usage, userId) {
  return {
    user_id: String(userId),
    plan: sub.plan,
    status: sub.status,
    display_status: sub.display_status || displayStatus(sub),
    trial_days_remaining: sub.trial_days_remaining ?? null,
    trial_started_at: sub.trial_started_at ?? null,
    trial_ends_at: sub.trial_ends_at ?? null,
    billing_plan_id: sub.billing_plan_id ?? null,
    limits: sub.limits,
    billing_provider: sub.billing_provider,
    current_period_end: sub.current_period_end,
    can_use_paid_features: Boolean(sub.can_use_paid_features),
    usage,
  }
}

/**
 * @param {import('express').Express} app
 * @param {{
 *   store: ReturnType<import('../authDirectoryStore.js').createAuthDirectoryStore>
 *   sqlitePath?: string
 *   appOrigin: string
 *   appBasePath: string
 * }} deps
 */
export function registerBillingRoutes(app, deps) {
  const subscriptionStore = createSubscriptionStore(deps.platformDb ?? deps.sqlitePath)
  const requireAuth = createAuthMiddleware(() => deps.store)
  const loadSub = attachSubscription(() => subscriptionStore)

  const injectStore = (req, _res, next) => {
    req.subscriptionStore = subscriptionStore
    next()
  }

  app.get('/api/billing/me', requireAuth, loadSub, (req, res) => {
    res.json({
      ok: true,
      subscription: serializeSubscription(req.subscription, req.usage, req.authUser.id),
    })
  })

  app.get('/api/billing/invoices', requireAuth, injectStore, (req, res) => {
    const invoices = subscriptionStore.listInvoices(req.authUser.id)
    res.json({ ok: true, invoices })
  })

  app.get('/api/billing/plans', (_req, res) => {
    res.json({
      ok: true,
      trial_days: DEFAULT_TRIAL_DAYS,
      pro_amount_usd: PRO_AMOUNT_CENTS / 100,
      merchant: {
        account_id: MERCHANT_ACCOUNT_ID,
        label: MERCHANT_LABEL,
        stripe_configured: String(process.env.STRIPE_SECRET_KEY || '').trim().startsWith('sk_'),
      },
      plans: Object.keys(PLAN_LIMITS).map(id => ({
        id,
        limits: PLAN_LIMITS[id],
      })),
    })
  })

  app.post('/api/billing/start-trial', requireAuth, injectStore, (req, res) => {
    const days = Number(req.body?.days || DEFAULT_TRIAL_DAYS)
    const record = subscriptionStore.startTrial(req.authUser.id, 'trial', days)
    res.json({ ok: true, subscription: serializeSubscription(record, subscriptionStore.getUsage(req.authUser.id), req.authUser.id) })
  })

  app.post('/api/billing/activate', requireAuth, loadSub, injectStore, (req, res) => {
    const billingPlanId = String(req.body?.planId || req.body?.billingPlanId || 'trial').trim()
    const paymentCompleted = Boolean(req.body?.paymentCompleted)

    if (billingPlanId === 'trial') {
      const record = subscriptionStore.startTrial(req.authUser.id, 'trial')
      return res.json({
        ok: true,
        subscription: serializeSubscription(record, req.usage, req.authUser.id),
      })
    }

    if (billingPlanId === 'pro' && paymentCompleted) {
      const record = subscriptionStore.activatePaidPlan(req.authUser.id, {
        plan: 'pro',
        provider: req.body?.provider || 'mock',
      })
      return res.json({
        ok: true,
        subscription: serializeSubscription(record, req.usage, req.authUser.id),
      })
    }

    if (billingPlanId === 'enterprise') {
      const record = subscriptionStore.setSubscription(req.authUser.id, {
        plan: 'enterprise',
        status: 'active',
        billing_plan_id: 'enterprise',
        billing_provider: req.body?.provider || 'sales',
      })
      return res.json({
        ok: true,
        subscription: serializeSubscription(record, req.usage, req.authUser.id),
      })
    }

    const plan = normalizePlanId(BILLING_PLAN_MAP[billingPlanId] || billingPlanId)
    const record = subscriptionStore.setSubscription(req.authUser.id, {
      plan,
      status: paymentCompleted ? 'active' : 'payment_pending',
      billing_plan_id: billingPlanId,
      billing_provider: paymentCompleted ? req.body?.provider || 'mock' : null,
    })
    res.json({ ok: true, subscription: serializeSubscription(record, req.usage, req.authUser.id) })
  })

  app.post('/api/billing/confirm-payment', requireAuth, injectStore, (req, res) => {
    const planId = String(req.body?.planId || 'pro').trim()
    const provider = String(req.body?.provider || 'stripe').trim()
    if (planId === 'enterprise') {
      return res.status(400).json({ ok: false, error: 'use_sales_channel' })
    }
    const record = subscriptionStore.activatePaidPlan(req.authUser.id, {
      plan: 'pro',
      provider,
      externalId: req.body?.sessionId || req.body?.paymentIntentId || null,
    })
    res.json({
      ok: true,
      subscription: serializeSubscription(record, subscriptionStore.getUsage(req.authUser.id), req.authUser.id),
    })
  })

  app.post('/api/billing/bank-transfer', requireAuth, injectStore, (req, res) => {
    const planId = String(req.body?.planId || 'pro').trim()
    const record = subscriptionStore.markPaymentPending(req.authUser.id, planId, 'bank_transfer')
    subscriptionStore.recordInvoice({
      userId: req.authUser.id,
      plan: normalizePlanId(BILLING_PLAN_MAP[planId] || planId),
      amountCents: PRO_AMOUNT_CENTS,
      status: 'pending',
      provider: 'bank_transfer',
      description: 'Bank transfer — awaiting confirmation',
    })
    res.json({
      ok: true,
      subscription: serializeSubscription(record, subscriptionStore.getUsage(req.authUser.id), req.authUser.id),
      instructions: {
        reference: `GS-${req.authUser.id}-${Date.now().toString(36).slice(-6).toUpperCase()}`,
        note: 'Email finance@geosyntra.com with your transfer receipt to activate Pro.',
      },
    })
  })

  app.post(
    '/api/billing/usage/ai-query',
    requireAuth,
    loadSub,
    injectStore,
    checkPlan(GEO_FEATURES.AI_QUERY, { incrementUsage: 'ai_queries' }),
    (req, res) => {
      res.json({ ok: true, usage: req.usage })
    },
  )

  app.post(
    '/api/billing/usage/grounding',
    requireAuth,
    loadSub,
    injectStore,
    checkPlan(GEO_FEATURES.POI_SEARCH, { incrementUsage: 'grounding_calls' }),
    (req, res) => {
      res.json({ ok: true, usage: req.usage })
    },
  )

  app.post('/api/billing/payment-intent', requireAuth, async (req, res) => {
    const secretKey = String(process.env.STRIPE_SECRET_KEY || '').trim()
    const billingPlanId = String(req.body?.planId || 'pro').trim()

    if (!secretKey.startsWith('sk_')) {
      return res.status(503).json({
        ok: false,
        error: 'stripe_not_configured',
        detail: 'Set STRIPE_SECRET_KEY on the API host.',
      })
    }

    try {
      const intent = await stripeCreatePaymentIntent({
        secretKey,
        amountCents: PRO_AMOUNT_CENTS,
        customerEmail: req.authUser.email,
        metadata: { user_id: String(req.authUser.id), plan: billingPlanId },
      })
      subscriptionStore.markPaymentPending(req.authUser.id, billingPlanId, 'stripe')
      res.json({
        ok: true,
        clientSecret: intent.client_secret,
        amountCents: PRO_AMOUNT_CENTS,
      })
    } catch (err) {
      console.error('[billing] payment-intent', err)
      res.status(502).json({ ok: false, error: 'payment_intent_failed', detail: String(err.message || err) })
    }
  })

  app.post('/api/billing/create-checkout-session', requireAuth, async (req, res) => {
    const secretKey = String(process.env.STRIPE_SECRET_KEY || '').trim()
    const priceId = String(req.body?.priceId || process.env.STRIPE_PRICE_PRO_MONTHLY || '').trim()
    const billingPlanId = String(req.body?.planId || 'pro').trim()
    const plan = normalizePlanId(BILLING_PLAN_MAP[billingPlanId] || billingPlanId)

    if (!secretKey.startsWith('sk_')) {
      return res.status(503).json({
        ok: false,
        error: 'stripe_not_configured',
        detail: 'Set STRIPE_SECRET_KEY and STRIPE_PRICE_PRO_MONTHLY on the API host.',
      })
    }
    if (!priceId) {
      return res.status(400).json({ ok: false, error: 'price_id_required' })
    }

    const { successUrl, cancelUrl } = billingUrls(deps)

    try {
      const session = await stripeCreateCheckoutSession({
        secretKey,
        priceId,
        customerEmail: req.authUser.email,
        successUrl,
        cancelUrl,
        metadata: { merchant_account_id: MERCHANT_ACCOUNT_ID, plan: billingPlanId, user_id: String(req.authUser.id) },
      })
      subscriptionStore.markPaymentPending(req.authUser.id, billingPlanId, 'stripe')
      res.json({ ok: true, url: session.url, sessionId: session.id })
    } catch (err) {
      console.error('[billing] checkout', err)
      res.status(502).json({ ok: false, error: 'checkout_failed', detail: String(err.message || err) })
    }
  })

  app.post('/api/billing/webhook', async (req, res) => {
    const webhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim()
    if (!webhookSecret) {
      return res.status(503).json({ ok: false, error: 'stripe_webhook_not_configured' })
    }

    let event = req.body
    if (typeof event === 'string') {
      try {
        event = JSON.parse(event)
      } catch {
        return res.status(400).json({ ok: false, error: 'invalid_payload' })
      }
    }

    const type = event?.type
    if (type === 'checkout.session.completed') {
      const session = event.data?.object
      const email = session?.customer_details?.email || session?.customer_email
      const subId = session?.subscription
      if (email && deps.store?.getUserByEmail) {
        const user = await Promise.resolve(deps.store.getUserByEmail(email))
        if (user) {
          const periodEnd = session?.expires_at
            ? new Date(session.expires_at * 1000).toISOString()
            : null
          await Promise.resolve(
            subscriptionStore.activatePaidPlan(user.id, {
              plan: 'pro',
              provider: 'stripe',
              periodEnd,
              externalId: subId || session?.id,
            }),
          )
        }
      }
    }
    if (type === 'payment_intent.succeeded') {
      const intent = event.data?.object
      const userId = intent?.metadata?.user_id
      if (userId) {
        subscriptionStore.activatePaidPlan(userId, {
          plan: 'pro',
          provider: 'stripe',
          externalId: intent.id,
        })
      }
    }

    res.json({ ok: true, received: true })
  })

  return { subscriptionStore, requireAuth, loadSub, checkPlan, GEO_FEATURES }
}
