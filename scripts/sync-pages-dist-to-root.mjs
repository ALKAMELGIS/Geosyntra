/**
 * Copies frontend/dist into the repository root for GitHub Pages (main / root).
 * Removes known prior deploy outputs before copy. With --git-add, stages paths using -f
 * so files under .gitignore (ignored to block accidental local commits) still commit in CI.
 */
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const root = process.cwd()
const dist = path.join(root, 'frontend', 'dist')

const managedTopLevel = [
  'assets',
  'avatars',
  'index.html',
  '404.html',
  'Geosyntra.html',
  '.nojekyll',
  'vite.svg',
  'robots.txt',
  'manifest.webmanifest',
  'registerSW.js',
  'sw.js',
  'favicon.svg',
  'favicon.png',
  'favicon-16x16.png',
  'favicon-32x32.png',
]

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true })
}

if (!fs.existsSync(dist)) {
  console.error('sync-pages-dist-to-root: frontend/dist not found. Run npm run build first.')
  process.exit(1)
}

for (const name of managedTopLevel) {
  const target = path.join(root, name)
  if (fs.existsSync(target)) rmrf(target)
}

const entries = fs.readdirSync(dist, { withFileTypes: true })
for (const ent of entries) {
  const from = path.join(dist, ent.name)
  const to = path.join(root, ent.name)
  fs.cpSync(from, to, { recursive: true })
}

console.log('sync-pages-dist-to-root: copied', entries.map((e) => e.name).join(', '))

function gitStageDeploy() {
  const dirs = ['assets', 'avatars']
  for (const name of dirs) {
    try {
      execSync(`git add -f -A -- "${name}"`, { cwd: root, stdio: 'inherit' })
    } catch {
      execSync(`git rm -rf --cached --ignore-unmatch -- "${name}"`, { cwd: root, stdio: 'inherit' })
    }
  }
  const files = managedTopLevel.filter((n) => !dirs.includes(n) && n !== '.nojekyll')
  for (const name of files) {
    const p = path.join(root, name)
    if (fs.existsSync(p)) {
      execSync(`git add -f -A -- "${name}"`, { cwd: root, stdio: 'inherit' })
    } else {
      execSync(`git rm --cached --ignore-unmatch -f -- "${name}"`, { cwd: root, stdio: 'inherit' })
    }
  }
  const nojekyll = path.join(root, '.nojekyll')
  if (fs.existsSync(nojekyll)) {
    execSync('git add -f -- .nojekyll', { cwd: root, stdio: 'inherit' })
  } else {
    execSync('git rm --cached --ignore-unmatch -f -- .nojekyll', { cwd: root, stdio: 'inherit' })
  }
}

if (process.argv.includes('--git-add')) {
  gitStageDeploy()
}
