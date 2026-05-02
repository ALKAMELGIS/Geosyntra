import type { CustomPageRecord, SystemSettingsPersistedV1 } from '../types/systemSettings'

export const SETTINGS_STORAGE_KEY = 'agri_system_settings_v1'

export const DEFAULT_SYSTEM_SETTINGS: SystemSettingsPersistedV1 = {
  version: 1,
  themeMode: 'system',
  customPrimaryHex: '#047857',
  logoLight: '',
  logoDark: '',
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
  return {
    ...DEFAULT_SYSTEM_SETTINGS,
    ...partial,
    navGroupOrder: Array.isArray(partial.navGroupOrder) ? partial.navGroupOrder : DEFAULT_SYSTEM_SETTINGS.navGroupOrder,
    navItemOrders:
      partial.navItemOrders && typeof partial.navItemOrders === 'object' ? { ...partial.navItemOrders } : {},
    navOverrides:
      partial.navOverrides && typeof partial.navOverrides === 'object' ? { ...partial.navOverrides } : {},
    customPages: Array.isArray(partial.customPages)
      ? partial.customPages.map(sanitizeCustomPage).filter(Boolean) as CustomPageRecord[]
      : [],
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
  }
}

const KNOWN_NAV_GROUP_IDS = ['dashboard', 'aiAgroCloud', 'satellite', 'data', 'sensors', 'master', 'admin'] as const

function sanitizeNavGroupId(raw: unknown): string {
  const id = String(raw ?? 'data').trim()
  return (KNOWN_NAV_GROUP_IDS as readonly string[]).includes(id) ? id : 'data'
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
