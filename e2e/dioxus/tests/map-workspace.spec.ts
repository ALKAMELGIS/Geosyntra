import { expect, test } from '../fixtures/test'

import { loginViaUi } from '../fixtures/auth.js'
import {
  expectNativeMapWorkspace,
  gotoSatelliteMap,
  openToolByLabel,
} from '../fixtures/map-workspace.js'

async function openRemoteSensingPanel(page: Parameters<typeof gotoSatelliteMap>[0]) {
  await openToolByLabel(page, 'Remote sensing')
  await expect(page.getByRole('heading', { name: 'Remote sensing' })).toBeVisible()
}

test.describe('GIS map workspace (Task 31 native Mapbox)', () => {
  test('owner reaches native map at /satellite/indices', async ({ page }) => {
    await gotoSatelliteMap(page)
    await expectNativeMapWorkspace(page)
    await openRemoteSensingPanel(page)
  })

  test('Start from landing opens native satellite workspace', async ({ page }) => {
    await loginViaUi(page)
    await page.locator('.gs-app-nav').getByRole('link', { name: 'Home', exact: true }).click()
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 })
    const start = page.getByRole('button', { name: 'Start', exact: true })
    await expect(start).toBeVisible({ timeout: 15_000 })
    await start.click()
    await expect(page).toHaveURL(/\/satellite/, { timeout: 20_000 })
    await expectNativeMapWorkspace(page)
  })

  test('remote sensing panel matches React workflow controls', async ({ page }) => {
    await gotoSatelliteMap(page)
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
    await gotoSatelliteMap(page)
    await expectNativeMapWorkspace(page)
    await openToolByLabel(page, 'Layers')
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
    await gotoSatelliteMap(page)
    await expectNativeMapWorkspace(page)
    await page.locator('.gs-native-toolbox-rail__btn[aria-label="Agent Chat"]').click()
    await expect(page.getByRole('heading', { name: 'Agent Chat' })).toBeVisible()
    const input = page.getByPlaceholder('Ask Geo AI…')
    await input.fill('What index is active?')
    await page.getByRole('button', { name: 'Send' }).click()
    await expect(page.getByText('What index is active?')).toBeVisible()
  })

  test('place search panel opens from map tools dock', async ({ page }) => {
    await gotoSatelliteMap(page)
    await expectNativeMapWorkspace(page)
    await page.getByRole('button', { name: 'Search' }).click()
    await expect(page.getByTestId('map-search-panel')).toBeVisible()
    await expect(page.getByPlaceholder('City, address…')).toBeVisible()
  })

  test('layer swipe tool opens floating panel and map divider', async ({ page }) => {
    await gotoSatelliteMap(page)
    await expectNativeMapWorkspace(page)
    await page.getByRole('button', { name: 'Layer swipe tool' }).click()
    await expect(page.getByText('Layer swipe')).toBeVisible()
  })

  test('toolbox pin keeps tool panel open after mouse leave', async ({ page }) => {
    await gotoSatelliteMap(page)
    await expectNativeMapWorkspace(page)
    await openToolByLabel(page, 'Layers')
    await page.getByRole('button', { name: 'Pin map toolbox' }).click()
    await page.locator('.gs-native-map-wrap').hover({ position: { x: 8, y: 8 } })
    await expect(page.getByTestId('gis-tool-panel')).toBeVisible()
  })
})
