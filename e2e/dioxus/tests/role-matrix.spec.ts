import { expect, test } from '../fixtures/test'

import { loginViaApiDashboard, loginViaUi, registerVerifiedTrialUser } from '../fixtures/auth.js'
import { openAdminPage } from '../fixtures/admin.js'

/**
 * Task 25.7 — role permission matrix (Task 23.5).
 */
test.describe('role permission matrix (Task 23.5)', () => {
  test('trial_user cannot open admin users', async ({ page }) => {
    await registerVerifiedTrialUser(page)
    await page.goto('/admin/users', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/dashboard/)
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Users' })).toHaveCount(0)
  })

  test('owner can open admin tokens via UI login', async ({ page }) => {
    await loginViaUi(page)
    await openAdminPage(page, '/admin/tokens')
    await expect(page.getByRole('heading', { name: /system tokens/i })).toBeVisible()
  })

  test('owner session via API reaches dashboard', async ({ page }) => {
    await loginViaApiDashboard(page)
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByText(/admin@geosyntra\.com/i)).toBeVisible()
  })
})
