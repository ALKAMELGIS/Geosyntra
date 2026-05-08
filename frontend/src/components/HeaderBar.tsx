import './header.css'
import { useEffect, useMemo, useRef } from 'react'
import { useSystemSettings } from '../store/SystemSettingsContext'

const DEFAULT_CENTER_LOGO = 'https://eliteprojects.ae/wp-content/uploads/2022/07/logo-retraced-white-03.png'

export default function HeaderBar() {
  const headerRef = useRef<HTMLElement | null>(null)
  const { settings } = useSystemSettings()
  const logoIconSrc = settings.logoIcon.trim()

  const centerLogoSrc = useMemo(() => {
    const isDark = settings.themeMode === 'dark'
    if (isDark && settings.logoDark.trim()) return settings.logoDark.trim()
    if (!isDark && settings.logoLight.trim()) return settings.logoLight.trim()
    return settings.logoLight.trim() || settings.logoDark.trim() || DEFAULT_CENTER_LOGO
  }, [settings.themeMode, settings.logoLight, settings.logoDark])

  useEffect(() => {
    const el = headerRef.current
    if (!el) return

    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    if (prefersReduced) return

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
  }, [])

  return (
    <header className="agri-header" ref={headerRef}>
      <div className="header-left">
        <span className="logo-icon">
          {logoIconSrc ? (
            <img className="logo-icon__img" src={logoIconSrc} alt="Brand icon" loading="lazy" decoding="async" />
          ) : (
            <i className="fa-solid fa-leaf" />
          )}
        </span>
        <span className="logo-text">Agro Cloud</span>
      </div>
      <div className="header-center">
        <img
          className="brand-logo"
          src={centerLogoSrc}
          alt="Elite Agro Projects"
          loading="lazy"
          decoding="async"
        />
      </div>
      <div className="header-right"></div>
    </header>
  )
}
