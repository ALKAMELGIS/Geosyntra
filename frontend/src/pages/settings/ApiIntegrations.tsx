import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { isPlatformOwnerUser, readCurrentUser } from '../../lib/auth'
import { useLanguage } from '../../lib/i18n'
import { IntegrationModal } from './apiIntegration/components/IntegrationModal'
import {
  deleteIntegrationRecord,
  listIntegrationRecords,
} from './apiIntegration/integrationStore'
import { getProvider } from './apiIntegration/providers/registry'
import type { IntegrationRecord } from './apiIntegration/types'
import type { ProviderCategory } from './apiIntegration/types'
import { appConfirm } from '../../lib/appDialog'
import { hydrateApiVaultFromServer, probeApiVaultServer } from '../../lib/apiVaultPersistence'
import { useApiTokenStore } from '../../lib/apiTokenStore'
import {
  clearDismissedApiManagerNoticeIds,
  loadDismissedApiManagerNoticeIds,
  persistDismissedApiManagerNoticeIds,
  type ApiManagerNotice,
} from './apiManagerNotifications'
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
  const me = readCurrentUser()
  const isOwner = isPlatformOwnerUser(me)

  if (!isOwner) {
    return (
      <div className="api-manager-shell" dir={ar ? 'rtl' : 'ltr'}>
        <div className="api-manager-notice api-manager-notice--warn" role="status">
          <p className="api-manager-notice__text">
            {ar
              ? 'مدير API متاح فقط لحساب Owner.'
              : 'API Manager is available only to the platform Owner.'}
          </p>
        </div>
      </div>
    )
  }

  const showCentralTokensBanner = isOwner

  const [rows, setRows] = useState<IntegrationRecord[]>(() => listIntegrationRecords())
  const [tab, setTab] = useState<TabId>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<IntegrationRecord | null>(null)
  const [saveNotice, setSaveNotice] = useState<string | null>(null)
  const [vaultStatus, setVaultStatus] = useState<{
    reachable: boolean
    persisted: boolean
    encrypted: boolean
  } | null>(null)
  const tokenSyncAt = useApiTokenStore(s => s.lastSyncAt)
  const tokenSyncError = useApiTokenStore(s => s.lastError)
  const [dismissedNoticeIds, setDismissedNoticeIds] = useState<Set<string>>(() =>
    loadDismissedApiManagerNoticeIds(),
  )
  const [notifyPanelOpen, setNotifyPanelOpen] = useState(false)
  const notifyRootRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(() => setRows(listIntegrationRecords()), [])

  const dismissNotice = useCallback((id: string) => {
    setDismissedNoticeIds(prev => {
      const next = new Set(prev)
      next.add(id)
      persistDismissedApiManagerNoticeIds(next)
      return next
    })
    if (id === 'save-notice') setSaveNotice(null)
  }, [])

  const restoreAllNotices = useCallback(() => {
    clearDismissedApiManagerNoticeIds()
    setDismissedNoticeIds(new Set())
  }, [])

  useEffect(() => {
    void hydrateApiVaultFromServer().then(() => refresh())
    void probeApiVaultServer().then(setVaultStatus)
    const onHydrated = () => refresh()
    window.addEventListener('geosyntra-api-vault-hydrated', onHydrated)
    window.addEventListener('geosyntra-api-vault-synced', onHydrated)
    window.addEventListener('geosyntra-api-secrets-hydrated', onHydrated)
    return () => {
      window.removeEventListener('geosyntra-api-vault-hydrated', onHydrated)
      window.removeEventListener('geosyntra-api-vault-synced', onHydrated)
      window.removeEventListener('geosyntra-api-secrets-hydrated', onHydrated)
    }
  }, [refresh])

  useEffect(() => {
    if (!notifyPanelOpen) return
    const onDoc = (e: MouseEvent) => {
      const el = notifyRootRef.current
      if (el && !el.contains(e.target as Node)) setNotifyPanelOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNotifyPanelOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [notifyPanelOpen])

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
        savedLocalOnly:
          'تم حفظ التكامل في هذا المتصفح فقط. شغّل خادم Node مع مسار دائم GEOSYNTRA_API_SECRETS_FILE ليبقى المفتاح بعد التحديثات.',
        vaultPersistent: 'تمت مزامنة الخزنة — المفاتيح والتكاملات تبقى بعد تحديثات الكود.',
        vaultOffline: 'خزنة الخادم غير متاحة — فعّل VITE_GEOSYNTRA_API_SECRETS_URL أو انشر الـ API مع volume للبيانات.',
        vaultEncrypted: 'المفاتيح مشفّرة على الخادم (GEOSYNTRA_API_VAULT_MASTER_KEY).',
        tokenDbSynced: 'تمت مزامنة مفاتيح API من قاعدة البيانات — تبقى بعد تسجيل الدخول والتحديث.',
        tokenDbPending: 'لم تُحمَّل المفاتيح من قاعدة البيانات بعد — تأكد من تشغيل Node API وتسجيل الدخول.',
        dismiss: 'إغلاق',
        notifications: 'الإشعارات',
        notificationsAria: 'فتح مركز الإشعارات',
        noNotifications: 'لا توجد إشعارات جديدة.',
        restoreNotifications: 'استعادة المخفية',
        markRead: 'إخفاء',
        centralTokensTitle: 'مفاتيح النظام',
        centralTokensBody: 'المفاتيح تُحفظ مشفّرة في قاعدة البيانات وتُحمَّل بعد تسجيل الدخول.',
        openApiTokens: 'فتح مدير التوكنات',
        tokenSyncTitle: 'مزامنة قاعدة البيانات',
        vaultTitle: 'خزنة الخادم',
        savedTitle: 'حفظ التكامل',
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
          'Integration saved in this browser only. Run the Node backend with a persistent GEOSYNTRA_API_SECRETS_FILE volume so keys survive deploys.',
        vaultPersistent: 'Vault synced — keys and integrations persist across code updates.',
        vaultOffline: 'Server vault unreachable — configure VITE_GEOSYNTRA_API_SECRETS_URL or deploy the API with a data volume.',
        vaultEncrypted: 'Secrets encrypted at rest (GEOSYNTRA_API_VAULT_MASTER_KEY).',
        tokenDbSynced: 'API keys synced from the database — they persist across login and refresh.',
        tokenDbPending: 'Database token sync pending — run the Node API and sign in with JWT.',
        dismiss: 'Dismiss',
        notifications: 'Notifications',
        notificationsAria: 'Open notification center',
        noNotifications: 'No new notifications.',
        restoreNotifications: 'Restore hidden',
        markRead: 'Dismiss',
        centralTokensTitle: 'System keys',
        centralTokensBody: 'Keys are encrypted in the database and reload after sign-in.',
        openApiTokens: 'Open API Tokens',
        tokenSyncTitle: 'Database sync',
        vaultTitle: 'Server vault',
        savedTitle: 'Integration saved',
      }

  const noticeCatalog = useMemo((): ApiManagerNotice[] => {
    const list: ApiManagerNotice[] = []
    if (saveNotice) {
      list.push({
        id: 'save-notice',
        tone: 'warn',
        icon: 'fa-circle-info',
        title: copy.savedTitle,
        priority: 100,
      })
    }
    if (showCentralTokensBanner) {
      list.push({
        id: 'central-tokens',
        tone: 'ok',
        icon: 'fa-key',
        title: copy.centralTokensTitle,
        priority: 80,
      })
    }
    list.push({
      id: 'token-sync',
      tone: tokenSyncAt && !tokenSyncError ? 'ok' : 'warn',
      icon: 'fa-database',
      title: copy.tokenSyncTitle,
      priority: 70,
    })
    if (vaultStatus) {
      list.push({
        id: 'vault-status',
        tone: vaultStatus.reachable && vaultStatus.persisted ? 'ok' : 'warn',
        icon: 'fa-shield-halved',
        title: copy.vaultTitle,
        priority: 60,
      })
    }
    return list.sort((a, b) => b.priority - a.priority)
  }, [
    copy.centralTokensTitle,
    copy.savedTitle,
    copy.tokenSyncTitle,
    copy.vaultTitle,
    saveNotice,
    showCentralTokensBanner,
    tokenSyncAt,
    tokenSyncError,
    vaultStatus,
  ])

  const visibleNotices = useMemo(
    () => noticeCatalog.filter(n => !dismissedNoticeIds.has(n.id)),
    [dismissedNoticeIds, noticeCatalog],
  )

  const hiddenNoticeCount = noticeCatalog.length - visibleNotices.length

  const renderNoticeBody = (id: string) => {
    if (id === 'save-notice' && saveNotice) return <p>{saveNotice}</p>
    if (id === 'central-tokens') {
      return (
        <p>
          {copy.centralTokensBody}{' '}
          <Link to="/settings/admin/tokens" className="api-manager-notify-item__link">
            {copy.openApiTokens}
          </Link>
        </p>
      )
    }
    if (id === 'token-sync') {
      return (
        <p>
          {tokenSyncError
            ? tokenSyncError
            : tokenSyncAt
              ? copy.tokenDbSynced
              : copy.tokenDbPending}
        </p>
      )
    }
    if (id === 'vault-status' && vaultStatus) {
      return (
        <p>
          {vaultStatus.reachable && vaultStatus.persisted
            ? `${copy.vaultPersistent}${vaultStatus.encrypted ? ` ${copy.vaultEncrypted}` : ''}`
            : copy.vaultOffline}
        </p>
      )
    }
    return null
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

  const remove = async (id: string) => {
    const ok = await appConfirm(copy.removeConfirm, {
      title: 'Remove integration',
      confirmLabel: 'Remove',
      cancelLabel: 'Cancel',
      danger: true,
    })
    if (!ok) return
    deleteIntegrationRecord(id)
    refresh()
  }

  return (
    <div className="api-manager-shell" dir={ar ? 'rtl' : 'ltr'}>
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

      <section
        className="api-manager-toolbar"
        aria-label={ar ? 'شريط أدوات مدير API' : 'API Manager toolbar'}
      >
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

        <div
          className={cn('api-manager-notify', notifyPanelOpen && 'api-manager-notify--open')}
          ref={notifyRootRef}
        >
          <button
            type="button"
            className="api-manager-notify__trigger"
            aria-expanded={notifyPanelOpen}
            aria-haspopup="dialog"
            aria-label={copy.notificationsAria}
            onClick={() => setNotifyPanelOpen(v => !v)}
          >
            <i className="fa-solid fa-bell" aria-hidden />
            <span className="api-manager-notify__trigger-label">{copy.notifications}</span>
            {visibleNotices.length > 0 ? (
              <span className="api-manager-notify__badge" aria-hidden>
                {visibleNotices.length > 9 ? '9+' : visibleNotices.length}
              </span>
            ) : null}
          </button>

          {notifyPanelOpen ? (
            <div
              className="api-manager-notify__panel"
              role="dialog"
              aria-label={copy.notifications}
            >
              <header className="api-manager-notify__head">
                <span className="api-manager-notify__head-title">
                  <i className="fa-solid fa-bell" aria-hidden />
                  {copy.notifications}
                </span>
                {hiddenNoticeCount > 0 ? (
                  <button
                    type="button"
                    className="api-manager-notify__restore"
                    onClick={restoreAllNotices}
                  >
                    <i className="fa-solid fa-rotate-left" aria-hidden />
                    {copy.restoreNotifications}
                  </button>
                ) : null}
              </header>

              <div className="api-manager-notify__list">
                {visibleNotices.length === 0 ? (
                  <p className="api-manager-notify__empty">{copy.noNotifications}</p>
                ) : (
                  visibleNotices.map(notice => (
                    <article
                      key={notice.id}
                      className={cn(
                        'api-manager-notify-item',
                        `api-manager-notify-item--${notice.tone}`,
                      )}
                    >
                      <span
                        className="api-manager-notify-item__icon"
                        aria-hidden
                      >
                        <i className={cn('fa-solid', notice.icon)} />
                      </span>
                      <div className="api-manager-notify-item__body">
                        <h3 className="api-manager-notify-item__title">{notice.title}</h3>
                        <div className="api-manager-notify-item__text">
                          {renderNoticeBody(notice.id)}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="api-manager-notify-item__dismiss"
                        aria-label={copy.markRead}
                        onClick={() => dismissNotice(notice.id)}
                      >
                        <i className="fa-solid fa-xmark" aria-hidden />
                      </button>
                    </article>
                  ))
                )}
              </div>
            </div>
          ) : null}
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