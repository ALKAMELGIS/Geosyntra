import { expect, test } from '../fixtures/test'

import { loginAsAdmin, openAdminPage } from '../fixtures/admin.js'
import { openSettingsPage } from '../fixtures/settings.js'

const API_URL = process.env.GEOSYNTRA_API_URL ?? 'http://127.0.0.1:3003'

/**
 * Task 25 — tenant isolation on dashboard, settings, admin (Task 23.5.10).
 */
test.describe('tenant isolation (Task 23.5)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('admin policies list loads for default tenant', async ({ page }) => {
    await openAdminPage(page, '/admin/policies')
    await expect(page.getByRole('heading', { name: /policy versions/i })).toBeVisible()
    await expect(page.getByText(/geosyntra-default/i).first()).toBeVisible()
  })

  test('unknown policy id shows empty detail state', async ({ page }) => {
    await openAdminPage(page, '/admin/policies')
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
    const resp = await page.request.get(
      `${API_URL}/api/rbac/policies/other-tenant-policy-id`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    expect(resp.status()).toBeGreaterThanOrEqual(400)
    await expect(page.getByRole('heading', { name: /policy versions/i })).toBeVisible()
  })

  test('dashboard shows active tenant id', async ({ page }) => {
    await expect(page.getByText(/Tenant:\s*geosyntra-default/i)).toBeVisible()
  })

  test('settings profile shows active tenant', async ({ page }) => {
    await openSettingsPage(page, '/settings/profile')
    await expect(page.getByText('geosyntra-default').first()).toBeVisible()
  })

  test('admin users page scopes to session tenant', async ({ page }) => {
    await openAdminPage(page, '/admin/users')
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
