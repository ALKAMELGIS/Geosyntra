/**
 * Canonical navigation structure. Keys are stable for overrides / ordering in system settings.
 */
import type { CustomPageRecord, SystemSettingsPersistedV1 } from '../types/systemSettings'
import { normalizeAppPath } from '../services/settingsStorage'

export type NavTranslationKey =
  | 'home'
  | 'dashboard'
  | 'esriApp'
  | 'developDashboard'
  | 'geosyntraDashboard'
  | 'agroDashboard'
  | 'geosyntraAi'
  | 'geosyntraChat'
  | 'satelliteImagery'
  | 'satelliteIntelligence'
  | 'gisMap'
  | 'operations'
  | 'irrigation'
  | 'ecph'
  | 'harvest'
  | 'qhis'
  | 'productTracking'
  | 'sensors'
  | 'soilSensors'
  | 'weatherSensors'
  | 'irrigationSensors'
  | 'camera'
  | 'gpsVehicleTracking'
  | 'masterData'
  | 'workflowDataSources'
  | 'dashboardSettings'
  | 'gisContent'
  | 'admin'
  | 'userManagement'
  | 'githubIntegration'
  | 'systemSettings'
  | 'customPage'

export type NavLeafDef = {
  id: string
  path: string
  i18nKey: NavTranslationKey
  defaultIcon: string
  subitemClass: string
}

export type NavGroupDef = {
  id: string
  i18nKey: NavTranslationKey
  defaultIcon: string
  headerClass: string
  children: NavLeafDef[]
}

export const NAV_HOME: NavLeafDef = {
  id: 'home',
  path: '/',
  i18nKey: 'home',
  defaultIcon: 'fa-solid fa-house',
  subitemClass: 'nav-item-home',
}

export const NAV_DEFAULT_GROUPS: NavGroupDef[] = [
  {
    id: 'satellite',
    i18nKey: 'satelliteImagery',
    defaultIcon: 'fa-solid fa-satellite-dish',
    headerClass: 'nav-header-satellite',
    children: [
      {
        id: 'satellite-indices',
        path: '/satellite/indices',
        i18nKey: 'satelliteIntelligence',
        defaultIcon: 'fa-solid fa-layer-group',
        subitemClass: 'nav-item-indices',
      },
      {
        id: 'satellite-gis',
        path: '/satellite/gis',
        i18nKey: 'gisMap',
        defaultIcon: 'fa-solid fa-map-location-dot',
        subitemClass: 'nav-item-gis-map',
      },
    ],
  },
  {
    id: 'master',
    i18nKey: 'masterData',
    defaultIcon: 'fa-solid fa-gear',
    headerClass: 'nav-header-master',
    children: [
      {
        id: 'master-workflow',
        path: '/master/workflow-settings',
        i18nKey: 'workflowDataSources',
        defaultIcon: 'fa-solid fa-database',
        subitemClass: 'nav-item-data-management',
      },
      {
        id: 'master-dashboard-settings',
        path: '/master/dashboard-settings',
        i18nKey: 'dashboardSettings',
        defaultIcon: 'fa-solid fa-link',
        subitemClass: 'nav-item-master',
      },
      {
        id: 'master-gis',
        path: '/master/gis-content',
        i18nKey: 'gisContent',
        defaultIcon: 'fa-solid fa-map',
        subitemClass: 'nav-item-master',
      },
    ],
  },
  {
    id: 'admin',
    i18nKey: 'admin',
    defaultIcon: 'fa-solid fa-user-shield',
    headerClass: 'nav-header-admin',
    children: [
      {
        id: 'admin-users',
        path: '/admin/users',
        i18nKey: 'userManagement',
        defaultIcon: 'fa-solid fa-users',
        subitemClass: 'nav-item-admin',
      },
      {
        id: 'admin-system-settings',
        path: '/admin/system-settings',
        i18nKey: 'systemSettings',
        defaultIcon: 'fa-solid fa-sliders',
        subitemClass: 'nav-item-admin-system',
      },
    ],
  },
]

/** Stable ids for sidebar groups — matches `nav-group-${id}` in NavMenu */
export const NAV_GROUP_IDS = NAV_DEFAULT_GROUPS.map(g => g.id)

/** Default sublist row class per group — mirrors first leaf style so custom pages match the group visually */
export function defaultSubitemClassForNavGroup(groupId: string): string {
  const map: Record<string, string> = {
    satellite: 'nav-item-indices',
    master: 'nav-item-master',
    admin: 'nav-item-admin',
  }
  return map[groupId] ?? 'nav-item-master'
}

