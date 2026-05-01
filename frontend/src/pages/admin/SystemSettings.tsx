import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import * as yup from 'yup'
import { useLanguage } from '../../lib/i18n'
import { hasPermission, normalizeRole, readCurrentUser } from '../../lib/auth'
import { NAV_DEFAULT_GROUPS, NAV_GROUP_IDS } from '../../nav/navManifest'
import { loadSystemSettings, normalizeAppPath } from '../../services/settingsStorage'
import { applyThemeToDocument, useSystemSettings } from '../../store/SystemSettingsContext'
import type { CustomPageRecord, SystemSettingsPersistedV1 } from '../../types/systemSettings'
import './system-settings.css'
import { NavGroupEditor } from './system-settings/NavGroupEditor'

const PAGE_ICON_PRESETS = [
  'fa-solid fa-file',
  'fa-solid fa-house',
  'fa-solid fa-map',
  'fa-solid fa-chart-line',
  'fa-solid fa-table',
  'fa-solid fa-leaf',
  'fa-solid fa-droplet',
  'fa-solid fa-tractor',
  'fa-solid fa-layer-group',
] as const

const SETTINGS_TABS = [
  { id: 'theme' as const, label: 'Theme', icon: 'fa-solid fa-palette' },
  { id: 'home' as const, label: 'Home Page', icon: 'fa-solid fa-house' },
  { id: 'logos' as const, label: 'Logos', icon: 'fa-solid fa-image' },
  { id: 'nav' as const, label: 'Navigation', icon: 'fa-solid fa-bars-staggered' },
  { id: 'pages' as const, label: 'Pages', icon: 'fa-solid fa-layer-group' },
]

