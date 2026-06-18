import { expect, test } from 'playwright/test'

import { loginViaApi } from '../fixtures/auth.js'

const API_URL = process.env.GEOSYNTRA_API_URL ?? 'http://127.0.0.1:3003'

test.describe('admin CRUD forms', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page)
  })

  test('create user returns server-assigned id', async ({ page }) => {
    const token = await page.evaluate(() => {
      const raw = localStorage.getItem('geosyntra_auth_v1')
      if (!raw) return null
      try {
        return (JSON.parse(raw) as { access_token?: string }).access_token ?? null
      } catch {
        return null
      }
    })
    expect(token).toBeTruthy()

    const email = `admin-form-${Date.now()}@test.local`
    const resp = await page.request.post(`${API_URL}/api/rbac/users`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { email, name: 'Form Test User', roleSlug: 'viewer' },
    })
    expect(resp.ok(), `create user failed: ${resp.status()}`).toBeTruthy()
    const body = (await resp.json()) as { user?: { id?: string; email?: string } }
    expect(body.user?.id).toMatch(/^\d+$/)
    expect(body.user?.email).toBe(email)
  })

  test('memberships page opens create modal with role and user selects', async ({ page }) => {
    await page.goto('/admin/memberships', { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: /membership/i }).first()).toBeVisible()
    await page.getByRole('button', { name: /add membership/i }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('#gs-membership-create-user')).toBeVisible()
    const userSelect = dialog.locator('#gs-membership-create-user')
    const userOptions = await userSelect.locator('option').allTextContents()
    const userPick = userOptions.find((o) => o.trim() && !/select/i.test(o))
    if (userPick) await userSelect.selectOption({ label: userPick.trim() })
    await dialog.getByRole('button', { name: 'Next' }).click()
    await expect(dialog.getByText(/step 2 of/i)).toBeVisible()
    await expect(dialog.locator('#gs-membership-create-tenant')).toBeVisible()
    await dialog.getByRole('button', { name: 'Next' }).click()
    await expect(dialog.locator('.gs-checkbox-group').first()).toBeVisible()
  })

  test('grants page opens create modal with permission and duration selects', async ({ page }) => {
    await page.goto('/admin/grants', { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: /temporary grant/i }).first()).toBeVisible()
    await page.getByRole('button', { name: /issue grant/i }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('#gs-grant-create-tenant')).toBeVisible()
    const userSelect = dialog.locator('#gs-grant-create-user')
    const options = await userSelect.locator('option').allTextContents()
    const pick = options.find((o) => o.trim() && !/select/i.test(o))
    if (pick) await userSelect.selectOption({ label: pick.trim() })
    await dialog.getByRole('button', { name: 'Next' }).click()
    await expect(dialog.locator('#gs-grant-create-permission')).toBeVisible()
    await dialog.getByRole('button', { name: 'Next' }).click()
    await expect(dialog.locator('#gs-grant-create-duration')).toBeVisible()
  })

  test('users page opens create user stepper modal', async ({ page }) => {
    await page.goto('/admin/users', { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: /create user/i }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(/step 1 of/i)).toBeVisible()
  })
})
