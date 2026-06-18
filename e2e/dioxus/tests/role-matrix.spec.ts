import { expect, test } from '../fixtures/test'

import { loginViaApi, loginViaUi, registerVerifiedTrialUser } from '../fixtures/auth.js'

/**
 * Task 25.7 — role permission matrix (Task 23.5).
 */
test.describe('role permission matrix (Task 23.5)', () => {
  test('trial_user cannot open admin users', async ({ page }) => {
    await registerVerifiedTrialUser(page)
    await page.goto('/admin/users', { waitUntil: 'networkidle' })
    await expect(page).toHaveURL(/\/dashboard/)
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Users' })).toHaveCount(0)
  })

  test('owner can open admin tokens via UI login', async ({ page }) => {
    await loginViaUi(page)
    await page.goto('/admin/tokens', { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: /system tokens/i })).toBeVisible()
  })

  test('owner session via API reaches dashboard', async ({ page }) => {
    await loginViaApi(page)
    await page.goto('/dashboard', { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByText(/admin@geosyntra\.com/i)).toBeVisible()
  })
})
