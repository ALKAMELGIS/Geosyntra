import { useCallback, useEffect, useState } from 'react'
import {
  applyThemeToDocument,
  useSystemSettings,
  useSystemSettingsOptional,
} from '../../store/SystemSettingsContext'
import type { ThemeMode } from '../../types/systemSettings'

export type ResolvedAppTheme = 'light' | 'dark'

function readResolvedThemeFromDocument(): ResolvedAppTheme {
  if (typeof document === 'undefined') return 'dark'
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
}

/** Subscribe to the resolved visual theme on `<html data-theme>`. */
export function useResolvedDocumentTheme(): ResolvedAppTheme {
  const [resolved, setResolved] = useState<ResolvedAppTheme>(() => readResolvedThemeFromDocument())

  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    const sync = () => setResolved(readResolvedThemeFromDocument())
    sync()
    const obs = new MutationObserver(sync)
    obs.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])

  return resolved
}

/**
 * Single app-wide theme API — reads/writes `SystemSettingsProvider` only.
 * Never set `data-theme` locally in components; call `setThemeMode` instead.
 */
export function useAppTheme() {
  const ctx = useSystemSettingsOptional()
  const resolvedTheme = useResolvedDocumentTheme()

  const setThemeMode = useCallback(
    (mode: ThemeMode) => {
      if (!ctx) return
      const next = { ...ctx.settings, themeMode: mode }
      ctx.setSettings(next)
      applyThemeToDocument(next)
    },
    [ctx],
  )

  const toggleLightDark = useCallback(() => {
    setThemeMode(resolvedTheme === 'light' ? 'dark' : 'light')
  }, [resolvedTheme, setThemeMode])

  if (!ctx) {
    return {
      themeMode: 'dark' as ThemeMode,
      resolvedTheme,
      isLight: resolvedTheme === 'light',
      setThemeMode,
      toggleLightDark,
    }
  }

  return {
    themeMode: ctx.settings.themeMode,
    resolvedTheme,
    isLight: resolvedTheme === 'light',
    setThemeMode,
    toggleLightDark,
    settings: ctx.settings,
    setSettings: ctx.setSettings,
  }
}

/** Strict hook — requires `SystemSettingsProvider`. */
export function useAppThemeStrict() {
  useSystemSettings()
  return useAppTheme()
}