export function normalizedNavGroupId(raw: string | undefined): string {
  const id = String(raw ?? 'master').trim()
  return NAV_GROUP_IDS.includes(id) ? id : 'master'
}

function sortByIdList<T extends { id: string }>(items: T[], order: string[]): T[] {
  if (!order.length) return items
  const map = new Map(items.map(i => [i.id, i]))
  const seen = new Set<string>()
  const head: T[] = []
  for (const id of order) {
    const it = map.get(id)
    if (it) {
      head.push(it)
      seen.add(id)
    }
  }
  for (const it of items) {
    if (!seen.has(it.id)) head.push(it)
  }
  return head
}

export type MergedLeaf = NavLeafDef & {
  iconClass: string
  visible: boolean
  labelEn: string
  labelAr: string
}

export type MergedGroup = Omit<NavGroupDef, 'children'> & {
  iconClass: string
  visible: boolean
  labelEn: string
  labelAr: string
  children: MergedLeaf[]
}

export function customPageToMergedLeaf(p: CustomPageRecord): MergedLeaf {
  const gid = normalizedNavGroupId(p.navGroupId)
  const icon = (p.iconClass || 'fa-solid fa-file').trim() || 'fa-solid fa-file'
  const sub =
    (p.subitemClass && p.subitemClass.trim()) || defaultSubitemClassForNavGroup(gid)
  const nameEn = (p.name || 'Page').trim() || 'Page'
  const nameAr = (p.nameAr && p.nameAr.trim()) || nameEn
  return {
    id: `custom-${p.id}`,
    path: normalizeAppPath(p.path),
    i18nKey: 'customPage',
    defaultIcon: icon,
    subitemClass: sub,
    iconClass: icon,
    visible: p.visible !== false,
    labelEn: nameEn,
    labelAr: nameAr,
  }
}

export function mergeNavigationManifest(
  settings: SystemSettingsPersistedV1,
  baseGroups: NavGroupDef[] = NAV_DEFAULT_GROUPS,
): { home: MergedLeaf; groups: MergedGroup[] } {
  const ov = settings.navOverrides

  const resolveLeaf = (leaf: NavLeafDef): MergedLeaf => {
    const o = ov[leaf.id]
    const hidden = o?.hidden === true
    const iconClass = (o?.iconClass?.trim() ? o.iconClass.trim() : leaf.defaultIcon) ?? leaf.defaultIcon
    const labelEn = o?.labelEn?.trim() || ''
    const labelAr = o?.labelAr?.trim() || ''
    return {
      ...leaf,
      iconClass,
      visible: !hidden,
      labelEn,
      labelAr,
    }
  }

  const resolveGroup = (g: NavGroupDef): MergedGroup => {
    const o = ov[g.id]
    const hidden = o?.hidden === true
    const iconClass = (o?.iconClass?.trim() ? o.iconClass.trim() : g.defaultIcon) ?? g.defaultIcon
    const labelEn = o?.labelEn?.trim() || ''
    const labelAr = o?.labelAr?.trim() || ''
    const order = settings.navItemOrders[g.id] ?? []
    const baseKids = sortByIdList(g.children.map(resolveLeaf), order).filter(c => c.visible)
    const customKids = (settings.customPages ?? [])
      .filter(p => p.visible !== false && normalizedNavGroupId(p.navGroupId) === g.id)
      .map(customPageToMergedLeaf)
    const kids = [...baseKids, ...customKids]
    return {
      ...g,
      iconClass,
      visible: !hidden,
      labelEn,
      labelAr,
      children: kids,
    }
  }

  const groupOrder = settings.navGroupOrder?.length ? settings.navGroupOrder : baseGroups.map(g => g.id)
  const merged = sortByIdList(baseGroups.map(resolveGroup), groupOrder).filter(g => g.visible && g.children.length > 0)

  const homeOv = ov[NAV_HOME.id]
  const homeResolved: MergedLeaf = {
    ...NAV_HOME,
    iconClass: homeOv?.iconClass?.trim() || NAV_HOME.defaultIcon,
    visible: homeOv?.hidden !== true,
    labelEn: homeOv?.labelEn?.trim() || '',
    labelAr: homeOv?.labelAr?.trim() || '',
  }

  return { home: homeResolved, groups: merged }
}
