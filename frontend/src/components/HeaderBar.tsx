import './header.css'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { LuxThemeLightToggle } from './LuxThemeLightToggle'
import PrimaryNavIcons from './PrimaryNavIcons'
import { SaasEntryBrandMark } from './saas/SaasEntryBrandMark'
import { useSystemSettings } from '../store/SystemSettingsContext'
import { useLanguage } from '../lib/i18n'
import { GEOSYNTRA_BRAND_NAME, GEOSYNTRA_BRAND_NAME_AR } from '../lib/brand'
import './saas/saas-entry-shell.css'

/** No third-party default; use System Settings → logo URLs, or header shows text/icon only. */
const DEFAULT_CENTER_LOGO = ''

type HeaderBarProps = {
  onLogout?: () => void
}

export default function HeaderBar({ onLogout }: HeaderBarProps) {
  const headerRef = useRef<HTMLElement | null>(null)
  const { settings } = useSystemSettings()
  const { language } = useLanguage()
  const logoIconSrc = settings.logoIcon.trim()
  const [logoIconBroken, setLogoIconBroken] = useState(false)
  const [centerLogoBroken, setCenterLogoBroken] = useState(false)
  const hs = settings.headerSettings

  const centerLogoSrc = useMemo(() => {
    const prefersDark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)')?.matches
    const isDark = settings.themeMode === 'dark' || (settings.themeMode === 'system' && prefersDark)
    if (isDark && settings.logoDark.trim()) return settings.logoDark.trim()
    if (!isDark && settings.logoLight.trim()) return settings.logoLight.trim()
    return settings.logoLight.trim() || settings.logoDark.trim() || DEFAULT_CENTER_LOGO.trim()
  }, [settings.themeMode, settings.logoLight, settings.logoDark])

  useEffect(() => {
    setLogoIconBroken(false)
  }, [logoIconSrc])

  useEffect(() => {
    setCenterLogoBroken(false)
  }, [centerLogoSrc])

  const logoText = useMemo(
    () => (language === 'ar' ? GEOSYNTRA_BRAND_NAME_AR : GEOSYNTRA_BRAND_NAME),
    [language],
  )
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
          logoIconSrc && !logoIconBroken ? (
            <span className="logo-icon">
              <img
                className="logo-icon__img"
                src={logoIconSrc}
                alt="Brand icon"
                loading="lazy"
                decoding="async"
                onError={() => setLogoIconBroken(true)}
              />
            </span>
          ) : (
            <SaasEntryBrandMark />
          )
        ) : null}
        {hs.showLogoText ? <span className="logo-text">{logoText}</span> : null}
      </div>
      <div className={`header-center${hs.showCenterLogo ? '' : ' header-center--hidden'}`}>
        {centerLogoSrc && !centerLogoBroken ? (
          <img
            className="brand-logo"
            src={centerLogoSrc}
            alt={logoText}
            loading="lazy"
            decoding="async"
            onError={() => setCenterLogoBroken(true)}
          />
        ) : null}
      </div>
      <div className="header-right">
        <PrimaryNavIcons onLogout={onLogout} />
        <LuxThemeLightToggle className="lux-theme-light--header" />
      </div>
    </header>
  )
}
