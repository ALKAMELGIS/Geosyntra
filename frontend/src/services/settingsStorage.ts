import type { Role } from '../lib/auth'
import { normalizeRole } from '../lib/auth'
import {
  GEOSYNTRA_BRAND_ICON_FALLBACK,
  GEOSYNTRA_BRAND_LOGO_SVG,
  GEOSYNTRA_BRAND_NAME,
  GEOSYNTRA_BRAND_NAME_AR,
  LEGACY_BRAND_ICON_CLASSES,
  LEGACY_BRAND_LOGO_SIGNATURES,
  LEGACY_BRAND_NAME_PATTERN,
  LEGACY_BRAND_NAME_PATTERN_AR,
} from '../lib/brand'
import type { CustomApiTokenSlot, CustomPageRecord, NavItemOverride, SystemSettingsPersistedV1 } from '../types/systemSettings'

export const SETTINGS_STORAGE_KEY = 'agri_system_settings_v1'

/** Fired on the window after `saveSystemSettings` (same tab). Cross-tab still receives `storage`. */
export const SYSTEM_SETTINGS_UPDATED_EVENT = 'geosyntra-system-settings-updated'

/** Global role order — sign-up and directory pickers use a subset in this order. */
export const DIRECTORY_ROLES_CANONICAL: readonly Role[] = ['Admin', 'Manager', 'Admin Manager', 'Analyst', 'Editor', 'Viewer', 'User']

export function sanitizeDirectoryRoleCatalog(raw: unknown): Role[] {
  if (!Array.isArray(raw) || raw.length === 0) return [...DIRECTORY_ROLES_CANONICAL]
  const want = new Set<Role>()
  for (const x of raw) {
    const n = normalizeRole(x)
    if ((DIRECTORY_ROLES_CANONICAL as readonly string[]).includes(n)) want.add(n)
  }
  const out = DIRECTORY_ROLES_CANONICAL.filter(r => want.has(r))
  return out.length ? out : [...DIRECTORY_ROLES_CANONICAL]
}

/**
 * Brand-name guard: any persisted English logo text that matches the legacy patterns
 * (Agro Cloud, Agri Cloud, Geosyntra Platform, …) or contains "AECOM" is overwritten with
 * `Geosyntra` so existing users instantly see the product identity. Other custom names are preserved.
 */
function sanitizeBrandName(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback
  const trimmed = raw.trim()
  if (!trimmed) return fallback
  if (/aecom/i.test(trimmed)) return fallback
  if (LEGACY_BRAND_NAME_PATTERN.test(trimmed)) return fallback
  return trimmed.slice(0, 120)
}

function sanitizeBrandNameAr(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback
  const trimmed = raw.trim()
  if (!trimmed) return fallback
  if (/aecom/i.test(trimmed)) return fallback
  if (LEGACY_BRAND_NAME_PATTERN_AR.test(trimmed)) return fallback
  return trimmed.slice(0, 120)
}

function sanitizeBrandIconClass(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback
  const trimmed = raw.trim()
  if (!trimmed) return fallback
  if (LEGACY_BRAND_ICON_CLASSES.has(trimmed)) return fallback
  return trimmed.slice(0, 120)
}

function sanitizeBrandLogoSvg(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback
  const trimmed = raw.trim()
  if (!trimmed) return fallback
  // Reject anything that does not look like a real `<svg>` payload (kills stray legacy strings).
  if (!trimmed.startsWith('<svg')) return fallback
  // Detect any earlier brand-mark SVG we shipped and migrate to the latest mark.
  for (const sig of LEGACY_BRAND_LOGO_SIGNATURES) {
    if (trimmed.includes(sig)) return fallback
  }
  return trimmed.slice(0, 6000)
}

export const DEFAULT_SYSTEM_SETTINGS: SystemSettingsPersistedV1 = {
  version: 1,
  themeMode: 'dark',
  customPrimaryHex: '#22d3ee',
  logoLight: '',
  logoDark: '',
  logoIcon: '',
  navGroupOrder: [],
  navItemOrders: {},
  navOverrides: {},
  customPages: [],
  homePage: {
    showItemCounts: true,
    showCardChevron: true,
    cardDensity: 'comfortable',
    backgroundMode: 'default',
    backgroundColor: '#0b1220',
    backgroundGradientFrom: '#0f172a',
    backgroundGradientTo: '#14532d',
    backgroundImage: '',
  },
  headerSettings: {
    logoText: GEOSYNTRA_BRAND_NAME,
    logoTextAr: GEOSYNTRA_BRAND_NAME_AR,
    useProjectName: false,
    fontFamily: 'var(--ds-font-sans)',
    fontSize: 19,
    fontWeight: 300,
    textColorLight: '#eef1ff',
    textColorDark: '#eef1ff',
    letterSpacing: 0.02,
    paddingX: 20,
    paddingY: 10,
    showLogoText: true,
    showLogoIcon: true,
    showCenterLogo: true,
    logoAlign: 'space-between',
    mobileShowLogoText: false,
    tabletShowLogoText: true,
    sticky: true,
    transparent: false,
    blur: 18,
    enableAnimation: true,
    autoResize: true,
    iconClass: GEOSYNTRA_BRAND_ICON_FALLBACK,
    logoSvg: GEOSYNTRA_BRAND_LOGO_SVG,
    layoutPreset: 'default',
    autoSave: false,
  },
  customApiTokenSlots: [],
  directoryRoleCatalog: [...DIRECTORY_ROLES_CANONICAL],
}

