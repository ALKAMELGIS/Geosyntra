/**
 * OAuth code / token exchange for home sign-in (Google, Apple, GitHub).
 */
import { createPrivateKey, sign } from 'crypto'

function b64url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input)
  return buf.toString('base64url')
}

function decodeJwtPayload(token) {
  const parts = String(token || '').split('.')
  if (parts.length < 2) return null
  const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
  try {
    return JSON.parse(Buffer.from(b64 + pad, 'base64').toString('utf8'))
  } catch {
    return null
  }
}

function makeAppleClientSecret() {
  const teamId = String(process.env.APPLE_OAUTH_TEAM_ID || '').trim()
  const clientId = String(process.env.APPLE_OAUTH_CLIENT_ID || '').trim()
  const keyId = String(process.env.APPLE_OAUTH_KEY_ID || '').trim()
  let privateKeyPem = String(process.env.APPLE_OAUTH_PRIVATE_KEY || '').trim()
  if (!teamId || !clientId || !keyId || !privateKeyPem) return null
  privateKeyPem = privateKeyPem.replace(/\\n/g, '\n')
  try {
    const privateKey = createPrivateKey({ key: privateKeyPem, format: 'pem' })
    const header = b64url(JSON.stringify({ alg: 'ES256', kid: keyId }))
    const now = Math.floor(Date.now() / 1000)
    const payload = b64url(
      JSON.stringify({
        iss: teamId,
        iat: now,
        exp: now + 300,
        aud: 'https://appleid.apple.com',
        sub: clientId,
      }),
    )
    const data = `${header}.${payload}`
    const signature = sign('sha256', Buffer.from(data), { key: privateKey, dsaEncoding: 'ieee-p1363' })
    return `${data}.${b64url(signature)}`
  } catch (e) {
    console.error('[auth] Apple client secret failed', e)
    return null
  }
}

export async function exchangeGoogleAuthCode(code, redirectUri) {
  const clientId = String(
    process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID || '',
  ).trim()
  const clientSecret = String(
    process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET || '',
  ).trim()
  const redirect = String(
    redirectUri ||
      process.env.GOOGLE_OAUTH_REDIRECT_URI ||
      process.env.LINKEDIN_OAUTH_REDIRECT_URI ||
      '',
  ).trim()
  if (!code || !clientId || !clientSecret || !redirect) {
    return { ok: false, error: 'oauth_google_missing_config_or_code' }
  }
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirect,
    grant_type: 'authorization_code',
  })
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  const json = await tokenRes.json().catch(() => ({}))
  if (!tokenRes.ok) {
    return { ok: false, error: 'google_token_failed', detail: json }
  }
  const idToken = typeof json.id_token === 'string' ? json.id_token : ''
  if (!idToken) return { ok: false, error: 'google_no_id_token', detail: json }
  const payload = decodeJwtPayload(idToken)
  const email = String(payload?.email || '').trim().toLowerCase()
  const name = String(payload?.name || payload?.given_name || email || 'User').trim()
  if (!email) return { ok: false, error: 'google_email_missing' }
  return { ok: true, email, name, sub: String(payload?.sub || '') }
}

export async function exchangeAppleAuthPayload(body) {
  const audience = String(process.env.APPLE_OAUTH_CLIENT_ID || '').trim()
  const code = String(body?.code || '').trim()
  const redirectUri = String(body?.redirect_uri || process.env.APPLE_OAUTH_REDIRECT_URI || '').trim()
  const identityToken = String(body?.identity_token || body?.id_token || '').trim()

  if (code && audience) {
    const clientSecret = makeAppleClientSecret()
    if (!clientSecret) {
      return {
        ok: false,
        error: 'apple_oauth_missing_server_keys',
        message: 'Set APPLE_OAUTH_TEAM_ID, APPLE_OAUTH_KEY_ID, and APPLE_OAUTH_PRIVATE_KEY on the API server.',
      }
    }
    if (!redirectUri) {
      return { ok: false, error: 'apple_oauth_missing_redirect' }
    }
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: audience,
      client_secret: clientSecret,
    })
    const tokenRes = await fetch('https://appleid.apple.com/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
    const json = await tokenRes.json().catch(() => ({}))
    if (!tokenRes.ok) {
      return { ok: false, error: 'apple_token_failed', detail: json }
    }
    const idToken = typeof json.id_token === 'string' ? json.id_token : identityToken
    if (!idToken) return { ok: false, error: 'apple_no_id_token', detail: json }
    return validateAppleIdentityToken(idToken, audience)
  }

  if (identityToken && audience) {
    return validateAppleIdentityToken(identityToken, audience)
  }

  return { ok: false, error: 'apple_oauth_missing_config_or_token' }
}

