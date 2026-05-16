import { useCallback, useMemo, useState } from 'react'
import { useLanguage } from '../../lib/i18n'
import { IntegrationModal } from './apiIntegration/components/IntegrationModal'
import {
  deleteIntegrationRecord,
  listIntegrationRecords,
} from './apiIntegration/integrationStore'
import { getProvider } from './apiIntegration/providers/registry'
import type { IntegrationRecord } from './apiIntegration/types'
import type { ProviderCategory } from './apiIntegration/types'
import './apiIntegrations.css'

type TabId = 'all' | 'map' | 'ai' | 'satellite'

function categoryMatchesTab(category: ProviderCategory, tab: TabId): boolean {
  if (tab === 'all') return true
  if (tab === 'map') return category === 'gis'
  if (tab === 'ai') return category === 'ai'
  if (tab === 'satellite') return category === 'satellite'
  return true
}

function displayType(category: ProviderCategory): string {
  const labels: Record<ProviderCategory, string> = {
    gis: 'Map',
    ai: 'AI',
    satellite: 'Satellite',
    weather: 'Weather',
    storage: 'Storage',
    database: 'Database',
  }
  return labels[category] ?? category
}

export default function ApiIntegrations() {
  const { language } = useLanguage()
  const ar = language === 'ar'

  const [rows, setRows] = useState<IntegrationRecord[]>(() => listIntegrationRecords())
  const [tab, setTab] = useState<TabId>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<IntegrationRecord | null>(null)

  const refresh = useCallback(() => setRows(listIntegrationRecords()), [])

  const copy = ar
    ? {
        title: 'مدير API',
        subtitle: 'إدارة التكاملات والمفاتيح السرية بأمان',
        addApi: 'إضافة API',
        tabs: { all: 'الكل', map: 'خرائط', ai: 'ذكاء اصطناعي', satellite: 'أقمار صناعية' },
        typePrefix: 'النوع:',
        edit: 'تعديل',
        settings: 'إعدادات',
        delete: 'حذف',
        active: 'نشط',
        inactive: 'غير نشط',
        empty: 'لا توجد تكاملات في هذا القسم.',
        removeConfirm: 'إزالة هذا التكامل؟ تبقى الرموز في الخزنة حتى تُمسح يدوياً.',
      }
    : {
        title: 'API Manager',
        subtitle: 'Manage all integrations & secrets securely',
        addApi: 'Add API',
        tabs: { all: 'All', map: 'Map APIs', ai: 'AI APIs', satellite: 'Satellite' },
        typePrefix: 'Type:',
        edit: 'Edit',
        settings: 'Settings',
        delete: 'Delete',
        active: 'Active',
        inactive: 'Inactive',
        empty: 'No integrations in this section.',
        removeConfirm: 'Remove this integration? Stored tokens remain in the vault until cleared manually.',
      }

  const filtered = useMemo(() => {
    return rows.filter(row => {
      const provider = getProvider(row.providerId)
      return categoryMatchesTab(provider.category, tab)
    })
  }, [rows, tab])

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
    if (!window.confirm(copy.removeConfirm)) return
    deleteIntegrationRecord(id)
    refresh()
  }

  return (
    <div className="api-manager-page">
      <header className="api-manager-page__header">
        <div className="api-manager-page__titles">
          <h1 className="api-manager-page__title">{copy.title}</h1>
          <p className="api-manager-page__subtitle">{copy.subtitle}</p>
        </div>
        <button type="button" className="api-manager-page__add-btn" onClick={openCreate}>
          <i className="fa-solid fa-plus" aria-hidden />
          {copy.addApi}
        </button>
      </header>

      <div className="api-manager-tabs" role="tablist" aria-label={ar ? 'تصفية التكاملات' : 'Filter integrations'}>
        {(
          [
            ['all', copy.tabs.all],
            ['map', copy.tabs.map],
            ['ai', copy.tabs.ai],
            ['satellite', copy.tabs.satellite],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={['api-manager-tabs__trigger', tab === id ? 'api-manager-tabs__trigger--active' : '']
              .filter(Boolean)
              .join(' ')}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="api-manager-list" role="tabpanel">
        {filtered.length === 0 ? (
          <p className="api-manager-list__empty">{copy.empty}</p>
        ) : (
          filtered.map(row => (
            <article key={row.id} className="api-manager-row">
              <div className="api-manager-row__info">
                <span className="api-manager-row__key" aria-hidden>
                  <i className="fa-solid fa-key" />
                </span>
                <div className="api-manager-row__text">
                  <p className="api-manager-row__name">{row.name}</p>
                  <p className="api-manager-row__type">
                    {copy.typePrefix} {displayType(getProvider(row.providerId).category)}
                  </p>
                </div>
              </div>

              <div className="api-manager-row__actions">
                <span
                  className={[
                    'api-manager-badge',
                    row.active ? 'api-manager-badge--active' : 'api-manager-badge--inactive',
                  ].join(' ')}
                >
                  {row.active ? copy.active : copy.inactive}
                </span>

                <div className="api-manager-row__toolbar" role="group" aria-label={ar ? 'إجراءات' : 'Actions'}>
                  <button
                    type="button"
                    className="api-manager-icon-btn"
                    title={copy.edit}
                    aria-label={copy.edit}
                    onClick={() => openEdit(row)}
                  >
                    <i className="fa-solid fa-pencil" aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="api-manager-icon-btn"
                    title={copy.settings}
                    aria-label={copy.settings}
                    onClick={() => openEdit(row)}
                  >
                    <i className="fa-solid fa-gear" aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="api-manager-icon-btn api-manager-icon-btn--danger"
                    title={copy.delete}
                    aria-label={copy.delete}
                    onClick={() => remove(row.id)}
                  >
                    <i className="fa-solid fa-trash" aria-hidden />
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </div>

      <IntegrationModal open={modalOpen} record={editing} onClose={closeModal} onSaved={refresh} />
    </div>
  )
}
