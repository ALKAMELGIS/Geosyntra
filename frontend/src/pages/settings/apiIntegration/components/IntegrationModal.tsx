import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { cn } from '../../../../lib/utils'
import type { AuthType, IntegrationDraft, IntegrationEnvironment, IntegrationRecord, ProviderId } from '../types'
import { getProvider } from '../providers/registry'
import { primarySecretKey, validateIntegrationDraft } from '../providers/validate'
import {
  clearDraft,
  emptyDraft,
  saveIntegrationRecord,
} from '../integrationStore'
import {
  applyActiveSentinelHubFromIntegrations,
  resolveSentinelHubInstanceId,
  SENTINEL_HUB_PUBLIC_DATA_INSTANCE_ID,
} from '../../../../lib/sentinelHubIntegrationSync'
import { getSentinelHubWmsInstanceIdBrowserOverride } from '../../../../lib/sentinelHubWmsInstance'
import { loadVaultSecret, persistProviderVault } from '../vaultBridge'
import { useAutoSave } from '../hooks/useAutoSave'
import { useConnectionTest } from '../hooks/useConnectionTest'
import { useIntegrationValidation } from '../hooks/useIntegrationValidation'
import { useProviderConfig } from '../hooks/useProviderConfig'
import { useSecureTokens } from '../hooks/useSecureTokens'
import { ConnectionTester } from './ConnectionTester'
import { DynamicAuthFields } from './DynamicAuthFields'
import { ProviderSelector } from './ProviderSelector'
import { SelectMenu } from './SelectMenu'
import { sanitizeIntegrationDraft } from '../sanitizeDraft'
import { isMapboxSessionConfigured } from '../../../../lib/mapboxAccessToken'

