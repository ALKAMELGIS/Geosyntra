#!/usr/bin/env node
/**
 * Bootstrap local environment files (portable). Run: npm run setup
 */
import { setupProjectEnv } from './lib/setupEnv.mjs'

const result = setupProjectEnv()
if (result.skipped) {
  console.log('[setup] SKIP_GEOSYNTRA_SETUP=1 — skipped.')
  process.exit(0)
}
if (result.created.length) {
  console.log('[setup] Created:', result.created.join(', '))
} else {
  console.log('[setup] .env files already present.')
}
console.log('[setup] Data directory:', result.dataDir)
