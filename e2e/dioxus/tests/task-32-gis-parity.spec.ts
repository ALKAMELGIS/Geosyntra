import { expect, test } from '../fixtures/test'

import {
  expandIntelligenceTools,
  expectNativeMapWorkspace,
  gotoSatelliteMap,
  openToolByLabel,
  openToolbox,
} from '../fixtures/map-workspace.js'

test.describe('GIS Task 32 parity (live APIs + panels)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoSatelliteMap(page)
    await expectNativeMapWorkspace(page)
  })

  test('map brand chrome is visible', async ({ page }) => {
    const brand = page.locator('.gs-native-map-brand')
    await expect(brand).toBeVisible()
    await expect(brand.locator('.gs-native-map-brand__logo')).toContainText('GeoSyntra')
    await expect(brand.locator('.gs-native-map-brand__tag')).toContainText('Satellite Intelligence')
  })

  test('daylight panel — sun slider and terrain toggle', async ({ page }) => {
    await openToolByLabel(page, 'Daylight')
    await expect(page.getByRole('heading', { name: 'Daylight' })).toBeVisible()
    await expect(page.getByText(/Adjust sun position for 3D globe lighting/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Dawn' })).toBeVisible()
    await expect(page.getByText('Esri elevation terrain underlay')).toBeVisible()
  })

  test('symbology studio panel', async ({ page }) => {
    await openToolbox(page)
    await page.getByRole('button', { name: 'Open symbology' }).click()
    await expect(page.getByRole('heading', { name: 'Symbology' })).toBeVisible()
    await expect(page.getByText(/Style studio/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Apply symbology' })).toBeVisible()
  })

  test('legend shows classification bands', async ({ page }) => {
    await openToolByLabel(page, 'Legend')
    await expect(page.getByRole('heading', { name: 'Legend' })).toBeVisible()
    await expect(page.getByText(/Classification legend/)).toBeVisible()
    await expect(page.locator('.gs-aoi-report-swatch').first()).toBeVisible()
  })

  test('add data — upload staging and STAC explore', async ({ page }) => {
    await openToolByLabel(page, 'Add data')
    await expect(page.getByRole('heading', { name: 'Add data' })).toBeVisible()
    await expect(page.getByText('Staged uploads')).toBeVisible()
    await expect(page.getByText('Paste GeoJSON feature')).toBeVisible()
    await expect(page.getByText(/Planetary Computer STAC/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Search items' })).toBeVisible()
  })

  test('explore indexes — STAC + index catalog', async ({ page }) => {
    await expandIntelligenceTools(page)
    await openToolByLabel(page, 'Explore Indexes')
    await expect(page.getByRole('heading', { name: 'Explore Indexes' })).toBeVisible()
    await expect(page.getByText('Index catalog')).toBeVisible()
    await expect(page.getByText(/NDVI|EVI|NDWI/i).first()).toBeVisible()
  })

  test('quick dashboard and processing workflow', async ({ page }) => {
    await expandIntelligenceTools(page)
    await openToolByLabel(page, 'Quick Dashboard')
    await expect(page.getByRole('heading', { name: 'Quick Dashboard' })).toBeVisible()
    await expect(page.getByText('Processing workflow')).toBeVisible()
  })

  test('routing panel — GraphHopper gateway hint', async ({ page }) => {
    await openToolByLabel(page, 'Route')
    await expect(page.getByRole('heading', { name: 'Routing' })).toBeVisible()
    await expect(page.getByText(/GraphHopper via Axum gateway/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add waypoints' })).toBeVisible()
  })

  test('weather panel — Open-Meteo / gateway hint', async ({ page }) => {
    await openToolByLabel(page, 'Weather')
    await expect(page.getByRole('heading', { name: 'Weather' })).toBeVisible()
    await expect(page.getByText(/Open-Meteo at map pointer/)).toBeVisible()
    await expect(page.getByText('Show weather HUD')).toBeVisible()
  })

  test('print panel — map PNG export', async ({ page }) => {
    await openToolbox(page)
    await page.getByRole('button', { name: 'Print map' }).click()
    await expect(page.getByRole('heading', { name: 'Print' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Download map PNG' })).toBeVisible()
  })

  test('charts panel empty state', async ({ page }) => {
    await openToolByLabel(page, 'Remote sensing')
    await page.getByRole('button', { name: 'AOI timeline charts' }).click()
    await expect(page.getByRole('heading', { name: 'Charts' })).toBeVisible()
    await expect(
      page.getByText('Select or draw an AOI to view chart stats.'),
    ).toBeVisible()
  })

  test('elevation profile panel', async ({ page }) => {
    await openToolByLabel(page, 'Elev profile')
    await expect(page.getByRole('heading', { name: 'Elevation profile' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Measure line' })).toBeVisible()
  })
})
