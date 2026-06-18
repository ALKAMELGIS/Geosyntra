import { expect, test, type Page } from '../fixtures/test'

import { loginViaApi } from '../fixtures/auth.js'

/** Map shell is always mounted; canvas appears only when MAPBOX_TOKEN is set on Axum. */
async function expectMapShellReady(page: Page) {
  await expect(page.getByTestId('gis-map-canvas')).toBeVisible({ timeout: 30_000 })
  const canvas = page.locator('#gs-map-canvas .mapboxgl-canvas')
  const mapError = page.locator('.gs-gis-banner--error')
  await expect(canvas.or(mapError)).toBeVisible({ timeout: 30_000 })
}

test.describe('GIS map workspace (Task 28)', () => {
  test('owner reaches native map canvas at /satellite/indices', async ({ page }) => {
    await loginViaApi(page)
    await page.goto('/satellite/indices', { waitUntil: 'networkidle' })
    await expect(page).toHaveURL(/\/satellite\/indices/)
    await expect(page.getByText('Satellite intelligence')).toBeVisible()
    await expectMapShellReady(page)
  })

  test('Start from landing opens satellite workspace', async ({ page }) => {
    await loginViaApi(page)
    await page.goto('/', { waitUntil: 'networkidle' })
    const start = page.getByRole('button', { name: 'Start', exact: true })
    await expect(start).toBeVisible({ timeout: 15_000 })
    await start.click()
    await expect(page).toHaveURL(/\/satellite/, { timeout: 20_000 })
    await expectMapShellReady(page)
  })
})
