import { expect, test } from '../fixtures/test'

import { loginAsAdmin, openAdminPage } from '../fixtures/admin.js'

const API_URL = process.env.GEOSYNTRA_API_URL ?? 'http://127.0.0.1:3003'

test.describe('governance', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('/admin/tenants loads and can open propose form', async ({ page }) => {
    await openAdminPage(page, '/admin/tenants')
    await expect(page.getByRole('heading', { name: /tenant/i }).first()).toBeVisible()
    await expect(page.getByText(/propose|create/i).first()).toBeVisible()
  })

  test('tenant create submits governance proposal via API', async ({ page }) => {
    const token = await page.evaluate(() => {
      const raw = localStorage.getItem('geosyntra_auth_v1')
      if (!raw) return null
      try {
        return (JSON.parse(raw) as { access_token?: string }).access_token ?? null
      } catch {
        return null
      }
    })
    expect(token, 'session token required').toBeTruthy()

    const tenantId = `e2e-gov-${Date.now()}`
    const resp = await page.request.post(`${API_URL}/api/platform/tenants`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { id: tenantId, name: `E2E Gov ${tenantId}` },
    })
    expect(resp.ok(), `propose create failed: ${resp.status()}`).toBeTruthy()
    const body = (await resp.json()) as {
      governanceRequired?: boolean
      proposalId?: string
      requiredApprovals?: number
    }
    expect(body.governanceRequired ?? true).toBeTruthy()
    expect(body.proposalId).toBeTruthy()
    expect(body.requiredApprovals ?? 3).toBeGreaterThanOrEqual(3)
  })

  test('/admin/platform loads config snapshot', async ({ page }) => {
    await openAdminPage(page, '/admin/platform')
    await expect(page.getByRole('heading', { name: /platform config/i })).toBeVisible()
    await expect(page.getByText(/environment|gateway|capabilities/i).first()).toBeVisible()
  })

  test('/admin/governance shows inbox and nav badge', async ({ page }) => {
    await openAdminPage(page, '/admin/governance')
    await expect(page.getByRole('heading', { name: /governance inbox/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /governance/i }).first()).toBeVisible()
  })

  test('governance inbox lists proposal after tenant create', async ({ page }) => {
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

    const tenantId = `e2e-inbox-${Date.now()}`
    const resp = await page.request.post(`${API_URL}/api/platform/tenants`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { id: tenantId, name: `E2E Inbox ${tenantId}` },
    })
    expect(resp.ok()).toBeTruthy()
    const body = (await resp.json()) as { proposalId?: string }
    expect(body.proposalId).toBeTruthy()

    await openAdminPage(page, '/admin/governance')
    await expect(page.getByText(tenantId).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('link', { name: /governance \(\d+\)/i }).first()).toBeVisible()
  })

  test('governance reject removes pending proposal', async ({ page }) => {
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

    const tenantId = `e2e-reject-${Date.now()}`
    const create = await page.request.post(`${API_URL}/api/platform/tenants`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { id: tenantId, name: `E2E Reject ${tenantId}` },
    })
    expect(create.ok()).toBeTruthy()

    await openAdminPage(page, '/admin/governance')
    await expect(page.getByText(tenantId).first()).toBeVisible({ timeout: 15_000 })

    const row = page.locator('tr').filter({ hasText: tenantId }).first()
    await row.getByRole('button', { name: 'Review' }).click()
    await page.locator('#gs-gov-reject-reason').selectOption('duplicate')
    await page.getByRole('button', { name: 'Reject' }).click()
    await expect(page.getByText(/rejected/i).first()).toBeVisible({ timeout: 10_000 })
  })
})
