/** HttpOnly session cookie for cross-tab API auth (Bearer header still supported). */
export const ACCESS_TOKEN_COOKIE = 'geosyntra_access_token'
export const REFRESH_TOKEN_COOKIE = 'geosyntra_refresh_token'

const ACCESS_MAX_AGE_SEC = 60 * 60 * 24 * 7
const REFRESH_MAX_AGE_SEC = 60 * 60 * 24 * 30

export function parseCookieHeader(header) {
  const out = {}
  const raw = String(header || '')
  if (!raw) return out
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=')
    if (idx <= 0) continue
    const key = part.slice(0, idx).trim()
    const val = part.slice(idx + 1).trim()
    if (key) out[key] = decodeURIComponent(val)
  }
  return out
}

export function readBearerOrCookieToken(req) {
  const auth = String(req.headers.authorization || '')
  if (auth.startsWith('Bearer ')) {
    const t = auth.slice(7).trim()
    if (t) return t
  }
  const cookies = parseCookieHeader(req.headers.cookie)
  return String(cookies[ACCESS_TOKEN_COOKIE] || '').trim()
}

function cookieParts(name, value, maxAgeSec) {
  const secure = process.env.NODE_ENV === 'production'
  const parts = [
    `${name}=${value ? encodeURIComponent(value) : ''}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSec}`,
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function readRefreshTokenFromRequest(req) {
  const cookies = parseCookieHeader(req.headers.cookie)
  return String(cookies[REFRESH_TOKEN_COOKIE] || '').trim()
}

export function setAccessTokenCookie(res, token) {
  res.append('Set-Cookie', cookieParts(ACCESS_TOKEN_COOKIE, token, ACCESS_MAX_AGE_SEC))
}

export function setRefreshTokenCookie(res, token) {
  res.append('Set-Cookie', cookieParts(REFRESH_TOKEN_COOKIE, token, REFRESH_MAX_AGE_SEC))
}

export function clearAccessTokenCookie(res) {
  res.append('Set-Cookie', cookieParts(ACCESS_TOKEN_COOKIE, '', 0))
}

export function clearRefreshTokenCookie(res) {
  res.append('Set-Cookie', cookieParts(REFRESH_TOKEN_COOKIE, '', 0))
}

export function clearAuthCookies(res) {
  clearAccessTokenCookie(res)
  clearRefreshTokenCookie(res)
}
