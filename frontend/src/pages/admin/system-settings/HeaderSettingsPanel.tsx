import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AppLanguage } from '../../../lib/i18n'
import type { HeaderSettings, ThemeMode } from '../../../types/systemSettings'
import { GEOSYNTRA_BRAND_NAME, GEOSYNTRA_BRAND_NAME_AR } from '../../../lib/brand'
import { HeaderFontStackPicker } from './HeaderFontStackPicker'
import './header-settings-panel.css'

export type HeaderSmartSuggestions = {
  recommendedSize: number
  recommendedLightColor: string
  recommendedDarkColor: string
  warnings: string[]
}

export type HeaderSettingsPanelProps = {
  headerSettings: HeaderSettings
  onPatch: (patch: Partial<HeaderSettings>) => void
  smartSuggestions: HeaderSmartSuggestions
  onApplyPreset: (preset: 'default' | 'balanced' | 'branding' | 'minimal') => void
  language: AppLanguage
  themeMode: ThemeMode
  onResetHeaderToSystemDefaults: () => void
}

type SectionId = 'typography' | 'layout' | 'insights'

const SECTION_ORDER_LS = 'sys_header_settings_section_order_v1'
const DEFAULT_ORDER: SectionId[] = ['typography', 'layout', 'insights']

function normalizeSectionOrder(raw: unknown): SectionId[] {
  if (!Array.isArray(raw)) return [...DEFAULT_ORDER]
  const seen = new Set<SectionId>()
  const out: SectionId[] = []
  for (const id of raw) {
    if (DEFAULT_ORDER.includes(id as SectionId) && !seen.has(id as SectionId)) {
      seen.add(id as SectionId)
      out.push(id as SectionId)
    }
  }
  for (const id of DEFAULT_ORDER) {
    if (!seen.has(id)) out.push(id)
  }
  return out
}

function Tip({ text }: { text: string }) {
  return (
    <span className="hs-tip" title={text} aria-label={text}>
      <i className="fa-regular fa-circle-question" aria-hidden />
    </span>
  )
}