export function loadSystemSettings(): SystemSettingsPersistedV1 {
  if (typeof window === 'undefined') return { ...DEFAULT_SYSTEM_SETTINGS }
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SYSTEM_SETTINGS }
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_SYSTEM_SETTINGS }
    const o = parsed as Record<string, unknown>
    if (o.version !== 1) return { ...DEFAULT_SYSTEM_SETTINGS }
    return mergeWithDefaults(o as Partial<SystemSettingsPersistedV1>)
  } catch {
    return { ...DEFAULT_SYSTEM_SETTINGS }
  }
}

export function mergeWithDefaults(partial: Partial<SystemSettingsPersistedV1>): SystemSettingsPersistedV1 {
  const homeRaw = partial.homePage as Partial<SystemSettingsPersistedV1['homePage']> | undefined
  const cardDensity = homeRaw?.cardDensity === 'compact' ? 'compact' : 'comfortable'
  const backgroundMode =
    homeRaw?.backgroundMode === 'solid' ||
    homeRaw?.backgroundMode === 'gradient' ||
    homeRaw?.backgroundMode === 'image'
      ? homeRaw.backgroundMode
      : 'default'
  const isHex = (value: unknown, fallback: string) =>
    typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value) ? value : fallback
  const hdrRaw = partial.headerSettings as Partial<SystemSettingsPersistedV1['headerSettings']> | undefined
  return {
    ...DEFAULT_SYSTEM_SETTINGS,
    ...partial,
    navGroupOrder: Array.isArray(partial.navGroupOrder)
      ? migrateNavGroupOrderIds(partial.navGroupOrder as string[])
      : DEFAULT_SYSTEM_SETTINGS.navGroupOrder,
    navItemOrders:
      partial.navItemOrders && typeof partial.navItemOrders === 'object'
        ? migrateNavItemOrders(partial.navItemOrders as Record<string, string[]>)
        : {},
    navOverrides:
      partial.navOverrides && typeof partial.navOverrides === 'object'
        ? migrateNavOverrides(partial.navOverrides as SystemSettingsPersistedV1['navOverrides'])
        : {},
    customPages: Array.isArray(partial.customPages)
      ? partial.customPages.map(sanitizeCustomPage).filter(Boolean) as CustomPageRecord[]
      : [],
    customApiTokenSlots: Array.isArray(partial.customApiTokenSlots)
      ? (partial.customApiTokenSlots as unknown[])
          .map(sanitizeCustomApiTokenSlot)
          .filter((s): s is CustomApiTokenSlot => s != null)
      : [],
    directoryRoleCatalog: sanitizeDirectoryRoleCatalog(partial.directoryRoleCatalog),
    themeMode:
      partial.themeMode === 'dark' ||
      partial.themeMode === 'custom' ||
      partial.themeMode === 'system'
        ? partial.themeMode
        : 'light',
    homePage: {
      showItemCounts: homeRaw?.showItemCounts !== false,
      showCardChevron: homeRaw?.showCardChevron !== false,
      cardDensity,
      backgroundMode,
      backgroundColor: isHex(homeRaw?.backgroundColor, DEFAULT_SYSTEM_SETTINGS.homePage.backgroundColor),
      backgroundGradientFrom: isHex(homeRaw?.backgroundGradientFrom, DEFAULT_SYSTEM_SETTINGS.homePage.backgroundGradientFrom),
      backgroundGradientTo: isHex(homeRaw?.backgroundGradientTo, DEFAULT_SYSTEM_SETTINGS.homePage.backgroundGradientTo),
      backgroundImage: typeof homeRaw?.backgroundImage === 'string' ? homeRaw.backgroundImage : '',
    },
    headerSettings: {
      logoText: sanitizeBrandName(hdrRaw?.logoText, DEFAULT_SYSTEM_SETTINGS.headerSettings.logoText),
      logoTextAr: sanitizeBrandNameAr(hdrRaw?.logoTextAr, DEFAULT_SYSTEM_SETTINGS.headerSettings.logoTextAr),
      useProjectName: hdrRaw?.useProjectName === true,
      fontFamily: typeof hdrRaw?.fontFamily === 'string' && hdrRaw.fontFamily.trim() ? hdrRaw.fontFamily.trim().slice(0, 120) : DEFAULT_SYSTEM_SETTINGS.headerSettings.fontFamily,
      fontSize: Math.max(10, Math.min(42, Number(hdrRaw?.fontSize ?? DEFAULT_SYSTEM_SETTINGS.headerSettings.fontSize) || DEFAULT_SYSTEM_SETTINGS.headerSettings.fontSize)),
      // Migrate the legacy bold default (700) to the new ultra-light default (300) so existing
      // users instantly see the refined identity. Custom weights chosen by the user are preserved.
      fontWeight: (() => {
        const raw = Number(hdrRaw?.fontWeight ?? DEFAULT_SYSTEM_SETTINGS.headerSettings.fontWeight)
          || DEFAULT_SYSTEM_SETTINGS.headerSettings.fontWeight
        if (raw === 700) return DEFAULT_SYSTEM_SETTINGS.headerSettings.fontWeight
        return Math.max(200, Math.min(900, raw))
      })(),
      textColorLight: isHex(hdrRaw?.textColorLight, DEFAULT_SYSTEM_SETTINGS.headerSettings.textColorLight),
      textColorDark: isHex(hdrRaw?.textColorDark, DEFAULT_SYSTEM_SETTINGS.headerSettings.textColorDark),
      // Migrate the legacy negative tracking default (-0.02) to the new airier 0.02.
      letterSpacing: (() => {
        const raw = Number(hdrRaw?.letterSpacing ?? DEFAULT_SYSTEM_SETTINGS.headerSettings.letterSpacing) || 0
        if (raw === -0.02) return DEFAULT_SYSTEM_SETTINGS.headerSettings.letterSpacing
        return Math.max(-0.08, Math.min(0.2, raw))
      })(),
      paddingX: Math.max(0, Math.min(60, Number(hdrRaw?.paddingX ?? DEFAULT_SYSTEM_SETTINGS.headerSettings.paddingX) || DEFAULT_SYSTEM_SETTINGS.headerSettings.paddingX)),
      paddingY: Math.max(0, Math.min(24, Number(hdrRaw?.paddingY ?? DEFAULT_SYSTEM_SETTINGS.headerSettings.paddingY) || DEFAULT_SYSTEM_SETTINGS.headerSettings.paddingY)),
      showLogoText: hdrRaw?.showLogoText !== false,
      showLogoIcon: hdrRaw?.showLogoIcon !== false,
      showCenterLogo: hdrRaw?.showCenterLogo !== false,
      logoAlign:
        hdrRaw?.logoAlign === 'start' || hdrRaw?.logoAlign === 'center' || hdrRaw?.logoAlign === 'space-between'
          ? hdrRaw.logoAlign
          : DEFAULT_SYSTEM_SETTINGS.headerSettings.logoAlign,
      mobileShowLogoText: hdrRaw?.mobileShowLogoText === true,
      tabletShowLogoText: hdrRaw?.tabletShowLogoText !== false,
      sticky: hdrRaw?.sticky !== false,
      transparent: hdrRaw?.transparent === true,
      blur: Math.max(0, Math.min(30, Number(hdrRaw?.blur ?? DEFAULT_SYSTEM_SETTINGS.headerSettings.blur) || DEFAULT_SYSTEM_SETTINGS.headerSettings.blur)),
      enableAnimation: hdrRaw?.enableAnimation !== false,
      autoResize: hdrRaw?.autoResize !== false,
      iconClass: sanitizeBrandIconClass(hdrRaw?.iconClass, DEFAULT_SYSTEM_SETTINGS.headerSettings.iconClass),
      logoSvg: sanitizeBrandLogoSvg(hdrRaw?.logoSvg, DEFAULT_SYSTEM_SETTINGS.headerSettings.logoSvg),
      layoutPreset:
        hdrRaw?.layoutPreset === 'balanced' ||
        hdrRaw?.layoutPreset === 'branding' ||
        hdrRaw?.layoutPreset === 'minimal' ||
        hdrRaw?.layoutPreset === 'default'
          ? hdrRaw.layoutPreset
          : DEFAULT_SYSTEM_SETTINGS.headerSettings.layoutPreset,
      autoSave: hdrRaw?.autoSave === true,
    },
  }
}

