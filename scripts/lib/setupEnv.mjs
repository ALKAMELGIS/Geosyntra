import fs from 'node:fs'
import path from 'node:path'
import { getRepoRoot, assertRepoLayout } from './repoRoot.mjs'

function copyIfMissing(target, example) {
  if (fs.existsSync(target)) return false
  if (!fs.existsSync(example)) return false
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.copyFileSync(example, target)
  return true
}

/**
 * Create local .env files and data dirs from examples (safe on any machine).
 */
export function setupProjectEnv(root = getRepoRoot(import.meta.url)) {
  if (process.env.SKIP_GEOSYNTRA_SETUP === '1') return { skipped: true }

  assertRepoLayout(root)

  const created = []
  const pairs = [
    [path.join(root, 'backend', '.env'), path.join(root, 'backend', '.env.example')],
    [path.join(root, 'frontend', '.env'), path.join(root, 'frontend', '.env.example')],
  ]
  for (const [target, example] of pairs) {
    if (copyIfMissing(target, example)) created.push(path.relative(root, target))
  }

  const dataDir = path.join(root, 'backend', 'server', 'data')
  fs.mkdirSync(dataDir, { recursive: true })

  return { root, created, dataDir }
}