type Props = {
  open: boolean
  record: IntegrationRecord | null
  onClose: () => void
  onSaved: (warning?: string) => void
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
    record ? recordToDraft(record) : emptyDraft('arcgis_online'),
  )
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const { provider, authOptions, fields, dataMappingFields, defaultBaseUrl } =
    useProviderConfig(draft.providerId, draft.authType)
  const { secrets, setSecret, revealed, toggleReveal, copySecret, displayValue } = useSecureTokens(
    draft.providerId,
  )
  const cleanSecrets = secrets
  const { fieldLevel, isValid } = useIntegrationValidation(draft, cleanSecrets)
  const { status, message, latencyMs, testing, runTest, reset } = useConnectionTest()
  const { discardDraft } = useAutoSave(draft, open && !record?.id)

  useEffect(() => {
    if (!open) return
    if (record) {
      const next = sanitizeIntegrationDraft(recordToDraft(record))
      const instanceId =
        next.providerId === 'sentinel_hub'
          ? next.config.instanceId?.trim() ||
            getSentinelHubWmsInstanceIdBrowserOverride() ||
            SENTINEL_HUB_PUBLIC_DATA_INSTANCE_ID
          : ''
      setDraft(
        instanceId
          ? { ...next, config: { ...next.config, instanceId } }
          : next,
      )
      const vault = loadVaultSecret(record.providerId)
      const key = primarySecretKey(record.providerId, record.authType)
      if (vault) setSecret(key, vault)
    } else {
      setDraft(sanitizeIntegrationDraft(emptyDraft('arcgis_online')))
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
    setDraft(prev => {
      const next = sanitizeIntegrationDraft({
        ...prev,
        providerId,
        authType: p.defaultAuthType,
        integrationType: p.label,
        provider: p.label,
        baseUrl: p.defaultBaseUrl ?? prev.baseUrl,
        name: prev.name.trim() || `${p.label}`,
      })
      if (providerId !== 'sentinel_hub') return next
      const instanceId =
        next.config.instanceId?.trim() ||
        getSentinelHubWmsInstanceIdBrowserOverride() ||
        SENTINEL_HUB_PUBLIC_DATA_INSTANCE_ID
      return { ...next, config: { ...next.config, instanceId } }
    })
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
      secrets: cleanSecrets,
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
    const validation = validateIntegrationDraft(draft, cleanSecrets)
    if (!validation.valid) {
      setSaveError('Complete required fields before saving.')
      return
    }
    setBusy(true)
    setSaveError(null)
    try {
      if (provider.envOnly) {
        saveIntegrationRecord({ ...draft, status }, {})
        discardDraft()
        clearDraft()
        onSaved()
        onClose()
        return
      }

      const instanceId = resolveSentinelHubInstanceId(draft.config, draft.name, draft.notes)
      const configForSave =
        draft.providerId === 'sentinel_hub' && instanceId
          ? { ...draft.config, instanceId }
          : draft.config

      const vaultResult = await persistProviderVault(
        draft.providerId,
        draft.authType,
        configForSave,
        cleanSecrets,
        { name: draft.name, notes: draft.notes },
      )
      if (!vaultResult.ok) {
        setSaveError('error' in vaultResult ? vaultResult.error : 'Failed to store secret')
        return
      }
      saveIntegrationRecord({ ...draft, config: configForSave, status }, cleanSecrets)
      applyActiveSentinelHubFromIntegrations()
      discardDraft()
      clearDraft()
      onSaved(vaultResult.warning)
      onClose()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  const secretKey = primarySecretKey(draft.providerId, draft.authType)
  const hasCredentials =
    Boolean(cleanSecrets[secretKey]?.trim()) ||
    Object.values(cleanSecrets).some(v => v.trim()) ||
    Object.values(draft.config).some(v => v.trim() && v !== '__vault__') ||
    Boolean(record?.id)
  const canSave =
    isValid && draft.name.trim().length > 0 && (provider.envOnly || hasCredentials)
  const mapboxConfigured = draft.providerId === 'mapbox' && isMapboxSessionConfigured()

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
            className="api-integ-modal api-integ-modal--simple"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          >
            <header className="api-integ-modal__head api-integ-modal__head--simple">
              <div className="api-integ-modal__head-main">
                <h2 id="integration-modal-title" className="api-integ-modal__title">
                  {record ? 'Edit integration' : 'Add integration'}
                </h2>
                <p className="api-integ-modal__lead">{provider.description}</p>
              </div>
              <button
                type="button"
                className="api-integ-modal__close"
                onClick={onClose}
                disabled={busy}
                aria-label="Close"
              >
                <i className="fa-solid fa-xmark" aria-hidden />
              </button>
            </header>

            <div className="api-integ-modal__body api-integ-modal__body--simple">
              <ProviderSelector value={draft.providerId} onChange={onProviderChange} />

              <div className="api-integ-tw-field">
                <label className="api-integ-tw-label" htmlFor="integ-name">
                  Display name *
                </label>
                <input
                  id="integ-name"
                  className={cn('api-integ-tw-input', fieldLevel._name?.level === 'error' && 'api-integ-tw-input--error')}
                  value={draft.name}
                  onChange={e => patch('name', e.target.value)}
                  placeholder={provider.label}
                  autoComplete="off"
                />
              </div>

              <section className="api-integ-modal__credentials" aria-labelledby="integ-creds-title">
                <h3 id="integ-creds-title" className="api-integ-modal__section-title">
                  {provider.envOnly ? 'Server configuration' : 'Credentials'}
                </h3>
                {provider.envOnly ? (
                  <div className="api-integ-env-banner" role="status">
                    <p>
                      Mapbox uses <strong>MAPBOX_TOKEN</strong> from Hostinger Node.js environment variables.
                      No API key is saved here or in the browser.
                    </p>
                    <p className={cn('api-integ-env-banner__status', mapboxConfigured && 'api-integ-env-banner__status--ok')}>
                      {mapboxConfigured
                        ? 'Server token is configured — maps work for all users without login.'
                        : 'MAPBOX_TOKEN is not set on the server. Add it in Hostinger hPanel and restart Node.js.'}
                    </p>
                  </div>
                ) : (
                  <>
                <p className="api-integ-modal__section-hint">Stored securely in your browser — not logged.</p>
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
                  </>
                )}
              </section>

              <div className="api-integ-modal__advanced">
                <button
                  type="button"
                  className="api-integ-modal__advanced-toggle"
                  aria-expanded={advancedOpen}
                  onClick={() => setAdvancedOpen(o => !o)}
                >
                  <i className={cn('fa-solid', advancedOpen ? 'fa-chevron-up' : 'fa-chevron-down')} aria-hidden />
                  Optional settings
                </button>
                {advancedOpen ? (
                  <div className="api-integ-modal__advanced-panel">
                    <SelectMenu
                      label="Environment"
                      id="integ-env"
                      value={draft.environment}
                      options={ENV_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
                      onChange={v => patch('environment', v as IntegrationEnvironment)}
                    />
                    {provider.defaultBaseUrl ? (
                      <div className="api-integ-tw-field">
                        <label className="api-integ-tw-label" htmlFor="integ-base">
                          API base URL
                        </label>
                        <input
                          id="integ-base"
                          className="api-integ-tw-input"
                          value={draft.baseUrl}
                          placeholder={defaultBaseUrl ?? ''}
                          onChange={e => patch('baseUrl', e.target.value)}
                          autoComplete="off"
                        />
                      </div>
                    ) : null}
                    {dataMappingFields?.length ? (
                      <div className="api-integ-modal__mapping">
                        <p className="api-integ-tw-label">Weather field mapping</p>
                        <div className="api-integ-modal__mapping-grid">
                          {dataMappingFields.map(f => (
                            <div key={f.id} className="api-integ-tw-field">
                              <label className="api-integ-tw-label api-integ-tw-label--plain" htmlFor={`map-${f.id}`}>
                                {f.label}
                              </label>
                              <input
                                id={`map-${f.id}`}
                                className="api-integ-tw-input"
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
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {message ? (
                <p
                  className={cn(
                    'api-integ-modal__status-msg',
                    status === 'connected' && 'api-integ-modal__status-msg--ok',
                  )}
                  role="status"
                >
                  {message}
                  {latencyMs != null ? ` (${latencyMs} ms)` : ''}
                </p>
              ) : null}

              {saveError ? (
                <p className="api-integ-status api-integ-status--err" role="alert">
                  {saveError}
                </p>
              ) : null}
            </div>

            <footer className="api-integ-modal__foot api-integ-modal__foot--simple">
              <label className="api-integ-check">
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={e => patch('active', e.target.checked)}
                />
                Enable this integration
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