const KNOWN_NAV_GROUP_IDS = ['dashboard', 'geosyntraAi', 'satellite', 'data', 'sensors', 'master', 'admin'] as const

function migrateNavGroupIdString(id: string): string {
  return id === 'aiAgroCloud' ? 'geosyntraAi' : id
}

function sanitizeNavGroupId(raw: unknown): string {
  const id = migrateNavGroupIdString(String(raw ?? 'data').trim())
  return (KNOWN_NAV_GROUP_IDS as readonly string[]).includes(id) ? id : 'data'
}

function migrateNavGroupOrderIds(ids: string[]): string[] {
  return ids.map(migrateNavGroupIdString)
}

function migrateNavItemOrders(raw: Record<string, string[]>): Record<string, string[]> {
  const next: Record<string, string[]> = { ...raw }
  if (next.aiAgroCloud && !next.geosyntraAi) {
    next.geosyntraAi = next.aiAgroCloud.map(id => (id === 'ai-agro-chat' ? 'geosyntra-chat' : id))
    delete next.aiAgroCloud
  }
  return next
}

function migrateNavOverrides(raw: SystemSettingsPersistedV1['navOverrides']): SystemSettingsPersistedV1['navOverrides'] {
  const o: Record<string, NavItemOverride> = { ...raw }
  const pairs: [string, string][] = [
    ['ai-agro-chat', 'geosyntra-chat'],
    ['dashboard-agro-cloud', 'dashboard-geosyntra'],
    ['aiAgroCloud', 'geosyntraAi'],
  ]
  for (const [from, to] of pairs) {
    if (o[from] && !o[to]) o[to] = o[from]
  }
  return o
}

