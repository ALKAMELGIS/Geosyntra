import { expect, type Page } from 'playwright/test'

const SETTINGS_LINKS: Record<string, string> = {
  '/settings/profile': 'Profile',
  '/settings/api-integrations': 'API integrations',
}

/** SPA navigation into settings sections. */
export async function openSettingsPage(page: Page, path: string) {
  if (!page.url().includes('/settings')) {
    await page.locator('.gs-app-nav').getByRole('link', { name: 'Settings', exact: true }).click()
    await expect(page).toHaveURL(/\/settings/, { timeout: 15_000 })
  }
  const label = SETTINGS_LINKS[path]
  if (label) {
    await page.locator('.gs-sidebar--settings').getByRole('link', { name: label }).click()
  }
  await expect(page).toHaveURL(new RegExp(path.replace(/\//g, '\\/')), { timeout: 15_000 })
}
