import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { DataSourceFieldsPanel, type DataSourceFormState } from '../data-entry/components/datasourcefieldspanel'
import '../data-entry/EC.css'
import { canManageDataSourceSettings } from '../../lib/auth'
import { useCommonText } from '../../lib/i18n'

type Role = 'Admin' | 'Manager' | 'Editor' | 'Viewer'

type CurrentUser = {
  id: number
  name: string
  email: string
  role: Role | string
}

const FORM_KEYS = ['EC', 'Fertigation', 'Irrigation', 'Harvest', 'Production', 'QHIS'] as const
type FormKey = (typeof FORM_KEYS)[number]

const readCurrentUser = (): CurrentUser | null => {
  try {
    const raw = localStorage.getItem('currentUser')
    if (!raw) return null
    const parsed = JSON.parse(raw) as CurrentUser
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

type FieldConfig = { name: string; enabled: boolean }
type ManagementLayerBinding = { sourceId: string; selectedFields: string[]; availableFields?: string[] }
type FormBindings = Record<
  string,
  {
    sourceId?: string
    sourceIds?: string[]
    fieldConfigsBySource?: Record<string, FieldConfig[]>
    selectedFieldsBySource?: Record<string, string[]>
    managementLayer?: ManagementLayerBinding
  }
>

const normalizeEnabledFields = (
  bindings: FormBindings,
  formKey: string
): { sourceIds: string[]; enabledBySource: Record<string, string[]> } => {
  const form = bindings[formKey] || {}
  const rawIds = Array.isArray(form.sourceIds) ? form.sourceIds : []
  const sourceIds = rawIds.filter(v => typeof v === 'string').map(v => v.trim()).filter(Boolean)
  const legacy = typeof form.sourceId === 'string' ? form.sourceId.trim() : ''
  const ids = sourceIds.length ? Array.from(new Set(sourceIds)) : legacy ? [legacy] : []
  const mgmtSourceId = typeof form.managementLayer?.sourceId === 'string' ? form.managementLayer.sourceId.trim() : ''
  const mgmtSelected = Array.isArray(form.managementLayer?.selectedFields) ? form.managementLayer!.selectedFields.filter(Boolean) : []
  const mgmtKey = mgmtSourceId && mgmtSelected.length ? `management:${mgmtSourceId}` : ''

  if (!ids.length && !mgmtKey) return { sourceIds: [], enabledBySource: {} }

  const enabledBySource: Record<string, string[]> = {}
  if (mgmtKey) enabledBySource[mgmtKey] = mgmtSelected.slice()
  for (const sourceId of ids) {
    const configs = form.fieldConfigsBySource?.[sourceId]
    if (Array.isArray(configs)) {
      enabledBySource[sourceId] = configs.filter(c => c && c.enabled).map(c => c.name)
      continue
    }

    const v1 = form.selectedFieldsBySource?.[sourceId]
    enabledBySource[sourceId] = Array.isArray(v1) ? v1.slice() : []
  }

  return { sourceIds: mgmtKey ? [mgmtKey, ...ids] : ids, enabledBySource }
}

export default function Settings() {
  const location = useLocation()
  const navigate = useNavigate()
  const text = useCommonText()
  const qs = useMemo(() => new URLSearchParams(location.search), [location.search])
  const defaultForm = (qs.get('form') || '').trim()
  const [activeForm, setActiveForm] = useState<FormKey>(() => (FORM_KEYS.includes(defaultForm as any) ? (defaultForm as FormKey) : 'EC'))
  const [ready, setReady] = useState(false)

  const currentUser = useMemo(() => readCurrentUser(), [])
  const canManageSettings = canManageDataSourceSettings()

  useEffect(() => {
    const next = (qs.get('form') || '').trim()
    if (FORM_KEYS.includes(next as any)) setActiveForm(next as FormKey)
  }, [qs])

  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), 120)
    return () => window.clearTimeout(t)
  }, [])

  const [lastState, setLastState] = useState<DataSourceFormState | null>(null)

  const bindings = useMemo(() => readJson<FormBindings>('form_data_source_bindings_v1', {}), [activeForm, ready])
  const enabledInfo = useMemo(() => normalizeEnabledFields(bindings, activeForm), [bindings, activeForm])
  const enabledTotal = useMemo(
    () => Object.values(enabledInfo.enabledBySource).reduce((acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0), 0),
    [enabledInfo]
  )

  useEffect(() => {
    document.title = text.workflowDataSources
  }, [text.workflowDataSources])

  const goBackPage = () => {
    if (location.key && location.key !== 'default') navigate(-1)
    else navigate('/')
  }

  return (
    <div className="ec-page settings-page">
      <div className="ec-container ec-container-wide ec-animate-in">
        <div className="ec-header" role="region" aria-labelledby="ec-hero-title">
          <div className="ec-hero">
            <div className="ec-hero-content">
              <div className="ec-hero-eyebrow"><i className="fa-solid fa-gear"></i> {text.settings}</div>
              <h1 className="ec-hero-title" id="ec-hero-title">{text.workflowDataSources}</h1>
              <p className="ec-hero-subtitle">{text.workflowDescription}</p>
              <div className="ec-hero-ctas">
                <button
                  type="button"
                  className="ec-btn ec-btn-primary"
                  aria-label={text.configureFields}
                  onClick={() => {
                    const section = document.getElementById('data-source-settings')
                    section?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    setTimeout(() => {
                      const btn = document.getElementById('open-fields-btn') as HTMLButtonElement | null
                      btn?.click()
                    }, 350)
                  }}
                >
                  <i className="fa-solid fa-sliders"></i> {text.configureFields}
                </button>
                <a href="#data-source-settings" className="ec-btn ec-btn-ghost" aria-label={text.jumpToSection}>
                  {text.jumpToSection}
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="ec-feature-grid settings-summary-grid" aria-label="Workflow settings summary">
          <div className="ec-feature-card">
            <div className="ec-feature-card-icon"><i className="fa-solid fa-diagram-project" aria-hidden="true"></i></div>
            <div className="ec-feature-card-title">{text.activeWorkflow}</div>
            <div className="ec-feature-card-value">{activeForm}</div>
          </div>
          <div className="ec-feature-card">
            <div className="ec-feature-card-icon"><i className="fa-solid fa-layer-group" aria-hidden="true"></i></div>
            <div className="ec-feature-card-title">{text.connectedLayers}</div>
            <div className="ec-feature-card-value">{enabledInfo.sourceIds.length}</div>
          </div>
          <div className="ec-feature-card">
            <div className="ec-feature-card-icon"><i className="fa-solid fa-list-check" aria-hidden="true"></i></div>
            <div className="ec-feature-card-title">{text.enabledFields}</div>
            <div className="ec-feature-card-value">{enabledTotal}</div>
          </div>
        </div>

        {!ready ? (
          <div className="ec-card">
            <div className="ec-card-body" style={{ color: '#64748b', fontSize: 14 }}>
              {text.loadingSettings}
            </div>
          </div>
        ) : (
          <>
            <div className="ec-card ec-animate-in" id="data-source-settings">
              <div className="ec-card-header">
                <div>
                  <div className="ec-card-title">
                    <i className="fa-solid fa-database" style={{ color: 'var(--secondary)' }}></i>
                    {text.dataSource}
                  </div>
                  <div className="ec-card-subtitle-small">{text.workflowDescription}</div>
                </div>
                <div className="ec-card-header-actions">
                  <button type="button" className="ec-btn ec-btn-secondary ec-btn-sm" onClick={goBackPage} aria-label={text.backPage}>
                    <i className="fa-solid fa-arrow-left" aria-hidden="true"></i> {text.backPage}
                  </button>
                </div>
              </div>

              <div className="ec-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="ec-input-group" style={{ maxWidth: 380 }}>
                  <label className="ec-label">{text.selectWorkflow}</label>
                  <select className="ec-select" value={activeForm} onChange={e => setActiveForm(e.target.value as FormKey)} aria-label={text.selectWorkflow}>
                    {FORM_KEYS.map(k => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </div>

                {canManageSettings ? (
                  <DataSourceFieldsPanel formKey={activeForm} mode="settings" onChange={setLastState} />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ fontSize: 12, color: '#1e293b', background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '10px 12px', borderRadius: 12 }}>
                      You have read-only access. Only Admins and Managers can change data source settings.
                    </div>
                    <div style={{ fontSize: 13, color: '#334155' }}>
                      <span style={{ fontWeight: 700 }}>Configured sources:</span> {enabledInfo.sourceIds.length ? enabledInfo.sourceIds.join(', ') : '—'}
                    </div>
                    <div style={{ fontSize: 13, color: '#334155' }}>
                      <span style={{ fontWeight: 700 }}>Enabled fields:</span>{' '}
                      {enabledTotal
                        ? enabledInfo.sourceIds
                            .map(id => `${id}: ${(enabledInfo.enabledBySource[id] || []).join(', ')}`)
                            .filter(Boolean)
                            .join(' • ')
                        : '—'}
                    </div>
                  </div>
                )}

                {canManageSettings && lastState ? (
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    {text.currentSelection}: {lastState.sourceIds.length ? lastState.sourceIds.join(', ') : '—'} •{' '}
                    {Object.values(lastState.selectedFieldsBySource || {}).reduce<number>(
                      (acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0),
                      0
                    )}{' '}
                    {text.fieldsEnabled}
                  </div>
                ) : null}
              </div>
            </div>
            <footer className="ec-page-footer" role="contentinfo" aria-label="Page footer">
              <div className="ec-page-footer-content">
                <div className="ec-page-footer-brand">Agro Cloud</div>
                <div className="ec-page-footer-links">
                  <a href="/accessibility" aria-label="Accessibility statement">Accessibility</a>
                  <a href="/privacy" aria-label="Privacy policy">Privacy</a>
                  <a href="/help" aria-label="Help and support">Help</a>
                </div>
              </div>
            </footer>
          </>
        )}
      </div>
    </div>
  )
}
