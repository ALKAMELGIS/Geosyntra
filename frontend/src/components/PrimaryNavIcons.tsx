import { NavLink, useLocation } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import './primary-nav-icons.css'
import { hasPermission, normalizeRole, readCurrentUser } from '../lib/auth'
import { useLanguage } from '../lib/i18n'
import type { MergedGroup } from '../nav/navManifest'
import { prefetchRoute } from '../routes/routePrefetch'
import { normalizeAppPath } from '../services/settingsStorage'
import { useMergedNavigation, useSystemSettings } from '../store/SystemSettingsContext'
import { navTranslations } from './navTranslations'
import { HomeProfileSheet } from '../pages/home/profile/HomeProfileSheet'

type PrimaryNavIconsProps = {
  onLogout?: () => void
}

function useIsMobileNavViewport() {
  return useSyncExternalStore(
    cb => {
      if (typeof window === 'undefined') return () => {}
      const mq = window.matchMedia('(max-width: 767px)')
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => (typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false),
    () => false,
  )
}

export default function PrimaryNavIcons({ onLogout }: PrimaryNavIconsProps) {
  const isMobile = useIsMobileNavViewport()
  const location = useLocation()
  const rootRef = useRef<HTMLElement | null>(null)
  const [openGroupId, setOpenGroupId] = useState<string | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const { language } = useLanguage()
  const role = normalizeRole(readCurrentUser()?.role)
  const canSeeMaster = true
  const canSeeAdmin = hasPermission('admin.users.manage', role)
  const t = navTranslations[language]
  const { home: mergedHome, groups: mergedGroups } = useMergedNavigation()
  const { settings: systemSettings } = useSystemSettings()

  const navLabel = useCallback(
    (leaf: { i18nKey: keyof typeof navTranslations.en; labelEn: string; labelAr: string }) => {
      if (language === 'ar') return leaf.labelAr || t[leaf.i18nKey]
      return leaf.labelEn || t[leaf.i18nKey]
    },
    [language, t],
  )

  const groupTitle = useCallback(
    (group: MergedGroup) => {
      if (language === 'ar') return group.labelAr || t[group.i18nKey]
      return group.labelEn || t[group.i18nKey]
    },
    [language, t],
  )

  const activeGroup = useMemo(() => {
    const path = location.pathname
    const custom = systemSettings.customPages.find(p => {
      const n = normalizeAppPath(p.path)
      return path === n || path.startsWith(`${n}/`)
    })
    if (custom?.navGroupId) return custom.navGroupId
    if (path.startsWith('/satellite/')) return 'satellite'
    if (path.startsWith('/master/')) return 'master'
    if (path.startsWith('/settings/')) return 'settings'
    if (path.startsWith('/admin/')) return 'admin'
    if (path.startsWith('/account/')) return 'account'
    return null
  }, [location.pathname, systemSettings.customPages])

  const closePopover = useCallback(() => setOpenGroupId(null), [])

  useEffect(() => {
    closePopover()
  }, [location.pathname, closePopover])

  useEffect(() => {
    if (!openGroupId) return
    const onDoc = (e: MouseEvent) => {
      const el = rootRef.current
      if (el && !el.contains(e.target as Node)) closePopover()
    }
    document.addEventListener('mousedown', onDoc, true)
    return () => document.removeEventListener('mousedown', onDoc, true)
  }, [openGroupId, closePopover])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePopover()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closePopover])

  if (isMobile) return null

  const toggle = (id: string) => setOpenGroupId(prev => (prev === id ? null : id))

  return (
    <nav
      ref={rootRef}
      className="geosyntra-primary-nav"
      aria-label="Primary app navigation"
    >
      {mergedHome.visible ? (
        <NavLink
          to="/"
          className={({ isActive }) =>
            `geosyntra-primary-nav__link${isActive ? ' geosyntra-primary-nav__link--active' : ''}`
          }
          title={navLabel(mergedHome)}
          onClick={closePopover}
        >
          <span className="geosyntra-primary-nav__glass" aria-hidden>
            <i className={mergedHome.iconClass} />
          </span>
        </NavLink>
      ) : null}

      {mergedGroups.map(group => {
        if (group.id === 'master' && !canSeeMaster) return null
        if (group.id === 'admin' && !canSeeAdmin) return null
        const open = openGroupId === group.id
        const active = activeGroup === group.id
        return (
          <div key={group.id} className="geosyntra-primary-nav__slot">
            <button
              type="button"
              className={
                'geosyntra-primary-nav__trigger' +
                (active ? ' geosyntra-primary-nav__trigger--active' : '') +
                (open ? ' geosyntra-primary-nav__trigger--open' : '')
              }
              aria-haspopup="true"
              aria-expanded={open}
              aria-controls={`geosyntra-primary-pop-${group.id}`}
              title={groupTitle(group)}
              onClick={() => toggle(group.id)}
            >
              <span className="geosyntra-primary-nav__glass" aria-hidden>
                <i className={group.iconClass} />
              </span>
            </button>
            <div
              id={`geosyntra-primary-pop-${group.id}`}
              className={open ? 'geosyntra-primary-nav__popover geosyntra-primary-nav__popover--open' : 'geosyntra-primary-nav__popover'}
              role="menu"
              hidden={!open}
            >
              {group.children.map(leaf => (
                <NavLink
                  key={leaf.id}
                  to={leaf.path}
                  role="menuitem"
                  title={navLabel(leaf)}
                  aria-label={navLabel(leaf)}
                  className={({ isActive }) =>
                    `geosyntra-primary-nav__popitem${isActive ? ' geosyntra-primary-nav__popitem--active' : ''}`
                  }
                  onClick={() => {
                    closePopover()
                  }}
                  onMouseEnter={() => prefetchRoute(leaf.path)}
                  onPointerEnter={() => prefetchRoute(leaf.path)}
                  onFocus={() => prefetchRoute(leaf.path)}
                >
                  <span className="geosyntra-primary-nav__popicon" aria-hidden>
                    <i className={leaf.iconClass} />
                  </span>
                </NavLink>
              ))}
            </div>
          </div>
        )
      })}

      <div className="geosyntra-primary-nav__slot geosyntra-primary-nav__slot--account">
        <button
          type="button"
          className={
            'geosyntra-primary-nav__trigger' +
            (activeGroup === 'account' ? ' geosyntra-primary-nav__trigger--active' : '') +
            (openGroupId === 'account' ? ' geosyntra-primary-nav__trigger--open' : '')
          }
          aria-haspopup="true"
          aria-expanded={openGroupId === 'account'}
          aria-controls="geosyntra-primary-pop-account"
          title={t.account}
          onClick={() => toggle('account')}
        >
          <span className="geosyntra-primary-nav__glass" aria-hidden>
            <i className="fa-solid fa-circle-user" />
          </span>
        </button>
        <div
          id="geosyntra-primary-pop-account"
          className={
            openGroupId === 'account'
              ? 'geosyntra-primary-nav__popover geosyntra-primary-nav__popover--open'
              : 'geosyntra-primary-nav__popover'
          }
          role="menu"
          hidden={openGroupId !== 'account'}
        >
          <button
            type="button"
            role="menuitem"
            title="Account profile"
            aria-label="Account profile"
            className="geosyntra-primary-nav__popitem geosyntra-primary-nav__popitem--btn"
            onClick={() => {
              closePopover()
              setProfileOpen(true)
            }}
          >
            <span className="geosyntra-primary-nav__popicon" aria-hidden>
              <i className="fa-solid fa-user" />
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            title={t.logout}
            aria-label={t.logout}
            className="geosyntra-primary-nav__popitem geosyntra-primary-nav__popitem--btn"
            onClick={() => {
              closePopover()
              if (onLogout) onLogout()
              else window.location.href = '/'
            }}
          >
            <span className="geosyntra-primary-nav__popicon" aria-hidden>
              <i className="fa-solid fa-arrow-right-from-bracket" />
            </span>
          </button>
        </div>
      </div>
      <HomeProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)} />
    </nav>
  )
}