function validateAppleIdentityToken(identityToken, audience) {
  const payload = decodeJwtPayload(identityToken)
  if (!payload) return { ok: false, error: 'apple_token_malformed' }
  const audOk = payload.aud === audience || (Array.isArray(payload.aud) && payload.aud.includes(audience))
  if (!audOk) return { ok: false, error: 'apple_audience_mismatch' }
  const now = Math.floor(Date.now() / 1000)
  if (typeof payload.exp === 'number' && payload.exp < now) {
    return { ok: false, error: 'apple_token_expired' }
  }
  const sub = String(payload.sub || '')
  const email = String(payload.email || '').trim().toLowerCase()
  if (!email) {
    return {
      ok: false,
      error: 'apple_email_missing',
      message: 'Apple did not share an email. Use email/password sign-in or try again and allow email sharing.',
    }
  }
  return {
    ok: true,
    sub,
    email,
    name: email.split('@')[0] || 'Apple User',
    email_verified: Boolean(payload.email_verified),
    is_private_email: email.endsWith('@privaterelay.appleid.com'),
  }
}

export async function exchangeGitHubAuthCode(code, redirectUri) {
  const clientId = String(
    process.env.AUTH_GITHUB_CLIENT_ID || process.env.GITHUB_CLIENT_ID || '',
  ).trim()
  const clientSecret = String(
    process.env.AUTH_GITHUB_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET || '',
  ).trim()
  const redirect = String(
    redirectUri || process.env.AUTH_GITHUB_REDIRECT_URI || process.env.GITHUB_OAUTH_REDIRECT_URL || '',
  ).trim()
  if (!code || !clientId || !clientSecret || !redirect) {
    return { ok: false, error: 'oauth_github_missing_config_or_code' }
  }

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirect,
    }),
  })
  const tokenJson = await tokenRes.json().catch(() => ({}))
  const accessToken =
    tokenJson && typeof tokenJson.access_token === 'string' ? tokenJson.access_token : ''
  if (!accessToken) {
    return { ok: false, error: 'github_token_failed', detail: tokenJson }
  }

  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${accessToken}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  const user = await userRes.json().catch(() => ({}))
  if (!userRes.ok) {
    return { ok: false, error: 'github_user_failed', detail: user }
  }

  let email = String(user.email || '').trim().toLowerCase()
  if (!email) {
    const emailsRes = await fetch('https://api.github.com/user/emails', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })
    const emails = await emailsRes.json().catch(() => [])
    if (Array.isArray(emails)) {
      const primary =
        emails.find(e => e?.primary && e?.verified) ||
        emails.find(e => e?.verified) ||
        emails[0]
      email = String(primary?.email || '').trim().toLowerCase()
    }
  }

  if (!email) {
    return {
      ok: false,
      error: 'github_email_missing',
      message: 'GitHub did not return a verified email. Make your email visible in GitHub settings or use email sign-in.',
    }
  }

  const name = String(user.name || user.login || email).trim()
  return { ok: true, email, name, sub: String(user.id || user.login || '') }
}

export async function exchangeLinkedInAuthCode(code, redirectUri) {
  const clientId = String(
    process.env.LINKEDIN_CLIENT_ID || process.env.LINKEDIN_OAUTH_CLIENT_ID || '',
  ).trim()
  const clientSecret = String(
    process.env.LINKEDIN_CLIENT_SECRET || process.env.LINKEDIN_OAUTH_CLIENT_SECRET || '',
  ).trim()
  const redirect = String(
    redirectUri ||
      process.env.LINKEDIN_OAUTH_REDIRECT_URI ||
      process.env.GOOGLE_OAUTH_REDIRECT_URI ||
      '',
  ).trim()
  if (!code || !clientId || !clientSecret || !redirect) {
    return { ok: false, error: 'oauth_linkedin_missing_config_or_code' }
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirect,
    client_id: clientId,
    client_secret: clientSecret,
  })
  const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  const tokenJson = await tokenRes.json().catch(() => ({}))
  const accessToken =
    tokenJson && typeof tokenJson.access_token === 'string' ? tokenJson.access_token : ''
  if (!accessToken) {
    return { ok: false, error: 'linkedin_token_failed', detail: tokenJson }
  }

  const profileRes = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const profile = await profileRes.json().catch(() => ({}))
  if (!profileRes.ok) {
    return { ok: false, error: 'linkedin_user_failed', detail: profile }
  }

  const email = String(profile.email || '').trim().toLowerCase()
  if (!email) {
    return {
      ok: false,
      error: 'linkedin_email_missing',
      message: 'LinkedIn did not return an email. Allow email access or use email sign-in.',
    }
  }

  const name = String(profile.name || profile.given_name || email).trim()
  return { ok: true, email, name, sub: String(profile.sub || '') }
}
