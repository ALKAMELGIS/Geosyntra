/**
 * In-memory per-user rate limit for API gateway (quota abuse protection).
 */

const buckets = new Map()

function windowKey(userId, route) {
  return `${userId}:${route}`
}

/**
 * @param {{ userId: number | string; route: string; limit?: number; windowMs?: number }} opts
 */
export function checkGatewayRateLimit(opts) {
  const limit = opts.limit ?? 60
  const windowMs = opts.windowMs ?? 60_000
  const key = windowKey(opts.userId, opts.route)
  const now = Date.now()
  let bucket = buckets.get(key)
  if (!bucket || now - bucket.start > windowMs) {
    bucket = { start: now, count: 0 }
    buckets.set(key, bucket)
  }
  bucket.count += 1
  if (bucket.count > limit) {
    return { ok: false, retryAfterMs: windowMs - (now - bucket.start) }
  }
  return { ok: true, remaining: limit - bucket.count }
}

export function createGatewayRateLimitMiddleware(route, opts = {}) {
  return (req, res, next) => {
    const userId = req.authUser?.id ?? req.ip ?? 'anon'
    const hit = checkGatewayRateLimit({ userId, route, ...opts })
    if (!hit.ok) {
      return res.status(429).json({
        ok: false,
        error: 'rate_limit_exceeded',
        retryAfterMs: hit.retryAfterMs,
      })
    }
    res.setHeader('X-RateLimit-Remaining', String(hit.remaining ?? 0))
    next()
  }
}
