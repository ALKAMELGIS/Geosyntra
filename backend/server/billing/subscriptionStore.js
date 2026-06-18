import { randomUUID } from 'crypto'
import { createRequire } from 'module'
import { limitsForPlan, normalizePlanId, subscriptionPayload } from './planDefinitions.js'
import { DEFAULT_TRIAL_DAYS, resolveSubscriptionAccess, trialEndIso } from './subscriptionLifecycle.js'

const require = createRequire(import.meta.url)

function todayUtc() {
  return new Date().toISOString().slice(0, 10)
}

function parseProfileEnterprise(profileExtra) {
  if (!profileExtra || typeof profileExtra !== 'object') return null
  const geo = profileExtra.geoEnterpriseV1
  if (!geo || typeof geo !== 'object') return null
  return geo
}

function enrichRecord(base) {
  return resolveSubscriptionAccess(base)
}

import { resolvePlatformStoreDb } from '../platformDatabase.js'
import { createSqlRunner } from '../sqlRunner.js'

/**
 * @param {string | import('../platformDatabase.js').resolvePlatformStoreDb extends Function ? Parameters<typeof import('../platformDatabase.js').resolvePlatformStoreDb>[0] : any} platformDb
 */
export function createSubscriptionStore(platformDb) {
  const resolved = resolvePlatformStoreDb(platformDb)
  if (resolved.dialect === 'postgres' && resolved.pool) {
    return createSubscriptionStoreSql(createSqlRunner(resolved))
  }
  if (resolved.dialect === 'sqlite' && resolved.sqlitePath) {
    return createSubscriptionStoreSqlite(resolved.sqlitePath)
  }
  return createMemorySubscriptionStore()
}

