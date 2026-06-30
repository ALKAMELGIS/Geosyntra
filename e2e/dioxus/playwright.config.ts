import { defineConfig, devices } from 'playwright/test'

const baseURL = process.env.GEOSYNTRA_WEB_URL ?? 'http://127.0.0.1:8080'

const headed = process.env.HEADED === '1' || process.argv.includes('--headed')

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: !headed,
  workers: headed ? 1 : undefined,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(headed
      ? { headless: false, launchOptions: { slowMo: 250 } }
      : {
          launchOptions: {
            args: ['--disable-gpu', '--use-angle=swiftshader', '--use-gl=swiftshader'],
          },
        }),
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
