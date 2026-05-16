import { useCallback, useState } from 'react'
import { IntegrationModal } from './apiIntegration/components/IntegrationModal'
import { IntegrationStatusBadge } from './apiIntegration/components/IntegrationStatusBadge'
import {
  deleteIntegrationRecord,
  listIntegrationRecords,
} from './apiIntegration/integrationStore'
import { getProvider } from './apiIntegration/providers/registry'
import type { IntegrationRecord } from './apiIntegration/types'
import './apiIntegrations.css'

export default function ApiIntegrations() {
  const [rows, setRows] = useState<IntegrationRecord[]>(() => listIntegrationRecords())
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<IntegrationRecord | null>(null)

  const refresh = useCallback(() => setRows(listIntegrationRecords()), [])

  const openCreate = () => {
    setEditing(null)
    setModalOpen(true)
  }

  const openEdit = (row: IntegrationRecord) => {
    setEditing(row)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditing(null)
  }

  const remove = (id: string) => {
    if (
      !window.confirm(
        'Remove this integration? Stored tokens remain in the vault until cleared manually.',
      )
    ) {
      return
    }
    deleteIntegrationRecord(id)
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
          {rows.map(row => {
            const provider = getProvider(row.providerId)
            return (
              <article key={row.id} className="api-integ-card">
                <div className="api-integ-card__head">
                  <div className="flex min-w-0 items-start gap-2">
                    <i className={provider.iconClass} aria-hidden />
                    <div className="min-w-0">
                      <h2 className="api-integ-card__name">{row.name}</h2>
                      <p className="api-integ-card__type">{provider.label}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={`api-integ-badge ${row.active ? 'api-integ-badge--on' : 'api-integ-badge--off'}`}
                    >
                      {row.active ? 'Active' : 'Inactive'}
                    </span>
                    <IntegrationStatusBadge status={row.status} className="scale-90" />
                  </div>
                </div>
                {row.environment ? (
                  <p className="api-integ-card__meta capitalize">Environment: {row.environment}</p>
                ) : null}
                {row.baseUrl ? <p className="api-integ-card__meta">Base URL: {row.baseUrl}</p> : null}
                {row.latencyMs != null ? (
                  <p className="api-integ-card__meta">Last latency: {row.latencyMs} ms</p>
                ) : null}
                <div className="api-integ-card__actions">
                  <button type="button" className="api-integ-btn api-integ-btn--ghost" onClick={() => openEdit(row)}>
                    Edit
                  </button>
                  <button type="button" className="api-integ-btn api-integ-btn--ghost" onClick={() => remove(row.id)}>
                    Remove
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <IntegrationModal open={modalOpen} record={editing} onClose={closeModal} onSaved={refresh} />
    </div>
  )
}
