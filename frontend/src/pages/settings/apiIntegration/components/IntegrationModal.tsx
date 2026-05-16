import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { cn } from '../../../../lib/utils'
import type { AuthType, IntegrationDraft, IntegrationEnvironment, IntegrationRecord, ProviderId } from '../types'
import { getProvider } from '../providers/registry'
import { primarySecretKey } from '../providers/validate'
import {
  clearDraft,
  emptyDraft,
  saveIntegrationRecord,
} from '../integrationStore'
import { loadVaultSecret, persistVaultSecret } from '../vaultBridge'
import { useAutoSave } from '../hooks/useAutoSave'
import { useConnectionTest } from '../hooks/useConnectionTest'
import { useIntegrationValidation } from '../hooks/useIntegrationValidation'
import { useProviderConfig } from '../hooks/useProviderConfig'
import { useSecureTokens } from '../hooks/useSecureTokens'
import { ConnectionTester } from './ConnectionTester'
import { DynamicAuthFields } from './DynamicAuthFields'
import { FormSection } from './FormSection'
import { IntegrationStatusBadge } from './IntegrationStatusBadge'
import { LiveStatusPanel } from './LiveStatusPanel'
import { ProviderSelector } from './ProviderSelector'

type Props = {
  open: boolean
  record: IntegrationRecord | null
  onClose: () => void
  onSaved: () => void
}

const ENV_OPTIONS: { value: IntegrationEnvironment; label: string }[] = [
  { value: 'development', label: 'Development' },
  { value: 'staging', label: 'Staging' },
  { value: 'production', label: 'Production' },
]

function recordToDraft(record: IntegrationRecord): IntegrationDraft {
  return {
    id: record.id,
    name: record.name,
    providerId: record.providerId,
    environment: record.environment,
    integrationType: record.integrationType,
    authType: record.authType,
    provider: record.provider,
    baseUrl: record.baseUrl,
    pollingMinutes: record.pollingMinutes,
    active: record.active,
    notes: record.notes,
    config: { ...record.config },
    dataMapping: { ...record.dataMapping },
    status: record.status,
    lastCheckedAt: record.lastCheckedAt,
    lastSuccessAt: record.lastSuccessAt,
    latencyMs: record.latencyMs,
  }
}

