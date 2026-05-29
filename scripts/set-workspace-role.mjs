#!/usr/bin/env node
/**
 * Set a user's workspace RBAC role in the admin directory (SQLite or JSON).
 *
 * Usage:
 *   node scripts/set-workspace-role.mjs <email> [roleSlug]
 *
 * Examples:
 *   node scripts/set-workspace-role.mjs admin@Geosyntra.com super_admin
 *
 * Env (optional, same as backend/server):
 *   AGRI_USER_DB_PATH, AGRI_ADMIN_DIRECTORY_FILE
 * Loads `.env` from repo root when present.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createAuthDirectoryStore } from '../backend/server/authDirectoryStore.js'
import { promoteWorkspaceRole } from '../backend/server/rbac/promoteWorkspaceRole.js'

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

loadDotEnv()

const email = String(process.argv[2] || process.env.RBAC_PROMOTE_OWNER_EMAIL || '').trim()
const roleSlug = String(process.argv[3] || 'owner').trim()

if (!email) {
  console.error('Usage: node scripts/set-workspace-role.mjs <email> [roleSlug]')
  process.exit(1)
}

const { jsonFilePath, sqlitePath } = resolveStorePaths()
const storePath = sqlitePath && fs.existsSync(sqlitePath) ? sqlitePath : jsonFilePath

if (!fs.existsSync(storePath)) {
  console.error(`User store not found: ${storePath}`)
  console.error('Sign up once via the app, or point AGRI_USER_DB_PATH / AGRI_ADMIN_DIRECTORY_FILE at your production data.')
  process.exit(1)
}

const store = createAuthDirectoryStore({ jsonFilePath, sqlitePath: sqlitePath || undefined })
const result = promoteWorkspaceRole(store, email, roleSlug)

if (!result.ok) {
  console.error('Failed:', result)
  process.exit(1)
}

if (result.unchanged) {
  console.log(`No change — ${email} is already ${result.role} (${result.roleSlug}).`)
} else {
  console.log(`Updated ${email} → ${result.role} (${result.roleSlug}) [user id ${result.userId}]`)
  if (result.previousRole) {
    console.log(`  was: ${result.previousRole} (${result.previousRoleSlug})`)
  }
}

console.log(`Store: ${storePath}`)
