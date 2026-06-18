import { expect, test } from '../fixtures/test'

import { loginViaUi } from '../fixtures/auth.js'

test.describe('auth + workspace', () => {
  test('login persists after reload', async ({ page }) => {
    await loginViaUi(page)
    await expect(page).toHaveURL(/\/satellite/)
    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.getByText('Satellite intelligence')).toBeVisible()
  })
})
