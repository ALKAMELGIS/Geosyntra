import { NavLink, useLocation } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import './navmenu.css'
import { hasPermission, normalizeRole } from '../lib/auth'
import { useLanguage } from '../lib/i18n'

type NavMenuProps = {
  onLogout?: () => void
}

type AppNotification = {
  id: number
  title: string
  body: string
  at: string
  read: boolean
}

const navTranslations = {
  en: {
    account: 'Account',
    admin: 'Admin',
    arabic: 'Arabic',
    camera: 'Camera',
    clearAll: 'Clear all',
    closeMenu: 'Close navigation menu',
    dashboard: 'Dashboard',
    designDashboard: 'Design Dashboard',
    developDashboard: 'Develop Dashboard',
    ecph: 'EC/PH',
    english: 'English',
    gisContent: 'GIS Content',
    gisMap: 'GIS Map',
    githubIntegration: 'GitHub Integration',
    harvest: 'Harvest Logging',
    home: 'Home',
    irrigation: 'Irrigation Scheduling',
    irrigationSensors: 'Irrigation Sensors',
    language: 'Language',
    logout: 'Logout',
    masterData: 'Master Data',
    noNotifications: 'No notifications',
    notifications: 'Notifications',
    openMenu: 'Open navigation menu',
    operations: 'Operations',
    productTracking: 'Product & Sales Tracking',
    profile: 'Profile',
    qhis: 'QHIS',
    satelliteImagery: 'Satellite Imagery',
    satelliteIntelligence: 'Satellite Intelligence',
    sensors: 'Sensors',
    soilSensors: 'Soil Sensors',
    userManagement: 'User Management',
    weatherSensors: 'Weather Sensors',
    workflowDataSources: 'Workflow & Data Sources',
  },
  ar: {
    account: 'الحساب',
    admin: 'الإدارة',
    arabic: 'العربية',
    camera: 'الكاميرا',
    clearAll: 'مسح الكل',
    closeMenu: 'إغلاق قائمة التنقل',
    dashboard: 'لوحة التحكم',
    designDashboard: 'تصميم لوحة التحكم',
    developDashboard: 'تطوير لوحة التحكم',
    ecph: 'الملوحة والحموضة',
    english: 'الإنجليزية',
    gisContent: 'محتوى نظم المعلومات الجغرافية',
    gisMap: 'خريطة GIS',
    githubIntegration: 'تكامل GitHub',
    harvest: 'تسجيل الحصاد',
    home: 'الرئيسية',
    irrigation: 'جدولة الري',
    irrigationSensors: 'حساسات الري',
    language: 'اللغة',
    logout: 'تسجيل الخروج',
    masterData: 'البيانات الرئيسية',
    noNotifications: 'لا توجد إشعارات',
    notifications: 'الإشعارات',
    openMenu: 'فتح قائمة التنقل',
    operations: 'العمليات',
    productTracking: 'تتبع المنتجات والمبيعات',
    profile: 'الملف الشخصي',
    qhis: 'الجودة والسلامة',
    satelliteImagery: 'صور الأقمار الصناعية',
    satelliteIntelligence: 'التحليل الفضائي الذكي',
    sensors: 'الحساسات',
    soilSensors: 'حساسات التربة',
    userManagement: 'إدارة المستخدمين',
    weatherSensors: 'حساسات الطقس',
    workflowDataSources: 'سير العمل ومصادر البيانات',
  },
} as const

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
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('navCollapsed') === 'true'
  })
  const [openGroup, setOpenGroup] = useState<
    'dashboard' | 'satellite' | 'data' | 'sensors' | 'master' | 'admin' | 'notifications' | 'language' | 'account' | null
  >(null)
  const location = useLocation()
  const navRef = useRef<HTMLElement | null>(null)
  const groupContainerRefs = useRef<Record<string, HTMLLIElement | null>>({})
  const groupHeaderRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const groupFirstItemRefs = useRef<Record<string, HTMLElement | null>>({})

  const { language, setLanguage } = useLanguage()

  const [notifications, setNotifications] = useState<AppNotification[]>(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('appNotifications') : null
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) return parsed as AppNotification[]
      } catch {
      }
    }
    return [
      { id: Date.now() - 2, title: 'Welcome', body: 'Your account is ready.', at: new Date().toLocaleString(), read: false },
      { id: Date.now() - 1, title: 'Tip', body: 'Use Admin → User Management to manage users.', at: new Date().toLocaleString(), read: false }
    ]
  })

  const role = useMemo(() => {
    try {
      const raw = localStorage.getItem('currentUser')
      if (!raw) return 'Viewer'
      const parsed = JSON.parse(raw) as any
      return normalizeRole(parsed?.role)
    } catch {
      return 'Viewer'
    }
  }, [])

  const canSeeMaster = true
  const canSeeAdmin = hasPermission('admin.users.manage', role)

  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications])
  const t = navTranslations[language]

  const closeAllGroups = () => setOpenGroup(null)
  const closeAll = () => {
    setMobileOpen(false)
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
    return () => {
      window.removeEventListener('resize', update)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem('navCollapsed', collapsed ? 'true' : 'false')
  }, [collapsed])

  useEffect(() => {
    closeAll()
  }, [location.pathname])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('appNotifications', JSON.stringify(notifications))
    }
  }, [notifications])

  useEffect(() => {
    if (openGroup !== 'notifications') return
    setNotifications(prev => prev.map(n => (n.read ? n : { ...n, read: true })))
  }, [openGroup])

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
    if (path.startsWith('/dashboard')) return 'dashboard'
    if (path.startsWith('/satellite/')) return 'satellite'
    if (path.startsWith('/data/')) return 'data'
    if (path.startsWith('/sensors/')) return 'sensors'
    if (path.startsWith('/master/')) return 'master'
    if (path.startsWith('/admin/')) return 'admin'
    if (path.startsWith('/account/')) return 'account'
    return null
  }, [location.pathname])

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

  return (
    <nav
      className={[
        'navmenu',
        mobileOpen ? 'navmenu-open' : '',
      ].filter(Boolean).join(' ')}
      aria-label="Primary"
      ref={navRef}
      data-viewport={viewport}
    >
      <button
        className="nav-toggle"
        type="button"
        aria-label={mobileOpen ? t.closeMenu : t.openMenu}
        aria-expanded={mobileOpen}
        aria-controls="primary-nav"
        onClick={() => {
          setMobileOpen(o => !o)
          closeAllGroups()
        }}
      >
        <i className={mobileOpen ? 'fa-solid fa-xmark' : 'fa-solid fa-bars'}></i>
      </button>
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
        data-open={mobileOpen ? 'true' : 'false'}
        aria-hidden={isMobile ? !mobileOpen : undefined}
      >
        <li className="navmenu-li">
          <NavLink
            to="/"
            onClick={handleNavigate}
            className={({ isActive }) => (isActive ? 'item active nav-item-home' : 'item nav-item-home')}
          >
            <span className="icon">
              <i className="fa-solid fa-house"></i>
            </span>
            <span className="label">{t.home}</span>
          </NavLink>
        </li>

        <li
          className={openGroup === 'dashboard' ? 'group open' : 'group'}
          ref={el => {
            groupContainerRefs.current.dashboard = el
          }}
        >
          <button
            className={
              activeGroup === 'dashboard' ? 'group-header active nav-header-data nav-header-dashboard' : 'group-header nav-header-data nav-header-dashboard'
            }
            type="button"
            aria-haspopup="true"
            aria-expanded={openGroup === 'dashboard'}
            aria-controls="nav-group-dashboard"
            onClick={() => toggleGroup('dashboard')}
            onMouseEnter={() => {
              if (flyoutMode) positionFlyout('dashboard')
            }}
            onFocus={() => {
              if (flyoutMode) positionFlyout('dashboard')
            }}
            onKeyDown={onGroupKeyDown('dashboard')}
            ref={el => {
              groupHeaderRefs.current.dashboard = el
            }}
          >
            <span className="icon">
              <i className="fa-solid fa-chart-line"></i>
            </span>
            <span className="label">{t.dashboard}</span>
            <i className={`chev fa-solid ${openGroup === 'dashboard' ? 'fa-chevron-down' : 'fa-chevron-right'}`}></i>
          </button>
          <div
            id="nav-group-dashboard"
            className={openGroup === 'dashboard' ? 'sublist open' : 'sublist'}
          >
            <NavLink
              to="/dashboard/develop"
              onClick={handleNavigate}
              className={({ isActive }) => (isActive ? 'subitem active nav-item-dashboard-edit' : 'subitem nav-item-dashboard-edit')}
              ref={el => {
                groupFirstItemRefs.current.dashboard = el
              }}
            >
              <span className="icon">
                <i className="fa-solid fa-grip"></i>
              </span>
              <span className="label">{t.developDashboard}</span>
            </NavLink>
            <NavLink
              to="/dashboard/design"
              onClick={handleNavigate}
              className={({ isActive }) => (isActive ? 'subitem active nav-item-dashboard-design' : 'subitem nav-item-dashboard-design')}
            >
              <span className="icon">
                <i className="fa-solid fa-palette"></i>
              </span>
              <span className="label">{t.designDashboard}</span>
            </NavLink>
          </div>
        </li>

        <li
          className={openGroup === 'satellite' ? 'group open' : 'group'}
          ref={el => {
            groupContainerRefs.current.satellite = el
          }}
        >
          <button
            className={activeGroup === 'satellite' ? 'group-header active nav-header-satellite' : 'group-header nav-header-satellite'}
            type="button"
            aria-haspopup="true"
            aria-expanded={openGroup === 'satellite'}
            aria-controls="nav-group-satellite"
            onClick={() => toggleGroup('satellite')}
            onMouseEnter={() => {
              if (flyoutMode) positionFlyout('satellite')
            }}
            onFocus={() => {
              if (flyoutMode) positionFlyout('satellite')
            }}
            onKeyDown={onGroupKeyDown('satellite')}
            ref={el => {
              groupHeaderRefs.current.satellite = el
            }}
          >
            <span className="icon">
              <i className="fa-solid fa-satellite-dish"></i>
            </span>
            <span className="label">{t.satelliteImagery}</span>
            <i className={`chev fa-solid ${openGroup === 'satellite' ? 'fa-chevron-down' : 'fa-chevron-right'}`}></i>
          </button>
          <div
            id="nav-group-satellite"
            className={openGroup === 'satellite' ? 'sublist open' : 'sublist'}
          >
            <NavLink
              to="/satellite/indices"
              onClick={handleNavigate}
              className={({ isActive }) => (isActive ? 'subitem active nav-item-indices' : 'subitem nav-item-indices')}
              ref={el => {
                groupFirstItemRefs.current.satellite = el
              }}
            >
              <span className="icon">
                <i className="fa-solid fa-layer-group"></i>
              </span>
              <span className="label">{t.satelliteIntelligence}</span>
            </NavLink>
            <NavLink
              to="/satellite/gis"
              onClick={handleNavigate}
              className={({ isActive }) => (isActive ? 'subitem active nav-item-gis-map' : 'subitem nav-item-gis-map')}
            >
              <span className="icon">
                <i className="fa-solid fa-map-location-dot"></i>
              </span>
              <span className="label">{t.gisMap}</span>
            </NavLink>
          </div>
        </li>

        <li
          className={openGroup === 'data' ? 'group open' : 'group'}
          ref={el => {
            groupContainerRefs.current.data = el
          }}
        >
          <button
            className={activeGroup === 'data' ? 'group-header active nav-header-data' : 'group-header nav-header-data'}
            type="button"
            aria-haspopup="true"
            aria-expanded={openGroup === 'data'}
            aria-controls="nav-group-data"
            onClick={() => toggleGroup('data')}
            onMouseEnter={() => {
              if (flyoutMode) positionFlyout('data')
            }}
            onFocus={() => {
              if (flyoutMode) positionFlyout('data')
            }}
            onKeyDown={onGroupKeyDown('data')}
            ref={el => {
              groupHeaderRefs.current.data = el
            }}
          >
            <span className="icon">
              <i className="fa-solid fa-screwdriver-wrench"></i>
            </span>
            <span className="label">{t.operations}</span>
            <i className={`chev fa-solid ${openGroup === 'data' ? 'fa-chevron-down' : 'fa-chevron-right'}`}></i>
          </button>
          <div
            id="nav-group-data"
            className={openGroup === 'data' ? 'sublist open' : 'sublist'}
          >
            <NavLink
              to="/data/irrigation"
              onClick={handleNavigate}
              className={({ isActive }) => (isActive ? 'subitem active nav-item-irrigation' : 'subitem nav-item-irrigation')}
              ref={el => {
                groupFirstItemRefs.current.data = el
              }}
            >
              <span className="icon">
                <i className="fa-solid fa-water"></i>
              </span>
              <span className="label">{t.irrigation}</span>
            </NavLink>
            <NavLink
              to="/data/ec-ph"
              onClick={handleNavigate}
              className={({ isActive }) => (isActive ? 'subitem active nav-item-ec-ph' : 'subitem nav-item-ec-ph')}
            >
              <span className="icon">
                <i className="fa-solid fa-droplet"></i>
              </span>
              <span className="label">{t.ecph}</span>
            </NavLink>
            <NavLink
              to="/data/harvest"
              onClick={handleNavigate}
              className={({ isActive }) => (isActive ? 'subitem active nav-item-harvest' : 'subitem nav-item-harvest')}
            >
              <span className="icon">
                <i className="fa-solid fa-tractor"></i>
              </span>
              <span className="label">{t.harvest}</span>
            </NavLink>
            <NavLink
              to="/data/qhis"
              onClick={handleNavigate}
              className={({ isActive }) => (isActive ? 'subitem active nav-item-qhis' : 'subitem nav-item-qhis')}
            >
              <span className="icon">
                <i className="fa-solid fa-shield-halved"></i>
              </span>
              <span className="label">{t.qhis}</span>
            </NavLink>
            <NavLink
              to="/data/production"
              onClick={handleNavigate}
              className={({ isActive }) => (isActive ? 'subitem active nav-item-production' : 'subitem nav-item-production')}
            >
              <span className="icon">
                <i className="fa-solid fa-boxes-stacked"></i>
              </span>
              <span className="label">{t.productTracking}</span>
            </NavLink>
          </div>
        </li>

        <li
          className={openGroup === 'sensors' ? 'group open' : 'group'}
          ref={el => {
            groupContainerRefs.current.sensors = el
          }}
        >
          <button
            className={activeGroup === 'sensors' ? 'group-header active nav-header-sensors' : 'group-header nav-header-sensors'}
            type="button"
            aria-haspopup="true"
            aria-expanded={openGroup === 'sensors'}
            aria-controls="nav-group-sensors"
            onClick={() => toggleGroup('sensors')}
            onMouseEnter={() => {
              if (flyoutMode) positionFlyout('sensors')
            }}
            onFocus={() => {
              if (flyoutMode) positionFlyout('sensors')
            }}
            onKeyDown={onGroupKeyDown('sensors')}
            ref={el => {
              groupHeaderRefs.current.sensors = el
            }}
          >
            <span className="icon">
              <i className="fa-solid fa-microchip"></i>
            </span>
            <span className="label">{t.sensors}</span>
            <i className={`chev fa-solid ${openGroup === 'sensors' ? 'fa-chevron-down' : 'fa-chevron-right'}`}></i>
          </button>
          <div
            id="nav-group-sensors"
            className={openGroup === 'sensors' ? 'sublist open' : 'sublist'}
          >
            <NavLink
              to="/sensors/soil"
              onClick={handleNavigate}
              className={({ isActive }) => (isActive ? 'subitem active nav-item-sensor-soil' : 'subitem nav-item-sensor-soil')}
              ref={el => {
                groupFirstItemRefs.current.sensors = el
              }}
            >
              <span className="icon">
                <i className="fa-solid fa-seedling"></i>
              </span>
              <span className="label">{t.soilSensors}</span>
            </NavLink>
            <NavLink
              to="/sensors/weather"
              onClick={handleNavigate}
              className={({ isActive }) => (isActive ? 'subitem active nav-item-sensor-weather' : 'subitem nav-item-sensor-weather')}
            >
              <span className="icon">
                <i className="fa-solid fa-cloud-sun"></i>
              </span>
              <span className="label">{t.weatherSensors}</span>
            </NavLink>
            <NavLink
              to="/sensors/irrigation"
              onClick={handleNavigate}
              className={({ isActive }) => (isActive ? 'subitem active nav-item-sensor-irrigation' : 'subitem nav-item-sensor-irrigation')}
            >
              <span className="icon">
                <i className="fa-solid fa-faucet-drip"></i>
              </span>
              <span className="label">{t.irrigationSensors}</span>
            </NavLink>
            <NavLink
              to="/sensors/camera"
              onClick={handleNavigate}
              className={({ isActive }) => (isActive ? 'subitem active nav-item-sensor-camera' : 'subitem nav-item-sensor-camera')}
            >
              <span className="icon">
                <i className="fa-solid fa-camera"></i>
              </span>
              <span className="label">{t.camera}</span>
            </NavLink>
          </div>
        </li>

        {canSeeMaster ? (
          <li
            className={openGroup === 'master' ? 'group open' : 'group'}
            ref={el => {
              groupContainerRefs.current.master = el
            }}
          >
            <button
              className={activeGroup === 'master' ? 'group-header active nav-header-master' : 'group-header nav-header-master'}
              type="button"
              aria-haspopup="true"
              aria-expanded={openGroup === 'master'}
              aria-controls="nav-group-master"
              onClick={() => toggleGroup('master')}
              onMouseEnter={() => {
                if (flyoutMode) positionFlyout('master')
              }}
              onFocus={() => {
                if (flyoutMode) positionFlyout('master')
              }}
              onKeyDown={onGroupKeyDown('master')}
              ref={el => {
                groupHeaderRefs.current.master = el
              }}
            >
              <span className="icon">
                <i className="fa-solid fa-gear"></i>
              </span>
              <span className="label">{t.masterData}</span>
              <i className={`chev fa-solid ${openGroup === 'master' ? 'fa-chevron-down' : 'fa-chevron-right'}`}></i>
            </button>
            <div
              id="nav-group-master"
              className={openGroup === 'master' ? 'sublist open' : 'sublist'}
            >
              <NavLink
                to="/master/workflow-settings"
                onClick={handleNavigate}
                className={({ isActive }) => (isActive ? 'subitem active nav-item-master' : 'subitem nav-item-master')}
                ref={el => {
                  groupFirstItemRefs.current.master = el
                }}
              >
                <span className="icon">
                  <i className="fa-solid fa-sliders"></i>
                </span>
                <span className="label">{t.workflowDataSources}</span>
              </NavLink>
              <NavLink
                to="/master/gis-content"
                onClick={handleNavigate}
                className={({ isActive }) => (isActive ? 'subitem active nav-item-master' : 'subitem nav-item-master')}
              >
                <span className="icon">
                  <i className="fa-solid fa-map"></i>
                </span>
                <span className="label">{t.gisContent}</span>
              </NavLink>
            </div>
          </li>
        ) : null}

        {canSeeAdmin ? (
        <li
          className={openGroup === 'admin' ? 'group open' : 'group'}
          ref={el => {
            groupContainerRefs.current.admin = el
          }}
        >
          <button
            className={activeGroup === 'admin' ? 'group-header active nav-header-admin' : 'group-header nav-header-admin'}
            type="button"
            aria-haspopup="true"
            aria-expanded={openGroup === 'admin'}
            aria-controls="nav-group-admin"
            onClick={() => toggleGroup('admin')}
            onMouseEnter={() => {
              if (flyoutMode) positionFlyout('admin')
            }}
            onFocus={() => {
              if (flyoutMode) positionFlyout('admin')
            }}
            onKeyDown={onGroupKeyDown('admin')}
            ref={el => {
              groupHeaderRefs.current.admin = el
            }}
          >
            <span className="icon">
              <i className="fa-solid fa-user-shield"></i>
            </span>
            <span className="label">{t.admin}</span>
            <i className={`chev fa-solid ${openGroup === 'admin' ? 'fa-chevron-down' : 'fa-chevron-right'}`}></i>
          </button>
          <div
            id="nav-group-admin"
            className={openGroup === 'admin' ? 'sublist open' : 'sublist'}
          >
            <NavLink
              to="/admin/users"
              onClick={handleNavigate}
              className={({ isActive }) => (isActive ? 'subitem active nav-item-admin' : 'subitem nav-item-admin')}
              ref={el => {
                groupFirstItemRefs.current.admin = el
              }}
            >
              <span className="icon">
                <i className="fa-solid fa-users"></i>
              </span>
              <span className="label">{t.userManagement}</span>
            </NavLink>
            <NavLink
              to="/admin/github"
              onClick={handleNavigate}
              className={({ isActive }) => (isActive ? 'subitem active nav-item-admin-github' : 'subitem nav-item-admin-github')}
            >
              <span className="icon">
                <i className="fa-brands fa-github"></i>
              </span>
              <span className="label">{t.githubIntegration}</span>
            </NavLink>
          </div>
        </li>
        ) : null}

        <li
          className={
            openGroup === 'notifications'
              ? 'group open navmenu-account navmenu-utility navmenu-utility-first'
              : 'group navmenu-account navmenu-utility navmenu-utility-first'
          }
          ref={el => {
            groupContainerRefs.current.notifications = el
          }}
        >
          <button
            className="group-header nav-header-notifications navmenu-icon-only"
            type="button"
            aria-haspopup="true"
            aria-label={t.notifications}
            aria-expanded={openGroup === 'notifications'}
            aria-controls="nav-group-notifications"
            title={t.notifications}
            onClick={() => toggleGroup('notifications')}
            onMouseEnter={() => {
              if (flyoutMode) positionFlyout('notifications')
            }}
            onFocus={() => {
              if (flyoutMode) positionFlyout('notifications')
            }}
            onKeyDown={onGroupKeyDown('notifications')}
            ref={el => {
              groupHeaderRefs.current.notifications = el
            }}
          >
            <span className="icon">
              <i className="fa-solid fa-bell"></i>
            </span>
            {unreadCount > 0 && <span className="navmenu-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
          </button>
          <div
            id="nav-group-notifications"
            className={openGroup === 'notifications' ? 'sublist open' : 'sublist'}
          >
            <div className="navmenu-sublist-title">{t.notifications}</div>
            {notifications.length ? (
              <>
                {notifications.slice(0, 6).map((n, idx) => (
                  <button
                    key={n.id}
                    type="button"
                    className="subitem nav-item-notifications"
                    onClick={() => {
                      setNotifications(prev => prev.map(p => (p.id === n.id ? { ...p, read: true } : p)))
                      setOpenGroup(null)
                    }}
                    ref={el => {
                      if (idx === 0) groupFirstItemRefs.current.notifications = el
                    }}
                  >
                    <span className="icon">
                      <i className="fa-solid fa-circle-info"></i>
                    </span>
                    <span className="label">
                      <span className="navmenu-subitem-title">{n.title}</span>
                      <span className="navmenu-subitem-meta">{n.at}</span>
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  className="subitem nav-item-notifications"
                  onClick={() => setNotifications([])}
                >
                  <span className="icon">
                    <i className="fa-solid fa-trash"></i>
                  </span>
                  <span className="label">{t.clearAll}</span>
                </button>
              </>
            ) : (
              <div className="navmenu-sublist-empty">{t.noNotifications}</div>
            )}
          </div>
        </li>

        <li
          className={openGroup === 'language' ? 'group open navmenu-utility' : 'group navmenu-utility'}
          ref={el => {
            groupContainerRefs.current.language = el
          }}
        >
          <button
            className="group-header nav-header-language navmenu-icon-only"
            type="button"
            aria-haspopup="true"
            aria-label={t.language}
            aria-expanded={openGroup === 'language'}
            aria-controls="nav-group-language"
            title={t.language}
            onClick={() => toggleGroup('language')}
            onMouseEnter={() => {
              if (flyoutMode) positionFlyout('language')
            }}
            onFocus={() => {
              if (flyoutMode) positionFlyout('language')
            }}
            onKeyDown={onGroupKeyDown('language')}
            ref={el => {
              groupHeaderRefs.current.language = el
            }}
          >
            <span className="icon">
              <i className="fa-solid fa-globe"></i>
            </span>
          </button>
          <div
            id="nav-group-language"
            className={openGroup === 'language' ? 'sublist open' : 'sublist'}
          >
            <div className="navmenu-sublist-title">{t.language}</div>
            <button
              type="button"
              className={language === 'en' ? 'subitem active nav-item-language' : 'subitem nav-item-language'}
              onClick={() => {
                setLanguage('en')
                setOpenGroup(null)
              }}
              ref={el => {
                groupFirstItemRefs.current.language = el
              }}
            >
              <span className="icon">
                <i className="fa-solid fa-language"></i>
              </span>
              <span className="label">{t.english}</span>
            </button>
            <button
              type="button"
              className={language === 'ar' ? 'subitem active nav-item-language' : 'subitem nav-item-language'}
              onClick={() => {
                setLanguage('ar')
                setOpenGroup(null)
              }}
            >
              <span className="icon">
                <i className="fa-solid fa-language"></i>
              </span>
              <span className="label">{t.arabic}</span>
            </button>
          </div>
        </li>

        <li
          className={openGroup === 'account' ? 'group open navmenu-utility navmenu-utility-last' : 'group navmenu-utility navmenu-utility-last'}
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
              <i className="fa-solid fa-user-astronaut"></i>
            </span>
            <i className={`chev fa-solid ${openGroup === 'account' ? 'fa-chevron-down' : 'fa-chevron-right'}`}></i>
          </button>
          <div
            id="nav-group-account"
            className={openGroup === 'account' ? 'sublist open' : 'sublist'}
          >
            <NavLink
              to="/account/profile-user-management"
              onClick={handleNavigate}
              className={({ isActive }) => (isActive ? 'subitem active nav-item-account' : 'subitem nav-item-account')}
              ref={el => {
                groupFirstItemRefs.current.account = el
              }}
            >
              <span className="icon">
                <i className="fa-solid fa-user-gear"></i>
              </span>
              <span className="label">{t.profile}</span>
            </NavLink>
            <button
              className="subitem nav-item-account"
              type="button"
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
              <span className="label">{t.logout}</span>
            </button>
          </div>
        </li>

      </ul>
    </nav>
  )
}
