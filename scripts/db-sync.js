#!/usr/bin/env node
'use strict'
/**
 * Entry point for `node scripts/db-sync.js` (delegates to ESM implementation).
 */
const { spawnSync } = require('node:child_process')
const path = require('node:path')

const child = spawnSync(process.execPath, [path.join(__dirname, 'db-sync.mjs'), ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
})

process.exit(child.status === null ? 1 : child.status)
