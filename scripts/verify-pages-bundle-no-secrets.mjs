/**
 * Fail CI before pushing root assets if a Mapbox secret token was baked into the bundle.
 */
import fs from 'node:fs'
import path from 'node:path'

const distAssets = path.join(process.cwd(), 'frontend', 'dist', 'assets')
if (!fs.existsSync(distAssets)) {
  console.error('verify-pages-bundle-no-secrets: frontend/dist/assets missing')
  process.exit(1)
}

const secretPattern = /pk\.eyJ[A-Za-z0-9_-]{20,}/
for (const name of fs.readdirSync(distAssets)) {
  if (!name.endsWith('.js')) continue
  const file = path.join(distAssets, name)
  const text = fs.readFileSync(file, 'utf8')
  if (secretPattern.test(text)) {
    console.error(`verify-pages-bundle-no-secrets: Mapbox secret pattern found in dist/assets/${name}`)
    process.exit(1)
  }
}

console.log('verify-pages-bundle-no-secrets: OK')
