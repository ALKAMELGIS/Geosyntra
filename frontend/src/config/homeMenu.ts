import type { AppLanguage } from '../lib/i18n'

export interface SubMenuItem {
  label: Record<AppLanguage, string>
  icon: string
  to?: string
  action?: 'logout'
}

export interface MenuItem {
  id: string
  label: Record<AppLanguage, string>
  icon: string
  color: string
  items?: SubMenuItem[]
  to?: string
}

/** Home launcher + nav menu source (shared by Home landing and header). */
export const homeMenuItems: MenuItem[] = [
  {
    id: 'dashboard',
    label: { en: 'Dashboard', ar: 'لوحة التحكم' },
    icon: 'fa-solid fa-chart-line',
    color: '#F97316',
    items: [
      { label: { en: 'Develop Dashboard', ar: 'تطوير لوحة التحكم' }, icon: 'fa-solid fa-grip', to: '/dashboard/develop' },
      { label: { en: 'Agro Cloud Dashboard', ar: 'لوحة Agro Cloud' }, icon: 'fa-solid fa-chart-pie', to: '/dashboards/agro-cloud' },
      { label: { en: 'Agro Dashboard', ar: 'لوحة Agro' }, icon: 'fa-solid fa-seedling', to: '/dashboards/agro-dashboard' },
    ],
  },
  {
    id: 'satellite',
    label: { en: 'Satellite Imagery', ar: 'صور الأقمار الصناعية' },
    icon: 'fa-solid fa-satellite-dish',
    color: '#8B5CF6',
    items: [
      { label: { en: 'Satellite Intelligence', ar: 'التحليل الفضائي الذكي' }, icon: 'fa-solid fa-layer-group', to: '/satellite/indices' },
      { label: { en: 'GIS Map', ar: 'خريطة GIS' }, icon: 'fa-solid fa-map', to: '/satellite/gis' },
    ],
  },
  {
    id: 'data',
    label: { en: 'Operations', ar: 'العمليات' },
    icon: 'fa-solid fa-screwdriver-wrench',
    color: '#F59E0B',
    items: [
      { label: { en: 'EC/PH', ar: 'الملوحة والحموضة' }, icon: 'fa-solid fa-droplet', to: '/data/ec-ph' },
      { label: { en: 'Irrigation Scheduling', ar: 'جدولة الري' }, icon: 'fa-solid fa-water', to: '/data/irrigation' },
      { label: { en: 'Harvest Logging', ar: 'تسجيل الحصاد' }, icon: 'fa-solid fa-tractor', to: '/data/harvest' },
      { label: { en: 'QHIS', ar: 'الجودة والسلامة' }, icon: 'fa-solid fa-shield-halved', to: '/data/qhis' },
      { label: { en: 'Product & Sales Tracking', ar: 'تتبع المنتجات والمبيعات' }, icon: 'fa-solid fa-boxes-stacked', to: '/data/production' },
    ],
  },
  {
    id: 'sensors',
    label: { en: 'Sensors', ar: 'الحساسات' },
    icon: 'fa-solid fa-microchip',
    color: '#0EA5E9',
    items: [
      { label: { en: 'Soil Sensors', ar: 'حساسات التربة' }, icon: 'fa-solid fa-seedling', to: '/sensors/soil' },
      { label: { en: 'Weather Sensors', ar: 'حساسات الطقس' }, icon: 'fa-solid fa-cloud-sun', to: '/sensors/weather' },
      { label: { en: 'Irrigation Sensors', ar: 'حساسات الري' }, icon: 'fa-solid fa-faucet-drip', to: '/sensors/irrigation' },
      { label: { en: 'Camera', ar: 'الكاميرا' }, icon: 'fa-solid fa-camera', to: '/sensors/camera' },
      { label: { en: 'GPS Vehicle Tracking', ar: 'تتبع مركبات GPS' }, icon: 'fa-solid fa-route', to: '/sensors/gps' },
    ],
  },
  {
    id: 'ai-agro-cloud-home',
    label: { en: 'AI AgroCloud', ar: 'سحابة Agro الذكية' },
    icon: 'fa-solid fa-cloud-bolt',
    color: '#059669',
    to: '/dashboards/ai-agro-cloud',
  },
  {
    id: 'camera-direct',
    label: { en: 'Camera', ar: 'الكاميرا' },
    icon: 'fa-solid fa-camera',
    color: '#0EA5E9',
    to: '/sensors/camera',
  },
  {
    id: 'gps-direct',
    label: { en: 'GPS Vehicle Tracking', ar: 'تتبع مركبات GPS' },
    icon: 'fa-solid fa-route',
    color: '#10B981',
    to: '/sensors/gps',
  },
  {
    id: 'master',
    label: { en: 'Master Data', ar: 'البيانات الرئيسية' },
    icon: 'fa-solid fa-gear',
    color: '#64748B',
    items: [
      { label: { en: 'Data Management', ar: 'إدارة البيانات' }, icon: 'fa-solid fa-database', to: '/master/workflow-settings' },
      { label: { en: 'Dashboard Settings', ar: 'إعدادات لوحة التحكم' }, icon: 'fa-solid fa-link', to: '/master/dashboard-settings' },
      { label: { en: 'GIS Content', ar: 'محتوى GIS' }, icon: 'fa-solid fa-map-location-dot', to: '/master/gis-content' },
    ],
  },
  {
    id: 'admin',
    label: { en: 'Settings', ar: 'الإعدادات' },
    icon: 'fa-solid fa-user-shield',
    color: '#1E293B',
    items: [
      { label: { en: 'User Management', ar: 'إدارة المستخدمين' }, icon: 'fa-solid fa-users', to: '/admin/users' },
      { label: { en: 'GitHub Integration', ar: 'تكامل GitHub' }, icon: 'fa-brands fa-github', to: '/admin/github' },
      { label: { en: 'System Settings', ar: 'إعدادات النظام' }, icon: 'fa-solid fa-sliders', to: '/admin/system-settings' },
    ],
  },
  {
    id: 'account',
    label: { en: 'Account', ar: 'الحساب' },
    icon: 'fa-solid fa-circle-user',
    color: '#0EA5E9',
    items: [
      { label: { en: 'Settings', ar: 'الإعدادات' }, icon: 'fa-solid fa-gear', to: '/account/settings' },
      { label: { en: 'Logout', ar: 'تسجيل الخروج' }, icon: 'fa-solid fa-arrow-right-from-bracket', action: 'logout' },
    ],
  },
]
