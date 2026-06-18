import { expect, test } from '../fixtures/test'

import { loginViaApi, loginViaUi } from '../fixtures/auth.js'

test.describe('settings', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page)
  })

  test('/settings/profile shows session', async ({ page }) => {
    await page.goto('/settings/profile', { waitUntil: 'networkidle' })
    await expect(page.getByText(/admin@geosyntra\.com/i)).toBeVisible()
  })

  test('/settings/api-integrations loads for owner', async ({ page }) => {
    await page.goto('/settings/api-integrations', { waitUntil: 'networkidle' })
    await expect(page.getByText(/integration|capabilit|platform/i).first()).toBeVisible()
  })
})
