import { expect, test, type Page } from '../fixtures/test'

import { loginViaApi } from '../fixtures/auth.js'

/** Native Mapbox GIS — 3D globe + toolbox rail (Task 31). */
async function openToolbox(page: Page) {
  const rail = page.locator('.gs-native-toolbox-rail')
  if (!(await rail.isVisible())) {
    await page.getByRole('button', { name: 'Open map toolbox' }).click()
    await expect(rail).toBeVisible({ timeout: 10_000 })
  }
}

async function openRemoteSensingPanel(page: Page) {
  await openToolbox(page)
  await page.locator('.gs-native-toolbox-rail__btn[title*="Remote sensing"]').click()
  await expect(page.getByTestId('gis-tool-panel')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('heading', { name: 'Remote sensing' })).toBeVisible()
}

async function expectNativeMapWorkspace(page: Page) {
  await expect(page.getByTestId('native-map-canvas')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('.mapboxgl-canvas')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole('button', { name: 'Open map toolbox' })).toBeVisible({
    timeout: 15_000,
  })
  await openToolbox(page)
  await expect(page.locator('.gs-native-status-bar')).toBeVisible()
}

test.describe('GIS map workspace (Task 31 native Mapbox)', () => {
  test('owner reaches native map at /satellite/indices', async ({ page }) => {
    await loginViaApi(page)
    await page.goto('/satellite/indices', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/satellite\/indices/)
    await expect(page.getByText('Satellite intelligence')).toBeVisible()
    await expectNativeMapWorkspace(page)
    await openRemoteSensingPanel(page)
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

  test('remote sensing panel matches React workflow controls', async ({ page }) => {
    await loginViaApi(page)
    await page.goto('/satellite/indices', { waitUntil: 'domcontentloaded' })
    await expectNativeMapWorkspace(page)
    await openRemoteSensingPanel(page)
    await expect(page.getByRole('tab', { name: 'Main' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Field' })).toBeVisible()
    await expect(page.getByLabel('Satellite provider')).toBeVisible()
    await expect(page.getByLabel('Imagery date')).toBeVisible()
    await expect(page.getByLabel('Remote sensing layer')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add Data Source (AOI)' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Generate timeline' })).toBeVisible()
  })

  test('layers panel opens from toolbox rail', async ({ page }) => {
    await loginViaApi(page)
    await page.goto('/satellite/indices', { waitUntil: 'domcontentloaded' })
    await expectNativeMapWorkspace(page)
    await page.locator('.gs-native-toolbox-rail__btn[title="Layer settings"]').click()
    await expect(page.getByRole('heading', { name: 'Layer settings' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Main' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Options' })).toBeVisible()
    await expect(page.getByText('ADDED LAYERS')).toBeVisible()
    await expect(page.getByText('No layers added yet.')).toBeVisible()
    await page.getByRole('tab', { name: 'Options' }).click()
    await expect(page.getByText('Layer live')).toBeVisible()
    await expect(page.getByLabel('Basemap style')).toBeVisible()
    await expect(page.getByLabel('Active remote sensing index layer')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open Remote sensing' })).toBeVisible()
  })

  test('geo-ai panel opens and accepts input', async ({ page }) => {
    await loginViaApi(page)
    await page.goto('/satellite/indices', { waitUntil: 'domcontentloaded' })
    await expectNativeMapWorkspace(page)
    await page.locator('.gs-native-toolbox-rail__btn[aria-label="Agent Chat"]').click()
    await expect(page.getByRole('heading', { name: 'Agent Chat' })).toBeVisible()
    await expect(page.getByPlaceholder('Ask Geo AI…')).toBeVisible()
  })

  test('place search panel opens from float control', async ({ page }) => {
    await loginViaApi(page)
    await page.goto('/satellite/indices', { waitUntil: 'domcontentloaded' })
    await expectNativeMapWorkspace(page)
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await expect(page.getByTestId('map-search-panel')).toBeVisible()
  })

  test('layer swipe tool opens floating panel and map divider', async ({ page }) => {
    await loginViaApi(page)
    await page.goto('/satellite/indices', { waitUntil: 'domcontentloaded' })
    await expectNativeMapWorkspace(page)
    await page.getByRole('button', { name: 'Layer swipe tool' }).click()
    await expect(page.locator('.gs-native-swipe-panel-wrap')).toBeVisible()
    await expect(page.locator('.gs-map-swipe-root')).toBeVisible()
  })

  test('toolbox pin keeps rail open after mouse leave', async ({ page }) => {
    await loginViaApi(page)
    await page.goto('/satellite/indices', { waitUntil: 'domcontentloaded' })
    await expectNativeMapWorkspace(page)
    await page.getByRole('button', { name: 'Pin map toolbox' }).click()
    await page.locator('.gs-native-toolbox-rail').hover()
    await page.mouse.move(0, 0)
    await expect(page.locator('.gs-native-toolbox-rail')).toBeVisible()
  })
})
