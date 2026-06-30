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
    id?: string
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
    user_id: user.id ?? null,
    email: user.email ?? null,
    name: user.name ?? null,
    role: user.role ?? null,
    role_slug: user.roleSlug ?? user.role_slug ?? null,
    status: user.status ?? null,
    tenant_id: user.tenantId ?? user.tenant_id ?? 'geosyntra-default',
    permissions: user.permissions ?? [],
  }
}

  /** Persist auth session in localStorage before WASM boot (matches `geosyntra_auth_v1`). */
export async function persistSession(
  page: Page,
  body: LoginResponse,
  opts?: { landingPath?: string },
) {
  const session = sessionFromLogin(body)
  const landingPath = opts?.landingPath ?? '/satellite/indices'
  const raw = JSON.stringify(session)
  await page.context().addInitScript((payload: string) => {
    localStorage.setItem('geosyntra_auth_v1', payload)
  }, raw)
  // Establish origin, seed storage, then load the GIS route so WASM reads a warm session.
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.evaluate((payload: string) => {
    localStorage.setItem('geosyntra_auth_v1', payload)
  }, raw)
  await page.goto(landingPath, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(
    () => {
      const raw = localStorage.getItem('geosyntra_auth_v1')
      if (!raw) return false
      try {
        const parsed = JSON.parse(raw) as { access_token?: string; permissions?: string[] }
        return (
          Boolean(parsed.access_token)
          && Array.isArray(parsed.permissions)
          && parsed.permissions.includes('app.access')
        )
      } catch {
        return false
      }
    },
    { timeout: 20_000 },
  )
  if (landingPath.includes('/satellite')) {
    await page.waitForSelector('[data-testid="native-map-canvas"]', { timeout: 90_000 })
  }
}

/** Login and land on dashboard — for admin / account specs. */
export async function persistSessionDashboard(page: Page, body: LoginResponse) {
  await persistSession(page, body, { landingPath: '/dashboard' })
  await page.waitForFunction(
    () => {
      const heading = document.querySelector('.gs-page-title, h1')
      return heading != null && /dashboard/i.test(heading.textContent ?? '')
    },
    { timeout: 45_000 },
  )
  await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible({
    timeout: 10_000,
  })
}

async function gotoDashboard(page: Page) {
  if (!page.url().includes('/dashboard')) {
    await page.locator('.gs-app-nav').getByRole('link', { name: 'Dashboard', exact: true }).click()
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })
  }
  await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible({
    timeout: 15_000,
  })
}

/** Sign in via UI and land on GIS or dashboard (no redundant API login — avoids auth rate limit). */
export async function loginViaApi(
  page: Page,
  email = DEV_EMAIL,
  password = DEV_PASSWORD,
  opts?: { landingPath?: string },
) {
  await loginViaUi(page, email, password)
  const landingPath = opts?.landingPath ?? '/satellite/indices'
  if (landingPath.includes('/dashboard')) {
    await gotoDashboard(page)
  } else if (!page.url().includes('/satellite')) {
    await page.locator('.gs-app-nav').getByRole('link', { name: 'GeoAI' }).click()
    await expect(page).toHaveURL(/\/satellite/, { timeout: 15_000 })
    await page.waitForSelector('[data-testid="native-map-canvas"]', { timeout: 90_000 })
  }
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
  await loginViaApi(page, email, password, { landingPath: '/dashboard' })
  return { email, password }
}

/** @deprecated Use registerVerifiedTrialUser — raw register leaves account unverified. */
export async function registerTrialUser(page: Page): Promise<{ email: string; password: string }> {
  return registerVerifiedTrialUser(page)
}

export async function loginViaApiDashboard(
  page: Page,
  email = DEV_EMAIL,
  password = DEV_PASSWORD,
) {
  await loginViaUi(page, email, password, { skipMapWait: true })
  await gotoDashboard(page)
}

async function fillControlledInput(page: Page, selector: string, value: string) {
  const input = page.locator(selector)
  await expect(input).toBeVisible({ timeout: 15_000 })
  await input.click()
  await input.fill('')
  await input.pressSequentially(value, { delay: 20 })
}

/** Sign in via the Dioxus login form. */
export async function loginViaUi(
  page: Page,
  email = DEV_EMAIL,
  password = DEV_PASSWORD,
  opts?: { skipMapWait?: boolean },
) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await fillControlledInput(page, '#email', email)
  await fillControlledInput(page, '#password', password)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL(/\/(dashboard|satellite|admin)/, { timeout: 30_000 })
  if (page.url().includes('/satellite')) {
    if (!opts?.skipMapWait) {
      await page.waitForSelector('[data-testid="native-map-canvas"]', { timeout: 90_000 })
    }
  } else {
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 15_000 })
  }
}
