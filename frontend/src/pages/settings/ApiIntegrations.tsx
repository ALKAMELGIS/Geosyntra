import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  API_TOKEN_TYPES,
  labelForApiTokenType,
  type ApiIntegrationRecord,
  type ApiTokenTypeId,
} from '../../lib/apiIntegrationTypes'
import {
  createApiIntegration,
  deleteApiIntegration,
  findIntegrationByType,
  getApiIntegration,
  listApiIntegrations,
  updateApiIntegration,
  type ApiIntegrationInput,
} from '../../lib/apiIntegrationsStore'
import { readApiTokenSecret, testApiTokenSecret, writeApiTokenSecret } from '../../lib/apiIntegrationTokens'
import './apiIntegrations.css'

type FormState = {
  name: string
  typeId: ApiTokenTypeId
  provider: string
  baseUrl: string
  pollingMinutes: string
  apiKey: string
  active: boolean
  notes: string
}

const emptyForm = (): FormState => ({
  name: '',
  typeId: 'mapboxToken',
  provider: '',
  baseUrl: '',
  pollingMinutes: '60',
  apiKey: '',
  active: true,
  notes: '',
})

function formFromRecord(row: ApiIntegrationRecord): FormState {
  return {
    name: row.name,
    typeId: row.typeId,
    provider: row.provider,
    baseUrl: row.baseUrl,
    pollingMinutes: String(row.pollingMinutes || 60),
    apiKey: readApiTokenSecret(row.typeId),
    active: row.active,
    notes: row.notes,
  }
}

function toInput(form: FormState): ApiIntegrationInput {
  return {
    name: form.name.trim(),
    typeId: form.typeId,
    provider: form.provider.trim(),
    baseUrl: form.baseUrl.trim(),
    pollingMinutes: Math.max(1, Number.parseInt(form.pollingMinutes, 10) || 60),
    active: form.active,
    notes: form.notes.trim(),
  }
}

