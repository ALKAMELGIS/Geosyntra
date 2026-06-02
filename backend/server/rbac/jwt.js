import crypto from 'crypto'

const DEFAULT_TTL_SEC = 60 * 60 * 24 * 7 // 7 days

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function base64urlJson(obj) {
  return base64url(JSON.stringify(obj))
}

function signHmac(data, secret) {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url')
}

function getSecret() {
  const secret = String(process.env.JWT_SECRET || process.env.RBAC_JWT_SECRET || '').trim()
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET is required in production')
    }
    return 'geosyntra-dev-jwt-secret-change-me'
  }
  return secret
}

export function signAccessToken(payload, ttlSec = DEFAULT_TTL_SEC) {
  const secret = getSecret()
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'HS256', typ: 'JWT' }
  const body = {
    ...payload,
    iat: now,
    exp: now + ttlSec,
  }
  const encoded = `${base64urlJson(header)}.${base64urlJson(body)}`
  const sig = signHmac(encoded, secret)
  return `${encoded}.${sig}`
}

export function verifyAccessToken(token) {
  const secret = getSecret()
  const parts = String(token || '').split('.')
  if (parts.length !== 3) return { ok: false, error: 'invalid_token' }
  const [h, p, sig] = parts
  const encoded = `${h}.${p}`
  const expected = signHmac(encoded, secret)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, error: 'invalid_signature' }
  }
  let payload
  try {
    payload = JSON.parse(Buffer.from(p.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
  } catch {
    return { ok: false, error: 'invalid_payload' }
  }
  const now = Math.floor(Date.now() / 1000)
  if (typeof payload.exp === 'number' && payload.exp < now) {
    return { ok: false, error: 'token_expired' }
  }
  return { ok: true, payload }
}
