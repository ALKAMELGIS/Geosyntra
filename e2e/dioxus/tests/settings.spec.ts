import { expect, test } from '../fixtures/test'

import { loginViaApi, loginViaUi } from '../fixtures/auth.js'
import { openSettingsPage } from '../fixtures/settings.js'

test.describe('settings', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page, undefined, undefined, { landingPath: '/dashboard' })
  })

  test('/settings/profile shows session', async ({ page }) => {
    await openSettingsPage(page, '/settings/profile')
    await expect(page.getByText(/admin@geosyntra\.com/i)).toBeVisible()
  })

  test('/settings/api-integrations loads for owner', async ({ page }) => {
    await openSettingsPage(page, '/settings/api-integrations')
    await expect(page.getByText(/integration|capabilit|platform/i).first()).toBeVisible()
  })
})