const themeSchema = yup.object({
  themeMode: yup.string().oneOf(['light', 'dark', 'custom', 'system']).required(),
  customPrimaryHex: yup.string().matches(/^#[0-9A-Fa-f]{6}$/, 'Use #RRGGBB'),
})

export default function SystemSettings() {
  const { draft, setDraft, settings, saveDraft, cancelDraft, resetToDefaults, pushToast } = useSystemSettings()
  const { language } = useLanguage()
  const [tab, setTab] = useState<'theme' | 'home' | 'logos' | 'nav' | 'pages'>('theme')
  const [confirmReset, setConfirmReset] = useState(false)
  const [homeEditorSection, setHomeEditorSection] = useState<'page' | 'header' | 'blocks' | 'footer' | 'colors' | 'typography'>('page')
  const [pageQuery, setPageQuery] = useState('')
  const [pageGroupFilter, setPageGroupFilter] = useState<'all' | string>('all')
  const [navPickGroup, setNavPickGroup] = useState<string>(
    () => NAV_DEFAULT_GROUPS.find(g => g.id !== 'data')?.id ?? 'dashboard',
  )
  const location = useLocation()

  const role = normalizeRole(readCurrentUser()?.role)

  const allowed = hasPermission('admin.users.manage', role)

  useEffect(() => {
    setDraft(settings)
  }, [location.pathname, setDraft, settings])

  useEffect(() => {
    applyThemeToDocument(draft)
  }, [draft.themeMode, draft.customPrimaryHex])

  useEffect(() => {
    return () => {
      applyThemeToDocument(loadSystemSettings())
    }
  }, [])

  const pageSchema = useMemo(
    () =>
      yup.object({
        name: yup.string().min(1).max(120).required(),
        path: yup
          .string()
          .matches(/^\/?[A-Za-z0-9/_-]+$/)
          .required(),
        iconClass: yup.string().min(3).max(120).required(),
      }),
    [],
  )

  if (!allowed) {
    return (
      <div className="gis-page-padding" style={{ padding: 24 }}>
        <h1>Access denied</h1>
        <p>{language === 'ar' ? 'تحتاج صلاحيات المدير لعرض إعدادات النظام.' : 'You need administrator access to manage system settings.'}</p>
      </div>
    )
  }

  const validateTheme = async () => {
    try {
      await themeSchema.validate(
        { themeMode: draft.themeMode, customPrimaryHex: draft.customPrimaryHex },
        { abortEarly: false },
      )
      return true
    } catch (e) {
      if (e instanceof yup.ValidationError) pushToast('error', e.errors[0] ?? 'Validation failed')
      return false
    }
  }

  const handleSave = async () => {
    if (!(await validateTheme())) return
    for (const p of draft.customPages) {
      const gid = String(p.navGroupId ?? '').trim()
      if (!NAV_GROUP_IDS.includes(gid)) {
        pushToast('error', `Page "${p.name}": choose a valid sidebar group (dashboard, satellite, data, …).`)
        return
      }
      try {
        await pageSchema.validate(p)
      } catch (e) {
        if (e instanceof yup.ValidationError) {
          pushToast('error', `Page "${p.name}": ${e.errors[0]}`)
          return
        }
      }
    }
    saveDraft()
  }

  const handleCancel = () => {
    if (window.confirm(language === 'ar' ? 'تجاهل التغييرات غير المحفوظة؟' : 'Discard unsaved changes?')) {
      cancelDraft()
    }
  }

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result ?? ''))
      r.onerror = () => reject(new Error('read'))
      r.readAsDataURL(file)
    })

  const onLogoUpload = async (which: 'logoLight' | 'logoDark', file: File | undefined) => {
    if (!file) return
    try {
      const url = await readFileAsDataUrl(file)
      setDraft((d: SystemSettingsPersistedV1) => ({ ...d, [which]: url }))
    } catch {
      pushToast('error', 'Could not read file.')
    }
  }

  const updateHomePage = (patch: Partial<SystemSettingsPersistedV1['homePage']>) => {
    setDraft(d => ({
      ...d,
      homePage: { ...d.homePage, ...patch },
    }))
  }

  const onHomeBackgroundUpload = async (file: File | undefined) => {
    if (!file) return
    try {
      const url = await readFileAsDataUrl(file)
      updateHomePage({ backgroundImage: url, backgroundMode: 'image' })
    } catch {
      pushToast('error', 'Could not read image file.')
    }
  }

  const updateNavOverride = (id: string, patch: Partial<SystemSettingsPersistedV1['navOverrides'][string]>) => {
    setDraft(d => ({
      ...d,
      navOverrides: {
        ...d.navOverrides,
        [id]: { ...(d.navOverrides[id] ?? {}), ...patch },
      },
    }))
  }

  const reorderGroups = (from: number, to: number) => {
    const ids = NAV_DEFAULT_GROUPS.map(g => g.id)
    const cur = draft.navGroupOrder.length ? [...draft.navGroupOrder] : ids
    const [m] = cur.splice(from, 1)
    cur.splice(to, 0, m)
    setDraft(d => ({ ...d, navGroupOrder: cur }))
  }

  const reorderItem = (groupId: string, from: number, to: number) => {
    const g = NAV_DEFAULT_GROUPS.find(x => x.id === groupId)
    if (!g) return
    const base = g.children.map(c => c.id)
    const cur = draft.navItemOrders[groupId]?.length ? [...draft.navItemOrders[groupId]] : base
    const [m] = cur.splice(from, 1)
    cur.splice(to, 0, m)
    setDraft(d => ({
      ...d,
      navItemOrders: { ...d.navItemOrders, [groupId]: cur },
    }))
  }

  const addPage = () => {
    const id = `page-${Date.now()}`
    const rec: CustomPageRecord = {
      id,
      name: 'New page',
      path: `/pages/${id}`,
      iconClass: 'fa-solid fa-file',
      visible: true,
      bindTarget: 'placeholder',
      navGroupId: 'data',
      subitemClass: '',
    }
    setDraft(d => ({ ...d, customPages: [...d.customPages, rec] }))
  }

  const updatePage = (id: string, patch: Partial<CustomPageRecord>) => {
    setDraft(d => ({
      ...d,
      customPages: d.customPages.map(p => (p.id === id ? { ...p, ...patch, path: patch.path ? normalizeAppPath(patch.path) : p.path } : p)),
    }))
  }

  const removePage = (id: string) => {
    setDraft(d => ({ ...d, customPages: d.customPages.filter(p => p.id !== id) }))
  }

  const reorderPages = (from: number, to: number) => {
    setDraft(d => {
      const next = [...d.customPages]
      const [m] = next.splice(from, 1)
      next.splice(to, 0, m)
      return { ...d, customPages: next }
    })
  }

  const duplicatePage = (id: string) => {
    setDraft(d => {
      const idx = d.customPages.findIndex(p => p.id === id)
      if (idx < 0) return d
      const src = d.customPages[idx]
      const newId = `page-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const clone: CustomPageRecord = {
        ...src,
        id: newId,
        name: `${src.name} Copy`,
        path: normalizeAppPath(`${src.path}-copy`),
      }
      const next = [...d.customPages]
      next.splice(idx + 1, 0, clone)
      return { ...d, customPages: next }
    })
  }

  const movePageByDelta = (index: number, delta: -1 | 1) => {
    const target = index + delta
    if (target < 0 || target >= draft.customPages.length) return
    reorderPages(index, target)
  }

  const dataNavGroup = NAV_DEFAULT_GROUPS.find(g => g.id === 'data')
  const navGroupsExceptData = NAV_DEFAULT_GROUPS.filter(g => g.id !== 'data')
  const currentGroupDef = navGroupsExceptData.find(g => g.id === navPickGroup)
  const pageRows = draft.customPages
    .map((page, index) => ({ page, index }))
    .filter(({ page }) => {
      if (pageGroupFilter !== 'all' && (page.navGroupId || 'data') !== pageGroupFilter) return false
      const q = pageQuery.trim().toLowerCase()
      if (!q) return true
      return (
        page.name.toLowerCase().includes(q) ||
        (page.nameAr ?? '').toLowerCase().includes(q) ||
        page.path.toLowerCase().includes(q) ||
        (page.navGroupId || 'data').toLowerCase().includes(q)
      )
    })

  const homePreviewCanvasStyle = useMemo(() => {
    const bg = draft.homePage
    if (bg.backgroundMode === 'solid') {
      return { background: bg.backgroundColor }
    }
    if (bg.backgroundMode === 'gradient') {
      return { background: `linear-gradient(160deg, ${bg.backgroundGradientFrom}, ${bg.backgroundGradientTo})` }
    }
    if (bg.backgroundMode === 'image' && bg.backgroundImage) {
      return {
        backgroundImage: `linear-gradient(180deg, rgba(4, 10, 20, 0.36), rgba(4, 10, 20, 0.54)), url(${bg.backgroundImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    }
    return undefined
  }, [draft.homePage])

  return (
    <div className="gis-page-padding sys-settings">
      <div className="sys-settings-shell">
        <div className="sys-settings-tabs" role="tablist" aria-label="Settings sections">
          {SETTINGS_TABS.map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`sys-settings-tab ${tab === id ? 'sys-settings-tab--active' : ''}`}
              onClick={() => setTab(id)}
            >
              <span className="sys-settings-tab__icon" aria-hidden>
                <i className={icon} />
              </span>
              {label}
            </button>
          ))}
        </div>

      {tab === 'theme' ? (
        <section className="sys-settings-panel">
          <div className="sys-settings-panel__head">
            <h2 className="sys-settings-panel__title">
              <i className="fa-solid fa-brush" aria-hidden />
              Appearance
            </h2>
            <p className="sys-settings-panel__desc">
              Choose a base theme. Custom applies your brand color across buttons and accents while keeping a light shell.
            </p>
          </div>

          <span className="sys-field-label">Mode</span>
          <div className="sys-theme-picks" role="radiogroup" aria-label="Theme mode">
            <button
              type="button"
              role="radio"
              aria-checked={draft.themeMode === 'system'}
              className={`sys-theme-pick ${draft.themeMode === 'system' ? 'sys-theme-pick--active' : ''}`}
              onClick={() => setDraft(d => ({ ...d, themeMode: 'system' }))}
            >
              <span className="sys-theme-pick__icon">
                <i className="fa-solid fa-desktop" />
              </span>
              System
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={draft.themeMode === 'light'}
              className={`sys-theme-pick ${draft.themeMode === 'light' ? 'sys-theme-pick--active' : ''}`}
              onClick={() => setDraft(d => ({ ...d, themeMode: 'light' }))}
            >
              <span className="sys-theme-pick__icon">
                <i className="fa-solid fa-sun" />
              </span>
              Light
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={draft.themeMode === 'dark'}
              className={`sys-theme-pick ${draft.themeMode === 'dark' ? 'sys-theme-pick--active' : ''}`}
              onClick={() => setDraft(d => ({ ...d, themeMode: 'dark' }))}
            >
              <span className="sys-theme-pick__icon">
                <i className="fa-solid fa-moon" />
              </span>
              Dark
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={draft.themeMode === 'custom'}
              className={`sys-theme-pick ${draft.themeMode === 'custom' ? 'sys-theme-pick--active' : ''}`}
              onClick={() => setDraft(d => ({ ...d, themeMode: 'custom' }))}
            >
              <span className="sys-theme-pick__icon">
                <i className="fa-solid fa-droplet" />
              </span>
              Custom
            </button>
          </div>

          {draft.themeMode === 'custom' ? (
            <div className="sys-color-editor">
              <span className="sys-field-label">Primary brand color</span>
              <div className="sys-color-row">
                <div className="sys-color-swatch" title="Pick color">
                  <input
                    type="color"
                    value={draft.customPrimaryHex.match(/^#[0-9A-Fa-f]{6}$/) ? draft.customPrimaryHex : '#047857'}
                    onChange={e => setDraft(d => ({ ...d, customPrimaryHex: e.target.value }))}
                    aria-label="Pick primary color"
                  />
                </div>
                <div className="sys-color-hex">
                  <label htmlFor="sys-theme-hex" className="sys-field-label">
                    Hex value
                  </label>
                  <input
                    id="sys-theme-hex"
                    className="gis-input"
                    value={draft.customPrimaryHex}
                    onChange={e => setDraft(d => ({ ...d, customPrimaryHex: e.target.value }))}
                    placeholder="#047857"
                    spellCheck={false}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === 'home' ? (
        <section className="sys-settings-panel">
          <div className="sys-home-editor">
            <aside className="sys-home-sidebar" aria-label="Home page editor sections">
              <h3 className="sys-home-sidebar__title">Edit home page</h3>
              <p className="sys-home-sidebar__lead">
                Page settings, layout blocks, and visual style controls.
              </p>
              <div className="sys-home-section-list" role="tablist" aria-label="Home editor sections">
                {[
                  { id: 'page', label: 'Page settings', hint: 'Layout + visibility' },
                  { id: 'header', label: 'Header', hint: 'Logo, hero, actions' },
                  { id: 'blocks', label: 'Content blocks', hint: 'Cards and section order' },
                  { id: 'footer', label: 'Footer', hint: 'Links and footer text' },
                  { id: 'colors', label: 'Colors', hint: 'Brand and overlay colors' },
                  { id: 'typography', label: 'Typography', hint: 'Title and body styles' },
                ].map(section => (
                  <button
                    key={section.id}
                    type="button"
                    role="tab"
                    aria-selected={homeEditorSection === section.id}
                    className={`sys-home-section-btn ${homeEditorSection === section.id ? 'is-active' : ''}`}
                    onClick={() => setHomeEditorSection(section.id as typeof homeEditorSection)}
                  >
                    <strong>{section.label}</strong>
                    <small>{section.hint}</small>
                  </button>
                ))}
              </div>

              {homeEditorSection === 'page' ? (
                <div className="sys-home-controls">
                  <label className="sys-home-check">
                    <input
                      type="checkbox"
                      checked={draft.homePage.showItemCounts}
                      onChange={e => updateHomePage({ showItemCounts: e.target.checked })}
                    />
                    <span>Show item counts under each module</span>
                  </label>

                  <label className="sys-home-check">
                    <input
                      type="checkbox"
                      checked={draft.homePage.showCardChevron}
                      onChange={e => updateHomePage({ showCardChevron: e.target.checked })}
                    />
                    <span>Show arrow indicator on cards</span>
                  </label>

                  <label className="sys-home-field" htmlFor="sys-home-density">
                    <span className="sys-field-label">Card density</span>
                    <select
                      id="sys-home-density"
                      className="gis-input"
                      value={draft.homePage.cardDensity}
                      onChange={e =>
                        updateHomePage({
                          cardDensity: e.target.value === 'compact' ? 'compact' : 'comfortable',
                        })
                      }
                    >
                      <option value="comfortable">Comfortable</option>
                      <option value="compact">Compact</option>
                    </select>
                  </label>

                  <label className="sys-home-field" htmlFor="sys-home-bg-mode">
                    <span className="sys-field-label">Background mode</span>
                    <select
                      id="sys-home-bg-mode"
                      className="gis-input"
                      value={draft.homePage.backgroundMode}
                      onChange={e =>
                        updateHomePage({
                          backgroundMode:
                            e.target.value === 'solid' || e.target.value === 'gradient' || e.target.value === 'image'
                              ? e.target.value
                              : 'default',
                        })
                      }
                    >
                      <option value="default">Default</option>
                      <option value="solid">Solid color</option>
                      <option value="gradient">Gradient</option>
                      <option value="image">Background image</option>
                    </select>
                  </label>

                  {draft.homePage.backgroundMode === 'solid' ? (
                    <label className="sys-home-field">
                      <span className="sys-field-label">Background color</span>
                      <input
                        type="color"
                        className="sys-home-color"
                        value={draft.homePage.backgroundColor}
                        onChange={e => updateHomePage({ backgroundColor: e.target.value })}
                      />
                    </label>
                  ) : null}

                  {draft.homePage.backgroundMode === 'gradient' ? (
                    <div className="sys-home-grid-2">
                      <label className="sys-home-field">
                        <span className="sys-field-label">Gradient from</span>
                        <input
                          type="color"
                          className="sys-home-color"
                          value={draft.homePage.backgroundGradientFrom}
                          onChange={e => updateHomePage({ backgroundGradientFrom: e.target.value })}
                        />
                      </label>
                      <label className="sys-home-field">
                        <span className="sys-field-label">Gradient to</span>
                        <input
                          type="color"
                          className="sys-home-color"
                          value={draft.homePage.backgroundGradientTo}
                          onChange={e => updateHomePage({ backgroundGradientTo: e.target.value })}
                        />
                      </label>
                    </div>
                  ) : null}

                  {draft.homePage.backgroundMode === 'image' ? (
                    <div className="sys-home-field">
                      <span className="sys-field-label">Background image</span>
                      <label className="sys-home-upload">
                        <input type="file" accept="image/*" onChange={e => void onHomeBackgroundUpload(e.target.files?.[0])} />
                        <span>{draft.homePage.backgroundImage ? 'Replace image' : 'Upload image'}</span>
                      </label>
                      {draft.homePage.backgroundImage ? (
                        <button type="button" className="gis-btn gis-btn-outline" onClick={() => updateHomePage({ backgroundImage: '' })}>
                          Remove image
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="sys-home-placeholder">
                  <i className="fa-solid fa-screwdriver-wrench" aria-hidden />
                  <span>Section editor will be expanded here.</span>
                </div>
              )}
            </aside>

            <div className="sys-home-preview" role="region" aria-label="Home page preview">
              <div className="sys-home-preview__canvas" style={homePreviewCanvasStyle}>
                <div className="sys-home-preview__overlay" />
                <div className="sys-home-preview__brand">
                  <span className="sys-home-preview__logo">
                    <i className="fa-solid fa-seedling" aria-hidden />
                  </span>
                  <strong>Elite Agro Projects LLC</strong>
                </div>
                <div className="sys-home-preview__meta">52%</div>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {tab === 'logos' ? (
        <section className="sys-settings-panel">
          <div className="sys-settings-panel__head">
            <h2 className="sys-settings-panel__title">
              <i className="fa-solid fa-images" aria-hidden />
              Logo management
            </h2>
            <p className="sys-settings-panel__desc">
              PNG or SVG recommended. Files are stored locally in your browser as Data URLs — ideal for branded headers.
            </p>
          </div>

          <div className="sys-logo-grid">
            <div>
              <span className="sys-field-label">Light theme header</span>
              <label className="sys-logo-zone">
                <input
                  type="file"
                  accept="image/*"
                  className="sys-logo-zone__input"
                  onChange={e => void onLogoUpload('logoLight', e.target.files?.[0])}
                />
                <span className="sys-logo-zone__inner">
                  {draft.logoLight ? (
                    <>
                      <img src={draft.logoLight} alt="" className="sys-logo-zone__preview" />
                      <span className="sys-logo-zone__hint">Click to replace</span>
                    </>
                  ) : (
                    <>
                      <div className="sys-logo-zone__icon">
                        <i className="fa-solid fa-cloud-arrow-up" />
                      </div>
                      <div className="sys-logo-zone__title">Upload logo</div>
                      <div className="sys-logo-zone__hint">Click or tap to choose a file</div>
                    </>
                  )}
                </span>
              </label>
              <div className="sys-logo-zone__actions">
                <button type="button" className="gis-btn gis-btn-outline" onClick={() => setDraft(d => ({ ...d, logoLight: '' }))}>
                  Clear
                </button>
              </div>
            </div>
            <div>
              <span className="sys-field-label">Dark theme header</span>
              <label className="sys-logo-zone">
                <input
                  type="file"
                  accept="image/*"
                  className="sys-logo-zone__input"
                  onChange={e => void onLogoUpload('logoDark', e.target.files?.[0])}
                />
                <span className="sys-logo-zone__inner">
                  {draft.logoDark ? (
                    <>
                      <img src={draft.logoDark} alt="" className="sys-logo-zone__preview" />
                      <span className="sys-logo-zone__hint">Click to replace</span>
                    </>
                  ) : (
                    <>
                      <div className="sys-logo-zone__icon">
                        <i className="fa-solid fa-cloud-arrow-up" />
                      </div>
                      <div className="sys-logo-zone__title">Upload logo</div>
                      <div className="sys-logo-zone__hint">Often a lighter mark on dark chrome</div>
                    </>
                  )}
                </span>
              </label>
              <div className="sys-logo-zone__actions">
                <button type="button" className="gis-btn gis-btn-outline" onClick={() => setDraft(d => ({ ...d, logoDark: '' }))}>
                  Clear
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {tab === 'nav' ? (
        <section className="sys-settings-panel">
          <div className="sys-settings-panel__head">
            <h2 className="sys-settings-panel__title">
              <i className="fa-solid fa-route" aria-hidden />
              Navigation menu
            </h2>
            <p className="sys-settings-panel__desc">
              Override labels (EN/AR), Font Awesome icon classes, and visibility. Drag rows to reorder groups or items.
            </p>
          </div>

          {dataNavGroup ? (
            <section
              id="nav-group-data-settings"
              className="sys-nav-data"
              aria-labelledby="nav-group-data-heading"
            >
              <div className="sys-nav-data__top">
                <div>
                  <span className="sys-nav-data__badge">nav-group-data</span>
                  <h3 id="nav-group-data-heading" className="sys-nav-data__h">
                    Operations / Data
                  </h3>
                  <p className="sys-nav-data__p">
                    Sidebar flyout DOM id <code style={{ fontSize: '0.85em' }}>nav-group-data</code> — irrigation, EC/pH,
                    harvest, QHIS, production routes under{' '}
                    <code>/data/…</code>.
                  </p>
                </div>
              </div>
              <NavGroupEditor
                groupDef={dataNavGroup}
                draft={draft}
                updateNavOverride={updateNavOverride}
                reorderItem={reorderItem}
              />
            </section>
          ) : null}

          <div style={{ marginBottom: 22 }}>
            <p className="sys-section-label">Sidebar group order</p>
            <ul className="sys-drag-list">
              {(draft.navGroupOrder.length ? draft.navGroupOrder : NAV_DEFAULT_GROUPS.map(g => g.id)).map((gid, idx) => (
                <li
                  key={gid}
                  className="sys-drag-row"
                  draggable
                  onDragStart={e => {
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/group', String(idx))
                  }}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.preventDefault()
                    const from = Number(e.dataTransfer.getData('text/group'))
                    if (!Number.isFinite(from)) return
                    reorderGroups(from, idx)
                  }}
                >
                  <span className="sys-drag-row__handle" aria-hidden>
                    <i className="fa-solid fa-grip-vertical" />
                  </span>
                  {gid}
                  {gid === 'data' ? <span className="sys-drag-row__hint">Operations · see section above</span> : null}
                </li>
              ))}
            </ul>
          </div>

          <hr className="sys-divider" />

          <label className="sys-field-label" htmlFor="sys-nav-other-group" style={{ display: 'block', marginBottom: 8 }}>
            Edit another group
          </label>
          <select
            id="sys-nav-other-group"
            className="gis-input"
            style={{ display: 'block', width: '100%', maxWidth: 400, marginBottom: 16 }}
            value={navPickGroup}
            onChange={e => setNavPickGroup(e.target.value)}
          >
            {navGroupsExceptData.map(g => (
              <option key={g.id} value={g.id}>
                {g.id}
              </option>
            ))}
          </select>

          {currentGroupDef ? (
            <NavGroupEditor
              groupDef={currentGroupDef}
              draft={draft}
              updateNavOverride={updateNavOverride}
              reorderItem={reorderItem}
            />
          ) : null}
        </section>
      ) : null}

      {tab === 'pages' ? (
        <section className="sys-settings-panel">
          <div className="sys-pages-head">
            <div>
              <h2>Dynamic pages</h2>
              <p>
                Register routes and choose which sidebar group they appear under — same flyout ids as the manifest (
                <code dir="ltr">nav-group-data</code>, <code dir="ltr">nav-group-sensors</code>, …). Adjust names (EN/AR),
                path, icon, and optional <code dir="ltr">subitemClass</code> to match existing sublist rows.
              </p>
            </div>
            <button type="button" className="gis-btn gis-btn-primary sys-pages-add" onClick={addPage}>
              <i className="fa-solid fa-plus" aria-hidden />
              Add page
            </button>
          </div>

          <div className="sys-pages-toolbar">
            <label className="sys-pages-toolbar__search">
              <i className="fa-solid fa-magnifying-glass" aria-hidden />
              <input
                className="gis-input"
                value={pageQuery}
                onChange={e => setPageQuery(e.target.value)}
                placeholder="Search by name, path, or group…"
              />
            </label>
            <select
              className="gis-input"
              value={pageGroupFilter}
              onChange={e => setPageGroupFilter(e.target.value)}
              aria-label="Filter pages by sidebar group"
            >
              <option value="all">All groups</option>
              {NAV_GROUP_IDS.map(gid => (
                <option key={gid} value={gid}>{gid}</option>
              ))}
            </select>
            <span className="sys-pages-toolbar__count">
              {pageRows.length} / {draft.customPages.length} pages
            </span>
          </div>

          {draft.customPages.length === 0 ? (
            <div className="sys-empty-state">
              <i className="fa-solid fa-circle-plus" aria-hidden />
              No custom pages yet. Use <strong>Add page</strong> to register a path and bind it to a screen.
            </div>
          ) : pageRows.length === 0 ? (
            <div className="sys-empty-state">
              <i className="fa-solid fa-filter-circle-xmark" aria-hidden />
              No pages match your current search/filter.
            </div>
          ) : (
            <div className="sys-pages-list">
              {pageRows.map(({ page: p, index: rowIdx }) => (
                <article
                  key={p.id}
                  className="sys-page-card"
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.preventDefault()
                    const from = Number(e.dataTransfer.getData('text/page-row-abs'))
                    if (!Number.isFinite(from)) return
                    reorderPages(from, rowIdx)
                  }}
                >
                  <div
                    className="sys-page-card__drag"
                    draggable
                    onDragStart={e => {
                      e.dataTransfer.effectAllowed = 'move'
                      e.dataTransfer.setData('text/page-row-abs', String(rowIdx))
                    }}
                    title="Drag to reorder"
                    aria-hidden
                  >
                    <i className="fa-solid fa-grip-vertical" style={{ fontSize: 18 }} />
                  </div>
                  <div className="sys-page-card__main">
                    <div className="sys-page-card__topbar">
                      <span className="sys-page-card__index">#{rowIdx + 1}</span>
                      <div className="sys-page-card__quick-actions">
                        <button type="button" className="gis-btn gis-btn-outline" onClick={() => movePageByDelta(rowIdx, -1)} disabled={rowIdx === 0}>
                          <i className="fa-solid fa-arrow-up" aria-hidden /> Up
                        </button>
                        <button type="button" className="gis-btn gis-btn-outline" onClick={() => movePageByDelta(rowIdx, 1)} disabled={rowIdx === draft.customPages.length - 1}>
                          <i className="fa-solid fa-arrow-down" aria-hidden /> Down
                        </button>
                        <button type="button" className="gis-btn gis-btn-outline" onClick={() => duplicatePage(p.id)}>
                          <i className="fa-solid fa-copy" aria-hidden /> Duplicate
                        </button>
                      </div>
                    </div>
                    <div className="sys-page-card__grid">
                      <div className="sys-page-field">
                        <label htmlFor={`page-name-${p.id}`}>Display name (EN)</label>
                        <input
                          id={`page-name-${p.id}`}
                          className="gis-input"
                          value={p.name}
                          onChange={e => updatePage(p.id, { name: e.target.value })}
                        />
                      </div>
                      <div className="sys-page-field">
                        <label htmlFor={`page-name-ar-${p.id}`}>Display name (AR)</label>
                        <input
                          id={`page-name-ar-${p.id}`}
                          className="gis-input"
                          dir="rtl"
                          placeholder={p.name}
                          value={p.nameAr ?? ''}
                          onChange={e => updatePage(p.id, { nameAr: e.target.value })}
                        />
                      </div>
                      <div className="sys-page-field">
                        <label htmlFor={`page-path-${p.id}`}>Route path</label>
                        <input
                          id={`page-path-${p.id}`}
                          className="gis-input"
                          dir="ltr"
                          value={p.path}
                          onChange={e => updatePage(p.id, { path: e.target.value })}
                          spellCheck={false}
                        />
                      </div>
                      <div className="sys-page-field">
                        <label htmlFor={`page-bind-${p.id}`}>Bind target</label>
                        <select
                          id={`page-bind-${p.id}`}
                          className="gis-input"
                          value={p.bindTarget}
                          onChange={e =>
                            updatePage(p.id, { bindTarget: e.target.value as CustomPageRecord['bindTarget'] })
                          }
                        >
                          <option value="placeholder">Placeholder</option>
                          <option value="home">Home</option>
                          <option value="gis">GIS Map</option>
                          <option value="satellite-indices">Satellite Intelligence</option>
                          <option value="dashboards-overview">Dashboard overview</option>
                        </select>
                      </div>
                      <div className="sys-page-field">
                        <label htmlFor={`page-navgrp-${p.id}`}>Sidebar group</label>
                        <select
                          id={`page-navgrp-${p.id}`}
                          className="gis-input"
                          value={p.navGroupId || 'data'}
                          onChange={e => updatePage(p.id, { navGroupId: e.target.value })}
                        >
                          {NAV_GROUP_IDS.map(gid => (
                            <option key={gid} value={gid}>
                              {gid === 'data'
                                ? 'Operations / Data (nav-group-data)'
                                : gid.charAt(0).toUpperCase() + gid.slice(1)}
                            </option>
                          ))}
                        </select>
                        <small style={{ display: 'block', marginTop: 6, fontSize: 11, color: 'var(--ds-color-text-muted)' }}>
                          Flyout container id:{' '}
                          <code dir="ltr">{`nav-group-${p.navGroupId || 'data'}`}</code>
                        </small>
                      </div>
                      <div className="sys-page-field">
                        <label htmlFor={`page-subcls-${p.id}`}>Sublist row CSS (<code dir="ltr">subitemClass</code>)</label>
                        <input
                          id={`page-subcls-${p.id}`}
                          className="gis-input"
                          dir="ltr"
                          placeholder="Leave empty for auto (same style as group default)"
                          value={p.subitemClass ?? ''}
                          onChange={e => updatePage(p.id, { subitemClass: e.target.value })}
                          spellCheck={false}
                          list={`page-subcls-datalist-${p.id}`}
                        />
                        <datalist id={`page-subcls-datalist-${p.id}`}>
                          {(NAV_DEFAULT_GROUPS.find(g => g.id === (p.navGroupId || 'data'))?.children ?? []).map(leaf => (
                            <option key={leaf.id} value={leaf.subitemClass} />
                          ))}
                        </datalist>
                        <small style={{ display: 'block', marginTop: 6, fontSize: 11, color: 'var(--ds-color-text-muted)' }}>
                          Pick a built-in row class from suggestions or type your own — matches{' '}
                          <code dir="ltr">nav-item-*</code> entries under this group&apos;s sublist.
                        </small>
                      </div>
                    </div>

                    <div className="sys-page-field" style={{ marginTop: 14 }}>
                      <label htmlFor={`page-icon-${p.id}`}>Icon (Font Awesome class)</label>
                      <div className="sys-page-iconrow">
                        <span className="sys-page-icon-preview" aria-hidden>
                          <i className={p.iconClass || 'fa-solid fa-file'} />
                        </span>
                        <input
                          id={`page-icon-${p.id}`}
                          className="gis-input"
                          style={{ flex: 1, minWidth: 140 }}
                          value={p.iconClass}
                          onChange={e => updatePage(p.id, { iconClass: e.target.value })}
                          spellCheck={false}
                          placeholder="fa-solid fa-file"
                        />
                      </div>
                      <div className="sys-page-icon-chips" style={{ marginTop: 10 }}>
                        {PAGE_ICON_PRESETS.map(ic => (
                          <button
                            key={ic}
                            type="button"
                            className="sys-page-icon-chip"
                            title={ic}
                            aria-label={`Use icon ${ic}`}
                            onClick={() => updatePage(p.id, { iconClass: ic })}
                          >
                            <i className={ic} />
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="sys-page-actions">
                      <label className="sys-page-visible">
                        <input
                          type="checkbox"
                          checked={p.visible}
                          onChange={e => updatePage(p.id, { visible: e.target.checked })}
                        />
                        Visible in app routes
                      </label>
                      <button
                        type="button"
                        className="gis-btn gis-btn-outline sys-btn-icon-danger"
                        onClick={() => removePage(p.id)}
                      >
                        <i className="fa-solid fa-trash" aria-hidden style={{ marginInlineEnd: 6 }} />
                        Remove
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

        <footer className="sys-settings-footer">
          <button type="button" className="sys-footer-icon-btn is-save" onClick={() => void handleSave()} aria-label="Save settings" title="Save">
            <i className="fa-solid fa-floppy-disk" aria-hidden />
          </button>
          <button type="button" className="sys-footer-icon-btn" onClick={handleCancel} aria-label="Cancel changes" title="Cancel">
            <i className="fa-solid fa-ban" aria-hidden />
          </button>
          <button type="button" className="sys-footer-icon-btn is-danger" onClick={() => setConfirmReset(true)} aria-label="Reset defaults" title="Reset defaults">
            <i className="fa-solid fa-rotate-left" aria-hidden />
          </button>
        </footer>
      </div>

      {confirmReset ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100000,
          }}
        >
          <div style={{ background: 'var(--ds-color-surface)', padding: 24, borderRadius: 12, maxWidth: 400 }}>
            <p>Reset all system settings to factory defaults?</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="gis-btn" onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="gis-btn"
                style={{ background: 'var(--ds-color-danger)', color: '#fff' }}
                onClick={() => {
                  resetToDefaults()
                  setConfirmReset(false)
                }}
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
