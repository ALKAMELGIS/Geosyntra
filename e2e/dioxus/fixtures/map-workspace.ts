import { expect, type Page } from 'playwright/test'

import { loginViaApi } from './auth.js'

export async function gotoSatelliteMap(page: Page) {
  await loginViaApi(page)
  await expect(page).toHaveURL(/\/satellite\/indices/)
}

export async function openToolbox(page: Page) {
  await expect(page.getByTestId('toolbox-dock')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.gs-native-toolbox-rail')).toBeVisible({ timeout: 10_000 })
}

export async function expectNativeMapWorkspace(page: Page) {
  await expect(page.getByTestId('native-map-canvas')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('.mapboxgl-canvas')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByTestId('map-tools-dock')).toBeVisible({ timeout: 15_000 })
  await openToolbox(page)
  await expect(page.locator('.gs-native-status-bar')).toBeVisible()
}

export async function openToolByLabel(page: Page, label: string) {
  await openToolbox(page)
  await page.locator(`.gs-native-toolbox-rail__btn[aria-label="${label}"]`).click()
  await expect(page.getByTestId('gis-tool-panel')).toBeVisible({ timeout: 10_000 })
}

export async function expandIntelligenceTools(page: Page) {
  const toggle = page.getByRole('button', { name: 'Intelligence tools', exact: true })
  const expanded = await toggle.getAttribute('aria-expanded')
  if (expanded !== 'true') {
    await toggle.click()
  }
}
