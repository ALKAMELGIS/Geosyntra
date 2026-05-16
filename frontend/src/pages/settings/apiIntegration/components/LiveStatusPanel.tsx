import { cn } from '../../../../lib/utils'
import type { IntegrationDraft, IntegrationStatus } from '../types'
import { IntegrationStatusBadge } from './IntegrationStatusBadge'
import { labelForVaultType, vaultTypeForProvider } from '../vaultBridge'

type Props = {
  draft: IntegrationDraft
  connectionStatus: IntegrationStatus
  connectionMessage: string | null
  latencyMs: number | null
  autoSaveLabel: string | null
  capabilities: string[]
  isValid: boolean
}

export function LiveStatusPanel({
  draft,
  connectionStatus,
  connectionMessage,
  latencyMs,
  autoSaveLabel,
  capabilities,
  isValid,
}: Props) {
  const vaultType = vaultTypeForProvider(draft.providerId)

  return (
    <aside className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-md">
      <div>
        <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-white/40">Live status</p>
        <div className="mt-2">
          <IntegrationStatusBadge status={connectionStatus} />
        </div>
      </div>

      {draft.lastCheckedAt ? (
        <p className="text-[0.7rem] text-white/45">
          Last checked {new Date(draft.lastCheckedAt).toLocaleString()}
        </p>
      ) : null}

      {latencyMs != null ? (
        <div className="rounded-lg border border-white/8 bg-black/20 px-3 py-2">
          <p className="text-[0.65rem] uppercase text-white/35">Latency</p>
          <p className="text-lg font-semibold text-white/90">{latencyMs} ms</p>
        </div>
      ) : null}

      {connectionMessage ? (
        <p
          className={cn(
            'text-xs',
            connectionStatus === 'connected' ? 'text-emerald-400/90' : 'text-white/50',
          )}
        >
          {connectionMessage}
        </p>
      ) : null}

      <div>
        <p className="mb-1.5 text-[0.65rem] uppercase text-white/35">Validation</p>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs',
            isValid ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-200',
          )}
        >
          <i className={cn('fa-solid', isValid ? 'fa-check' : 'fa-pen')} aria-hidden />
          {isValid ? 'Ready to save' : 'Complete required fields'}
        </span>
      </div>

      {vaultType ? (
        <div className="rounded-lg border border-violet-500/20 bg-violet-500/10 px-3 py-2">
          <p className="text-[0.65rem] uppercase text-violet-200/60">Vault slot</p>
          <p className="text-xs text-violet-100/90">{labelForVaultType(vaultType)}</p>
          <p className="mt-1 text-[0.65rem] text-white/35">Secrets encrypted for server sync</p>
        </div>
      ) : null}

      <div>
        <p className="mb-1.5 text-[0.65rem] uppercase text-white/35">Capabilities</p>
        <div className="flex flex-wrap gap-1">
          {capabilities.map(c => (
            <span
              key={c}
              className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[0.65rem] text-white/60"
            >
              {c}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-auto border-t border-white/10 pt-3">
        <p className="text-[0.65rem] text-white/35">Environment</p>
        <p className="text-sm capitalize text-white/75">{draft.environment}</p>
        {autoSaveLabel ? <p className="mt-2 text-[0.65rem] text-white/30">{autoSaveLabel}</p> : null}
      </div>
    </aside>
  )
}
