/**
 * Hostinger production: secrets come only from hPanel → Node.js App → process.env.
 * Local development: load backend/.env + repo root .env (never frontend/.env with VITE_* keys).
 */
import path from 'path'
import { platformEnvVar } from './platformDataPaths.js'
import { loadEnvFile } from './loadEnvFile.js'
import {
  auditRequiredProductionEnv,
  getRequiredProductionEnvGroups,
  logEnvironmentBindings,
  resolveEnvFromGroup,
  validateMapboxEnvStartup,
  validateProductionStartup,
} from './env.js'

/** @deprecated Use getRequiredProductionEnvGroups() from env.js */
export const REQUIRED_HOSTINGER_ENV_GROUPS = Object.freeze(
  getRequiredProductionEnvGroups().map(g => ({ name: g.name, keys: g.keys })),
)

export { resolveEnvFromGroup, getRequiredProductionEnvGroups, auditRequiredProductionEnv } from './env.js'

export function isProductionDeployment() {
  if (process.env.GEOSYNTRA_ENV === 'production') return true
  if (process.env.NODE_ENV === 'production') return true
  return false
}

export function validateRequiredProductionEnv() {
  validateProductionStartup()
}

/**
 * @param {{ repoRoot: string }} opts
 * @returns {{ production: boolean }}
 */
export function bootstrapServerEnvironment({ repoRoot }) {
  const production = isProductionDeployment()

  if (!production) {
    const backendEnv = path.join(repoRoot, 'backend', '.env')
    const rootEnv = path.join(repoRoot, '.env')
    loadEnvFile(backendEnv)
    loadEnvFile(rootEnv)
    console.log('[env] Development mode — loaded local .env files (backend/.env, root .env only)')
    logEnvironmentBindings()
    validateMapboxEnvStartup()
    return { production: false }
  }

  validateProductionStartup()

  const { present } = auditRequiredProductionEnv()
  console.log('[env] Environment variables loaded successfully from Hostinger Node.js App settings')
  for (const row of present) {
    console.log(`[env]   ✓ ${row.canonical} (${row.envKey})`)
  }
  logEnvironmentBindings()
  validateMapboxEnvStartup()

  if (!platformEnvVar('API_VAULT_MASTER_KEY')) {
    console.warn(
      '[env] WARN: GEOSYNTRA_API_VAULT_MASTER_KEY is unset — tokens may be stored in plaintext envelopes (dev only).',
    )
  }

  return { production: true }
}