export function IntegrationModal({ open, record, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<IntegrationDraft>(() =>
    record ? recordToDraft(record) : emptyDraft('mapbox'),
  )
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const { provider, authOptions, fields, dataMappingFields, capabilities, defaultBaseUrl } =
    useProviderConfig(draft.providerId, draft.authType)
  const { secrets, setSecret, revealed, toggleReveal, copySecret, displayValue } = useSecureTokens(
    draft.providerId,
  )
  const { result, fieldLevel, isValid } = useIntegrationValidation(draft)
  const { status, message, latencyMs, testing, runTest, reset } = useConnectionTest()
  const { lastSavedAt, saving, discardDraft } = useAutoSave(draft, open && !record?.id)

  useEffect(() => {
    if (!open) return
    if (record) {
      setDraft(recordToDraft(record))
      const vault = loadVaultSecret(record.providerId)
      const key = primarySecretKey(record.providerId, record.authType)
      if (vault) setSecret(key, vault)
    } else {
      setDraft(emptyDraft('mapbox'))
    }
    setSaveError(null)
    reset()
  }, [open, record, reset, setSecret])

  const patch = useCallback(<K extends keyof IntegrationDraft>(key: K, value: IntegrationDraft[K]) => {
    setDraft(prev => ({ ...prev, [key]: value }))
    setSaveError(null)
    reset()
  }, [reset])

  const onProviderChange = (providerId: ProviderId) => {
    const p = getProvider(providerId)
    setDraft(prev => ({
      ...prev,
      providerId,
      authType: p.defaultAuthType,
      integrationType: p.label,
      provider: p.label,
      baseUrl: p.defaultBaseUrl ?? prev.baseUrl,
    }))
    const vault = loadVaultSecret(providerId)
    if (vault) setSecret(primarySecretKey(providerId, p.defaultAuthType), vault)
    reset()
  }

  const onAuthTypeChange = (authType: AuthType) => {
    patch('authType', authType)
  }

  const handleTest = async () => {
    const testResult = await runTest({
      providerId: draft.providerId,
      authType: draft.authType,
      baseUrl: draft.baseUrl,
      config: draft.config,
      secrets,
    })
    const now = new Date().toISOString()
    setDraft(prev => ({
      ...prev,
      status: testResult.ok ? 'connected' : 'invalid',
      lastCheckedAt: now,
      lastSuccessAt: testResult.ok ? now : prev.lastSuccessAt,
      latencyMs: testResult.latencyMs,
    }))
  }

  const handleSave = async () => {
    if (!isValid) return
    setBusy(true)
    setSaveError(null)
    try {
      const vaultResult = await persistVaultSecret(draft.providerId, draft.authType, {
        ...draft.config,
        ...secrets,
      })
      if (!vaultResult.ok) {
        setSaveError(vaultResult.error)
        return
      }
      saveIntegrationRecord({ ...draft, status }, secrets)
      discardDraft()
      clearDraft()
      onSaved()
      onClose()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  const autoSaveLabel = saving
    ? 'Saving draft…'
    : lastSavedAt
      ? `Draft saved ${lastSavedAt.toLocaleTimeString()}`
      : null

  const hasCredentials =
    Object.values(secrets).some(v => v.trim()) ||
    Object.values(draft.config).some(v => v.trim() && v !== '__vault__') ||
    Boolean(record?.id)
  const canSave = isValid && draft.name.trim().length > 0 && hasCredentials

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          className="api-integ-modal-backdrop api-integ-modal-backdrop--tw"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={e => e.target === e.currentTarget && !busy && onClose()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="integration-modal-title"
            className="api-integ-modal api-integ-modal--enterprise"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          >
            <header className="api-integ-modal__head api-integ-modal__head--enterprise">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-500/25 bg-violet-500/15">
                  <i className={cn(provider.iconClass, 'text-lg text-violet-300')} aria-hidden />
                </span>
                <div className="min-w-0">
                  <h2 id="integration-modal-title" className="api-integ-modal__title truncate">
                    {record ? 'Edit API Integration' : 'Add API Integration'}
                  </h2>
                  <p className="mt-0.5 truncate text-xs text-white/45">{provider.label}</p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
                <IntegrationStatusBadge status={status} />
                {draft.lastCheckedAt ? (
                  <span className="text-[0.65rem] text-white/35">
                    {new Date(draft.lastCheckedAt).toLocaleTimeString()}
                  </span>
                ) : null}
                <button
                  type="button"
                  className="api-integ-tw-icon-btn ml-1"
                  onClick={onClose}
                  disabled={busy}
                  aria-label="Close"
                >
                  <i className="fa-solid fa-xmark" aria-hidden />
                </button>
              </div>
            </header>

            <div className="api-integ-modal__body api-integ-modal__body--split">
              <div className="api-integ-modal__form-col">
                <FormSection title="Configuration">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="api-integ-tw-field sm:col-span-1">
                      <label className="api-integ-tw-label" htmlFor="integ-name">
                        Name *
                      </label>
                      <input
                        id="integ-name"
                        className={cn(
                          'api-integ-tw-input',
                          fieldLevel._name?.level === 'error' && 'border-red-500/50',
                        )}
                        value={draft.name}
                        onChange={e => patch('name', e.target.value)}
                        autoComplete="off"
                      />
                    </div>
                    <ProviderSelector value={draft.providerId} onChange={onProviderChange} />
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="api-integ-tw-field">
                      <label className="api-integ-tw-label" htmlFor="integ-env">
                        Environment
                      </label>
                      <select
                        id="integ-env"
                        className="api-integ-tw-input"
                        value={draft.environment}
                        onChange={e => patch('environment', e.target.value as IntegrationEnvironment)}
                      >
                        {ENV_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="api-integ-tw-field">
                      <label className="api-integ-tw-label" htmlFor="integ-type-label">
                        Integration Type
                      </label>
                      <input
                        id="integ-type-label"
                        className="api-integ-tw-input"
                        value={draft.integrationType}
                        onChange={e => patch('integrationType', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="api-integ-tw-field">
                      <label className="api-integ-tw-label" htmlFor="integ-provider-label">
                        Provider label
                      </label>
                      <input
                        id="integ-provider-label"
                        className="api-integ-tw-input"
                        value={draft.provider}
                        onChange={e => patch('provider', e.target.value)}
                      />
                    </div>
                    <div className="api-integ-tw-field">
                      <label className="api-integ-tw-label" htmlFor="integ-poll">
                        Polling Interval (min)
                      </label>
                      <input
                        id="integ-poll"
                        type="number"
                        min={1}
                        className="api-integ-tw-input"
                        value={draft.pollingMinutes}
                        onChange={e =>
                          patch('pollingMinutes', Math.max(1, Number.parseInt(e.target.value, 10) || 60))
                        }
                      />
                    </div>
                  </div>

                  <div className="api-integ-tw-field mt-3">
                    <label className="api-integ-tw-label" htmlFor="integ-base">
                      Base URL {provider.defaultBaseUrl ? '' : '(optional)'}
                    </label>
                    <input
                      id="integ-base"
                      className="api-integ-tw-input"
                      value={draft.baseUrl}
                      placeholder={defaultBaseUrl ?? 'https://api.example.com'}
                      onChange={e => patch('baseUrl', e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                </FormSection>

                <FormSection
                  title="Authentication"
                  subtitle="Credentials are stored in the vault and never logged."
                >
                  <DynamicAuthFields
                    authType={draft.authType}
                    authOptions={authOptions}
                    fields={fields}
                    config={draft.config}
                    secrets={secrets}
                    revealed={revealed}
                    fieldValidation={fieldLevel}
                    onAuthTypeChange={onAuthTypeChange}
                    onConfigChange={(id, v) =>
                      setDraft(prev => ({ ...prev, config: { ...prev.config, [id]: v } }))
                    }
                    onSecretChange={setSecret}
                    onToggleReveal={toggleReveal}
                    onCopy={copySecret}
                    displayValue={displayValue}
                  />
                </FormSection>

                {dataMappingFields?.length ? (
                  <FormSection
                    title="Data mapping"
                    subtitle="API response path → weather log field (dot notation)"
                  >
                    <button
                      type="button"
                      className="mb-2 text-xs text-violet-300/80 hover:text-violet-200"
                      onClick={() => setAdvancedOpen(o => !o)}
                    >
                      <i className={cn('fa-solid mr-1', advancedOpen ? 'fa-chevron-up' : 'fa-chevron-down')} aria-hidden />
                      {advancedOpen ? 'Hide' : 'Show'} field mapping
                    </button>
                    <AnimatePresence>
                      {advancedOpen ? (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="grid gap-2 overflow-hidden sm:grid-cols-2"
                        >
                          {dataMappingFields.map(f => (
                            <div key={f.id} className="api-integ-tw-field">
                              <label className="api-integ-tw-label" htmlFor={`map-${f.id}`}>
                                {f.label}
                              </label>
                              <input
                                id={`map-${f.id}`}
                                className="api-integ-tw-input font-mono text-xs"
                                placeholder={f.placeholder}
                                value={draft.dataMapping[f.id] ?? ''}
                                onChange={e =>
                                  setDraft(prev => ({
                                    ...prev,
                                    dataMapping: { ...prev.dataMapping, [f.id]: e.target.value },
                                  }))
                                }
                              />
                            </div>
                          ))}
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </FormSection>
                ) : null}

                {saveError ? (
                  <p className="api-integ-status api-integ-status--err" role="alert">
                    {saveError}
                  </p>
                ) : null}
              </div>

              <LiveStatusPanel
                draft={draft}
                connectionStatus={status}
                connectionMessage={message}
                latencyMs={latencyMs ?? draft.latencyMs}
                autoSaveLabel={autoSaveLabel}
                capabilities={capabilities}
                isValid={isValid}
              />
            </div>

            <footer className="api-integ-modal__foot api-integ-modal__foot--sticky">
              <label className="api-integ-check">
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={e => patch('active', e.target.checked)}
                />
                Active (enable automatic polling)
              </label>
              <ConnectionTester testing={testing} disabled={busy} onTest={() => void handleTest()} />
              <div className="api-integ-modal__foot-actions">
                <button type="button" className="api-integ-btn api-integ-btn--ghost" disabled={busy} onClick={onClose}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="api-integ-btn api-integ-btn--primary"
                  disabled={!canSave || busy}
                  onClick={() => void handleSave()}
                >
                  {record ? 'Save' : 'Create'}
                </button>
              </div>
            </footer>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
