#!/usr/bin/env node
/**
 * Portable startup validation — Node, workspaces, env, data paths.
 * Usage: npm run validate   |   npm run dev (runs --quick via predev)
 */
import fs from 'node:fs'
import path from 'node:path'
import { getRepoRoot, assertRepoLayout } from './lib/repoRoot.mjs'
import { setupProjectEnv } from './lib/setupEnv.mjs'

const quick = process.argv.includes('--quick')
const root = getRepoRoot(import.meta.url)
const errors = []
const warnings = []

function ok(msg) {
  console.log(`  ✓ ${msg}`)
}

function warn(msg) {
  warnings.push(msg)
  console.log(`  ⚠ ${msg}`)
}

function fail(msg) {
  errors.push(msg)
  console.log(`  ✗ ${msg}`)
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  const out = {}
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 1) continue
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
  return out
}

function hasAbsolutePathInEnv(vars) {
  const bad = []
  for (const [k, v] of Object.entries(vars)) {
    if (!v) continue
    if (/^[A-Za-z]:\\/.test(v) || /^\\\\/.test(v) || v.includes('OneDrive\\')) {
      bad.push(k)
    }
  }
  return bad
}

function parseNodeMajor() {
  const v = process.versions.node
  const major = Number.parseInt(v.split('.')[0], 10)
  return { v, major }
}

console.log('\nGeoSyntra — startup validation\n')
console.log(`Repo: ${root}\n`)

try {
  assertRepoLayout(root)
  ok('Repository layout')
} catch (e) {
  fail(e instanceof Error ? e.message : String(e))
}

const { major, v } = parseNodeMajor()
if (major >= 18) ok(`Node.js ${v}`)
else fail(`Node.js ${v} — require >= 18.18`)

const nmRoot = path.join(root, 'node_modules')
if (fs.existsSync(nmRoot)) ok('node_modules (workspace root)')
else fail('node_modules missing — run: npm install')

for (const ws of ['frontend', 'backend']) {
  const pkg = path.join(root, ws, 'package.json')
  if (fs.existsSync(pkg)) ok(`${ws}/package.json`)
  else fail(`Missing ${ws}/package.json`)
}

setupProjectEnv(root)

const backendEnvPath = path.join(root, 'backend', '.env')
const frontendEnvPath = path.join(root, 'frontend', '.env')

if (fs.existsSync(backendEnvPath)) ok('backend/.env')
else warn('backend/.env missing — run: npm run setup')

if (fs.existsSync(frontendEnvPath)) ok('frontend/.env')
else warn('frontend/.env missing — run: npm run setup')

const be = parseEnvFile(backendEnvPath)
const fe = parseEnvFile(frontendEnvPath)

for (const file of [backendEnvPath, frontendEnvPath]) {
  if (!fs.existsSync(file)) continue
  const vars = file === backendEnvPath ? be : fe
  const badKeys = hasAbsolutePathInEnv(vars)
  if (badKeys.length) {
    fail(`${path.relative(root, file)} contains machine-specific paths: ${badKeys.join(', ')}`)
  } else {
    ok(`${path.relative(root, file)} uses portable paths`)
  }
}

if (!be.JWT_SECRET && !quick) warn('backend/.env: JWT_SECRET not set (required for auth in production)')
if (!be.SESSION_SECRET && !quick) warn('backend/.env: SESSION_SECRET not set')

const apiUrl = fe.VITE_API_BASE_URL || 'http://localhost:3001'
if (apiUrl.startsWith('http://') || apiUrl.startsWith('https://') || apiUrl === '') {
  ok(`VITE_API_BASE_URL=${apiUrl || '(empty — same origin)'}`)
} else {
  warn('VITE_API_BASE_URL should be a full URL or empty')
}

if (!fe.VITE_MAPBOX_TOKEN && !quick) {
  warn(
    'VITE_MAPBOX_TOKEN empty — production uses Hostinger MAPBOX on the API server; dev may set MAPBOX in backend/.env',
  )
}

const requiredBackendKeys = ['MAPBOX', 'GEMINI_API_KEY', 'OPENAI']
if (!quick) {
  const missingBackend = requiredBackendKeys.filter(k => !be[k] && !be[k.replace('_API_KEY', '')])
  if (missingBackend.length === 0) {
    ok('backend/.env: required API keys (MAPBOX, GEMINI, OPENAI) present for local dev')
  } else {
    warn(
      `backend/.env missing API keys for local dev: ${missingBackend.join(', ')} — set Hostinger canonical names`,
    )
  }
  if (fe.VITE_MAPBOX_TOKEN || fe.VITE_GEMINI_API_KEY) {
    warn(
      'frontend/.env contains VITE_* API keys — move secrets to backend/.env / Hostinger hPanel only',
    )
  }
}

const dataDir = path.join(root, 'backend', 'server', 'data')
fs.mkdirSync(dataDir, { recursive: true })
ok(`Data directory: ${path.relative(root, dataDir)}`)

const dbRel = be.AGRI_USER_DB_PATH || 'geosyntra_platform.db'
const dbPath = path.isAbsolute(dbRel) ? dbRel : path.join(dataDir, dbRel)
if (!quick) {
  try {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    if (fs.existsSync(dbPath)) ok(`SQLite database present: ${path.relative(root, dbPath)}`)
    else ok(`SQLite will be created on first API start: ${path.relative(root, dbPath)}`)
  } catch (e) {
    warn(`Database path check: ${e instanceof Error ? e.message : String(e)}`)
  }
}

if (!quick) {
  const oauthKeys = ['GOOGLE_CLIENT_ID', 'GITHUB_CLIENT_ID', 'LINKEDIN_CLIENT_ID']
  const anyOAuth = oauthKeys.some(k => be[k] || be[`${k.replace('_CLIENT', '_OAUTH_CLIENT')}`])
  if (anyOAuth) ok('OAuth provider credentials configured')
  else warn('No OAuth client IDs in backend/.env — SSO buttons may be hidden until configured')
}

console.log('')
if (warnings.length) {
  console.log(`Warnings (${warnings.length}):`)
  warnings.forEach(w => console.log(`  - ${w}`))
  console.log('')
}

if (errors.length) {
  console.error(`Failed (${errors.length}). Fix errors above, then run npm run setup && npm install\n`)
  process.exit(1)
}

console.log(quick ? 'Quick validation passed.\n' : 'Validation passed. Run: npm run dev\n')
