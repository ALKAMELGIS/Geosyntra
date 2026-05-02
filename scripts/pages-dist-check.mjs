/**
 * Fails CI if GitHub Pages would ship a stub index.html instead of the Vite app shell
 * (e.g. the old "Opening Agri Cloud…" bootstrap page without React bundles).
 */
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

const rootIndexPath = path.join(root, 'index.html')
if (fs.existsSync(rootIndexPath)) {
  console.error(
    'Pages check failed: delete repository root index.html. It is not the Vite app; if GitHub Pages ' +
      'uses "Deploy from branch" at /, GitHub serves that file instead of frontend/dist and the SPA breaks.',
  )
  process.exit(1)
}

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
const notFoundPath = path.join(distDir, '404.html')
if (!fs.existsSync(notFoundPath)) {
  fs.copyFileSync(indexPath, notFoundPath)
  console.log('pages-dist-check: created frontend/dist/404.html from index.html (SPA fallback).')
}
const nojekyllPath = path.join(distDir, '.nojekyll')
if (!fs.existsSync(nojekyllPath)) {
  fs.writeFileSync(nojekyllPath, '')
  console.log('pages-dist-check: created frontend/dist/.nojekyll')
}

console.log('Pages dist check OK.')
