import fs from 'fs'
import path from 'path'

function parseEnvLine(trimmed) {
  const eq = trimmed.indexOf('=')
  if (eq <= 0) return null
  const key = trimmed.slice(0, eq).trim()
  if (!key) return null
  let value = trimmed.slice(eq + 1).trim()
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  }
  return { key, value }
}

/**
 * Load KEY=VALUE pairs from a .env file into process.env (does not override existing vars).
 * @param {string} filePath
 */
export function loadEnvFile(filePath) {
  return reloadEnvFile(filePath, { override: false })
}

/**
 * Reload env file — optionally override selected keys (Hostinger file sync / token rotation).
 * @param {string} filePath
 * @param {{ override?: boolean, keys?: string[] | null }} [opts]
 */
export function reloadEnvFile(filePath, opts = {}) {
  const override = opts.override === true
  const keys = Array.isArray(opts.keys) ? new Set(opts.keys) : null
  const resolved = path.resolve(filePath)
  if (!fs.existsSync(resolved)) return false
  const raw = fs.readFileSync(resolved, 'utf8')
  let applied = 0
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const parsed = parseEnvLine(trimmed)
    if (!parsed) continue
    const { key, value } = parsed
    if (keys && !keys.has(key)) continue
    if (!override && process.env[key] !== undefined) continue
    process.env[key] = value
    applied += 1
  }
  return applied > 0
}
