import { expect, test } from '../fixtures/test'

/**
 * Task 24 — public landing parity with React Home.
 * Enabled after Task 24.1 (public `/` without login wall).
 */
test.describe('public landing (Task 24)', () => {
  test('guest sees marketing hero without forced login', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: /the future of/i })).toBeVisible()
    await expect(page.locator('#pricing')).toBeVisible()
    await expect(page.locator('.gs-landing')).toBeVisible()
  })

  test('wizard opens from query params', async ({ page }) => {
    await page.goto('/?start=1&wizard=auth&mode=signup', { waitUntil: 'networkidle' })
    await expect(page.locator('.gs-wizard-overlay')).toBeVisible()
    await expect(page.getByRole('dialog')).toBeVisible()
  })
})
