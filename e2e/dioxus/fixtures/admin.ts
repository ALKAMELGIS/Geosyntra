import { expect, type Page } from 'playwright/test'

import { loginViaApiDashboard } from './auth.js'

const ADMIN_LINKS: Record<string, string | RegExp> = {
  '/admin/policies': 'Policy versions',
  '/admin/users': 'Users',
  '/admin/team': 'Team & invites',
  '/admin/roles': 'Roles',
  '/admin/audit': 'Audit log',
  '/admin/governance': /Governance/i,
  '/admin/tenants': 'Tenants',
  '/admin/memberships': 'Memberships',
  '/admin/grants': 'Grants',
  '/admin/platform': 'Platform config',
  '/admin/tokens': 'System tokens',
}

export async function loginAsAdmin(page: Page) {
  await loginViaApiDashboard(page)
}

/** SPA navigation — avoids full reload that drops in-memory auth before localStorage hydrates. */
export async function openAdminPage(page: Page, path: string) {
  if (!page.url().includes('/admin')) {
    await page.locator('.gs-app-nav').getByRole('link', { name: 'Admin', exact: true }).click()
    await expect(page).toHaveURL(/\/admin/, { timeout: 15_000 })
  }
  const label = ADMIN_LINKS[path]
  if (!label) {
    throw new Error(`Unknown admin path: ${path}`)
  }
  await page.locator('.gs-sidebar--admin').getByRole('link', { name: label }).click()
  await expect(page).toHaveURL(new RegExp(path.replace(/\//g, '\\/')), { timeout: 15_000 })
}
