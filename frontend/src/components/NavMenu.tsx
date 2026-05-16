import { NavLink, useLocation } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import './navmenu.css'
import { hasPermission, normalizeRole, readCurrentUser } from '../lib/auth'
import { useLanguage } from '../lib/i18n'
import type { MergedGroup } from '../nav/navManifest'
import { prefetchRoute } from '../routes/routePrefetch'
import { normalizeAppPath } from '../services/settingsStorage'
import { useMergedNavigation, useSystemSettings } from '../store/SystemSettingsContext'
import { navTranslations } from './navTranslations'

type NavMenuProps = {
  onLogout?: () => void
}

export default function NavMenu({ onLogout }: NavMenuProps) {
  const getViewport = (): 'desktop' | 'tablet' | 'mobile' => {
    if (typeof window === 'undefined') return 'desktop'
    const w = window.innerWidth
    if (w < 768) return 'mobile'
    if (w < 1024) return 'tablet'
    return 'desktop'
  }
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>(getViewport)
  const [isMobile, setIsMobile] = useState(() => getViewport() === 'mobile')
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('navCollapsed') === 'true'
  })
  const [openGroup, setOpenGroup] = useState<
    'dashboard' | 'geosyntraAi' | 'satellite' | 'data' | 'sensors' | 'master' | 'admin' | 'account' | string | null
  >(null)
  const location = useLocation()
  const navRef = useRef<HTMLElement | null>(null)
  const groupContainerRefs = useRef<Record<string, HTMLLIElement | null>>({})
  const groupHeaderRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const groupFirstItemRefs = useRef<Record<string, HTMLElement | null>>({})

  const { language } = useLanguage()

  const role = normalizeRole(readCurrentUser()?.role)

  const canSeeMaster = true
  const canSeeAdmin = hasPermission('admin.users.manage', role)

  const t = navTranslations[language]

  const { home: mergedHome, groups: mergedGroups } = useMergedNavigation()
  const { settings: systemSettings } = useSystemSettings()

  const navLabel = (leaf: { i18nKey: keyof typeof navTranslations.en; labelEn: string; labelAr: string }) => {
    if (language === 'ar') return leaf.labelAr || t[leaf.i18nKey]
    return leaf.labelEn || t[leaf.i18nKey]
  }

  const renderMergedGroup = (group: MergedGroup) => (
    <li
      key={group.id}
      className={openGroup === group.id ? 'group open' : 'group'}
      ref={el => {
        groupContainerRefs.current[group.id] = el
      }}
    >
      <button
        className={
          activeGroup === group.id
            ? `group-header active ${group.headerClass}`
            : `group-header ${group.headerClass}`
        }
        type="button"
        aria-haspopup="true"
        aria-expanded={openGroup === group.id}
        aria-controls={`nav-group-${group.id}`}
        onClick={() => toggleGroup(group.id)}
        onMouseEnter={() => {
          if (flyoutMode) positionFlyout(group.id)
        }}
        onFocus={() => {
          if (flyoutMode) positionFlyout(group.id)
        }}
        onKeyDown={onGroupKeyDown(group.id)}
        ref={el => {
          groupHeaderRefs.current[group.id] = el
        }}
      >
        <span className="icon">
          <i className={group.iconClass}></i>
        </span>
        <span className="label">{navLabel(group)}</span>
        <i className={`chev fa-solid ${openGroup === group.id ? 'fa-chevron-down' : 'fa-chevron-right'}`}></i>
      </button>
      <div
        id={`nav-group-${group.id}`}
        className={openGroup === group.id ? 'sublist open' : 'sublist'}
      >
        {group.children.map((leaf, ix) => (
          <NavLink
            key={leaf.id}
            to={leaf.path}
            title={navLabel(leaf)}
            aria-label={navLabel(leaf)}
            onClick={handleNavigate}
            /* Warm the destination chunk on hover / focus so the
             * subsequent click is essentially free (no network parse
             * delay). `prefetchRoute` is fire-and-forget + memoised,
             * so re-hovering is a no-op. */
            onMouseEnter={() => prefetchRoute(leaf.path)}
            onPointerEnter={() => prefetchRoute(leaf.path)}
            onFocus={() => prefetchRoute(leaf.path)}
            className={({ isActive }) => (isActive ? `subitem active ${leaf.subitemClass}` : `subitem ${leaf.subitemClass}`)}
            ref={el => {
              if (ix === 0) groupFirstItemRefs.current[group.id] = el
            }}
          >
            <span className="icon">
              <i className={leaf.iconClass}></i>
            </span>
          </NavLink>
        ))}
      </div>
    </li>
  )

  const closeAllGroups = () => setOpenGroup(null)
  const closeAll = () => {
    setOpenGroup(null)
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    const update = () => {
      const next = getViewport()
      setViewport(next)
      setIsMobile(next === 'mobile')
    }
    update()
    window.addEventListener('resize', update)
    const vv = window.visualViewport
    vv?.addEventListener('resize', update)
    vv?.addEventListener('scroll', update)
    return () => {
      window.removeEventListener('resize', update)
      vv?.removeEventListener('resize', update)
      vv?.removeEventListener('scroll', update)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem('navCollapsed', collapsed ? 'true' : 'false')
  }, [collapsed])

  useEffect(() => {
    setOpenGroup(null)
  }, [location.pathname])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const body = document.body
    const isMobileViewport = viewport === 'mobile'
    body.classList.toggle('nav-drawer-viewport', isMobileViewport)
    body.classList.toggle('nav-drawer-open', isMobileViewport)
    return () => {
      body.classList.remove('nav-drawer-viewport')
      body.classList.remove('nav-drawer-open')
    }
  }, [viewport])

  useEffect(() => {
    const handleAnyPointerDown = (e: Event) => {
      if (e.type === 'mousedown' && typeof window !== 'undefined' && 'PointerEvent' in window) return
      if (e.type === 'touchstart' && typeof window !== 'undefined' && 'PointerEvent' in window) return
      if (!navRef.current) return
      const target = e.target as Node | null
      if (!target) return

      const navEl = navRef.current

      if (!navEl.contains(target)) {
        closeAll()
        return
      }

      if (openGroup) {
        const openContainer = groupContainerRefs.current[openGroup]
        if (openContainer && !openContainer.contains(target)) {
          setOpenGroup(null)
        }
      }
    }

    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      closeAll()
    }

    document.addEventListener('pointerdown', handleAnyPointerDown, { capture: true })
    document.addEventListener('mousedown', handleAnyPointerDown, { capture: true })
    document.addEventListener('touchstart', handleAnyPointerDown, { capture: true })
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handleAnyPointerDown, { capture: true } as any)
      document.removeEventListener('mousedown', handleAnyPointerDown, { capture: true } as any)
      document.removeEventListener('touchstart', handleAnyPointerDown, { capture: true } as any)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [openGroup])

  const activeGroup = useMemo(() => {
    const path = location.pathname
    const custom = systemSettings.customPages.find(p => {
      const n = normalizeAppPath(p.path)
      return path === n || path.startsWith(`${n}/`)
    })
    if (custom?.navGroupId) return custom.navGroupId
    if (path.startsWith('/satellite/')) return 'satellite'
    if (path.startsWith('/master/')) return 'master'
    if (path.startsWith('/admin/')) return 'admin'
    if (path.startsWith('/account/')) return 'account'
    return null
  }, [location.pathname, systemSettings.customPages])

  const toggleGroup = (group: NonNullable<typeof openGroup>) => {
    setOpenGroup(prev => (prev === group ? null : group))
  }

  const flyoutMode = false

  const positionFlyout = (group: NonNullable<typeof openGroup>) => {
    if (typeof window === 'undefined') return
    const header = groupHeaderRefs.current[group]
    const container = groupContainerRefs.current[group]
    if (!header || !container) return
    const rect = header.getBoundingClientRect()
    const pad = 10
    const top = Math.max(8, Math.min(rect.top - 10, window.innerHeight - 8))
    const isRtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl'
    container.style.setProperty('--nav-flyout-top', `${top}px`)
    if (isRtl) {
      const right = Math.max(8, window.innerWidth - rect.left + pad)
      container.style.setProperty('--nav-flyout-right', `${right}px`)
      container.style.removeProperty('--nav-flyout-left')
    } else {
      const left = Math.max(8, rect.right + pad)
      container.style.setProperty('--nav-flyout-left', `${left}px`)
      container.style.removeProperty('--nav-flyout-right')
    }
  }

  useEffect(() => {
    if (!flyoutMode) return
    if (!openGroup) return
    const id = window.requestAnimationFrame(() => {
      positionFlyout(openGroup)
    })
    return () => window.cancelAnimationFrame(id)
  }, [flyoutMode, openGroup])

  const openGroupAndFocusFirst = (group: NonNullable<typeof openGroup>) => {
    setOpenGroup(group)
    requestAnimationFrame(() => {
      groupFirstItemRefs.current[group]?.focus()
    })
  }

  const onGroupKeyDown = (group: NonNullable<typeof openGroup>) => (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggleGroup(group)
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      openGroupAndFocusFirst(group)
      return
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      closeAll()
    }
  }

  const handleNavigate = () => {
    closeAll()
  }

  if (viewport !== 'mobile') {
    return null
  }

  return (
      <nav
        className={['navmenu', isMobile ? 'navmenu-open' : ''].filter(Boolean).join(' ')}
        aria-label="Primary"
        ref={navRef}
        data-viewport={viewport}
      >
      <button
        className="nav-collapse-toggle"
        type="button"
        aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        aria-pressed={collapsed}
        aria-controls="primary-nav"
        onClick={() => {
          setCollapsed(v => !v)
          closeAllGroups()
        }}
      >
        <i className={collapsed ? 'fa-solid fa-angles-right' : 'fa-solid fa-angles-left'}></i>
      </button>
      <ul
        id="primary-nav"
        className="navmenu-list"
        data-open={isMobile ? 'true' : undefined}
        aria-hidden={isMobile ? false : undefined}
      >
        {mergedHome.visible ? (
          <li className="navmenu-li">
            <NavLink
              to="/"
              title={navLabel(mergedHome)}
              aria-label={navLabel(mergedHome)}
              onClick={handleNavigate}
              className={({ isActive }) => (isActive ? 'item active nav-item-home' : 'item nav-item-home')}
            >
              <span className="icon">
                <i className={mergedHome.iconClass}></i>
              </span>
            </NavLink>
          </li>
        ) : null}

        {mergedGroups.map(group => {
          if (group.id === 'master' && !canSeeMaster) return null
          if (group.id === 'admin' && !canSeeAdmin) return null
          return renderMergedGroup(group)
        })}

        <li
          className={
            openGroup === 'account'
              ? 'group open navmenu-utility navmenu-utility-first navmenu-utility-last'
              : 'group navmenu-utility navmenu-utility-first navmenu-utility-last'
          }
          ref={el => {
            groupContainerRefs.current.account = el
          }}
        >
          <button
            className={activeGroup === 'account' ? 'group-header active nav-header-account' : 'group-header nav-header-account'}
            type="button"
            aria-haspopup="true"
            aria-label={t.account}
            aria-expanded={openGroup === 'account'}
            aria-controls="nav-group-account"
            title={t.account}
            onClick={() => toggleGroup('account')}
            onMouseEnter={() => {
              if (flyoutMode) positionFlyout('account')
            }}
            onFocus={() => {
              if (flyoutMode) positionFlyout('account')
            }}
            onKeyDown={onGroupKeyDown('account')}
            ref={el => {
              groupHeaderRefs.current.account = el
            }}
          >
            <span className="icon">
              <i className="fa-solid fa-circle-user"></i>
            </span>
            <i className={`chev fa-solid ${openGroup === 'account' ? 'fa-chevron-down' : 'fa-chevron-right'}`}></i>
          </button>
          <div
            id="nav-group-account"
            className={openGroup === 'account' ? 'sublist open' : 'sublist'}
          >
            <button
              className="subitem nav-item-account"
              type="button"
              title={t.logout}
              aria-label={t.logout}
              ref={el => {
                groupFirstItemRefs.current.account = el
              }}
              onClick={() => {
                closeAll()
                if (onLogout) {
                  onLogout()
                } else {
                  window.location.href = '/'
                }
              }}
            >
              <span className="icon">
                <i className="fa-solid fa-arrow-right-from-bracket"></i>
              </span>
            </button>
          </div>
        </li>

      </ul>
      </nav>
  )
}
