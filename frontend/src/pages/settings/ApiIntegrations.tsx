import { useCallback, useMemo, useState } from 'react'
import { cn } from '../../lib/utils'
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

const CATEGORY_META: Record<
  ProviderCategory,
  { label: string; icon: string; tone: string }
> = {
  gis: { label: 'Map', icon: 'fa-map-location-dot', tone: 'violet' },
  ai: { label: 'AI', icon: 'fa-wand-magic-sparkles', tone: 'fuchsia' },
  satellite: { label: 'Satellite', icon: 'fa-satellite', tone: 'sky' },
  weather: { label: 'Weather', icon: 'fa-cloud-sun', tone: 'amber' },
  storage: { label: 'Storage', icon: 'fa-database', tone: 'slate' },
  database: { label: 'Database', icon: 'fa-server', tone: 'emerald' },
}

function categoryMatchesTab(category: ProviderCategory, tab: TabId): boolean {
  if (tab === 'all') return true
  if (tab === 'map') return category === 'gis'
  if (tab === 'ai') return category === 'ai'
  if (tab === 'satellite') return category === 'satellite'
  return true
}

export default function ApiIntegrations() {
  const { language } = useLanguage()
  const ar = language === 'ar'

  const [rows, setRows] = useState<IntegrationRecord[]>(() => listIntegrationRecords())
  const [tab, setTab] = useState<TabId>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<IntegrationRecord | null>(null)
  const [saveNotice, setSaveNotice] = useState<string | null>(null)

  const refresh = useCallback(() => setRows(listIntegrationRecords()), [])

  const copy = ar
    ? {
        title: 'مدير API',
        subtitle: 'إدارة التكاملات والمفاتيح السرية بأمان — منصة موحّدة لجميع الخدمات',
        addApi: 'إضافة تكامل',
        integrations: 'تكامل',
        activeCount: 'نشط',
        tabs: { all: 'الكل', map: 'خرائط', ai: 'ذكاء اصطناعي', satellite: 'أقمار صناعية' },
        edit: 'تعديل',
        settings: 'إعدادات',
        delete: 'حذف',
        active: 'نشط',
        inactive: 'غير نشط',
        empty: 'لا توجد تكاملات في هذا القسم.',
        emptyCta: 'أضف أول تكامل',
        removeConfirm: 'إزالة هذا التكامل؟ تبقى الرموز في الخزنة حتى تُمسح يدوياً.',
        savedLocalOnly: 'تم حفظ التكامل. الرمز محفوظ في هذا المتصفح فقط (المزامنة مع الخادم غير متاحة على هذا الموقع).',
        dismiss: 'إغلاق',
      }
    : {
        title: 'API Manager',
        subtitle: 'Manage integrations and secrets securely — one hub for every connected service',
        addApi: 'Add integration',
        integrations: 'integrations',
        activeCount: 'active',
        tabs: { all: 'All', map: 'Map APIs', ai: 'AI APIs', satellite: 'Satellite' },
        edit: 'Edit',
        settings: 'Settings',
        delete: 'Delete',
        active: 'Active',
        inactive: 'Inactive',
        empty: 'No integrations in this section.',
        emptyCta: 'Add your first integration',
        removeConfirm: 'Remove this integration? Stored tokens remain in the vault until cleared manually.',
        savedLocalOnly:
          'Integration saved. Token stored in this browser only (server sync is not available on this host).',
        dismiss: 'Dismiss',
      }

  const filtered = useMemo(() => {
    return rows.filter(row => {
      const provider = getProvider(row.providerId)
      return categoryMatchesTab(provider.category, tab)
    })
  }, [rows, tab])

  const activeInView = useMemo(() => filtered.filter(r => r.active).length, [filtered])

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
    <div className="api-manager-shell" dir={ar ? 'rtl' : 'ltr'}>
      {saveNotice ? (
        <div className="api-manager-notice" role="status">
          <i className="fa-solid fa-circle-info api-manager-notice__icon" aria-hidden />
          <p className="api-manager-notice__text">{saveNotice}</p>
          <button
            type="button"
            className="api-manager-notice__dismiss"
            onClick={() => setSaveNotice(null)}
            aria-label={copy.dismiss}
          >
            <i className="fa-solid fa-xmark" aria-hidden />
          </button>
        </div>
      ) : null}

      <section className="api-manager-hero" aria-labelledby="api-manager-title">
        <div className="api-manager-hero__glow" aria-hidden />
        <div className="api-manager-hero__inner">
          <div className="api-manager-hero__brand">
            <span className="api-manager-hero__icon-wrap" aria-hidden>
              <i className="fa-solid fa-plug-circle-bolt" />
            </span>
            <div className="api-manager-hero__copy">
              <h1 id="api-manager-title" className="api-manager-hero__title">
                {copy.title}
              </h1>
              <p className="api-manager-hero__subtitle">{copy.subtitle}</p>
            </div>
          </div>
          <div className="api-manager-hero__aside">
            <div className="api-manager-stat" aria-label={`${filtered.length} ${copy.integrations}`}>
              <span className="api-manager-stat__value">{filtered.length}</span>
              <span className="api-manager-stat__label">{copy.integrations}</span>
            </div>
            <div className="api-manager-stat api-manager-stat--muted" aria-label={`${activeInView} ${copy.activeCount}`}>
              <span className="api-manager-stat__value">{activeInView}</span>
              <span className="api-manager-stat__label">{copy.activeCount}</span>
            </div>
            <button type="button" className="api-manager-hero__cta" onClick={openCreate}>
              <i className="fa-solid fa-plus" aria-hidden />
              {copy.addApi}
            </button>
          </div>
        </div>
      </section>

      <section className="api-manager-toolbar" aria-label={ar ? 'تصفية التكاملات' : 'Filter integrations'}>
        <div className="api-manager-tabs" role="tablist">
          {(
            [
              ['all', copy.tabs.all, 'fa-layer-group'],
              ['map', copy.tabs.map, 'fa-map'],
              ['ai', copy.tabs.ai, 'fa-robot'],
              ['satellite', copy.tabs.satellite, 'fa-satellite'],
            ] as const
          ).map(([id, label, icon]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={cn(
                'api-manager-tabs__trigger',
                tab === id && 'api-manager-tabs__trigger--active',
              )}
              onClick={() => setTab(id)}
            >
              <i className={cn('fa-solid', icon)} aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="api-manager-section" role="tabpanel">
        {filtered.length === 0 ? (
          <div className="api-manager-empty">
            <span className="api-manager-empty__icon" aria-hidden>
              <i className="fa-solid fa-key" />
            </span>
            <p className="api-manager-empty__text">{copy.empty}</p>
            <button type="button" className="api-manager-empty__cta" onClick={openCreate}>
              <i className="fa-solid fa-plus" aria-hidden />
              {copy.emptyCta}
            </button>
          </div>
        ) : (
          <ul className="api-manager-grid">
            {filtered.map(row => {
              const provider = getProvider(row.providerId)
              const meta = CATEGORY_META[provider.category]
              return (
                <li key={row.id}>
                  <article className="api-manager-card">
                    <div className="api-manager-card__top">
                      <span
                        className={cn('api-manager-card__provider', `api-manager-card__provider--${meta.tone}`)}
                        aria-hidden
                      >
                        <i className={provider.iconClass} />
                      </span>
                      <div className="api-manager-card__headline">
                        <h2 className="api-manager-card__name">{row.name}</h2>
                        <p className="api-manager-card__provider-label">{provider.label}</p>
                      </div>
                      <span
                        className={cn(
                          'api-manager-badge',
                          row.active ? 'api-manager-badge--active' : 'api-manager-badge--inactive',
                        )}
                      >
                        <span className="api-manager-badge__dot" aria-hidden />
                        {row.active ? copy.active : copy.inactive}
                      </span>
                    </div>

                    <div className="api-manager-card__meta">
                      <span className={cn('api-manager-chip', `api-manager-chip--${meta.tone}`)}>
                        <i className={cn('fa-solid', meta.icon)} aria-hidden />
                        {meta.label}
                      </span>
                      {row.baseUrl ? (
                        <span className="api-manager-card__url" title={row.baseUrl}>
                          {row.baseUrl.replace(/^https?:\/\//, '')}
                        </span>
                      ) : null}
                    </div>

                    <div className="api-manager-card__actions" role="group" aria-label={ar ? 'إجراءات' : 'Actions'}>
                      <button
                        type="button"
                        className="api-manager-card__btn"
                        title={copy.edit}
                        aria-label={copy.edit}
                        onClick={() => openEdit(row)}
                      >
                        <i className="fa-solid fa-pen-to-square" aria-hidden />
                        <span>{copy.edit}</span>
                      </button>
                      <button
                        type="button"
                        className="api-manager-card__btn"
                        title={copy.settings}
                        aria-label={copy.settings}
                        onClick={() => openEdit(row)}
                      >
                        <i className="fa-solid fa-sliders" aria-hidden />
                        <span>{copy.settings}</span>
                      </button>
                      <button
                        type="button"
                        className="api-manager-card__btn api-manager-card__btn--danger"
                        title={copy.delete}
                        aria-label={copy.delete}
                        onClick={() => remove(row.id)}
                      >
                        <i className="fa-solid fa-trash-can" aria-hidden />
                        <span>{copy.delete}</span>
                      </button>
                    </div>
                  </article>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <IntegrationModal
        open={modalOpen}
        record={editing}
        onClose={closeModal}
        onSaved={warning => {
          refresh()
          setSaveNotice(warning ? copy.savedLocalOnly : null)
        }}
      />
    </div>
  )
}