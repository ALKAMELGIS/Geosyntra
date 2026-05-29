/**
 * Periodic reload of local .env files (development only).
 * Production Hostinger injects env at process start — use hPanel + redeploy to rotate secrets.
 */
import path from 'path'
import { isProductionDeployment } from './bootstrapEnv.js'
import { reloadEnvFile } from './loadEnvFile.js'
import { TOKEN_REGISTRY } from './tokenManager/tokenRegistry.js'
import { bumpTokenRevision } from './tokenManager/tokenRevision.js'

const TOKEN_ENV_KEYS = [...new Set(TOKEN_REGISTRY.flatMap(t => t.envKeys))]

/**
 * @param {string} repoRoot
 * @param {{ intervalMs?: number }} [opts]
 */
export function startEnvConfigReload(repoRoot, opts = {}) {
  if (isProductionDeployment()) {
    console.log(
      '[env-reload] Production — using Hostinger Node.js environment variables only (no .env polling)',
    )
    return () => {}
  }

  const intervalMs = Math.max(Number(opts.intervalMs) || 60_000, 15_000)
  const files = [path.join(repoRoot, 'backend', '.env'), path.join(repoRoot, '.env')]

  let lastSnapshot = snapshotTokenEnv()

  const tick = () => {
    try {
      for (const file of files) {
        reloadEnvFile(file, { override: true, keys: TOKEN_ENV_KEYS })
      }
      const next = snapshotTokenEnv()
      if (next !== lastSnapshot) {
        lastSnapshot = next
        bumpTokenRevision('env_file_reload')
        console.log('[env-reload] Token environment keys refreshed from disk')
      }
    } catch (e) {
      console.error('[env-reload] failed', e)
    }
  }

  tick()
  const handle = setInterval(tick, intervalMs)
  if (typeof handle.unref === 'function') handle.unref()
  return () => clearInterval(handle)
}

function snapshotTokenEnv() {
  const parts = []
  for (const key of TOKEN_ENV_KEYS) {
    const v = process.env[key]
    if (v) parts.push(`${key}=${v.length}`)
  }
  parts.sort()
  return parts.join('|')
}
