import './header.css'
import { useEffect, useMemo, useRef, type CSSProperties } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import PrimaryNavIcons from './PrimaryNavIcons'
import { useSystemSettings } from '../store/SystemSettingsContext'
import { useLanguage } from '../lib/i18n'
import { hasPermission, normalizeRole, readCurrentUser } from '../lib/auth'
import {
  GEOSYNTRA_BRAND_ICON_FALLBACK,
  GEOSYNTRA_BRAND_LOGO_SVG,
  GEOSYNTRA_BRAND_NAME,
  GEOSYNTRA_BRAND_NAME_AR,
} from '../lib/brand'

/** No third-party default; use System Settings → logo URLs, or header shows text/icon only. */
const DEFAULT_CENTER_LOGO = ''

type HeaderBarProps = {
  onLogout?: () => void
}

export default function HeaderBar({ onLogout }: HeaderBarProps) {
  const headerRef = useRef<HTMLElement | null>(null)
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { settings } = useSystemSettings()
  const { language } = useLanguage()
  const role = normalizeRole(readCurrentUser()?.role)
  const canOpenApiVault = hasPermission('admin.users.manage', role)
  const vaultLinkActive =
    location.pathname === '/admin/system-settings' && searchParams.get('tab') === 'api-tokens'
  const logoIconSrc = settings.logoIcon.trim()
  const hs = settings.headerSettings

  const centerLogoSrc = useMemo(() => {
    const prefersDark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)')?.matches
    const isDark = settings.themeMode === 'dark' || (settings.themeMode === 'system' && prefersDark)
    if (isDark && settings.logoDark.trim()) return settings.logoDark.trim()
    if (!isDark && settings.logoLight.trim()) return settings.logoLight.trim()
    return settings.logoLight.trim() || settings.logoDark.trim() || DEFAULT_CENTER_LOGO.trim()
  }, [settings.themeMode, settings.logoLight, settings.logoDark])
  const logoText = useMemo(() => {
    if (hs.useProjectName) return String(import.meta.env.VITE_APP_NAME || GEOSYNTRA_BRAND_NAME)
    if (language === 'ar') return hs.logoTextAr.trim() || GEOSYNTRA_BRAND_NAME_AR
    return hs.logoText.trim() || GEOSYNTRA_BRAND_NAME
  }, [hs.logoText, hs.logoTextAr, hs.useProjectName, language])
  const headerStyle = useMemo(
    () =>
      ({
        '--header-pad-x': `${hs.paddingX}px`,
        '--header-pad-y': `${hs.paddingY}px`,
        '--header-blur': `${hs.blur}px`,
        '--header-logo-font-size': `${hs.fontSize}px`,
        '--header-logo-font-weight': String(hs.fontWeight),
        '--header-logo-font-family': hs.fontFamily,
        '--header-logo-letter-spacing': `${hs.letterSpacing}em`,
        '--header-logo-color-light': hs.textColorLight,
        '--header-logo-color-dark': hs.textColorDark,
      }) as CSSProperties,
    [hs],
  )

  useEffect(() => {
    const el = headerRef.current
    if (!el) return

    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    if (prefersReduced || !hs.enableAnimation) return

    let raf = 0
    let lastX = 0
    let lastY = 0

    const apply = () => {
      raf = 0
      el.style.setProperty('--hx', `${lastX}%`)
      el.style.setProperty('--hy', `${lastY}%`)
    }

    const onMove = (ev: PointerEvent) => {
      const rect = el.getBoundingClientRect()
      const x = rect.width ? (ev.clientX - rect.left) / rect.width : 0.5
      const y = rect.height ? (ev.clientY - rect.top) / rect.height : 0.5
      lastX = Math.max(0, Math.min(100, x * 100))
      lastY = Math.max(0, Math.min(100, y * 100))
      if (raf) return
      raf = window.requestAnimationFrame(apply)
    }

    const onLeave = () => {
      el.style.setProperty('--hx', '50%')
      el.style.setProperty('--hy', '35%')
    }

    el.addEventListener('pointermove', onMove, { passive: true })
    el.addEventListener('pointerleave', onLeave, { passive: true })
    onLeave()

    return () => {
      if (raf) window.cancelAnimationFrame(raf)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
    }
  }, [hs.enableAnimation])

  return (
    <header
      className={`geosyntra-header geosyntra-header--with-primary-nav geosyntra-header--align-${hs.logoAlign}${hs.sticky ? ' geosyntra-header--sticky' : ''}${hs.transparent ? ' geosyntra-header--transparent' : ''}${hs.autoResize ? ' geosyntra-header--auto-resize' : ''}${hs.mobileShowLogoText ? '' : ' geosyntra-header--hide-mobile-text'}${hs.tabletShowLogoText ? '' : ' geosyntra-header--hide-tablet-text'}`}
      ref={headerRef}
      style={headerStyle}
    >
      <div className={`header-left${hs.logoAlign === 'center' ? ' header-left--center' : ''}`}>
        {hs.showLogoIcon ? (
          <span className="logo-icon">
            {logoIconSrc ? (
              <img className="logo-icon__img" src={logoIconSrc} alt="Brand icon" loading="lazy" decoding="async" />
            ) : hs.logoSvg.trim().startsWith('<svg') ? (
              <span className="logo-icon__svg" aria-hidden dangerouslySetInnerHTML={{ __html: hs.logoSvg }} />
            ) : (
              <span
                className="logo-icon__svg"
                aria-hidden
                dangerouslySetInnerHTML={{ __html: GEOSYNTRA_BRAND_LOGO_SVG }}
              />
            )}
          </span>
        ) : null}
        {hs.showLogoText ? <span className="logo-text">{logoText}</span> : null}
      </div>
      <div className={`header-center${hs.showCenterLogo ? '' : ' header-center--hidden'}`}>
        {centerLogoSrc ? (
          <img
            className="brand-logo"
            src={centerLogoSrc}
            alt={logoText}
            loading="lazy"
            decoding="async"
          />
        ) : null}
      </div>
      <div className="header-right">
        <div className="header-right__cluster">
          {canOpenApiVault ? (
            <Link
              to="/admin/system-settings?tab=api-tokens"
              className={`header-api-vault-link${vaultLinkActive ? ' header-api-vault-link--active' : ''}`}
              title={language === 'ar' ? 'خزنة API — إدارة الأسرار والنسخ الاحتياطي' : 'API Vault — secrets & encrypted backup'}
              aria-label={language === 'ar' ? 'فتح خزنة API في إعدادات النظام' : 'Open API Vault in system settings'}
            >
              <span className="header-api-vault-link__glass" aria-hidden>
                <i className="fa-solid fa-shield-halved" />
              </span>
            </Link>
          ) : null}
          <PrimaryNavIcons onLogout={onLogout} />
        </div>
      </div>
    </header>
  )
}