function HeaderLivePreview({
  hs,
  previewTheme,
  viewport,
  language,
}: {
  hs: HeaderSettings
  previewTheme: 'light' | 'dark'
  viewport: 'desktop' | 'tablet' | 'mobile'
  language: AppLanguage
}) {
  const displayText = language === 'ar' ? GEOSYNTRA_BRAND_NAME_AR : GEOSYNTRA_BRAND_NAME

  const color = previewTheme === 'dark' ? hs.textColorDark : hs.textColorLight

  const alignStyle = useMemo(() => {
    if (hs.logoAlign === 'center') return { justifyContent: 'center' as const }
    if (hs.logoAlign === 'space-between') return { justifyContent: 'space-between' as const }
    return { justifyContent: 'flex-start' as const }
  }, [hs.logoAlign])

  const barBg = useMemo(() => {
    if (hs.transparent) {
      return previewTheme === 'dark' ? 'rgba(15, 23, 42, 0.42)' : 'rgba(255, 255, 255, 0.38)'
    }
    return previewTheme === 'dark' ? '#1e293b' : '#ffffff'
  }, [hs.transparent, previewTheme])

  const frameClass =
    viewport === 'tablet' ? 'hs-preview-frame hs-preview-frame--tablet' : viewport === 'mobile' ? 'hs-preview-frame hs-preview-frame--mobile' : 'hs-preview-frame hs-preview-frame--desktop'

  const svgInner = (hs.logoSvg ?? '').trim()

  return (
    <div className={frameClass}>
      <div className="hs-preview-backdrop">
        <div
          className={`hs-live-bar${hs.enableAnimation ? ' hs-live-bar--motion' : ''}`}
          style={{
            ...alignStyle,
            paddingLeft: hs.paddingX,
            paddingRight: hs.paddingX,
            paddingTop: hs.paddingY,
            paddingBottom: hs.paddingY,
            color,
            background: barBg,
            backdropFilter: hs.transparent ? `saturate(140%) blur(${hs.blur}px)` : undefined,
            WebkitBackdropFilter: hs.transparent ? `saturate(140%) blur(${hs.blur}px)` : undefined,
            border: `1px solid ${previewTheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)'}`,
            boxShadow: hs.sticky ? '0 8px 28px rgba(0,0,0,0.12)' : undefined,
          }}
        >
          <div className="hs-live-bar__brand" dir={language === 'ar' ? 'rtl' : 'ltr'}>
            {hs.showLogoIcon ? (
              <i className={hs.iconClass || 'fa-solid fa-leaf'} aria-hidden style={{ fontSize: Math.min(hs.fontSize, 22), flexShrink: 0 }} />
            ) : null}
            {svgInner ? (
              <span className="hs-live-bar__svg" aria-hidden dangerouslySetInnerHTML={{ __html: svgInner }} />
            ) : null}
            {hs.showLogoText ? (
              <span
                className="hs-live-bar__text"
                style={{
                  fontFamily: hs.fontFamily || 'inherit',
                  fontSize: hs.fontSize,
                  fontWeight: hs.fontWeight,
                  letterSpacing: `${hs.letterSpacing}em`,
                }}
              >
                {displayText}
              </span>
            ) : null}
            {hs.showCenterLogo && hs.logoAlign === 'center' ? (
              <span
                aria-hidden
                style={{
                  marginInlineStart: 10,
                  opacity: 0.85,
                  fontSize: Math.max(11, hs.fontSize - 6),
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: 999,
                  border: `1px solid ${previewTheme === 'dark' ? 'rgba(255,255,255,0.16)' : 'rgba(15,23,42,0.12)'}`,
                }}
              >
                Center
              </span>
            ) : null}
          </div>
          {(hs.logoAlign === 'space-between' || hs.logoAlign === 'start') && (
            <div
              className="hs-live-bar__fake-nav"
              style={{
                color,
                marginInlineStart: hs.logoAlign === 'start' ? 'auto' : undefined,
              }}
              aria-hidden
            >
              <span />
              <span />
              <span />
            </div>
          )}
        </div>
      </div>
      <div className="hs-live-meta">
        {hs.sticky ? (
          <span>
            <i className="fa-solid fa-thumbtack" aria-hidden /> Sticky ·{' '}
          </span>
        ) : null}
        {hs.transparent ? (
          <span>
            Glass <code>{hs.blur}px</code> ·{' '}
          </span>
        ) : null}
        Align <code>{hs.logoAlign}</code> · Preset <code>{hs.layoutPreset}</code>
      </div>
    </div>
  )
}

