import { expect, type Page } from 'playwright/test'

export const DEV_EMAIL = process.env.SMOKE_EMAIL ?? 'admin@geosyntra.com'
export const DEV_PASSWORD = process.env.SMOKE_PASSWORD ?? 'GeoSyntra-Admin-2026!'
export const TRIAL_PASSWORD = process.env.E2E_TRIAL_PASSWORD ?? 'E2E-Trial-User-2026!'

const API_URL = process.env.GEOSYNTRA_API_URL ?? 'http://127.0.0.1:3003'

type LoginResponse = {
  accessToken?: string
  access_token?: string
  refreshToken?: string
  refresh_token?: string
  user?: {
    email?: string
    name?: string
    role?: string
    roleSlug?: string
    role_slug?: string
    status?: string
    tenantId?: string
    tenant_id?: string
    permissions?: string[]
  }
}

function sessionFromLogin(body: LoginResponse) {
  const user = body.user ?? {}
  return {
    access_token: body.accessToken ?? body.access_token ?? null,
    refresh_token: body.refreshToken ?? body.refresh_token ?? null,
    email: user.email ?? null,
    name: user.name ?? null,
    role: user.role ?? null,
    role_slug: user.roleSlug ?? user.role_slug ?? null,
    status: user.status ?? null,
    tenant_id: user.tenantId ?? user.tenant_id ?? 'geosyntra-default',
    permissions: user.permissions ?? [],
  }
}

/** Persist auth session in localStorage (matches `geosyntra_auth_v1`). */
export async function persistSession(page: Page, body: LoginResponse) {
  const session = sessionFromLogin(body)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.evaluate(
    ([key, raw]) => localStorage.setItem(key, raw),
    ['geosyntra_auth_v1', JSON.stringify(session)] as const,
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(
    () => {
      const raw = localStorage.getItem('geosyntra_auth_v1')
      if (!raw) return false
      try {
        const parsed = JSON.parse(raw) as { access_token?: string }
        return Boolean(parsed.access_token)
      } catch {
        return false
      }
    },
    { timeout: 20_000 },
  )
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(
    () => {
      const heading = document.querySelector('.gs-page-title, h1')
      return heading != null && /dashboard/i.test(heading.textContent ?? '')
    },
    { timeout: 20_000 },
  )
  await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible({
    timeout: 5_000,
  })
}

export async function loginViaApi(
  page: Page,
  email = DEV_EMAIL,
  password = DEV_PASSWORD,
) {
  const resp = await page.request.post(`${API_URL}/api/auth/login`, {
    data: { email, password },
  })
  expect(resp.ok(), `login failed for ${email}: ${resp.status()}`).toBeTruthy()
  const body = (await resp.json()) as LoginResponse
  await persistSession(page, body)
}

/** Register, verify email (dev link), and persist a trial_user session. */
export async function registerVerifiedTrialUser(page: Page): Promise<{ email: string; password: string }> {
  const email = `e2e-trial-${Date.now()}@test.local`
  const password = TRIAL_PASSWORD
  const registerResp = await page.request.post(`${API_URL}/api/auth/register`, {
    data: {
      name: 'E2ETrialUser',
      email,
      password,
      requestedPlan: 'trial',
    },
  })
  expect(registerResp.ok(), `register failed: ${registerResp.status()}`).toBeTruthy()

  const resendResp = await page.request.post(`${API_URL}/api/auth/resend-verification`, {
    data: { email },
  })
  expect(resendResp.ok(), `resend-verification failed: ${resendResp.status()}`).toBeTruthy()
  const resendBody = (await resendResp.json()) as { devVerificationLink?: string }
  const link = resendBody.devVerificationLink ?? ''
  const token = new URL(link, API_URL).searchParams.get('token')
  expect(token, 'devVerificationLink missing token').toBeTruthy()

  const verifyResp = await page.request.get(
    `${API_URL}/api/auth/verify-email?token=${encodeURIComponent(token!)}`,
  )
  expect(verifyResp.ok(), `verify-email failed: ${verifyResp.status()}`).toBeTruthy()
  await loginViaApi(page, email, password)
  return { email, password }
}

/** @deprecated Use registerVerifiedTrialUser — raw register leaves account unverified. */
export async function registerTrialUser(page: Page): Promise<{ email: string; password: string }> {
  return registerVerifiedTrialUser(page)
}

/** Sign in via the Dioxus login form. */
export async function loginViaUi(page: Page, email = DEV_EMAIL, password = DEV_PASSWORD) {
  await page.goto('/login', { waitUntil: 'networkidle' })
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL(/\/(dashboard|satellite|admin)/, { timeout: 20_000 })
  await expect(page.getByRole('heading').first()).toBeVisible()
}
