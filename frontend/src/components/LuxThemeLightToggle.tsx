import { useEffect, useState } from 'react'
import { cn } from '../lib/utils'
import { useSystemSettings } from '../store/SystemSettingsContext'
import './lux-theme-light-toggle.css'

export type LuxThemeLightToggleProps = {
  className?: string
  /** Slightly smaller for home nav chrome. */
  size?: 'md' | 'sm'
  /** `table` = table sheet only; `wizard` = registration overlay shell only (not app theme). */
  scope?: 'app' | 'table' | 'wizard'
  /** When `scope` is `table`: true = white table + black text. */
  sheetLight?: boolean
  onSheetLightChange?: (light: boolean) => void
  /** When `scope` is `wizard`: light/dark for `.home-wizard-shell` only. */
  wizardTheme?: 'light' | 'dark'
  onWizardThemeChange?: (theme: 'light' | 'dark') => void
}

/** One-press theme control — sun / night lamp icons without glass chrome. */
export function LuxThemeLightToggle({
  className,
  size = 'md',
  scope = 'app',
  sheetLight = true,
  onSheetLightChange,
  wizardTheme = 'dark',
  onWizardThemeChange,
}: LuxThemeLightToggleProps) {
  const { settings, setSettings } = useSystemSettings()
  const isTableScope = scope === 'table'
  const isWizardScope = scope === 'wizard'
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() => {
    if (typeof document === 'undefined') return 'dark'
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
  })

  useEffect(() => {
    if (isTableScope || isWizardScope || typeof document === 'undefined') return
    const root = document.documentElement
    const sync = () => {
      setResolvedTheme(root.getAttribute('data-theme') === 'light' ? 'light' : 'dark')
    }
    sync()
    const obs = new MutationObserver(sync)
    obs.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [isTableScope, isWizardScope])

  const isLight = isTableScope ? sheetLight : isWizardScope ? wizardTheme === 'light' : resolvedTheme === 'light'

  const handleToggle = () => {
    if (isTableScope) {
      onSheetLightChange?.(!sheetLight)
      return
    }
    if (isWizardScope) {
      onWizardThemeChange?.(isLight ? 'dark' : 'light')
      return
    }
    const next: 'light' | 'dark' = isLight ? 'dark' : 'light'
    setSettings({ ...settings, themeMode: next })
  }

  return (
    <button
      type="button"
      className={cn(
        'lux-theme-light',
        size === 'sm' && 'lux-theme-light--sm',
        className,
      )}
      data-state={isLight ? 'light' : 'dark'}
      onClick={handleToggle}
      aria-pressed={isLight}
      aria-label={
        isTableScope
          ? isLight
            ? 'Table: standard contrast (white sheet on)'
            : 'Table: switch to white sheet with black text'
          : isWizardScope
            ? isLight
              ? 'Registration window: switch to dark appearance'
              : 'Registration window: switch to light appearance'
            : isLight
              ? 'Switch to dark mode'
              : 'Switch to light mode'
      }
      title={
        isTableScope
          ? isLight
            ? 'Table readable mode (white background)'
            : 'Enable table white sheet'
          : isWizardScope
            ? isLight
              ? 'Registration window — dark'
              : 'Registration window — light'
            : isLight
              ? 'Dark mode'
              : 'Light mode'
      }
    >
      <span className="lux-theme-light__glyph-wrap">
        <LuxDaySunIcon className="lux-theme-light__pic lux-theme-light__pic--day" />
        <LuxNightLampIcon className="lux-theme-light__glyph lux-theme-light__glyph--night" />
      </span>
    </button>
  )
}

function LuxDaySunIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3.75" stroke="currentColor" strokeWidth="1.35" />
      <g stroke="currentColor" strokeWidth="1.35" strokeLinecap="round">
        <path d="M12 3.25v2.35" />
        <path d="M12 18.4v2.35" />
        <path d="M4.85 4.85l1.66 1.66" />
        <path d="M17.49 17.49l1.66 1.66" />
        <path d="M3.25 12h2.35" />
        <path d="M18.4 12h2.35" />
        <path d="M4.85 19.15l1.66-1.66" />
        <path d="M17.49 6.51l1.66-1.66" />
      </g>
    </svg>
  )
}

function LuxNightLampIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        className="lux-theme-light__moon"
        d="M16.2 14.8a6.6 6.6 0 0 1-9.4-9.4 7.2 7.2 0 1 0 9.4 9.4Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        className="lux-theme-light__arc"
        d="M7.5 18.2c2.4-3.8 6.6-3.8 9 0"
        stroke="currentColor"
        strokeWidth="0.9"
        strokeLinecap="round"
        opacity="0.55"
      />
      <circle className="lux-theme-light__star" cx="17.2" cy="7.4" r="0.55" fill="currentColor" />
      <circle className="lux-theme-light__star" cx="19.1" cy="10.8" r="0.4" fill="currentColor" opacity="0.75" />
      <circle className="lux-theme-light__star" cx="15.4" cy="5.6" r="0.35" fill="currentColor" opacity="0.6" />
    </svg>
  )
}

export default LuxThemeLightToggle
