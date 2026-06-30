import { expect, test } from '../fixtures/test'

test.describe('wasm hydration', () => {
  test('loads wasm client bundle', async ({ page }) => {
    const jsOk = page.waitForResponse(
      (r) => r.url().includes('geosyntra-web') && r.url().endsWith('.js') && r.status() === 200,
    )
    const wasmOk = page.waitForResponse(
      (r) => r.url().includes('.wasm') && r.status() === 200,
    )
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await jsOk
    await wasmOk
    await expect(page.locator('script[src*="geosyntra-web"]')).toHaveCount(1)
  })
})
