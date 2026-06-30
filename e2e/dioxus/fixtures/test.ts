/**
 * Playwright test entry — attaches console/network monitors to every test.
 * Import `test` and `expect` from here, not from `@playwright/test` directly.
 */
import { test as base, expect } from 'playwright/test'

import {
  assertCleanConsole,
  attachConsoleMonitor,
  type ConsoleIssue,
} from './console-monitor'

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const issues: ConsoleIssue[] = []
    attachConsoleMonitor(page, issues)
    await use(page)
    await assertCleanConsole(issues, testInfo)
  },
})

export { expect }