export function HeaderSettingsPanel({
  headerSettings: hs,
  onPatch,
  smartSuggestions,
  onApplyPreset,
  language,
  themeMode,
  onResetHeaderToSystemDefaults,
}: HeaderSettingsPanelProps) {
  const [sectionOrder, setSectionOrder] = useState<SectionId[]>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(SECTION_ORDER_LS) ?? 'null')
      return normalizeSectionOrder(raw)
    } catch {
      return [...DEFAULT_ORDER]
    }
  })

  const [dragging, setDragging] = useState<SectionId | null>(null)
  const [dropTarget, setDropTarget] = useState<SectionId | null>(null)

  const [previewTheme, setPreviewTheme] = useState<'light' | 'dark'>('light')
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop')

  useEffect(() => {
    try {
      localStorage.setItem(SECTION_ORDER_LS, JSON.stringify(sectionOrder))
    } catch {
      /* ignore */
    }
  }, [sectionOrder])

  const moveSection = useCallback((id: SectionId, delta: number) => {
    setSectionOrder(prev => {
      const i = prev.indexOf(id)
      const j = i + delta
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev]
      const [removed] = next.splice(i, 1)
      next.splice(j, 0, removed)
      return next
    })
  }, [])

  const reorderDrag = useCallback((from: SectionId, to: SectionId) => {
    if (from === to) return
    setSectionOrder(prev => {
      const next = [...prev]
      const fi = next.indexOf(from)
      const ti = next.indexOf(to)
      if (fi < 0 || ti < 0) return prev
      next.splice(fi, 1)
      next.splice(ti, 0, from)
      return next
    })
  }, [])

  const handleDragStart = (e: React.DragEvent, id: SectionId) => {
    e.dataTransfer.setData('text/plain', id)
    e.dataTransfer.effectAllowed = 'move'
    setDragging(id)
  }

  const handleDragEnd = () => {
    setDragging(null)
    setDropTarget(null)
  }

  const handleDragOver = (e: React.DragEvent, id: SectionId) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTarget(id)
  }

  const handleDrop = (e: React.DragEvent, targetId: SectionId) => {
    e.preventDefault()
    const from = e.dataTransfer.getData('text/plain') as SectionId
    if (from && DEFAULT_ORDER.includes(from)) reorderDrag(from, targetId)
    setDragging(null)
    setDropTarget(null)
  }

  const presets = useMemo(
    () =>
      [
        { id: 'default' as const, icon: 'fa-solid fa-rotate-left', label: 'Default', tip: 'Restore baseline typography while keeping your text.' },
        { id: 'balanced' as const, icon: 'fa-solid fa-scale-balanced', label: 'Balanced', tip: 'Centered brand with calm spacing and soft glass.' },
        { id: 'branding' as const, icon: 'fa-solid fa-wand-magic-sparkles', label: 'Branding', tip: 'Bold wordmark, animated accents, premium feel.' },
        { id: 'minimal' as const, icon: 'fa-solid fa-minimize', label: 'Minimal', tip: 'Compact start-aligned header for dense tools.' },
      ] as const,
    [],
  )

  const iconToggles = useMemo(
    () =>
      [
        {
          key: 'showLogoText' as const,
          icon: 'fa-solid fa-font',
          label: 'Text',
          tip: 'Show the logo wordmark next to the icon.',
          checked: hs.showLogoText,
        },
        {
          key: 'showLogoIcon' as const,
          icon: 'fa-solid fa-icons',
          label: 'Icon',
          tip: 'Show the configured Font Awesome icon.',
          checked: hs.showLogoIcon,
        },
        {
          key: 'showCenterLogo' as const,
          icon: 'fa-solid fa-crosshairs',
          label: 'Center',
          tip: 'Highlight a centered brand treatment when alignment is center.',
          checked: hs.showCenterLogo,
        },
        {
          key: 'mobileShowLogoText' as const,
          icon: 'fa-solid fa-mobile-screen',
          label: 'Mob text',
          tip: 'Keep the wordmark visible on narrow phones.',
          checked: hs.mobileShowLogoText,
        },
        {
          key: 'tabletShowLogoText' as const,
          icon: 'fa-solid fa-tablet-screen-button',
          label: 'Tab text',
          tip: 'Keep the wordmark visible on tablets.',
          checked: hs.tabletShowLogoText,
        },
        {
          key: 'sticky' as const,
          icon: 'fa-solid fa-thumbtack',
          label: 'Sticky',
          tip: 'Pin the header while scrolling long pages.',
          checked: hs.sticky,
        },
        {
          key: 'transparent' as const,
          icon: 'fa-regular fa-window-restore',
          label: 'Glass',
          tip: 'Transparent bar with backdrop blur over the map.',
          checked: hs.transparent,
        },
        {
          key: 'enableAnimation' as const,
          icon: 'fa-solid fa-bolt',
          label: 'Motion',
          tip: 'Subtle motion polish on the header chrome.',
          checked: hs.enableAnimation,
        },
        {
          key: 'useProjectName' as const,
          icon: 'fa-solid fa-link',
          label: 'Project',
          tip: 'Unused: the header wordmark is always Geosyntra.',
          checked: hs.useProjectName,
        },
        {
          key: 'autoResize' as const,
          icon: 'fa-solid fa-arrows-left-right-to-line',
          label: 'Resize',
          tip: 'Automatically shrink logo text on tight widths.',
          checked: hs.autoResize,
        },
        {
          key: 'autoSave' as const,
          icon: 'fa-solid fa-floppy-disk',
          label: 'Autosave',
          tip: 'Persist header tweaks automatically after edits.',
          checked: hs.autoSave,
        },
      ] as const,
    [hs],
  )

  const renderTypography = () => (
    <div className="hs-card__body">
      <div className="hs-grid">
        <div className="hs-field hs-cell-span-6">
          <div className="hs-field__label-row">
            <label htmlFor="hs-logo-en">Logo EN</label>
            <Tip text="The live header always shows Geosyntra; this value is kept for records / export only." />
          </div>
          <input
            id="hs-logo-en"
            className="gis-input"
            value={hs.logoText}
            onChange={e => onPatch({ logoText: e.target.value })}
          />
        </div>
        <div className="hs-field hs-cell-span-6">
          <div className="hs-field__label-row">
            <label htmlFor="hs-logo-ar">Logo AR</label>
            <Tip text="The live header always shows جيوسينترا when Arabic is active; this field is kept for records / export only." />
          </div>
          <input
            id="hs-logo-ar"
            className="gis-input"
            dir="rtl"
            value={hs.logoTextAr}
            onChange={e => onPatch({ logoTextAr: e.target.value })}
          />
        </div>
        <div className="hs-field hs-cell-span-12">
          <div className="hs-field__label-row">
            <label htmlFor="hs-font-stack">Font stack</label>
            <Tip text="Preset stacks load web fonts once; custom CSS keeps full control (e.g. var(--ds-font-sans))." />
          </div>
          <HeaderFontStackPicker
            id="hs-font-stack"
            value={hs.fontFamily}
            onChange={next => onPatch({ fontFamily: next })}
            themeMode={themeMode}
            language={language}
            onResetHeaderToSystemDefaults={onResetHeaderToSystemDefaults}
          />
        </div>
        <div className="hs-field hs-cell-span-6">
          <div className="hs-field__label-row">
            <label htmlFor="hs-icon-class">Icon class</label>
            <Tip text="Font Awesome classes for the header glyph." />
          </div>
          <input
            id="hs-icon-class"
            className="gis-input"
            dir="ltr"
            value={hs.iconClass}
            onChange={e => onPatch({ iconClass: e.target.value })}
          />
        </div>

        <div className="hs-field hs-cell-span-12">
          <div className="hs-field__label-row">
            <label htmlFor="hs-fs">
              <i className="fa-solid fa-text-height" aria-hidden /> Size
            </label>
            <Tip text="Logo text size in pixels. Large values may crowd navigation on tablets." />
          </div>
          <div className="hs-range-row">
            <i className="fa-solid fa-text-height" aria-hidden />
            <input
              id="hs-fs"
              type="range"
              min={10}
              max={42}
              value={hs.fontSize}
              onChange={e => onPatch({ fontSize: Number(e.target.value) })}
            />
            <span className="hs-range-val">{hs.fontSize}px</span>
          </div>
        </div>

        <div className="hs-field hs-cell-span-12">
          <div className="hs-field__label-row">
            <label htmlFor="hs-fw">Weight</label>
            <Tip text="From light (300) to extra-bold (900)." />
          </div>
          <div className="hs-range-row">
            <i className="fa-solid fa-bold" aria-hidden />
            <input
              id="hs-fw"
              type="range"
              min={300}
              max={900}
              step={100}
              value={hs.fontWeight}
              onChange={e => onPatch({ fontWeight: Number(e.target.value) })}
            />
            <span className="hs-range-val">{hs.fontWeight}</span>
          </div>
        </div>

        <div className="hs-field hs-cell-span-12">
          <div className="hs-field__label-row">
            <label htmlFor="hs-track">Tracking</label>
            <Tip text="Letter spacing in em units — negative tightens the wordmark." />
          </div>
          <div className="hs-range-row">
            <i className="fa-solid fa-sliders" aria-hidden />
            <input
              id="hs-track"
              type="range"
              min={-0.08}
              max={0.2}
              step={0.01}
              value={hs.letterSpacing}
              onChange={e => onPatch({ letterSpacing: Number(e.target.value) })}
            />
            <span className="hs-range-val">{hs.letterSpacing.toFixed(2)}em</span>
          </div>
        </div>

        <div className="hs-colors hs-cell-span-12">
          <div className="hs-color-field">
            <input
              id="hs-clight"
              type="color"
              value={hs.textColorLight}
              onChange={e => onPatch({ textColorLight: e.target.value })}
              aria-label="Light theme text color"
              title="Light theme text color"
            />
            <div className="hs-field" style={{ flex: 1 }}>
              <div className="hs-field__label-row">
                <label htmlFor="hs-clight-hex">Light ink</label>
                <Tip text="Foreground color when the app runs in light mode." />
              </div>
              <input
                id="hs-clight-hex"
                className="gis-input"
                dir="ltr"
                value={hs.textColorLight}
                onChange={e => onPatch({ textColorLight: e.target.value })}
                spellCheck={false}
              />
            </div>
          </div>
          <div className="hs-color-field">
            <input
              id="hs-cdark"
              type="color"
              value={hs.textColorDark}
              onChange={e => onPatch({ textColorDark: e.target.value })}
              aria-label="Dark theme text color"
              title="Dark theme text color"
            />
            <div className="hs-field" style={{ flex: 1 }}>
              <div className="hs-field__label-row">
                <label htmlFor="hs-cdark-hex">Dark ink</label>
                <Tip text="Foreground color when the app runs in dark mode." />
              </div>
              <input
                id="hs-cdark-hex"
                className="gis-input"
                dir="ltr"
                value={hs.textColorDark}
                onChange={e => onPatch({ textColorDark: e.target.value })}
                spellCheck={false}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  const renderLayout = () => (
    <div className="hs-card__body">
      <div className="hs-grid">
        <div className="hs-field hs-cell-span-6">
          <div className="hs-field__label-row">
            <label htmlFor="hs-align">
              <i className="fa-solid fa-align-left" aria-hidden /> Alignment
            </label>
            <Tip text="Controls how the brand locks relative to navigation chrome." />
          </div>
          <select
            id="hs-align"
            className="gis-input"
            value={hs.logoAlign}
            onChange={e => onPatch({ logoAlign: e.target.value as HeaderSettings['logoAlign'] })}
          >
            <option value="start">Start</option>
            <option value="center">Center</option>
            <option value="space-between">Space between</option>
          </select>
        </div>

        <div className="hs-field hs-cell-span-12">
          <div className="hs-field__label-row">
            <label htmlFor="hs-px">Horizontal padding</label>
            <Tip text="Breathing room between the viewport edge and logo cluster." />
          </div>
          <div className="hs-range-row">
            <i className="fa-solid fa-arrows-left-right" aria-hidden />
            <input id="hs-px" type="range" min={0} max={60} value={hs.paddingX} onChange={e => onPatch({ paddingX: Number(e.target.value) })} />
            <span className="hs-range-val">{hs.paddingX}px</span>
          </div>
        </div>

        <div className="hs-field hs-cell-span-12">
          <div className="hs-field__label-row">
            <label htmlFor="hs-py">Vertical padding</label>
            <Tip text="Header height influence — pairs with font size." />
          </div>
          <div className="hs-range-row">
            <i className="fa-solid fa-arrows-up-down" aria-hidden />
            <input id="hs-py" type="range" min={0} max={24} value={hs.paddingY} onChange={e => onPatch({ paddingY: Number(e.target.value) })} />
            <span className="hs-range-val">{hs.paddingY}px</span>
          </div>
        </div>

        <div className="hs-field hs-cell-span-12">
          <div className="hs-field__label-row">
            <label htmlFor="hs-blur">Backdrop blur</label>
            <Tip text="Glass strength when transparency is enabled." />
          </div>
          <div className="hs-range-row">
            <i className="fa-solid fa-droplet" aria-hidden />
            <input id="hs-blur" type="range" min={0} max={30} value={hs.blur} onChange={e => onPatch({ blur: Number(e.target.value) })} />
            <span className="hs-range-val">{hs.blur}px</span>
          </div>
        </div>

        <div className="hs-field hs-cell-span-12">
          <div className="hs-field__label-row">
            <label htmlFor="hs-svg">
              <i className="fa-solid fa-file-code" aria-hidden /> Inline SVG
            </label>
            <Tip text="Optional vector mark injected beside the wordmark — paste full <svg> markup." />
          </div>
          <textarea
            id="hs-svg"
            className="gis-input"
            rows={4}
            placeholder="<svg ...>...</svg>"
            value={hs.logoSvg}
            onChange={e => onPatch({ logoSvg: e.target.value })}
            spellCheck={false}
          />
        </div>
      </div>

      <div className="hs-toggle-grid" role="group" aria-label="Header visibility">
        {iconToggles.map(t => (
          <button
            key={t.key}
            type="button"
            role="switch"
            aria-checked={t.checked}
            title={t.tip}
            className={`hs-icon-toggle${t.checked ? ' hs-icon-toggle--on' : ''}`}
            onClick={() => onPatch({ [t.key]: !t.checked } as Partial<HeaderSettings>)}
          >
            <i className={t.icon} aria-hidden />
            <span>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  )

  const renderInsights = () => (
    <div className="hs-card__body hs-insights">
      <div className="hs-insights__row">
        <i className="fa-solid fa-lightbulb" style={{ color: 'var(--ds-color-primary)' }} aria-hidden />
        <span>
          {language === 'ar' ? (
            <>
              حجم مقترح تقريباً <strong>{smartSuggestions.recommendedSize}px</strong> · ألوان الواجهة{' '}
              <code>{smartSuggestions.recommendedLightColor}</code> / <code>{smartSuggestions.recommendedDarkColor}</code>
            </>
          ) : (
            <>
              Suggested size ~ <strong>{smartSuggestions.recommendedSize}px</strong> · Theme inks{' '}
              <code>{smartSuggestions.recommendedLightColor}</code> / <code>{smartSuggestions.recommendedDarkColor}</code>
            </>
          )}
        </span>
      </div>
      {smartSuggestions.warnings.length ? (
        <div className="hs-insights__warn" role="status">
          <strong>
            <i className="fa-solid fa-triangle-exclamation" aria-hidden />{' '}
            {language === 'ar' ? 'انتبه' : 'Heads-up'}
          </strong>
          <ul>
            {smartSuggestions.warnings.map(w => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--hs-muted, var(--ds-color-text-muted))' }}>
          <i className="fa-solid fa-circle-check" aria-hidden />{' '}
          {language === 'ar'
            ? 'لا توجد تعارضات واضحة في إعدادات الشريط الحالية.'
            : 'No UI conflicts detected for this configuration.'}
        </p>
      )}
    </div>
  )

  const sectionMeta = {
    typography: {
      title: language === 'ar' ? 'الهوية والخط' : 'Typography & brand',
      subtitle: language === 'ar' ? 'النصوص، الألوان، وأوزان الخط' : 'Wordmark, palette, and optical sizing',
      icon: 'fa-solid fa-pen-nib',
      render: renderTypography,
    },
    layout: {
      title: language === 'ar' ? 'التخطيط والظهور' : 'Layout & visibility',
      subtitle: language === 'ar' ? 'محاذاة، حشو، زجاج، وأعلام العرض' : 'Alignment, padding, glass, and display flags',
      icon: 'fa-solid fa-table-columns',
      render: renderLayout,
    },
    insights: {
      title: language === 'ar' ? 'اقتراحات ذكية' : 'Smart insights',
      subtitle: language === 'ar' ? 'توصيات سياقية للقراءة والاستجابة' : 'Contextual guidance for readability',
      icon: 'fa-solid fa-chart-line',
      render: renderInsights,
    },
  } satisfies Record<SectionId, { title: string; subtitle: string; icon: string; render: () => JSX.Element }>

  return (
    <div className="hs-panel" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <header className="hs-panel__hero">
        <div className="hs-panel__hero-text">
          <h2 className="hs-panel__hero-title">
            <span className="hs-panel__hero-icon" aria-hidden>
              <i className="fa-solid fa-window-maximize" />
            </span>
            {language === 'ar' ? 'إعدادات الشريط العلوي' : 'Header Settings'}
          </h2>
          <p className="hs-panel__hero-desc">
            {language === 'ar'
              ? 'صفِّ هوية الشريط العلوي مع معاينة فورية، أقسام قابلة لإعادة الترتيب، واختصارات أيقونية واضحة.'
              : 'Tune the shell header with instant preview, draggable sections, and calm icon-first controls tuned for modern SaaS workspaces.'}
          </p>
        </div>
        <div className="hs-panel__presets" role="group" aria-label="Layout presets">
          {presets.map(p => (
            <button key={p.id} type="button" className="hs-preset" title={p.tip} onClick={() => onApplyPreset(p.id)}>
              <i className={p.icon} aria-hidden />
              <span>{p.label}</span>
            </button>
          ))}
        </div>
      </header>

      <div className="hs-layout">
        <div className="hs-editor">
          <div className="hs-editor__hint">
            <i className="fa-solid fa-grip-vertical" aria-hidden />
            <span>
              {language === 'ar'
                ? 'اسحب المقبض لإعادة ترتيب البطاقات ؛ أو استخدم الأسهم للوحة المفاتيح.'
                : 'Drag the handle to reorder cards — arrow buttons provide precise keyboard control.'}
            </span>
          </div>

          {sectionOrder.map(id => {
            const meta = sectionMeta[id]
            const cardClass =
              `hs-card${dragging === id ? ' hs-card--dragging' : ''}${dropTarget === id ? ' hs-card--drop-target' : ''}`
            return (
              <article
                key={id}
                className={cardClass}
                onDragOver={e => handleDragOver(e, id)}
                onDragLeave={() => setDropTarget(null)}
                onDrop={e => handleDrop(e, id)}
              >
                <div className="hs-card__head">
                  <button
                    type="button"
                    className="hs-card__handle"
                    draggable
                    onDragStart={e => handleDragStart(e, id)}
                    onDragEnd={handleDragEnd}
                    aria-grabbed={dragging === id}
                    aria-label={language === 'ar' ? 'سحب لإعادة الترتيب' : 'Drag to reorder section'}
                    title={language === 'ar' ? 'سحب لإعادة الترتيب' : 'Drag to reorder'}
                    onKeyDown={e => {
                      if (e.key === 'ArrowUp') {
                        e.preventDefault()
                        moveSection(id, -1)
                      }
                      if (e.key === 'ArrowDown') {
                        e.preventDefault()
                        moveSection(id, 1)
                      }
                    }}
                  >
                    <i className="fa-solid fa-grip-vertical" aria-hidden />
                  </button>
                  <div className="hs-card__title-wrap">
                    <div className="hs-card__glyph" aria-hidden>
                      <i className={meta.icon} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <h3 className="hs-card__title">{meta.title}</h3>
                      <p className="hs-card__subtitle">{meta.subtitle}</p>
                    </div>
                  </div>
                  <div className="hs-card__kb">
                    <button
                      type="button"
                      title={language === 'ar' ? 'تحريك لأعلى' : 'Move up'}
                      aria-label={language === 'ar' ? 'تحريك القسم لأعلى' : 'Move section up'}
                      onClick={() => moveSection(id, -1)}
                    >
                      <i className="fa-solid fa-chevron-up" aria-hidden />
                    </button>
                    <button
                      type="button"
                      title={language === 'ar' ? 'تحريك لأسفل' : 'Move down'}
                      aria-label={language === 'ar' ? 'تحريك القسم لأسفل' : 'Move section down'}
                      onClick={() => moveSection(id, 1)}
                    >
                      <i className="fa-solid fa-chevron-down" aria-hidden />
                    </button>
                  </div>
                </div>
                {meta.render()}
              </article>
            )
          })}
        </div>

        <aside className="hs-aside" aria-label={language === 'ar' ? 'معاينة مباشرة' : 'Live preview'}>
          <div className="hs-preview-card">
            <div className="hs-preview-toolbar">
              <p className="hs-preview-toolbar__title">
                <i className="fa-solid fa-eye" aria-hidden />
                {language === 'ar' ? 'معاينة مباشرة' : 'Live preview'}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <div className="hs-seg" role="group" aria-label="Preview theme">
                  {(['light', 'dark'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      data-active={previewTheme === t}
                      title={t === 'light' ? 'Preview light canvas ink' : 'Preview dark canvas ink'}
                      onClick={() => setPreviewTheme(t)}
                    >
                      {t === 'light' ? (
                        <i className="fa-solid fa-sun" aria-hidden />
                      ) : (
                        <i className="fa-solid fa-moon" aria-hidden />
                      )}
                    </button>
                  ))}
                </div>
                <div className="hs-seg" role="group" aria-label="Viewport width">
                  {(
                    [
                      ['desktop', 'fa-solid fa-desktop'],
                      ['tablet', 'fa-solid fa-tablet-screen-button'],
                      ['mobile', 'fa-solid fa-mobile-screen-button'],
                    ] as const
                  ).map(([vp, ic]) => (
                    <button
                      key={vp}
                      type="button"
                      data-active={viewport === vp}
                      title={`${vp} frame`}
                      onClick={() => setViewport(vp)}
                    >
                      <i className={ic} aria-hidden />
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="hs-preview-canvas">
              <HeaderLivePreview hs={hs} previewTheme={previewTheme} viewport={viewport} language={language} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
