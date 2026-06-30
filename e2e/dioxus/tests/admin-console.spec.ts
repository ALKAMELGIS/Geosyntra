import { expect, test } from '../fixtures/test'

import { loginAsAdmin, openAdminPage } from '../fixtures/admin.js'

const adminPaths = [
  { path: '/admin/policies', heading: /polic/i },
  { path: '/admin/users', heading: /user/i },
  { path: '/admin/team', heading: /team|invite/i },
  { path: '/admin/roles', heading: /role|permission|matrix/i },
  { path: '/admin/audit', heading: /audit/i },
  { path: '/admin/governance', heading: /governance inbox/i },
  { path: '/admin/tenants', heading: /tenant/i },
  { path: '/admin/memberships', heading: /membership/i },
  { path: '/admin/grants', heading: /grant/i },
  { path: '/admin/platform', heading: /platform config/i },
  { path: '/admin/tokens', heading: /token/i },
]

test.describe('admin console', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  for (const { path, heading } of adminPaths) {
    test(`${path} loads`, async ({ page }) => {
      await openAdminPage(page, path)
      await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible()
    })
  }
})
