import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Walk upward from any script until workspace root package.json is found. */
export function getRepoRoot(fromMetaUrl = import.meta.url) {
  let dir = path.dirname(fileURLToPath(fromMetaUrl))
  for (let i = 0; i < 8; i += 1) {
    const pkgPath = path.join(dir, 'package.json')
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
        if (pkg?.name === 'geosyntra-platform' || Array.isArray(pkg?.workspaces)) {
          return dir
        }
      } catch {
        /* continue */
      }
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error('Could not locate GeoSyntra repository root (geosyntra-platform package.json)')
}

export function assertRepoLayout(root) {
  const required = [
    'package.json',
    'frontend/package.json',
    'backend/package.json',
    'frontend/vite.config.ts',
    'backend/server/index.js',
  ]
  const missing = required.filter(rel => !fs.existsSync(path.join(root, rel)))
  if (missing.length) {
    throw new Error(`Invalid GeoSyntra layout. Missing: ${missing.join(', ')}`)
  }
}
