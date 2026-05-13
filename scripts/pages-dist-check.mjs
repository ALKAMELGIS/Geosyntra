/**
 * Fails CI if GitHub Pages would ship a stub index.html instead of the Vite app shell
 * (e.g. an old "Opening Agri Cloud…" / "Opening Geosyntra…" bootstrap page without React bundles).
 */
import fs from 'node:fs'
import path from 'node:path'
import { link404ToGeosyntra } from './link-404-to-geosyntra.mjs'

const root = process.cwd()

const indexPath = path.join(root, 'frontend', 'dist', 'index.html')
const html = fs.readFileSync(indexPath, 'utf8')

const errors = []
if (html.includes('/src/main.tsx')) {
  errors.push('dist/index.html still points to Vite dev entry (/src/main.tsx).')
}
/* The previous `[^"'\\s]+` pattern was double-escaping the whitespace class
 * inside a regex literal — so it actually excluded the literal letter `s`,
 * not whitespace. Local hashes like `index-DNeZeOVN.js` have no lowercase
 * `s` and slipped through; CI built a hash that contained `s` and the
 * sanity-check failed within sub-second timing. `\S+` is unambiguous. */
if (!/assets\/index-\S+\.js/.test(html)) {
  errors.push('dist/index.html does not reference a built assets/index-*.js bundle.')
}
if (!/id=["']root["']/.test(html)) {
  errors.push('dist/index.html must include <div id="root"> (Vite app shell).')
}
const stubMarkers = [
  'boot-card',
  'Opening Agri Cloud',
  'Opening Geosyntra',
  'boot-open-app',
  'published from the Vite build',
  'not this file',
]
for (const m of stubMarkers) {
  if (html.includes(m)) {
    errors.push(`dist/index.html must not contain bootstrap stub marker: ${m}`)
  }
}

if (errors.length) {
  console.error('Pages dist check failed:\n- ' + errors.join('\n- '))
  process.exit(1)
}

const distDir = path.join(root, 'frontend', 'dist')
const shellHtml = html
const geosyntraShellPath = path.join(distDir, 'Geosyntra.html')
fs.writeFileSync(geosyntraShellPath, shellHtml)
try {
  link404ToGeosyntra(distDir)
  console.log('pages-dist-check: Geosyntra.html written; 404.html is a hard link or symlink (single HTML blob).')
} catch (e) {
  console.error('pages-dist-check:', e?.message || e)
  process.exit(1)
}
const nojekyllPath = path.join(distDir, '.nojekyll')
if (!fs.existsSync(nojekyllPath)) {
  fs.writeFileSync(nojekyllPath, '')
  console.log('pages-dist-check: created frontend/dist/.nojekyll')
}

console.log('Pages dist check OK.')
