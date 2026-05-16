import { useCallback, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
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
        subtitle: 'إدارة التكاملات والمفاتيح السرية بأمان — تفعّل Satellite Intelligence وخريطة GIS',
        addApi: 'إضافة API',
        tabs: { all: 'الكل', map: 'خرائط', ai: 'ذكاء اصطناعي', satellite: 'أقمار صناعية' },
        typePrefix: 'النوع:',
        addNew: 'إضافة API جديد',
        addHint:
          'افتح معالج التكامل لاختيار المزوّد (Mapbox، ArcGIS، Sentinel Hub، Gemini…) وحفظ المفاتيح لتفعيل الخرائط والأدوات.',
        openWizard: 'فتح معالج التكامل',
        test: 'اختبار',
        settings: 'إعدادات',
        delete: 'حذف',
        active: 'نشط',
        inactive: 'غير نشط',
        empty: 'لا توجد تكاملات في هذا القسم.',
        removeConfirm: 'إزالة هذا التكامل؟ تبقى الرموز في الخزنة حتى تُمسح يدوياً.',
      }
    : {
        title: 'API Manager',
        subtitle: 'Manage all integrations & secrets securely — powers Satellite Intelligence & GIS Map',
        addApi: 'Add API',
        tabs: { all: 'All', map: 'Map APIs', ai: 'AI APIs', satellite: 'Satellite' },
        typePrefix: 'Type:',
        addNew: 'Add New API',
        addHint:
          'Open the integration wizard to pick a provider (Mapbox, ArcGIS, Sentinel Hub, Gemini…) and store keys to enable maps and tools.',
        openWizard: 'Open integration wizard',
        test: 'Test connection',
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
    <motion.div
      className="api-manager-page"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
    >
      <header className="api-manager-page__header">
        <motion.div className="api-manager-page__brand">
          <span className="api-manager-page__icon" aria-hidden>
            <i className="fa-solid fa-key" />
          </span>
          <motion.div className="api-manager-page__titles">
            <h1 className="api-manager-page__title">{copy.title}</h1>
            <p className="api-manager-page__subtitle">{copy.subtitle}</p>
          </motion.div>
        </motion.div>
        <button type="button" className="api-integ-btn api-integ-btn--primary api-manager-page__add-btn" onClick={openCreate}>
          <i className="fa-solid fa-plus" aria-hidden />
          {copy.addApi}
        </button>
      </header>

      <motion.div className="api-manager-tabs" role="tablist" aria-label={ar ? 'تصفية التكاملات' : 'Filter integrations'}>
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
      </motion.div>

      <motion.div className="api-manager-list" role="tabpanel" layout>
        {filtered.length === 0 ? (
          <p className="api-manager-list__empty">{copy.empty}</p>
        ) : (
          filtered.map((row, idx) => (
            <motion.article
              key={row.id}
              className="api-manager-row"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.03 * idx }}
              whileHover={{ scale: 1.006 }}
            >
              <motion.div className="api-manager-row__info" whileHover={{ x: 2 }}>
                <span className="api-manager-row__key" aria-hidden>
                  <i className="fa-solid fa-key" />
                </span>
                <div className="api-manager-row__text">
                  <p className="api-manager-row__name">{row.name}</p>
                  <p className="api-manager-row__type">
                    {copy.typePrefix} {displayType(getProvider(row.providerId).category)}
                  </p>
                </div>
              </motion.div>

              <motion.div className="api-manager-row__actions">
                <span
                  className={[
                    'api-manager-badge',
                    row.active ? 'api-manager-badge--active' : 'api-manager-badge--inactive',
                  ].join(' ')}
                >
                  {row.active ? copy.active : copy.inactive}
                </span>

                <button
                  type="button"
                  className="api-manager-icon-btn"
                  title={copy.test}
                  aria-label={copy.test}
                  onClick={() => openEdit(row)}
                >
                  <i className="fa-solid fa-flask" aria-hidden />
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
              </motion.div>
            </motion.article>
          ))
        )}
      </motion.div>

      <motion.section
        className="api-manager-form-card"
        id="api-integrations-add-form"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <h2 className="api-manager-form-card__title">{copy.addNew}</h2>
        <p className="api-manager-form-card__hint">{copy.addHint}</p>
        <div className="api-manager-form-card__fields" aria-hidden>
          <div className="api-manager-form-card__field api-manager-form-card__field--ghost" />
          <motion.div
            className="api-manager-form-card__field api-manager-form-card__field--ghost"
            whileHover={{ scale: 1.01 }}
          />
          <motion.div
            className="api-manager-form-card__field api-manager-form-card__field--ghost api-manager-form-card__field--wide"
            whileHover={{ scale: 1.01 }}
          />
        </div>
        <button type="button" className="api-integ-btn api-integ-btn--primary" onClick={openCreate}>
          {copy.openWizard}
        </button>
      </motion.section>

      <IntegrationModal open={modalOpen} record={editing} onClose={closeModal} onSaved={refresh} />
    </motion.div>
  )
}
