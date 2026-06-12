#!/usr/bin/env node
/**
 * Create or promote a workspace Owner account (SQLite or JSON user store).
 *
 * Usage:
 *   node scripts/create-owner.mjs --email you@company.com --password "min-12-chars"
 *   node scripts/create-owner.mjs --email you@company.com --generate-password
 *
 * Env (optional, same as backend): AGRI_USER_DB_PATH, AGRI_ADMIN_DIRECTORY_FILE, .env in repo root
 *   RBAC_BOOTSTRAP_EMAIL, RBAC_BOOTSTRAP_PASSWORD, RBAC_BOOTSTRAP_NAME
 */
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createAuthDirectoryStore } from '../backend/server/authDirectoryStore.js'
import { createOrPromoteOwner } from '../backend/server/rbac/createOwnerAccount.js'
import { bootstrapSystemOwners } from '../backend/server/rbac/systemOwnerUser.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.join(__dirname, '..')
const SERVER_DIR = path.join(REPO_ROOT, 'backend', 'server')

function loadDotEnv() {
  const envPath = path.join(REPO_ROOT, '.env')
  if (!fs.existsSync(envPath)) return
  const text = fs.readFileSync(envPath, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq <= 0) continue
    const key = t.slice(0, eq).trim()
    let val = t.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (process.env[key] == null) process.env[key] = val
  }
}

function parseArgs(argv) {
  const out = {
    email: '',
    password: '',
    name: '',
    generatePassword: false,
    resetPassword: false,
    allowMultiple: false,
  }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--email' || a === '-e') out.email = String(argv[++i] || '').trim()
    else if (a === '--password' || a === '-p') out.password = String(argv[++i] || '')
    else if (a === '--name' || a === '-n') out.name = String(argv[++i] || '').trim()
    else if (a === '--generate-password') out.generatePassword = true
    else if (a === '--reset-password') out.resetPassword = true
    else if (a === '--allow-multiple-owners') out.allowMultiple = true
    else if (a === '--help' || a === '-h') out.help = true
  }
  if (!out.email) out.email = String(process.env.RBAC_BOOTSTRAP_EMAIL || '').trim()
  if (!out.password) out.password = String(process.env.RBAC_BOOTSTRAP_PASSWORD || '')
  if (!out.name) out.name = String(process.env.RBAC_BOOTSTRAP_NAME || 'System Owner').trim()
  return out
}

function resolveStorePaths() {
  const envAdminDirPath = process.env.AGRI_ADMIN_DIRECTORY_FILE?.trim()
  const jsonFilePath = envAdminDirPath
    ? path.isAbsolute(envAdminDirPath)
      ? envAdminDirPath
      : path.join(SERVER_DIR, envAdminDirPath)
    : path.join(SERVER_DIR, 'agri_admin_directory.json')

  const envUserDbPath = process.env.AGRI_USER_DB_PATH?.trim()
  const sqlitePath = envUserDbPath
    ? path.isAbsolute(envUserDbPath)
      ? envUserDbPath
      : path.join(SERVER_DIR, envUserDbPath)
    : ''

  return { jsonFilePath, sqlitePath }
}

function printHelp() {
  console.log(`Create or promote a GeoSyntra Owner account.

Usage:
  node scripts/create-owner.mjs --email <email> --password "<min 12 chars>"
  node scripts/create-owner.mjs --email <email> --generate-password [--name "Display Name"]

Options:
  --allow-multiple-owners   Create/promote even when another Owner already exists
  --name                    Display name (default: System Owner)

After creation, add the email to RBAC_SYSTEM_OWNER_EMAILS and VITE_RBAC_SYSTEM_OWNER_EMAILS
so OAuth logins always resolve to Owner.`)
}

loadDotEnv()
const args = parseArgs(process.argv)

if (args.help) {
  printHelp()
  process.exit(0)
}

if (!args.email) {
  console.error('Missing --email (or RBAC_BOOTSTRAP_EMAIL in .env).')
  printHelp()
  process.exit(1)
}

let password = args.password
if (args.generatePassword) {
  password = crypto.randomBytes(18).toString('base64url')
} else if (password.length < 12) {
  console.error('Password must be at least 12 characters (or use --generate-password).')
  process.exit(1)
}

const { jsonFilePath, sqlitePath } = resolveStorePaths()
const store = createAuthDirectoryStore({ jsonFilePath, sqlitePath: sqlitePath || undefined })

const result = createOrPromoteOwner(store, {
  email: args.email,
  password,
  name: args.name,
  allowWhenOtherOwnerExists: args.allowMultiple,
})

if (!result.ok) {
  console.error('Failed:', result)
  if (result.error === 'owner_exists') {
    console.error('Another Owner already exists. Re-run with --allow-multiple-owners to add this account.')
  }
  process.exit(1)
}

try {
  bootstrapSystemOwners(store)
} catch (e) {
  console.warn('[rbac] system owner patch skipped:', e?.message || e)
}

const storePath =
  sqlitePath && fs.existsSync(sqlitePath) ? sqlitePath : jsonFilePath

  if (result.unchanged || result.promoted || result.created) {
    if (args.resetPassword && password.length >= 12 && store.ensureOwnerProvisionedSignIn) {
      const repaired = store.ensureOwnerProvisionedSignIn({
        email: args.email,
        password,
        status: 'Active',
        emailVerified: true,
        provisionedBy: 'create-owner',
      })
      if (repaired?.ok) {
        console.log(`Password updated for ${args.email}.`)
      } else if (args.resetPassword) {
        console.error('Password reset failed:', repaired?.error || 'unknown')
        process.exit(1)
      }
    }
  }

  if (result.unchanged) {
    if (!args.resetPassword) {
      console.log(`No change — ${args.email} is already Owner.`)
    }
  } else if (result.promoted) {
  console.log(`Promoted ${args.email} → Owner (user id ${result.userId}).`)
} else if (result.created) {
  console.log(`Created Owner account: ${args.email} (user id ${result.userId}).`)
  if (args.generatePassword) {
    console.log('')
    console.log('Generated password (save now — not stored in logs):')
    console.log(password)
  }
}

console.log(`User store: ${storePath}`)
console.log('')
console.log('Next steps:')
console.log(`  1. Sign in at the app with ${args.email}`)
console.log('  2. Open Settings → Admin → User Management')
console.log(
  `  3. Add to .env: RBAC_SYSTEM_OWNER_EMAILS=${args.email}`,
)
console.log(
  `     and VITE_RBAC_SYSTEM_OWNER_EMAILS=${args.email} (rebuild frontend)`,
)
