import { expect, test, type Page } from '../fixtures/test'

import { loginViaApi } from '../fixtures/auth.js'

/** Native Mapbox GIS — 3D globe + toolbox rail (Task 31). */
async function expectNativeMapWorkspace(page: Page) {
  await expect(page.getByTestId('native-map-canvas')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('.mapboxgl-canvas')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('.gs-native-toolbox-rail')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.gs-native-status-bar')).toBeVisible()
  await expect(page.getByTestId('gis-tool-panel')).toBeVisible({ timeout: 15_000 })
}

test.describe('GIS map workspace (Task 31 native Mapbox)', () => {
  test('owner reaches native map at /satellite/indices', async ({ page }) => {
    await loginViaApi(page)
    await page.goto('/satellite/indices', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/satellite\/indices/)
    await expect(page.getByText('Satellite intelligence')).toBeVisible()
    await expectNativeMapWorkspace(page)
    await expect(page.getByRole('heading', { name: 'Remote sensing' })).toBeVisible()
  })

  test('Start from landing opens native satellite workspace', async ({ page }) => {
    await loginViaApi(page)
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const start = page.getByRole('button', { name: 'Start', exact: true })
    await expect(start).toBeVisible({ timeout: 15_000 })
    await start.click()
    await expect(page).toHaveURL(/\/satellite/, { timeout: 20_000 })
    await expectNativeMapWorkspace(page)
  })

  test('layers panel opens from toolbox rail', async ({ page }) => {
    await loginViaApi(page)
    await page.goto('/satellite/indices', { waitUntil: 'domcontentloaded' })
    await expectNativeMapWorkspace(page)
    await page.locator('.gs-native-toolbox-rail__btn[title*="Layer"]').click()
    await expect(page.getByRole('heading', { name: 'Layers' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add demo field polygon' })).toBeVisible()
  })
})