function createSubscriptionStoreSqlite(sqlitePath) {
  const Database = require('better-sqlite3')
  const db = new Database(sqlitePath)
  db.pragma('journal_mode = WAL')

  const getStmt = db.prepare(
    `SELECT user_id, plan, status, billing_provider, stripe_customer_id, stripe_subscription_id,
            current_period_end, limits_json, trial_started_at, trial_ends_at, billing_plan_id,
            created_at, updated_at
     FROM user_subscriptions WHERE user_id = ?`,
  )

  const upsertStmt = db.prepare(`
    INSERT INTO user_subscriptions (
      user_id, plan, status, billing_provider, stripe_customer_id, stripe_subscription_id,
      current_period_end, limits_json, trial_started_at, trial_ends_at, billing_plan_id,
      created_at, updated_at
    ) VALUES (
      @user_id, @plan, @status, @billing_provider, @stripe_customer_id, @stripe_subscription_id,
      @current_period_end, @limits_json, @trial_started_at, @trial_ends_at, @billing_plan_id,
      @created_at, @updated_at
    )
    ON CONFLICT(user_id) DO UPDATE SET
      plan = excluded.plan,
      status = excluded.status,
      billing_provider = COALESCE(excluded.billing_provider, user_subscriptions.billing_provider),
      stripe_customer_id = COALESCE(excluded.stripe_customer_id, user_subscriptions.stripe_customer_id),
      stripe_subscription_id = COALESCE(excluded.stripe_subscription_id, user_subscriptions.stripe_subscription_id),
      current_period_end = COALESCE(excluded.current_period_end, user_subscriptions.current_period_end),
      limits_json = excluded.limits_json,
      trial_started_at = COALESCE(excluded.trial_started_at, user_subscriptions.trial_started_at),
      trial_ends_at = COALESCE(excluded.trial_ends_at, user_subscriptions.trial_ends_at),
      billing_plan_id = COALESCE(excluded.billing_plan_id, user_subscriptions.billing_plan_id),
      updated_at = excluded.updated_at
  `)

  const usageGetStmt = db.prepare(
    `SELECT ai_queries, grounding_calls, exports FROM usage_daily WHERE user_id = ? AND usage_date = ?`,
  )

  const usageUpsertStmt = db.prepare(`
    INSERT INTO usage_daily (user_id, usage_date, ai_queries, grounding_calls, exports)
    VALUES (@user_id, @usage_date, @ai_queries, @grounding_calls, @exports)
    ON CONFLICT(user_id, usage_date) DO UPDATE SET
      ai_queries = excluded.ai_queries,
      grounding_calls = excluded.grounding_calls,
      exports = excluded.exports
  `)

  const invoiceInsertStmt = db.prepare(`
    INSERT INTO billing_invoices (
      id, user_id, plan, amount_cents, currency, status, provider, description,
      external_id, paid_at, period_start, period_end, created_at, updated_at
    ) VALUES (
      @id, @user_id, @plan, @amount_cents, @currency, @status, @provider, @description,
      @external_id, @paid_at, @period_start, @period_end, @created_at, @updated_at
    )
  `)

  const invoiceListStmt = db.prepare(
    `SELECT id, user_id, plan, amount_cents, currency, status, provider, description,
            external_id, paid_at, period_start, period_end, created_at, updated_at
     FROM billing_invoices WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
  )

  function rowToRecord(row) {
    if (!row) return null
    let limits = limitsForPlan(row.plan)
    if (row.limits_json) {
      try {
        limits = { ...limits, ...JSON.parse(row.limits_json) }
      } catch {
        /* keep defaults */
      }
    }
    return enrichRecord({
      userId: row.user_id,
      plan: normalizePlanId(row.plan),
      status: row.status || 'active',
      billing_provider: row.billing_provider || null,
      stripe_customer_id: row.stripe_customer_id || null,
      stripe_subscription_id: row.stripe_subscription_id || null,
      current_period_end: row.current_period_end || null,
      trial_started_at: row.trial_started_at || null,
      trial_ends_at: row.trial_ends_at || null,
      billing_plan_id: row.billing_plan_id || null,
      limits,
    })
  }

  return {
    getSubscriptionForUser(user) {
      const userId = Number(user?.id)
      if (!Number.isFinite(userId)) return enrichRecord(subscriptionPayload('free'))

      const row = getStmt.get(userId)
      if (row) return rowToRecord(row)

      const geo = parseProfileEnterprise(user.profile_extra)
      const plan = normalizePlanId(geo?.subscriptionPlan)
      return enrichRecord({
        userId,
        ...subscriptionPayload(plan, 'active'),
        limits: limitsForPlan(plan),
      })
    },

    setSubscription(userId, patch) {
      const id = Number(userId)
      if (!Number.isFinite(id)) throw new Error('invalid_user_id')
      const plan = normalizePlanId(patch.plan)
      const now = new Date().toISOString()
      const existing = getStmt.get(id)
      const limits = limitsForPlan(plan)
      upsertStmt.run({
        user_id: id,
        plan,
        status: patch.status || 'active',
        billing_provider: patch.billing_provider ?? existing?.billing_provider ?? null,
        stripe_customer_id: patch.stripe_customer_id ?? existing?.stripe_customer_id ?? null,
        stripe_subscription_id:
          patch.stripe_subscription_id ?? existing?.stripe_subscription_id ?? null,
        current_period_end: patch.current_period_end ?? existing?.current_period_end ?? null,
        trial_started_at: patch.trial_started_at ?? existing?.trial_started_at ?? null,
        trial_ends_at: patch.trial_ends_at ?? existing?.trial_ends_at ?? null,
        billing_plan_id: patch.billing_plan_id ?? existing?.billing_plan_id ?? null,
        limits_json: JSON.stringify(limits),
        created_at: existing?.created_at || now,
        updated_at: now,
      })
      return rowToRecord(getStmt.get(id))
    },

    startTrial(userId, billingPlanId = 'trial', days = DEFAULT_TRIAL_DAYS) {
      const now = new Date().toISOString()
      const ends = trialEndIso(days)
      return this.setSubscription(userId, {
        plan: 'free',
        status: 'trialing',
        billing_plan_id: billingPlanId,
        trial_started_at: now,
        trial_ends_at: ends,
        current_period_end: ends,
        billing_provider: null,
      })
    },

    activatePaidPlan(userId, { plan = 'pro', provider = 'stripe', periodEnd, externalId } = {}) {
      const normalized = normalizePlanId(plan)
      const renew = periodEnd || trialEndIso(30)
      const record = this.setSubscription(userId, {
        plan: normalized,
        status: 'active',
        billing_plan_id: normalized,
        billing_provider: provider,
        current_period_end: renew,
        trial_ends_at: null,
      })
      this.recordInvoice({
        userId,
        plan: normalized,
        amountCents: normalized === 'pro' ? 10000 : 0,
        status: 'paid',
        provider,
        description: `${normalized === 'pro' ? 'Pro' : 'Enterprise'} subscription`,
        externalId,
        paidAt: new Date().toISOString(),
        periodStart: new Date().toISOString(),
        periodEnd: renew,
      })
      return record
    },

    markPaymentPending(userId, plan = 'pro', provider = 'bank_transfer') {
      return this.setSubscription(userId, {
        plan: normalizePlanId(plan),
        status: 'payment_pending',
        billing_plan_id: plan,
        billing_provider: provider,
      })
    },

    recordInvoice({
      userId,
      plan,
      amountCents = 0,
      currency = 'USD',
      status = 'pending',
      provider = null,
      description = '',
      externalId = null,
      paidAt = null,
      periodStart = null,
      periodEnd = null,
    }) {
      const now = new Date().toISOString()
      const id = randomUUID()
      try {
        invoiceInsertStmt.run({
          id,
          user_id: Number(userId),
          plan: normalizePlanId(plan),
          amount_cents: amountCents,
          currency,
          status,
          provider,
          description,
          external_id: externalId,
          paid_at: paidAt,
          period_start: periodStart,
          period_end: periodEnd,
          created_at: now,
          updated_at: now,
        })
      } catch (e) {
        console.warn('[billing] recordInvoice skipped', e?.message)
      }
      return { id, status, amountCents, createdAt: now }
    },

    listInvoices(userId) {
      const id = Number(userId)
      try {
        return invoiceListStmt.all(id).map(row => ({
          id: row.id,
          plan: row.plan,
          amount_cents: row.amount_cents,
          currency: row.currency,
          status: row.status,
          provider: row.provider,
          description: row.description,
          external_id: row.external_id,
          paid_at: row.paid_at,
          period_start: row.period_start,
          period_end: row.period_end,
          created_at: row.created_at,
        }))
      } catch {
        return []
      }
    },

    getUsage(userId) {
      const id = Number(userId)
      const row = usageGetStmt.get(id, todayUtc())
      return {
        ai_queries: row?.ai_queries ?? 0,
        grounding_calls: row?.grounding_calls ?? 0,
        exports: row?.exports ?? 0,
      }
    },

    incrementUsage(userId, field, amount = 1) {
      const id = Number(userId)
      const date = todayUtc()
      const current = usageGetStmt.get(id, date) || { ai_queries: 0, grounding_calls: 0, exports: 0 }
      const next = {
        user_id: id,
        usage_date: date,
        ai_queries: current.ai_queries,
        grounding_calls: current.grounding_calls,
        exports: current.exports,
      }
      if (field === 'ai_queries') next.ai_queries += amount
      else if (field === 'grounding_calls') next.grounding_calls += amount
      else if (field === 'exports') next.exports += amount
      usageUpsertStmt.run(next)
      return next
    },
  }
}

function createSubscriptionStoreSql(sql) {
  function rowToRecord(row) {
    if (!row) return null
    let limits = limitsForPlan(row.plan)
    if (row.limits_json) {
      try {
        limits = { ...limits, ...JSON.parse(row.limits_json) }
      } catch {
        /* keep defaults */
      }
    }
    return enrichRecord({
      userId: row.user_id,
      plan: normalizePlanId(row.plan),
      status: row.status || 'active',
      billing_provider: row.billing_provider || null,
      stripe_customer_id: row.stripe_customer_id || null,
      stripe_subscription_id: row.stripe_subscription_id || null,
      current_period_end: row.current_period_end || null,
      trial_started_at: row.trial_started_at || null,
      trial_ends_at: row.trial_ends_at || null,
      billing_plan_id: row.billing_plan_id || null,
      limits,
    })
  }

  return {
    async getSubscriptionForUser(user) {
      const userId = Number(user?.id)
      if (!Number.isFinite(userId)) return enrichRecord(subscriptionPayload('free'))

      const row = await sql.queryOne(
        `SELECT user_id, plan, status, billing_provider, stripe_customer_id, stripe_subscription_id,
                current_period_end, limits_json, trial_started_at, trial_ends_at, billing_plan_id,
                created_at, updated_at
         FROM user_subscriptions WHERE user_id = ?`,
        [userId],
      )
      if (row) return rowToRecord(row)

      const geo = parseProfileEnterprise(user.profile_extra)
      const plan = normalizePlanId(geo?.subscriptionPlan)
      return enrichRecord({
        userId,
        ...subscriptionPayload(plan, 'active'),
        limits: limitsForPlan(plan),
      })
    },

    async setSubscription(userId, patch) {
      const id = Number(userId)
      if (!Number.isFinite(id)) throw new Error('invalid_user_id')
      const plan = normalizePlanId(patch.plan)
      const now = new Date().toISOString()
      const existing = await sql.queryOne(`SELECT * FROM user_subscriptions WHERE user_id = ?`, [id])
      const limits = limitsForPlan(plan)
      await sql.runNamed(
        `INSERT INTO user_subscriptions (
          user_id, plan, status, billing_provider, stripe_customer_id, stripe_subscription_id,
          current_period_end, limits_json, trial_started_at, trial_ends_at, billing_plan_id,
          created_at, updated_at
        ) VALUES (
          @user_id, @plan, @status, @billing_provider, @stripe_customer_id, @stripe_subscription_id,
          @current_period_end, @limits_json, @trial_started_at, @trial_ends_at, @billing_plan_id,
          @created_at, @updated_at
        )
        ON CONFLICT(user_id) DO UPDATE SET
          plan = EXCLUDED.plan,
          status = EXCLUDED.status,
          billing_provider = COALESCE(EXCLUDED.billing_provider, user_subscriptions.billing_provider),
          stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, user_subscriptions.stripe_customer_id),
          stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, user_subscriptions.stripe_subscription_id),
          current_period_end = COALESCE(EXCLUDED.current_period_end, user_subscriptions.current_period_end),
          limits_json = EXCLUDED.limits_json,
          trial_started_at = COALESCE(EXCLUDED.trial_started_at, user_subscriptions.trial_started_at),
          trial_ends_at = COALESCE(EXCLUDED.trial_ends_at, user_subscriptions.trial_ends_at),
          billing_plan_id = COALESCE(EXCLUDED.billing_plan_id, user_subscriptions.billing_plan_id),
          updated_at = EXCLUDED.updated_at`,
        {
          user_id: id,
          plan,
          status: patch.status || 'active',
          billing_provider: patch.billing_provider ?? existing?.billing_provider ?? null,
          stripe_customer_id: patch.stripe_customer_id ?? existing?.stripe_customer_id ?? null,
          stripe_subscription_id: patch.stripe_subscription_id ?? existing?.stripe_subscription_id ?? null,
          current_period_end: patch.current_period_end ?? existing?.current_period_end ?? null,
          trial_started_at: patch.trial_started_at ?? existing?.trial_started_at ?? null,
          trial_ends_at: patch.trial_ends_at ?? existing?.trial_ends_at ?? null,
          billing_plan_id: patch.billing_plan_id ?? existing?.billing_plan_id ?? null,
          limits_json: JSON.stringify(limits),
          created_at: existing?.created_at || now,
          updated_at: now,
        },
      )
      const row = await sql.queryOne(`SELECT * FROM user_subscriptions WHERE user_id = ?`, [id])
      return rowToRecord(row)
    },

    async startTrial(userId, billingPlanId = 'trial', days = DEFAULT_TRIAL_DAYS) {
      const now = new Date().toISOString()
      const ends = trialEndIso(days)
      return this.setSubscription(userId, {
        plan: 'free',
        status: 'trialing',
        billing_plan_id: billingPlanId,
        trial_started_at: now,
        trial_ends_at: ends,
        current_period_end: ends,
        billing_provider: null,
      })
    },

    async activatePaidPlan(userId, { plan = 'pro', provider = 'stripe', periodEnd, externalId } = {}) {
      const normalized = normalizePlanId(plan)
      const renew = periodEnd || trialEndIso(30)
      const record = await this.setSubscription(userId, {
        plan: normalized,
        status: 'active',
        billing_plan_id: normalized,
        billing_provider: provider,
        current_period_end: renew,
        trial_ends_at: null,
      })
      await this.recordInvoice({
        userId,
        plan: normalized,
        amountCents: normalized === 'pro' ? 10000 : 0,
        status: 'paid',
        provider,
        description: `${normalized === 'pro' ? 'Pro' : 'Enterprise'} subscription`,
        externalId,
        paidAt: new Date().toISOString(),
        periodStart: new Date().toISOString(),
        periodEnd: renew,
      })
      return record
    },

    async markPaymentPending(userId, plan = 'pro', provider = 'bank_transfer') {
      return this.setSubscription(userId, {
        plan: normalizePlanId(plan),
        status: 'payment_pending',
        billing_plan_id: plan,
        billing_provider: provider,
      })
    },

    async recordInvoice({
      userId,
      plan,
      amountCents = 0,
      currency = 'USD',
      status = 'pending',
      provider = null,
      description = '',
      externalId = null,
      paidAt = null,
      periodStart = null,
      periodEnd = null,
    }) {
      const now = new Date().toISOString()
      const id = randomUUID()
      try {
        await sql.runNamed(
          `INSERT INTO billing_invoices (
            id, user_id, plan, amount_cents, currency, status, provider, description,
            external_id, paid_at, period_start, period_end, created_at, updated_at
          ) VALUES (
            @id, @user_id, @plan, @amount_cents, @currency, @status, @provider, @description,
            @external_id, @paid_at, @period_start, @period_end, @created_at, @updated_at
          )`,
          {
            id,
            user_id: Number(userId),
            plan: normalizePlanId(plan),
            amount_cents: amountCents,
            currency,
            status,
            provider,
            description,
            external_id: externalId,
            paid_at: paidAt,
            period_start: periodStart,
            period_end: periodEnd,
            created_at: now,
            updated_at: now,
          },
        )
      } catch (e) {
        console.warn('[billing] recordInvoice skipped', e?.message)
      }
      return { id, status, amountCents, createdAt: now }
    },

    async listInvoices(userId) {
      const id = Number(userId)
      try {
        const rows = await sql.query(
          `SELECT id, user_id, plan, amount_cents, currency, status, provider, description,
                  external_id, paid_at, period_start, period_end, created_at, updated_at
           FROM billing_invoices WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
          [id],
        )
        return rows.map(row => ({
          id: row.id,
          plan: row.plan,
          amount_cents: row.amount_cents,
          currency: row.currency,
          status: row.status,
          provider: row.provider,
          description: row.description,
          external_id: row.external_id,
          paid_at: row.paid_at,
          period_start: row.period_start,
          period_end: row.period_end,
          created_at: row.created_at,
        }))
      } catch {
        return []
      }
    },

    async getUsage(userId) {
      const id = Number(userId)
      const row = await sql.queryOne(
        `SELECT ai_queries, grounding_calls, exports FROM usage_daily WHERE user_id = ? AND usage_date = ?`,
        [id, todayUtc()],
      )
      return {
        ai_queries: row?.ai_queries ?? 0,
        grounding_calls: row?.grounding_calls ?? 0,
        exports: row?.exports ?? 0,
      }
    },

    async incrementUsage(userId, field, amount = 1) {
      const id = Number(userId)
      const date = todayUtc()
      const current =
        (await sql.queryOne(
          `SELECT ai_queries, grounding_calls, exports FROM usage_daily WHERE user_id = ? AND usage_date = ?`,
          [id, date],
        )) || { ai_queries: 0, grounding_calls: 0, exports: 0 }
      const next = {
        user_id: id,
        usage_date: date,
        ai_queries: current.ai_queries,
        grounding_calls: current.grounding_calls,
        exports: current.exports,
      }
      if (field === 'ai_queries') next.ai_queries += amount
      else if (field === 'grounding_calls') next.grounding_calls += amount
      else if (field === 'exports') next.exports += amount
      await sql.runNamed(
        `INSERT INTO usage_daily (user_id, usage_date, ai_queries, grounding_calls, exports)
         VALUES (@user_id, @usage_date, @ai_queries, @grounding_calls, @exports)
         ON CONFLICT(user_id, usage_date) DO UPDATE SET
           ai_queries = EXCLUDED.ai_queries,
           grounding_calls = EXCLUDED.grounding_calls,
           exports = EXCLUDED.exports`,
        next,
      )
      return next
    },
  }
}

