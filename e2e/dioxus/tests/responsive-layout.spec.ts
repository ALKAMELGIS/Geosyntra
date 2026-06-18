import { expect, test } from 'playwright/test'

import { loginViaApi } from '../fixtures/auth.js'

/**
 * Task 25.6 — responsive viewport matrix (port of React home-grid patterns).
 */
const VIEWPORTS = [
  { name: 'mobile-320', width: 320, height: 780 },
  { name: 'tablet-768', width: 768, height: 900 },
  { name: 'desktop-1200', width: 1200, height: 900 },
  { name: '4k-3840', width: 3840, height: 1400 },
] as const

async function expectNoHorizontalOverflow(page: import('playwright/test').Page) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 2)
}

test.describe('responsive layout (Task 25.6)', () => {
  for (const vp of VIEWPORTS) {
    test(`${vp.name}: public landing nav and hero`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto('/', { waitUntil: 'networkidle' })
      await expect(page.locator('.gs-app-nav')).toBeVisible()
      await expect(page.locator('.gs-landing-hero')).toBeVisible()
      await expectNoHorizontalOverflow(page)
    })

    test(`${vp.name}: signed-in dashboard uses unified nav`, async ({ page }) => {
      await loginViaApi(page)
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto('/dashboard', { waitUntil: 'networkidle' })
      await expect(page.locator('.gs-app-nav')).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
      await expect(
        page.locator('.gs-app-nav').getByRole('link', { name: 'GeoAI', exact: true }),
      ).toBeVisible()
    })
  }
})