function sanitizeCustomApiTokenSlot(raw: unknown): CustomApiTokenSlot | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = String(r.id ?? '').trim().slice(0, 80)
  if (!id) return null
  const title = String(r.title ?? 'API').trim().slice(0, 120) || 'API'
  const titleArRaw = r.titleAr != null ? String(r.titleAr).trim().slice(0, 120) : ''
  const description = String(r.description ?? '').trim().slice(0, 800)
  const descriptionArRaw = r.descriptionAr != null ? String(r.descriptionAr).trim().slice(0, 800) : ''
  const fieldLabel = String(r.fieldLabel ?? 'API secret').trim().slice(0, 120) || 'API secret'
  const fieldLabelArRaw = r.fieldLabelAr != null ? String(r.fieldLabelAr).trim().slice(0, 120) : ''
  const placeholderRaw = r.placeholder != null ? String(r.placeholder).trim().slice(0, 160) : ''
  const placeholderArRaw = r.placeholderAr != null ? String(r.placeholderAr).trim().slice(0, 160) : ''
  let iconClass = String(r.iconClass ?? 'fa-solid fa-key').trim().slice(0, 120) || 'fa-solid fa-key'
  if (!iconClass.includes('fa-')) iconClass = 'fa-solid fa-key'
  return {
    id,
    title,
    ...(titleArRaw ? { titleAr: titleArRaw } : {}),
    description,
    ...(descriptionArRaw ? { descriptionAr: descriptionArRaw } : {}),
    fieldLabel,
    ...(fieldLabelArRaw ? { fieldLabelAr: fieldLabelArRaw } : {}),
    ...(placeholderRaw ? { placeholder: placeholderRaw } : {}),
    ...(placeholderArRaw ? { placeholderAr: placeholderArRaw } : {}),
    iconClass,
  }
}

function sanitizeCustomPage(raw: unknown): CustomPageRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = String(r.id ?? '').trim() || `page-${Date.now()}`
  const name = String(r.name ?? 'Page').trim() || 'Page'
  const nameArRaw = r.nameAr != null ? String(r.nameAr).trim().slice(0, 160) : ''
  let path = String(r.path ?? '/pages/new').trim()
  if (!path.startsWith('/')) path = `/${path}`
  const iconClass = String(r.iconClass ?? 'fa-solid fa-file').trim() || 'fa-solid fa-file'
  const visible = r.visible !== false
  const bindTarget = (
    ['placeholder', 'home', 'gis', 'satellite-indices', 'dashboards-overview'].includes(String(r.bindTarget))
      ? r.bindTarget
      : 'placeholder'
  ) as CustomPageRecord['bindTarget']
  const navGroupId = sanitizeNavGroupId(r.navGroupId)
  const subRaw = r.subitemClass != null ? String(r.subitemClass).trim().slice(0, 160) : ''
  return {
    id,
    name,
    ...(nameArRaw ? { nameAr: nameArRaw } : {}),
    path,
    iconClass,
    visible,
    bindTarget,
    navGroupId,
    ...(subRaw ? { subitemClass: subRaw } : {}),
  }
}

export function saveSystemSettings(next: SystemSettingsPersistedV1): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next))
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(SYSTEM_SETTINGS_UPDATED_EVENT))
    }
  } catch {
    console.warn('[settings] Failed to persist')
  }
}

/** Normalize path segments — single leading slash */
export function normalizeAppPath(path: string): string {
  let p = path.trim().replace(/\\/g, '/')
  if (!p.startsWith('/')) p = `/${p}`
  const parts = p.split('/').filter(Boolean)
  return `/${parts.join('/')}`
}