export default function ApiIntegrations() {
  const [rows, setRows] = useState<ApiIntegrationRecord[]>(() => listApiIntegrations())
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [busy, setBusy] = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'ok' | 'error' | 'skipped'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)

  const refresh = useCallback(() => setRows(listApiIntegrations()), [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm())
    setTestStatus('idle')
    setSaveError(null)
    setModalOpen(true)
  }

  const openEdit = (id: string) => {
    const row = getApiIntegration(id)
    if (!row) return
    setEditingId(id)
    setForm(formFromRecord(row))
    setTestStatus('idle')
    setSaveError(null)
    setModalOpen(true)
  }

  const closeModal = () => {
    if (busy) return
    setModalOpen(false)
    setEditingId(null)
    setSaveError(null)
    setTestStatus('idle')
  }

  const canSave = form.name.trim().length > 0 && form.apiKey.trim().length > 0

  const typeConflict = useMemo(() => {
    if (!modalOpen) return null
    const other = findIntegrationByType(form.typeId)
    if (!other) return null
    if (editingId && other.id === editingId) return null
    return other
  }, [modalOpen, form.typeId, editingId])

  const patch = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
    setTestStatus('idle')
    setSaveError(null)
  }

  const onTypeChange = (typeId: ApiTokenTypeId) => {
    setForm(prev => ({
      ...prev,
      typeId,
      apiKey: readApiTokenSecret(typeId),
      name: prev.name.trim() ? prev.name : labelForApiTokenType(typeId),
    }))
    setTestStatus('idle')
  }

  const runTest = async () => {
    setBusy(true)
    setTestStatus('idle')
    try {
      const result = await testApiTokenSecret(form.typeId, form.apiKey)
      setTestStatus(result === 'ok' ? 'ok' : result === 'skipped' ? 'skipped' : 'error')
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    if (!canSave) return
    if (typeConflict) {
      setSaveError(`An integration for “${labelForApiTokenType(form.typeId)}” already exists. Edit that entry or pick another type.`)
      return
    }
    setBusy(true)
    setSaveError(null)
    try {
      const input = toInput(form)
      const secretResult = await writeApiTokenSecret(form.typeId, form.apiKey)
      if (!secretResult.ok) {
        setSaveError(secretResult.ok === false ? secretResult.error : 'Could not save token')
        return
      }
      if (editingId) updateApiIntegration(editingId, input)
      else createApiIntegration(input)
      refresh()
      closeModal()
    } finally {
      setBusy(false)
    }
  }

  const remove = (id: string) => {
    if (!window.confirm('Remove this integration? The stored token will remain in the vault until cleared manually.')) return
    deleteApiIntegration(id)
    refresh()
  }

  return (
    <div className="api-integ-page">
      <header className="api-integ-hero">
        <div className="api-integ-hero__brand">
          <span className="api-integ-hero__icon" aria-hidden>
            <i className="fa-solid fa-plug" />
          </span>
          <h1 className="api-integ-hero__title">API Integrations</h1>
        </div>
        <button type="button" className="api-integ-btn api-integ-btn--primary" onClick={openCreate}>
          + Add Integration
        </button>
      </header>

      {rows.length === 0 ? (
        <div className="api-integ-empty">
          <p className="api-integ-empty__text">No API integrations configured yet</p>
          <button type="button" className="api-integ-btn api-integ-btn--ghost" onClick={openCreate}>
            + Add Your First Integration
          </button>
        </div>
      ) : (
        <div className="api-integ-grid">
          {rows.map(row => (
            <article key={row.id} className="api-integ-card">
              <div className="api-integ-card__head">
                <div>
                  <h2 className="api-integ-card__name">{row.name}</h2>
                  <p className="api-integ-card__type">{labelForApiTokenType(row.typeId)}</p>
                </div>
                <span className={`api-integ-badge ${row.active ? 'api-integ-badge--on' : 'api-integ-badge--off'}`}>
                  {row.active ? 'Active' : 'Inactive'}
                </span>
              </div>
              {row.provider ? <p className="api-integ-card__meta">Provider: {row.provider}</p> : null}
              {row.baseUrl ? <p className="api-integ-card__meta">Base URL: {row.baseUrl}</p> : null}
              <div className="api-integ-card__actions">
                <button type="button" className="api-integ-btn api-integ-btn--ghost" onClick={() => openEdit(row.id)}>
                  Edit
                </button>
                <button type="button" className="api-integ-btn api-integ-btn--ghost" onClick={() => remove(row.id)}>
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {modalOpen ? (
        <div
          className="api-integ-modal-backdrop"
          role="presentation"
          onMouseDown={e => e.target === e.currentTarget && closeModal()}
        >
          <div className="api-integ-modal" role="dialog" aria-modal="true" aria-labelledby="api-integ-modal-title">
            <header className="api-integ-modal__head">
              <h2 id="api-integ-modal-title" className="api-integ-modal__title">
                {editingId ? 'Edit API Integration' : 'Add API Integration'}
              </h2>
            </header>
            <div className="api-integ-modal__body">
              <div className="api-integ-field--row">
                <div className="api-integ-field">
                  <label htmlFor="api-integ-name">Name *</label>
                  <input
                    id="api-integ-name"
                    value={form.name}
                    onChange={e => patch('name', e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div className="api-integ-field">
                  <label htmlFor="api-integ-type">Type</label>
                  <select
                    id="api-integ-type"
                    value={form.typeId}
                    onChange={e => onTypeChange(e.target.value as ApiTokenTypeId)}
                  >
                    {API_TOKEN_TYPES.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="api-integ-field--row">
                <div className="api-integ-field">
                  <label htmlFor="api-integ-provider">Provider</label>
                  <input
                    id="api-integ-provider"
                    value={form.provider}
                    onChange={e => patch('provider', e.target.value)}
                    autoComplete="organization"
                  />
                </div>
                <div className="api-integ-field">
                  <label htmlFor="api-integ-poll">Polling Interval (min)</label>
                  <input
                    id="api-integ-poll"
                    type="number"
                    min={1}
                    value={form.pollingMinutes}
                    onChange={e => patch('pollingMinutes', e.target.value)}
                  />
                </div>
              </div>
              <div className="api-integ-field">
                <label htmlFor="api-integ-base">Base URL</label>
                <input
                  id="api-integ-base"
                  value={form.baseUrl}
                  onChange={e => patch('baseUrl', e.target.value)}
                  placeholder="https://api.example.com"
                  autoComplete="off"
                />
              </div>
              <div className="api-integ-field">
                <label htmlFor="api-integ-key">{labelForApiTokenType(form.typeId)} *</label>
                <input
                  id="api-integ-key"
                  type="password"
                  value={form.apiKey}
                  onChange={e => patch('apiKey', e.target.value)}
                  autoComplete="off"
                />
              </div>
              {typeConflict ? (
                <p className="api-integ-status api-integ-status--err" role="alert">
                  Another integration already uses this token type ({typeConflict.name}).
                </p>
              ) : null}
              {saveError ? (
                <p className="api-integ-status api-integ-status--err" role="alert">
                  {saveError}
                </p>
              ) : null}
            </div>
            <footer className="api-integ-modal__foot">
              <label className="api-integ-check">
                <input type="checkbox" checked={form.active} onChange={e => patch('active', e.target.checked)} />
                Active (enable automatic polling)
              </label>
              <button type="button" className="api-integ-btn api-integ-btn--ghost" disabled={busy} onClick={() => void runTest()}>
                <i className="fa-solid fa-play" aria-hidden /> Test connection
              </button>
              {testStatus === 'ok' ? <span className="api-integ-status api-integ-status--ok">Connection OK</span> : null}
              {testStatus === 'error' ? <span className="api-integ-status api-integ-status--err">Check failed</span> : null}
              {testStatus === 'skipped' ? (
                <span className="api-integ-status api-integ-status--muted">Saved locally (live test skipped)</span>
              ) : null}
              <div className="api-integ-modal__foot-actions">
                <button type="button" className="api-integ-btn api-integ-btn--ghost" disabled={busy} onClick={closeModal}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="api-integ-btn api-integ-btn--primary"
                  disabled={!canSave || busy || Boolean(typeConflict)}
                  onClick={() => void save()}
                >
                  {editingId ? 'Save' : 'Create'}
                </button>
              </div>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  )
}
