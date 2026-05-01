/** Stored in localStorage — see services/settingsStorage.ts */

export type ThemeMode = 'light' | 'dark' | 'custom' | 'system'

export type NavItemOverride = {
  labelEn?: string
  labelAr?: string
  iconClass?: string
  hidden?: boolean
}

export type CustomPageRecord = {
  id: string
  /** Display name (English UI default) */
  name: string
  /** Arabic label for sidebar — falls back to name when empty */
  nameAr?: string
  /** Normalized path without hash, e.g. /pages/demo */
  path: string
  iconClass: string
  visible: boolean
  /** Which built-in screen to render */
  bindTarget: 'placeholder' | 'home' | 'gis' | 'satellite-indices' | 'dashboards-overview'
  /**
   * Sidebar group id — matches NAV_DEFAULT_GROUPS / DOM sublists (`nav-group-${id}`).
   * Use `data` for Operations (nav-group-data).
   */
  navGroupId: string
  /**
   * CSS classes on the sublist row — same pattern as manifest leaves (e.g. nav-item-ec-ph).
   * Empty string uses the default style for the chosen group.
   */
  subitemClass?: string
}

export type HomePageSettings = {
  showItemCounts: boolean
  showCardChevron: boolean
  cardDensity: 'comfortable' | 'compact'
  backgroundMode: 'default' | 'solid' | 'gradient' | 'image'
  backgroundColor: string
  backgroundGradientFrom: string
  backgroundGradientTo: string
  backgroundImage: string
}

export type SystemSettingsPersistedV1 = {
  version: 1
  themeMode: ThemeMode
  /** Used when themeMode === 'custom' */
  customPrimaryHex: string
  logoLight: string
  logoDark: string
  navGroupOrder: string[]
  /** groupId -> ordered child item ids */
  navItemOrders: Record<string, string[]>
  /** Key: group id or item id */
  navOverrides: Record<string, NavItemOverride>
  customPages: CustomPageRecord[]
  homePage: HomePageSettings
}

export type SystemSettingsDraft = SystemSettingsPersistedV1 & { dirty?: boolean }
