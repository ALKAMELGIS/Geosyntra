import { expect, test } from '../fixtures/test'

import { loginViaApi } from '../fixtures/auth.js'

const API_URL = process.env.GEOSYNTRA_API_URL ?? 'http://127.0.0.1:3003'

/**
 * Task 25 — tenant isolation on dashboard, settings, admin (Task 23.5.10).
 */
test.describe('tenant isolation (Task 23.5)', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page)
  })

  test('admin policies list loads for default tenant', async ({ page }) => {
    await page.goto('/admin/policies', { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: /policy versions/i })).toBeVisible()
    await expect(page.getByText(/geosyntra-default/i).first()).toBeVisible()
  })

  test('unknown policy id shows empty detail state', async ({ page }) => {
    await page.goto('/admin/policies/other-tenant-policy-id', { waitUntil: 'networkidle' })
    await expect(page.getByText('Loading policy…')).toHaveCount(0, { timeout: 20_000 })
    await expect(page.getByRole('heading', { name: /Policy v\d+/ })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /All policies/i })).toBeVisible()
  })

  test('dashboard shows active tenant id', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'networkidle' })
    await expect(page.getByText(/Tenant:\s*geosyntra-default/i)).toBeVisible()
  })

  test('settings profile shows active tenant', async ({ page }) => {
    await page.goto('/settings/profile', { waitUntil: 'networkidle' })
    await expect(page.getByText('geosyntra-default').first()).toBeVisible()
  })

  test('admin users page scopes to session tenant', async ({ page }) => {
    await page.goto('/admin/users', { waitUntil: 'networkidle' })
    await expect(page.getByText(/Create users in tenant/i)).toBeVisible()
    await expect(page.getByText('geosyntra-default').first()).toBeVisible()
  })

  test('cross-tenant user mutation returns 403', async ({ page }) => {
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

    const resp = await page.request.post(`${API_URL}/api/rbac/users/900004/approve`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {},
    })
    expect(resp.status()).toBe(403)
  })
})
