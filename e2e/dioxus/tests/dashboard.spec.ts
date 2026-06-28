import { expect, test } from '../fixtures/test'

import { loginViaUi } from '../fixtures/auth.js'

test.describe('auth + workspace', () => {
  test('login persists after reload', async ({ page }) => {
    await loginViaUi(page, undefined, undefined, { skipMapWait: true })
    await page.locator('.gs-app-nav').getByRole('link', { name: 'Dashboard', exact: true }).click()
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })
    const sessionBefore = await page.evaluate(() => localStorage.getItem('geosyntra_auth_v1'))
    expect(sessionBefore).toBeTruthy()
    await page.reload({ waitUntil: 'load' })
    const sessionAfter = await page.evaluate(() => localStorage.getItem('geosyntra_auth_v1'))
    expect(sessionAfter).toEqual(sessionBefore)
    const parsed = sessionAfter ? (JSON.parse(sessionAfter) as { access_token?: string; permissions?: string[] }) : null
    expect(parsed?.access_token).toBeTruthy()
    expect(parsed?.permissions).toContain('app.access')
  })
})
