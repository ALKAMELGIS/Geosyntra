/**
 * Fails CI if GitHub Pages would ship a stub index.html instead of the Vite app shell
 * (e.g. an old "Opening Agri Cloud…" / "Opening Geosyntra…" bootstrap page without React bundles).
 */
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

const indexPath = path.join(root, 'frontend', 'dist', 'index.html')
const html = fs.readFileSync(indexPath, 'utf8')

const errors = []
if (html.includes('/src/main.tsx')) {
  errors.push('dist/index.html still points to Vite dev entry (/src/main.tsx).')
}
if (!/assets\/index-[^"'\\s]+\.js/.test(html)) {
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
const notFoundPath = path.join(distDir, '404.html')
const geosyntraShellPath = path.join(distDir, 'Geosyntra.html')
/** GitHub Pages requires `404.html` for unknown paths; `Geosyntra.html` is the branded SPA shell copy. */
fs.writeFileSync(notFoundPath, shellHtml)
fs.writeFileSync(geosyntraShellPath, shellHtml)
console.log('pages-dist-check: wrote frontend/dist/404.html and Geosyntra.html from index.html (SPA shell).')
const nojekyllPath = path.join(distDir, '.nojekyll')
if (!fs.existsSync(nojekyllPath)) {
  fs.writeFileSync(nojekyllPath, '')
  console.log('pages-dist-check: created frontend/dist/.nojekyll')
}

console.log('Pages dist check OK.')
