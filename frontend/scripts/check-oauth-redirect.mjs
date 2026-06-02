import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
let authUrl = ''

page.on('request', (req) => {
  const u = req.url()
  if (u.includes('accounts.google.com/o/oauth2') || u.includes('linkedin.com/oauth/v2/authorization')) {
    authUrl = u
  }
})

await page.goto('http://localhost:5173/Geosyntra/#/?start=1&wizard=auth&mode=signin', {
  waitUntil: 'networkidle',
  timeout: 60000,
})
await page.waitForTimeout(5000)

const googleBtn = page.getByRole('button', { name: /Continue with Google/i })
if ((await googleBtn.count()) > 0) {
  await googleBtn.first().click({ timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(4000)
}

if (authUrl) {
  const u = new URL(authUrl)
  console.log('provider:', authUrl.includes('linkedin') ? 'linkedin' : 'google')
  console.log('redirect_uri:', decodeURIComponent(u.searchParams.get('redirect_uri') || ''))
  console.log('client_id:', u.searchParams.get('client_id') || '')
} else {
  console.log('No OAuth navigation captured (popup may block headless).')
  const env = await page.evaluate(() => ({
    google: import.meta.env?.VITE_AUTH_GOOGLE_REDIRECT_URI,
    linkedin: import.meta.env?.VITE_AUTH_LINKEDIN_REDIRECT_URI,
    base: import.meta.env?.BASE_URL,
    origin: window.location.origin,
  }))
  console.log('SPA env:', env)
}

await browser.close()
