/**
 * Auto Environment Recovery — runtime audit of process.env + resolved system tokens.
 * Production Hostinger: env vars are fixed at process start; this detects DB/env drift and logs clearly.
 */
import { auditEnvironmentBindings, auditRequiredProductionEnv } from './env.js'
import { bumpTokenRevision } from './tokenManager/tokenRevision.js'
import { TOKEN_REGISTRY } from './tokenManager/tokenRegistry.js'

/**
 * @param {(name: string) => Promise<string | null>} getSystemToken
 */
export async function auditRuntimeTokenResolution(getSystemToken) {
  const envRows = auditEnvironmentBindings()
  const resolved = []
  const unresolved = []

  for (const meta of TOKEN_REGISTRY) {
    let value = null
    try {
      value = await getSystemToken(meta.name)
    } catch {
      value = null
    }
    const ok = Boolean(value?.trim())
    if (ok) resolved.push(meta.name)
    else unresolved.push(meta.name)
  }

  const required = auditRequiredProductionEnv()
  return {
    envBindings: envRows,
    resolved,
    unresolved,
    requiredMissing: required.missing,
    healthy: required.missing.length === 0 && unresolved.filter(n => {
      const meta = TOKEN_REGISTRY.find(t => t.name === n)
      return meta?.requiredInProduction
    }).length === 0,
  }
}

/**
 * @param {{
 *   getSystemToken: (name: string) => Promise<string | null>
 *   intervalMs?: number
 *   isProduction?: boolean
 * }} opts
 */
export function startEnvironmentRecoveryMonitor(opts) {
  const intervalMs = Math.max(Number(opts.intervalMs) || 120_000, 30_000)
  let lastSnapshot = ''

  const tick = async () => {
    try {
      const report = await auditRuntimeTokenResolution(opts.getSystemToken)
      const snapshot = [
        report.requiredMissing.join(','),
        report.unresolved.join(','),
        report.resolved.join(','),
      ].join('|')

      if (report.requiredMissing.length) {
        console.error(
          `[env-recovery] REQUIRED API keys missing: ${report.requiredMissing.join(', ')} — set in Hostinger hPanel → Node.js → Environment Variables, then Restart.`,
        )
      }

      const optionalLost = report.unresolved.filter(n => {
        const meta = TOKEN_REGISTRY.find(t => t.name === n)
        return meta && !meta.requiredInProduction
      })
      if (optionalLost.length) {
        console.warn(`[env-recovery] Optional integrations unset: ${optionalLost.join(', ')}`)
      }

      if (snapshot !== lastSnapshot) {
        if (lastSnapshot) {
          bumpTokenRevision('env_recovery_change')
          console.log('[env-recovery] Token resolution changed — clients should refresh session capabilities')
        }
        lastSnapshot = snapshot
        if (report.healthy) {
          console.log(
            `[env-recovery] OK — ${report.resolved.length}/${TOKEN_REGISTRY.length} platform token(s) available to all users`,
          )
        }
      }
    } catch (e) {
      console.error('[env-recovery] audit failed', e)
    }
  }

  void tick()
  const handle = setInterval(() => void tick(), intervalMs)
  if (typeof handle.unref === 'function') handle.unref()

  console.log(
    `[env-recovery] Monitor started (every ${Math.round(intervalMs / 1000)}s) — Hostinger process.env + SQLite token store`,
  )

  return () => clearInterval(handle)
}