function createMemorySubscriptionStore() {
  const subs = new Map()
  const usage = new Map()
  const invoices = new Map()

  const api = {
    getSubscriptionForUser(user) {
      const userId = Number(user?.id)
      const geo = parseProfileEnterprise(user?.profile_extra)
      const stored = subs.get(userId)
      const plan = normalizePlanId(stored?.plan || geo?.subscriptionPlan)
      const base = stored || { userId, ...subscriptionPayload(plan, 'active'), limits: limitsForPlan(plan) }
      return enrichRecord({ ...base, userId })
    },
    setSubscription(userId, patch) {
      const plan = normalizePlanId(patch.plan)
      const rec = enrichRecord({
        userId: Number(userId),
        ...subscriptionPayload(plan, patch.status || 'active', patch),
        limits: limitsForPlan(plan),
        trial_started_at: patch.trial_started_at ?? null,
        trial_ends_at: patch.trial_ends_at ?? null,
        billing_plan_id: patch.billing_plan_id ?? null,
      })
      subs.set(Number(userId), rec)
      return rec
    },
    startTrial(userId, billingPlanId = 'trial', days = DEFAULT_TRIAL_DAYS) {
      const now = new Date().toISOString()
      return api.setSubscription(userId, {
        plan: 'free',
        status: 'trialing',
        billing_plan_id: billingPlanId,
        trial_started_at: now,
        trial_ends_at: trialEndIso(days),
        current_period_end: trialEndIso(days),
      })
    },
    activatePaidPlan(userId, opts = {}) {
      const plan = normalizePlanId(opts.plan || 'pro')
      const renew = opts.periodEnd || trialEndIso(30)
      const rec = api.setSubscription(userId, {
        plan,
        status: 'active',
        billing_plan_id: plan,
        billing_provider: opts.provider || 'mock',
        current_period_end: renew,
      })
      api.recordInvoice({
        userId,
        plan,
        amountCents: plan === 'pro' ? 10000 : 0,
        status: 'paid',
        provider: opts.provider || 'mock',
        paidAt: new Date().toISOString(),
        periodEnd: renew,
      })
      return rec
    },
    markPaymentPending(userId, plan = 'pro', provider = 'bank_transfer') {
      return api.setSubscription(userId, {
        plan: normalizePlanId(plan),
        status: 'payment_pending',
        billing_plan_id: plan,
        billing_provider: provider,
      })
    },
    recordInvoice(payload) {
      const id = randomUUID()
      const list = invoices.get(Number(payload.userId)) || []
      list.unshift({ id, ...payload, created_at: new Date().toISOString() })
      invoices.set(Number(payload.userId), list)
      return { id }
    },
    listInvoices(userId) {
      return invoices.get(Number(userId)) || []
    },
    getUsage(userId) {
      const key = `${userId}:${todayUtc()}`
      return usage.get(key) || { ai_queries: 0, grounding_calls: 0, exports: 0 }
    },
    incrementUsage(userId, field, amount = 1) {
      const key = `${userId}:${todayUtc()}`
      const cur = usage.get(key) || { ai_queries: 0, grounding_calls: 0, exports: 0 }
      if (field === 'ai_queries') cur.ai_queries += amount
      else if (field === 'grounding_calls') cur.grounding_calls += amount
      else if (field === 'exports') cur.exports += amount
      usage.set(key, cur)
      return cur
    },
  }
  return api
}
