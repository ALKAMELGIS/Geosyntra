import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Chart from 'chart.js/auto'
import type { Chart as ChartInstance } from 'chart.js'
import { useLanguage } from '../../lib/i18n'
import { loadGisMapSavedLayers } from '../../lib/gisMapLayerStore'
import type { LayerData } from '../satellite/components/LayerManager'
import { parseFile, parseRemoteUrlAsFile } from '../../utils/FileLoader'
import './develop-dashboard.css'
import './agro-dashboard.css'

const MO_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const
const MO_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'] as const

const DATA = {
  all: { h: [120, 180, 240, 980, 560, 420, 680, 740, 310, 190, 80, 40], t: [200, 200, 300, 500, 600, 600, 700, 700, 400, 300, 150, 100] },
  q1: { h: [120, 180, 240], t: [200, 200, 300] },
  q2: { h: [980, 560, 420], t: [500, 600, 600] },
  q3: { h: [680, 740, 310], t: [700, 700, 400] },
  q4: { h: [190, 80, 40], t: [300, 150, 100] },
} as const

type QuarterKey = keyof typeof DATA

const RAIN = [45, 60, 80, 120, 95, 70, 55, 50, 90, 110, 75, 40]
const YLD = [100, 160, 220, 860, 490, 380, 620, 680, 280, 170, 70, 35]

const COLORS = {
  accent: '#2D6BE4',
  teal: '#12A97B',
  amber: '#E8920A',
  violet: '#6C5DD3',
  accentM: '#93B8F5',
  tealM: '#7DD9C0',
  grid: 'rgba(0,0,0,0.05)',
  tick: '#8b90a0',
} as const

function gridOpts() {
  return { color: COLORS.grid, drawBorder: false }
}

function tickOpts() {
  return { font: { size: 10 }, color: COLORS.tick }
}

function noLegend() {
  return { legend: { display: false } }
}

const FIELDS = [
  { n: 'Field A-12', kg: 2840, pct: 89, s: 'Active', sc: { background: '#E3F7F1', color: '#085041' } },
  { n: 'Field B-07', kg: 2610, pct: 81, s: 'Active', sc: { background: '#E3F7F1', color: '#085041' } },
  { n: 'Field C-03', kg: 2200, pct: 68, s: 'Fallow', sc: { background: '#FEF3E2', color: '#854F0B' } },
  { n: 'Field D-19', kg: 1980, pct: 62, s: 'Active', sc: { background: '#E3F7F1', color: '#085041' } },
  { n: 'Field E-22', kg: 1560, pct: 49, s: 'Done', sc: { background: '#EBF1FD', color: '#1e55c0' } },
] as const

const ACTS = [
  { title: 'ArcGIS layer synced', sub: 'North region · 34 fields updated', t: '2m ago', c: '#12A97B' },
  { title: 'Source connected', sub: 'CSV uploaded · Soil quality index', t: '18m ago', c: '#2D6BE4' },
  { title: 'Yield alert', sub: 'Field C-03 below threshold', t: '1h ago', c: '#E05252' },
  { title: 'Export ready', sub: 'Q1 report generated as PDF', t: '3h ago', c: '#E8920A' },
  { title: 'New field pinned', sub: 'Field F-11 added to dashboard', t: '5h ago', c: '#6C5DD3' },
] as const

type AgroAddWizard = 'home' | 'get-data' | 'gis-list' | 'tabs'
type AgroAddTab = 'arcgis' | 'database' | 'upload' | 'url'

const GET_DATA_COMMON_SOURCES: Array<{ id: string; label: string; icon: string; iconColor?: string }> = [
  { id: 'excel', label: 'Excel workbook', icon: 'fa-solid fa-file-excel', iconColor: '#217346' },
  { id: 'semantic', label: 'Power BI semantic models', icon: 'fa-solid fa-cubes', iconColor: '#f2c811' },
  { id: 'dataflows', label: 'Dataflows', icon: 'fa-solid fa-diagram-project', iconColor: '#742774' },
  { id: 'dataverse', label: 'Dataverse', icon: 'fa-solid fa-cloud', iconColor: '#742774' },
  { id: 'sql', label: 'SQL Server', icon: 'fa-solid fa-database', iconColor: '#cc2927' },
  { id: 'analysis', label: 'Analysis Services', icon: 'fa-solid fa-cube', iconColor: '#5c2d91' },
  { id: 'textcsv', label: 'Text/CSV', icon: 'fa-solid fa-file-lines', iconColor: '#107c10' },
  { id: 'web', label: 'Web', icon: 'fa-solid fa-globe', iconColor: '#0078d4' },
  { id: 'odata', label: 'OData feed', icon: 'fa-solid fa-table-cells', iconColor: '#e98300' },
  { id: 'blank', label: 'Blank query', icon: 'fa-solid fa-scroll', iconColor: '#c50f1f' },
]

type DiscoveredArcLayer = {
  id: number
  name: string
  kind: 'layer' | 'table'
  url: string
  geometryType?: string
}

function buildArcGisUrl(baseUrl: string, params: Record<string, string>) {
  const normalized = baseUrl.trim().replace(/#.*$/, '').replace(/\?.*$/, '').replace(/\/+$/, '')
  const u = new URL(normalized, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
  const search = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== '') search.set(k, v)
  })
  u.search = search.toString()
  return u.toString()
}

function normalizeArcGisServiceUrl(raw: string) {
  const trimmed = raw.trim().replace(/#.*$/, '').replace(/\?.*$/, '').replace(/\/+$/, '')
  const parts = trimmed.split('/')
  const last = parts[parts.length - 1]
  const prev = parts[parts.length - 2]
  if (/^\d+$/.test(last) && (prev === 'FeatureServer' || prev === 'MapServer')) {
    return parts.slice(0, -1).join('/')
  }
  return trimmed
}

async function fetchArcGisFeatureCollection(
  layerUrl: string,
  token: string,
  kind: 'layer' | 'table',
): Promise<GeoJSON.FeatureCollection> {
  let returnGeometry = kind !== 'table'
  try {
    const defUrl = buildArcGisUrl(layerUrl.replace(/\/+$/, ''), { f: 'json', token: token.trim() })
    const defRes = await fetch(defUrl)
    const json = await defRes.json()
    if (json?.error?.message) {
      const details = Array.isArray(json?.error?.details) ? json.error.details.join(' ') : ''
      throw new Error([json.error.message, details].filter(Boolean).join(' '))
    }
    if (json?.type && String(json.type).toLowerCase() === 'table') returnGeometry = false
    else if (typeof json?.geometryType === 'string') returnGeometry = true
  } catch {
    returnGeometry = kind !== 'table'
  }
  const url = buildArcGisUrl(`${layerUrl.replace(/\/+$/, '')}/query`, {
    where: '1=1',
    outFields: '*',
    returnGeometry: returnGeometry ? 'true' : 'false',
    outSR: '4326',
    f: 'geojson',
    resultRecordCount: '2000',
    token: token.trim(),
  })
  const res = await fetch(url)
  const geojson = await res.json()
  if (geojson?.error?.message) {
    const details = Array.isArray(geojson?.error?.details) ? geojson.error.details.join(' ') : ''
    throw new Error([geojson.error.message, details].filter(Boolean).join(' '))
  }
  if (!geojson || geojson.type !== 'FeatureCollection') throw new Error('Service did not return GeoJSON.')
  return geojson as GeoJSON.FeatureCollection
}

function isFeatureCollection(x: unknown): x is GeoJSON.FeatureCollection {
  return Boolean(
    x &&
      typeof x === 'object' &&
      (x as GeoJSON.FeatureCollection).type === 'FeatureCollection' &&
      Array.isArray((x as GeoJSON.FeatureCollection).features),
  )
}

function gisLayerCanImportToDashboard(layer: LayerData): boolean {
  if (isFeatureCollection(layer.data)) return true
  if (layer.url && layer.source === 'arcgis') return true
  return false
}

function uniqueRegistryKey(existingKeys: string[], displayName: string): string {
  const stem = (displayName.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '') || 'layer').toLowerCase()
  let key = stem
  let i = 0
  while (existingKeys.includes(key)) {
    i += 1
    key = `${stem}_${i}`
  }
  return key
}

export default function AgroDashboard() {
  const { language, direction } = useLanguage()
  const ar = language === 'ar'

  const t = useMemo(
    () =>
      ar
        ? {
            srTitle: 'لوحة تحليلات الحصاد — مؤشرات، رسوم، جدول حقول، ونشاط',
            brand: 'جيو',
            brandBold: 'داش',
            nav: ['نظرة عامة', 'عرض الخريطة', 'التقارير', 'المصادر'],
            dataset: [
              { v: 'harvest', l: 'بيانات الحصاد 2024' },
              { v: 'forecast', l: 'توقعات الإنتاج 2025' },
              { v: 'soil', l: 'مؤشر جودة التربة' },
            ],
            addSource: 'إضافة مصدر',
            addSourceBtnTitle: 'فتح نافذة إضافة مصدر البيانات',
            modalTitle: 'إضافة مصدر البيانات',
            modalLead: 'اختر كيف تريد إضافة الطبقات إلى السجل للتحليلات والخرائط.',
            modalOptsLegend: 'طريقة إضافة المصدر',
            optGisTitle: 'الاختيار من محتوى GIS',
            optGisDesc: 'استخدام الطبقات والحقول المحفوظة مسبقًا في خريطة GIS في هذا المتصفح.',
            optArcTitle: 'توفير رابط طبقة ArcGIS Server',
            optArcDesc: 'الاتصال بخدمة المعالم واختيار طبقة أو جدول.',
            optUploadTitle: 'رفع ملف',
            optUploadDesc: 'GeoJSON، KML، KMZ، Shapefile (zip)، CSV بإحداثيات، والمزيد.',
            optGetDataTitle: 'الحصول على البيانات',
            optGetDataDesc:
              'Excel، CSV، GeoJSON عبر عنوان ويب (نفس أنماط مصادر Power BI الشائعة).',
            advancedBtn: 'قاعدة بيانات، رابط ويب وخيارات متقدمة…',
            allOptionsBack: 'جميع الخيارات',
            gisHintBefore: 'الطبقات أدناه من جلسة ',
            gisHintStrong: 'خريطة GIS',
            gisHintAfter: ' (IndexedDB). الاستيراد ينسخ بيانات المعالم إلى هذه اللوحة.',
            gisEmptyBody: 'لا توجد طبقات محفوظة بعد. افتح خريطة GIS، أضف طبقة، ثم عد إلى هنا.',
            loadGisLabel: 'جاري تحميل محتوى GIS…',
            wmsNote: 'WMS / البلاط فقط — غير قابلة للاستيراد هنا',
            addingLabel: 'جاري الإضافة…',
            addBtn: 'إضافة',
            getDataRegionAria: 'الحصول على البيانات — مصادر شائعة',
            commonSources: 'مصادر بيانات شائعة',
            getDataToolbar: 'الحصول على البيانات',
            templateAppsRow: 'تطبيقات قالب Power BI',
            moreEllipsis: 'المزيد…',
            templateNotice:
              'تفتح تطبيقات القالب في خدمة Power BI. هنا، استخدم القائمة أعلاه أو خريطة GIS للطبقات الزراعية.',
            connecting: 'جاري الاتصال…',
            connectDiscover: 'اتصال واكتشاف الطبقات',
            featurePh: 'رابط خدمة المعالم',
            tokenPh: 'رمز / مفتاح API (اختياري)',
            foundLayers: (n: number) => `تم العثور على ${n} طبقة/جدول:`,
            selectLayerLbl: 'اختر الطبقة',
            layerNamePh: 'اسم العرض للطبقة',
            dbTabBefore: 'الاتصال الكامل بقاعدة البيانات والتحقق (مثل خريطة GIS) متاح في صفحة ',
            dbTabStrong: 'خريطة GIS',
            dbTabAfter: '. هنا يمكنك إضافة الطبقات عبر ArcGIS أو رفع ملف أو عنوان URL.',
            chooseFileBtn: 'اختر ملفًا',
            addToRegistry: 'إضافة إلى السجل',
            addFromUrlBtn: 'إضافة من الرابط',
            urlPh: 'https://… (GeoJSON، KML، KMZ، zip، …)',
            csvUploadHint:
              'ملف CSV بدون أعمدة خط العرض/خط الطول يُضاف كجدول بيانات (الجزء الأيمن ← بيانات) مثل حقول Power BI.',
            cancelBtn: 'إلغاء',
            wf: ['إضافة طبقة', 'إضافة بيانات', 'اختيار الحقول', 'تثبيت الحقول'],
            quarter: [
              { v: 'all', l: 'كل 2024' },
              { v: 'q1', l: 'الربع 1' },
              { v: 'q2', l: 'الربع 2' },
              { v: 'q3', l: 'الربع 3' },
              { v: 'q4', l: 'الربع 4' },
            ],
            export: 'تصدير ↗',
            save: 'حفظ',
            kpi1: 'إجمالي الحصاد (كغ)',
            kpi2: 'حقول نشطة',
            kpi3: 'متوسط الإنتاج / حقل',
            kpi4: 'مصادر البيانات',
            chartMain: 'حجم الحصاد الشهري',
            chartPie: 'الحصاد حسب المنطقة',
            chartLine: 'الإنتاج مقابل المطر',
            chartLineSub: 'ارتباط شهري',
            topFields: 'أعلى الحقول',
            topFieldsSub: 'حسب حجم الإخراج',
            activity: 'نشاط حديث',
            activitySub: 'تحديثات مباشرة',
            tblField: 'حقل',
            tblKg: 'كغ',
            tblProg: 'التقدم',
            tblStatus: 'الحالة',
            analyze: 'تحليل ↗',
            dist: 'التوزيع 2024',
            legHarvest: 'الحصاد (كغ)',
            legTarget: 'الهدف',
            legYield: 'مؤشر الإنتاج',
            legRain: 'المطر (مم)',
            metaAll: 'يناير – ديسمبر 2024 · كل المناطق',
            metaQ: (q: string) => `${q.toUpperCase()} 2024 · كل المناطق`,
          }
        : {
            srTitle: 'Harvest analytics dashboard — KPI cards, charts, field table, and activity feed',
            brand: 'Geo',
            brandBold: 'Dash',
            nav: ['Overview', 'Map view', 'Reports', 'Sources'],
            dataset: [
              { v: 'harvest', l: 'Harvest data 2024' },
              { v: 'forecast', l: 'Yield forecast 2025' },
              { v: 'soil', l: 'Soil quality index' },
            ],
            addSource: 'Add source',
            addSourceBtnTitle: 'Open Add Source Data',
            modalTitle: 'Add Source Data',
            modalLead: 'Choose how you want to add layers to the registry for analytics and maps.',
            modalOptsLegend: 'Data source method',
            optGisTitle: 'Select from GIS Content',
            optGisDesc: 'Use layers and fields already saved in GIS Map in this browser.',
            optArcTitle: 'Provide an ArcGIS Server layer URL',
            optArcDesc: 'Connect to a feature service and pick a layer or table.',
            optUploadTitle: 'Upload a file',
            optUploadDesc: 'GeoJSON, KML, KMZ, Shapefile (zip), CSV with coordinates, and more.',
            optGetDataTitle: 'Get Data',
            optGetDataDesc: 'Excel, CSV, GeoJSON via web URL (same patterns as Power BI common sources).',
            advancedBtn: 'Database, web URL & advanced…',
            allOptionsBack: 'All options',
            gisHintBefore: 'Layers below come from your ',
            gisHintStrong: 'GIS Map',
            gisHintAfter: ' session (IndexedDB). Import copies feature data into this dashboard.',
            gisEmptyBody: 'No saved layers yet. Open GIS Map, add a layer, then return here.',
            loadGisLabel: 'Loading GIS Content…',
            wmsNote: 'WMS / tiles only — not importable here',
            addingLabel: 'Adding…',
            addBtn: 'Add',
            getDataRegionAria: 'Get data — common sources',
            commonSources: 'Common data sources',
            getDataToolbar: 'Get data',
            templateAppsRow: 'Power BI Template Apps',
            moreEllipsis: 'More…',
            templateNotice:
              'Template Apps open in the Power BI service. Here, use the list above or GIS Map for curated agriculture layers.',
            connecting: 'Connecting…',
            connectDiscover: 'Connect & Discover Layers',
            featurePh: 'Feature Service URL',
            tokenPh: 'Token / API Key (optional)',
            foundLayers: (n: number) => `FOUND ${n} LAYER/TABLE(S):`,
            selectLayerLbl: 'Select layer',
            layerNamePh: 'Layer display name',
            dbTabBefore: 'Full database connection and validation (same as GIS Map) is available on the ',
            dbTabStrong: 'GIS Map',
            dbTabAfter: ' page. Here you can add layers via ArcGIS, file upload, or URL.',
            chooseFileBtn: 'Choose file',
            addToRegistry: 'Add to registry',
            addFromUrlBtn: 'Add from URL',
            urlPh: 'https://… (GeoJSON, KML, KMZ, zip, …)',
            csvUploadHint:
              'CSV without latitude/longitude columns is added as a Data table (right pane → Data) like Power BI Fields.',
            cancelBtn: 'Cancel',
            wf: ['Add layer', 'Add source data', 'Select fields', 'Pin fields'],
            quarter: [
              { v: 'all', l: 'All 2024' },
              { v: 'q1', l: 'Q1' },
              { v: 'q2', l: 'Q2' },
              { v: 'q3', l: 'Q3' },
              { v: 'q4', l: 'Q4' },
            ],
            export: 'Export ↗',
            save: 'Save',
            kpi1: 'Total harvest (kg)',
            kpi2: 'Active fields',
            kpi3: 'Avg yield / field',
            kpi4: 'Data sources',
            chartMain: 'Monthly harvest volume',
            chartPie: 'Harvest by region',
            chartLine: 'Yield vs rainfall',
            chartLineSub: 'Monthly correlation',
            topFields: 'Top fields',
            topFieldsSub: 'By output volume',
            activity: 'Recent activity',
            activitySub: 'Live updates',
            tblField: 'Field',
            tblKg: 'Kg',
            tblProg: 'Progress',
            tblStatus: 'Status',
            analyze: 'Analyze ↗',
            dist: 'Distribution 2024',
            legHarvest: 'Harvest (kg)',
            legTarget: 'Target',
            legYield: 'Yield index',
            legRain: 'Rainfall (mm)',
            metaAll: 'Jan – Dec 2024 · all regions',
            metaQ: (q: string) => `${q.toUpperCase()} 2024 · all regions`,
          },
    [ar],
  )

  const getDataNotices = useMemo(
    () =>
      ar
        ? {
            semantic:
              'النماذج الدلالية غير متصلة في هذه الأداة. صدّر البيانات أو استخدم محتوى GIS أو ArcGIS.',
            dataflows: 'تدفقات البيانات غير متوفرة هنا. استخدم خريطة GIS أو رفع ملف.',
            dataverse: 'Dataverse غير مربوط في هذه الشاشة. استخدم محتوى GIS أو الويب.',
            blank: 'استعلام فارغ غير متوفر في لوحة Agro. استخدم خريطة GIS للاستعلامات المتقدمة.',
          }
        : {
            semantic:
              'Semantic models are not connected in this toolkit. Export data or use GIS Content / ArcGIS instead.',
            dataflows: 'Dataflows are not available here. Use GIS Map dataflows or upload a file.',
            dataverse: 'Dataverse is not wired in this view. Use GIS Content or Web to reach your data.',
            blank: 'Blank query is not available on the Agro dashboard. Use GIS Map for advanced queries.',
          },
    [ar],
  )

  const MO = ar ? MO_AR : MO_EN

  const [navIdx, setNavIdx] = useState(0)
  const [wfIdx, setWfIdx] = useState(1)
  const [addSourceOpen, setAddSourceOpen] = useState(false)
  const [addWizard, setAddWizard] = useState<AgroAddWizard>('home')
  const [addTab, setAddTab] = useState<AgroAddTab>('arcgis')
  const [gisContentLayers, setGisContentLayers] = useState<LayerData[]>([])
  const [gisContentLoading, setGisContentLoading] = useState(false)
  const [getDataNotice, setGetDataNotice] = useState<string | null>(null)
  const [serviceUrl, setServiceUrl] = useState('')
  const [arcgisToken, setArcgisToken] = useState('')
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [discoverError, setDiscoverError] = useState<string | null>(null)
  const [discoveredLayers, setDiscoveredLayers] = useState<DiscoveredArcLayer[]>([])
  const [selectedDiscoveredUrl, setSelectedDiscoveredUrl] = useState('')
  const [layerModalName, setLayerModalName] = useState('')
  const [addingLayerKey, setAddingLayerKey] = useState<string | null>(null)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [remoteDataUrl, setRemoteDataUrl] = useState('')
  const [agroLinkedSources, setAgroLinkedSources] = useState<string[]>([])
  const [homePick, setHomePick] = useState<'gis' | 'arcgis' | 'upload' | 'getdata'>('gis')
  const addLayerFileInputRef = useRef<HTMLInputElement | null>(null)
  const [mainType, setMainType] = useState<'bar' | 'line' | 'area'>('bar')
  const [pieType, setPieType] = useState<'pie' | 'doughnut'>('pie')
  const [quarter, setQuarter] = useState<QuarterKey>('all')

  const mainMeta = quarter === 'all' ? t.metaAll : t.metaQ(quarter)

  const kpi1 = useMemo(() => {
    const totals: Record<QuarterKey, string> = {
      all: '48,320',
      q1: '12,080',
      q2: '13,440',
      q3: '13,580',
      q4: '9,220',
    }
    return totals[quarter]
  }, [quarter])

  const kpi2 = useMemo(() => {
    if (quarter === 'all') return '142'
    const f = { q1: 0.25, q2: 0.28, q3: 0.27, q4: 0.2 } as const
    return String(Math.round(142 * f[quarter as keyof typeof f]))
  }, [quarter])

  const mainCanvasRef = useRef<HTMLCanvasElement>(null)
  const pieCanvasRef = useRef<HTMLCanvasElement>(null)
  const lineCanvasRef = useRef<HTMLCanvasElement>(null)
  const mainChartRef = useRef<ChartInstance | null>(null)
  const pieChartRef = useRef<ChartInstance | null>(null)
  const lineChartRef = useRef<ChartInstance | null>(null)

  const buildMain = useCallback(() => {
    const ctx = mainCanvasRef.current
    if (!ctx) return
    mainChartRef.current?.destroy()
    const d = DATA[quarter]
    const slice = { q1: [0, 3] as const, q2: [3, 6] as const, q3: [6, 9] as const, q4: [9, 12] as const }
    const labs =
      quarter !== 'all' ? [...MO].slice(...slice[quarter as Exclude<QuarterKey, 'all'>]) : [...MO]
    const isLine = mainType === 'line' || mainType === 'area'
    const chartType = isLine ? 'line' : 'bar'

    mainChartRef.current = new Chart(ctx, {
      type: chartType,
      data: {
        labels: labs,
        datasets: [
          {
            label: 'Harvest',
            data: [...d.h],
            backgroundColor: mainType === 'bar' ? COLORS.accent : 'transparent',
            borderColor: COLORS.accent,
            borderWidth: isLine ? 2 : 0,
            fill: mainType === 'area' ? 'origin' : false,
            tension: 0.4,
            pointRadius: isLine ? 3 : 0,
            borderRadius: mainType === 'bar' ? 5 : 0,
          },
          {
            label: 'Target',
            data: [...d.t],
            type: 'line',
            borderColor: COLORS.accentM,
            borderWidth: 1.5,
            borderDash: [5, 4],
            backgroundColor: 'transparent',
            fill: false,
            pointRadius: 0,
            tension: 0.4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { ...noLegend() },
        scales: {
          x: {
            ticks: { ...tickOpts(), autoSkip: false, maxRotation: 0 },
            grid: { display: false },
            border: { display: false },
          },
          y: {
            ticks: {
              ...tickOpts(),
              callback: (v: string | number) => {
                const n = typeof v === 'number' ? v : Number(v)
                return n >= 1000 ? `${(n / 1000).toFixed(0)}k` : n
              },
            },
            grid: gridOpts(),
            border: { display: false },
          },
        },
      },
    })
  }, [MO, mainType, quarter])

  const buildPie = useCallback(() => {
    const ctx = pieCanvasRef.current
    if (!ctx) return
    pieChartRef.current?.destroy()
    pieChartRef.current = new Chart(ctx, {
      type: pieType,
      data: {
        labels: ['North', 'South', 'East', 'West'],
        datasets: [
          {
            data: [35, 28, 22, 15],
            backgroundColor: [COLORS.accent, COLORS.teal, COLORS.amber, COLORS.violet],
            borderWidth: 0,
            hoverOffset: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          ...noLegend(),
          tooltip: {
            callbacks: {
              label: ctx => {
                const v = typeof ctx.raw === 'number' ? ctx.raw : 0
                return ` ${ctx.label}: ${v}%`
              },
            },
          },
        },
      },
    })
  }, [pieType])

  const buildLine = useCallback(() => {
    const ctx = lineCanvasRef.current
    if (!ctx) return
    lineChartRef.current?.destroy()
    lineChartRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [...MO],
        datasets: [
          {
            label: 'Yield',
            data: [...YLD],
            borderColor: COLORS.accent,
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.4,
            fill: false,
          },
          {
            label: 'Rainfall',
            data: [...RAIN],
            borderColor: COLORS.tealM,
            borderWidth: 2,
            borderDash: [4, 3],
            pointRadius: 0,
            tension: 0.4,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { ...noLegend() },
        scales: {
          x: {
            ticks: { ...tickOpts(), autoSkip: true },
            grid: { display: false },
            border: { display: false },
          },
          y: {
            ticks: tickOpts(),
            grid: gridOpts(),
            border: { display: false },
          },
        },
      },
    })
  }, [MO])

  useEffect(() => {
    buildMain()
    return () => {
      mainChartRef.current?.destroy()
      mainChartRef.current = null
    }
  }, [buildMain])

  useEffect(() => {
    buildPie()
    return () => {
      pieChartRef.current?.destroy()
      pieChartRef.current = null
    }
  }, [buildPie])

  useEffect(() => {
    buildLine()
    return () => {
      lineChartRef.current?.destroy()
      lineChartRef.current = null
    }
  }, [buildLine])

  const resetAgroAddForm = useCallback(() => {
    setAddWizard('home')
    setAddTab('arcgis')
    setGisContentLayers([])
    setGisContentLoading(false)
    setGetDataNotice(null)
    setServiceUrl('')
    setArcgisToken('')
    setIsDiscovering(false)
    setDiscoverError(null)
    setDiscoveredLayers([])
    setSelectedDiscoveredUrl('')
    setLayerModalName('')
    setAddingLayerKey(null)
    setUploadFile(null)
    setRemoteDataUrl('')
    setHomePick('gis')
  }, [])

  const closeAddSourceModal = useCallback(() => {
    setAddSourceOpen(false)
    resetAgroAddForm()
  }, [resetAgroAddForm])

  useEffect(() => {
    if (!addSourceOpen) return
    let cancelled = false
    setGisContentLoading(true)
    void loadGisMapSavedLayers()
      .then(rows => {
        if (!cancelled) setGisContentLayers(rows)
      })
      .finally(() => {
        if (!cancelled) setGisContentLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [addSourceOpen])

  useEffect(() => {
    if (!addSourceOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAddSourceModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [addSourceOpen, closeAddSourceModal])

  const goAgroWizardHome = useCallback(() => {
    setDiscoverError(null)
    setGetDataNotice(null)
    setHomePick('gis')
    setAddWizard('home')
  }, [])

  const switchAddTab = useCallback((tab: AgroAddTab) => {
    setDiscoverError(null)
    setAddTab(tab)
  }, [])

  const pickGetDataSource = useCallback(
    (id: string) => {
      setDiscoverError(null)
      setGetDataNotice(null)
      if (id === 'excel' || id === 'textcsv') {
        setAddWizard('tabs')
        setAddTab('upload')
        return
      }
      if (id === 'web' || id === 'odata') {
        setAddWizard('tabs')
        setAddTab('url')
        return
      }
      if (id === 'sql' || id === 'analysis') {
        setAddWizard('tabs')
        setAddTab('database')
        return
      }
      setGetDataNotice(getDataNotices[id as keyof typeof getDataNotices] ?? (ar ? 'هذا المصدر غير متوفر بعد في هذه الشاشة.' : 'This source is not available on this screen yet.'))
    },
    [ar, getDataNotices],
  )

  const discoverArcGisLayers = useCallback(async () => {
    const base = normalizeArcGisServiceUrl(serviceUrl)
    if (!base) return
    setIsDiscovering(true)
    setDiscoverError(null)
    setDiscoveredLayers([])
    setSelectedDiscoveredUrl('')
    try {
      const url = buildArcGisUrl(base, { f: 'json', token: arcgisToken.trim() })
      const res = await fetch(url, { method: 'GET' })
      const json = await res.json()
      if (json?.error?.message) {
        const details = Array.isArray(json?.error?.details) ? json.error.details.join(' ') : ''
        throw new Error([json.error.message, details].filter(Boolean).join(' '))
      }
      const layersArr = Array.isArray(json?.layers) ? json.layers : []
      const tablesArr = Array.isArray(json?.tables) ? json.tables : []
      const discovered: DiscoveredArcLayer[] = [
        ...layersArr.map((l: { id: number; name: string; geometryType?: string }) => ({ ...l, kind: 'layer' as const })),
        ...tablesArr.map((t: { id: number; name: string }) => ({ ...t, kind: 'table' as const })),
      ]
        .filter((l: { id?: unknown; name?: unknown }) => typeof l?.id === 'number' && typeof l?.name === 'string')
        .map((l: { id: number; name: string; kind: 'layer' | 'table'; geometryType?: string }) => ({
          id: l.id,
          name: l.name,
          kind: l.kind,
          url: `${base.replace(/\/+$/, '')}/${l.id}`,
          geometryType: typeof l?.geometryType === 'string' ? l.geometryType : undefined,
        }))
      if (discovered.length === 0) throw new Error('No layers/tables found in this service URL.')
      setDiscoveredLayers(discovered)
      setSelectedDiscoveredUrl(discovered[0]!.url)
      setLayerModalName(prev => (prev.trim() ? prev : discovered[0]!.name))
    } catch (e: unknown) {
      setDiscoverError(e instanceof Error ? e.message : 'Failed to connect to service.')
    } finally {
      setIsDiscovering(false)
    }
  }, [serviceUrl, arcgisToken])

  const importGisContentLayer = useCallback(
    async (layer: LayerData) => {
      if (!gisLayerCanImportToDashboard(layer)) return
      const opKey = `gis:${String(layer.id)}`
      setAddingLayerKey(opKey)
      setDiscoverError(null)
      try {
        let data: GeoJSON.FeatureCollection
        const displayName = layer.name?.trim() || 'Layer'

        if (isFeatureCollection(layer.data)) {
          data = layer.data
          if (data.features.length === 0) throw new Error('Layer has no features.')
        } else if (layer.url && layer.source === 'arcgis') {
          const def = layer.arcgisLayerDefinition
          const isTable = def?.type === 'table' || String(def?.type || '').toLowerCase() === 'table'
          const kind: 'layer' | 'table' = isTable ? 'table' : 'layer'
          const token = layer.authToken || ''
          data = await fetchArcGisFeatureCollection(layer.url, token, kind)
        } else {
          throw new Error('Unsupported layer format for this dashboard.')
        }

        void data
        setAgroLinkedSources(prev => [...prev, displayName])
        closeAddSourceModal()
      } catch (e: unknown) {
        setDiscoverError(e instanceof Error ? e.message : 'Failed to add layer from GIS Content.')
      } finally {
        setAddingLayerKey(null)
      }
    },
    [closeAddSourceModal],
  )

  const addArcGisLayerToRegistry = useCallback(
    async (l: DiscoveredArcLayer) => {
      const opKey = `arcgis:${l.url}`
      setAddingLayerKey(opKey)
      setDiscoverError(null)
      try {
        const data = await fetchArcGisFeatureCollection(l.url, arcgisToken, l.kind)
        const displayName = layerModalName.trim() || l.name
        if (!data.features.length) throw new Error('Layer has no features.')
        void data
        setAgroLinkedSources(prev => [...prev, displayName])
        closeAddSourceModal()
      } catch (e: unknown) {
        setDiscoverError(e instanceof Error ? e.message : 'Failed to add layer.')
      } finally {
        setAddingLayerKey(null)
      }
    },
    [arcgisToken, layerModalName, closeAddSourceModal],
  )

  const addUploadLayerToRegistry = useCallback(async () => {
    if (!uploadFile) return
    const opKey = `upload:${uploadFile.name}`
    setAddingLayerKey(opKey)
    setDiscoverError(null)
    try {
      const parsed = await parseFile(uploadFile)
      if (parsed.type === 'table') {
        const rows = parsed.data as Record<string, unknown>[]
        if (!Array.isArray(rows) || rows.length === 0) throw new Error('CSV has no data rows.')
        const columns = Object.keys(rows[0] ?? {})
        if (!columns.length) throw new Error('CSV has no columns.')
        const displayName = layerModalName.trim() || uploadFile.name.replace(/\.[^.]+$/, '').trim() || 'Table'
        void columns
        setAgroLinkedSources(prev => [...prev, `${displayName} (table)`])
        closeAddSourceModal()
        return
      }
      if (parsed.type !== 'geojson') throw new Error('File must contain GIS features (GeoJSON/KML/KMZ/Shapefile zip).')
      let geojson: unknown = parsed.data
      if (Array.isArray(geojson)) geojson = geojson[0]
      const fc = geojson as GeoJSON.FeatureCollection
      if (!fc || fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
        throw new Error('File must be a GeoJSON FeatureCollection.')
      }
      const displayName = layerModalName.trim() || uploadFile.name.replace(/\.[^.]+$/, '').trim() || 'Layer'
      void fc
      setAgroLinkedSources(prev => [...prev, displayName])
      closeAddSourceModal()
    } catch (e: unknown) {
      setDiscoverError(e instanceof Error ? e.message : 'Failed to import file.')
    } finally {
      setAddingLayerKey(null)
    }
  }, [uploadFile, layerModalName, closeAddSourceModal])

  const addUrlLayerToRegistry = useCallback(async () => {
    const trimmed = remoteDataUrl.trim()
    if (!trimmed) return
    const opKey = `url:${trimmed}`
    setAddingLayerKey(opKey)
    setDiscoverError(null)
    try {
      const file = await parseRemoteUrlAsFile(trimmed)
      const parsed = await parseFile(file)
      if (parsed.type !== 'geojson') {
        throw new Error('URL must resolve to GIS features (GeoJSON/KML/KMZ/Shapefile zip/CSV with coordinates).')
      }
      let geojson: unknown = parsed.data
      if (Array.isArray(geojson)) geojson = geojson[0]
      const fc = geojson as GeoJSON.FeatureCollection
      if (!fc || fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
        throw new Error('URL must resolve to a GeoJSON FeatureCollection.')
      }
      const stem = file.name.replace(/\.[^.]+$/, '').trim()
      const displayName = layerModalName.trim() || stem || 'Layer'
      void fc
      setAgroLinkedSources(prev => [...prev, displayName])
      closeAddSourceModal()
    } catch (e: unknown) {
      setDiscoverError(e instanceof Error ? e.message : 'Failed to import from URL.')
    } finally {
      setAddingLayerKey(null)
    }
  }, [remoteDataUrl, layerModalName, closeAddSourceModal])

  const wfClass = (i: number) => {
    if (i < wfIdx) return 'agdash-done'
    if (i === wfIdx) return 'agdash-act'
    return ''
  }

  const wfNumContent = (i: number) => {
    if (i < wfIdx) {
      return (
        <svg viewBox="0 0 10 10" width={10} height={10} fill="none" aria-hidden>
          <path
            d="M2 5.2l2 2 4-4.2"
            stroke="white"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
    }
    return i + 1
  }

  return (
    <div className="page agro-dash-root" dir={direction}>
      <h2 className="agdash-sr-only">{t.srTitle}</h2>

      <div className="agdash-db">
        <nav className="agdash-nav" aria-label="Dashboard">
          <div className="agdash-nav-logo">
            <div className="agdash-logo-mark">
              <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                <rect x="1" y="8" width="3.5" height="7" rx="1" fill="white" />
                <rect x="6.25" y="5" width="3.5" height="10" rx="1" fill="white" opacity="0.85" />
                <rect x="11.5" y="1" width="3.5" height="14" rx="1" fill="white" opacity="0.7" />
              </svg>
            </div>
            <span className="agdash-logo-text">
              {t.brand}
              <b>{t.brandBold}</b>
            </span>
          </div>
          <div className="agdash-nav-tabs" role="tablist">
            {t.nav.map((label, i) => (
              <button
                key={label}
                type="button"
                role="tab"
                aria-selected={navIdx === i}
                className={`agdash-ntab${navIdx === i ? ' agdash-on' : ''}`}
                onClick={() => setNavIdx(i)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="agdash-nav-end">
            <select className="agdash-nav-sel" aria-label={ar ? 'مجموعة البيانات' : 'Dataset'} defaultValue="harvest">
              {t.dataset.map(o => (
                <option key={o.v} value={o.v}>
                  {o.l}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="agdash-add-btn"
              onClick={() => {
                resetAgroAddForm()
                setWfIdx(1)
                setAddSourceOpen(true)
              }}
              title={t.addSourceBtnTitle}
            >
              <svg viewBox="0 0 12 12" fill="none" aria-hidden>
                <circle cx="6" cy="6" r="5.2" stroke="white" strokeWidth="1.3" />
                <path d="M6 3.5v5M3.5 6h5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {t.addSource}
            </button>
          </div>
        </nav>

        <div className="agdash-wf">
          {t.wf.map((label, i) => (
            <span key={label} style={{ display: 'contents' }}>
              {i > 0 ? <span className="agdash-wf-chevron">›</span> : null}
              <button type="button" className={`agdash-wf-step ${wfClass(i)}`} onClick={() => setWfIdx(i)}>
                <div className="agdash-wf-num">{wfNumContent(i)}</div>
                <span className="agdash-wf-label">{label}</span>
              </button>
            </span>
          ))}
          <div className="agdash-wf-end">
            <select
              className="agdash-chip-sel"
              aria-label={ar ? 'الفترة' : 'Period'}
              value={quarter}
              onChange={e => setQuarter(e.target.value as QuarterKey)}
            >
              {t.quarter.map(o => (
                <option key={o.v} value={o.v}>
                  {o.l}
                </option>
              ))}
            </select>
            <button type="button" className="agdash-wf-export">
              {t.export}
            </button>
            <button type="button" className="agdash-wf-export">
              {t.save}
            </button>
          </div>
        </div>

        <div className="agdash-body">
          <div className="agdash-kpi-row">
            <div className="agdash-kpi">
              <div className="agdash-kpi-header">
                <div className="agdash-kpi-icon" style={{ background: 'var(--agdash-accent-light)' }}>
                  <svg viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path
                      d="M3 12L6.5 6l3 4L12 4l2 8"
                      stroke="#2D6BE4"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <span className="agdash-kpi-badge agdash-up">▲ 12.4%</span>
              </div>
              <div className="agdash-kpi-val">{kpi1}</div>
              <div className="agdash-kpi-lbl">{t.kpi1}</div>
              <div className="agdash-kpi-bar">
                <div className="agdash-kpi-fill" style={{ width: '78%', background: 'var(--agdash-accent)' }} />
              </div>
            </div>
            <div className="agdash-kpi">
              <div className="agdash-kpi-header">
                <div className="agdash-kpi-icon" style={{ background: 'var(--agdash-teal-light)' }}>
                  <svg viewBox="0 0 16 16" fill="none" aria-hidden>
                    <rect x="2" y="2" width="5" height="5" rx="1.5" stroke="#12A97B" strokeWidth="1.4" />
                    <rect x="9" y="2" width="5" height="5" rx="1.5" stroke="#12A97B" strokeWidth="1.4" />
                    <rect x="2" y="9" width="5" height="5" rx="1.5" stroke="#12A97B" strokeWidth="1.4" />
                    <rect x="9" y="9" width="5" height="5" rx="1.5" stroke="#12A97B" strokeWidth="1.4" />
                  </svg>
                </div>
                <span className="agdash-kpi-badge agdash-up">▲ 8 new</span>
              </div>
              <div className="agdash-kpi-val">{kpi2}</div>
              <div className="agdash-kpi-lbl">{t.kpi2}</div>
              <div className="agdash-kpi-bar">
                <div className="agdash-kpi-fill" style={{ width: '86%', background: 'var(--agdash-teal)' }} />
              </div>
            </div>
            <div className="agdash-kpi">
              <div className="agdash-kpi-header">
                <div className="agdash-kpi-icon" style={{ background: 'var(--agdash-amber-light)' }}>
                  <svg viewBox="0 0 16 16" fill="none" aria-hidden>
                    <circle cx="8" cy="8" r="5.5" stroke="#E8920A" strokeWidth="1.4" />
                    <path d="M8 5.5V8l2 1.5" stroke="#E8920A" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                </div>
                <span className="agdash-kpi-badge agdash-dn">▼ 2.1%</span>
              </div>
              <div className="agdash-kpi-val">340 kg</div>
              <div className="agdash-kpi-lbl">{t.kpi3}</div>
              <div className="agdash-kpi-bar">
                <div className="agdash-kpi-fill" style={{ width: '62%', background: 'var(--agdash-amber)' }} />
              </div>
            </div>
            <div className="agdash-kpi">
              <div className="agdash-kpi-header">
                <div className="agdash-kpi-icon" style={{ background: 'var(--agdash-violet-light)' }}>
                  <svg viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path
                      d="M2 8h3M8 2v3M14 8h-3M8 14v-3"
                      stroke="#6C5DD3"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    />
                    <circle cx="8" cy="8" r="2.5" stroke="#6C5DD3" strokeWidth="1.4" />
                  </svg>
                </div>
                <span className="agdash-kpi-badge agdash-nt">2 added</span>
              </div>
              <div className="agdash-kpi-val">{7 + agroLinkedSources.length}</div>
              <div className="agdash-kpi-lbl">{t.kpi4}</div>
              <div className="agdash-kpi-bar">
                <div className="agdash-kpi-fill" style={{ width: '50%', background: 'var(--agdash-violet)' }} />
              </div>
            </div>
          </div>

          <div className="agdash-mid">
            <div className="agdash-card">
              <div className="agdash-ch">
                <div>
                  <div className="agdash-ctitle">{t.chartMain}</div>
                  <div className="agdash-csub">{mainMeta}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div className="agdash-type-grp" role="group" aria-label={ar ? 'نوع الرسم' : 'Chart type'}>
                    <button
                      type="button"
                      title="Bar"
                      className={`agdash-tbtn${mainType === 'bar' ? ' agdash-on' : ''}`}
                      onClick={() => setMainType('bar')}
                    >
                      <svg viewBox="0 0 13 13" fill="currentColor" aria-hidden>
                        <rect x="0" y="5" width="3" height="8" />
                        <rect x="5" y="2" width="3" height="11" />
                        <rect x="10" y="0" width="3" height="13" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      title="Line"
                      className={`agdash-tbtn${mainType === 'line' ? ' agdash-on' : ''}`}
                      onClick={() => setMainType('line')}
                    >
                      <svg viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
                        <polyline points="0,10 4,5 8,7 13,2" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      title="Area"
                      className={`agdash-tbtn${mainType === 'area' ? ' agdash-on' : ''}`}
                      onClick={() => setMainType('area')}
                    >
                      <svg viewBox="0 0 13 13" fill="currentColor" opacity="0.8" aria-hidden>
                        <polygon points="0,13 0,8 4,4 8,6 13,2 13,13" />
                      </svg>
                    </button>
                  </div>
                  <button type="button" className="agdash-action-link">
                    {t.analyze}
                  </button>
                </div>
              </div>
              <div className="agdash-chart-wrap">
                <canvas ref={mainCanvasRef} role="img" aria-label={t.chartMain} />
              </div>
              <div className="agdash-leg">
                <div className="agdash-li">
                  <div className="agdash-lsq" style={{ background: 'var(--agdash-accent)' }} />
                  {t.legHarvest}
                </div>
                <div className="agdash-li">
                  <div className="agdash-lsq" style={{ background: 'var(--agdash-accent-mid)', opacity: 0.6 }} />
                  {t.legTarget}
                </div>
              </div>
            </div>

            <div className="agdash-card">
              <div className="agdash-ch">
                <div>
                  <div className="agdash-ctitle">{t.chartPie}</div>
                  <div className="agdash-csub">{t.dist}</div>
                </div>
                <div className="agdash-type-grp" role="group" aria-label={ar ? 'نوع الدائرة' : 'Pie type'}>
                  <button
                    type="button"
                    title="Pie"
                    className={`agdash-tbtn${pieType === 'pie' ? ' agdash-on' : ''}`}
                    onClick={() => setPieType('pie')}
                  >
                    <svg viewBox="0 0 13 13" fill="currentColor" aria-hidden>
                      <path d="M6.5 0A6.5 6.5 0 0 1 13 6.5H6.5Z" opacity="0.9" />
                      <path d="M13 6.5A6.5 6.5 0 0 1 6.5 13V6.5Z" opacity="0.65" />
                      <path d="M6.5 13A6.5 6.5 0 0 1 0 6.5H6.5Z" opacity="0.4" />
                      <path d="M0 6.5A6.5 6.5 0 0 1 6.5 0V6.5Z" opacity="0.2" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    title="Doughnut"
                    className={`agdash-tbtn${pieType === 'doughnut' ? ' agdash-on' : ''}`}
                    onClick={() => setPieType('doughnut')}
                  >
                    <svg viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
                      <circle cx="6.5" cy="6.5" r="4" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="agdash-chart-wrap agdash-chart-sm">
                <canvas ref={pieCanvasRef} role="img" aria-label={t.chartPie} />
              </div>
              <div className="agdash-leg" style={{ justifyContent: 'center' }}>
                <div className="agdash-li">
                  <div className="agdash-lsq" style={{ background: 'var(--agdash-accent)' }} />
                  North 35%
                </div>
                <div className="agdash-li">
                  <div className="agdash-lsq" style={{ background: 'var(--agdash-teal)' }} />
                  South 28%
                </div>
                <div className="agdash-li">
                  <div className="agdash-lsq" style={{ background: 'var(--agdash-amber)' }} />
                  East 22%
                </div>
                <div className="agdash-li">
                  <div className="agdash-lsq" style={{ background: 'var(--agdash-violet)' }} />
                  West 15%
                </div>
              </div>
            </div>
          </div>

          <div className="agdash-bot">
            <div className="agdash-card">
              <div className="agdash-ch">
                <div>
                  <div className="agdash-ctitle">{t.chartLine}</div>
                  <div className="agdash-csub">{t.chartLineSub}</div>
                </div>
                <button type="button" className="agdash-action-link">
                  {t.analyze}
                </button>
              </div>
              <div className="agdash-chart-wrap agdash-chart-xs">
                <canvas ref={lineCanvasRef} role="img" aria-label={t.chartLine} />
              </div>
              <div className="agdash-leg" style={{ marginTop: 10 }}>
                <div className="agdash-li">
                  <div className="agdash-lsq" style={{ background: 'var(--agdash-accent)' }} />
                  {t.legYield}
                </div>
                <div className="agdash-li">
                  <div className="agdash-lsq" style={{ background: 'var(--agdash-teal-mid)' }} />
                  {t.legRain}
                </div>
              </div>
            </div>

            <div className="agdash-card">
              <div className="agdash-ch">
                <div>
                  <div className="agdash-ctitle">{t.topFields}</div>
                  <div className="agdash-csub">{t.topFieldsSub}</div>
                </div>
              </div>
              <table className="agdash-field-tbl">
                <thead>
                  <tr>
                    <th style={{ width: '38%' }}>{t.tblField}</th>
                    <th style={{ width: '22%' }}>{t.tblKg}</th>
                    <th style={{ width: '24%' }}>{t.tblProg}</th>
                    <th style={{ width: '16%' }}>{t.tblStatus}</th>
                  </tr>
                </thead>
                <tbody>
                  {FIELDS.map(f => (
                    <tr key={f.n}>
                      <td style={{ fontWeight: 500 }}>{f.n}</td>
                      <td>{f.kg.toLocaleString(ar ? 'ar' : 'en')}</td>
                      <td>
                        <div style={{ height: 4, borderRadius: 2, background: '#e8ebf2', overflow: 'hidden' }}>
                          <div
                            style={{
                              height: '100%',
                              width: `${f.pct}%`,
                              background: 'var(--agdash-teal)',
                              borderRadius: 2,
                            }}
                          />
                        </div>
                      </td>
                      <td>
                        <span className="agdash-fbadge" style={f.sc}>
                          {f.s}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="agdash-card">
              <div className="agdash-ch">
                <div>
                  <div className="agdash-ctitle">{t.activity}</div>
                  <div className="agdash-csub">{t.activitySub}</div>
                </div>
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: 'var(--agdash-teal)',
                    display: 'inline-block',
                    marginTop: 1,
                  }}
                  aria-hidden
                />
              </div>
              <div>
                {ACTS.map(a => (
                  <div key={a.title} className="agdash-feed-item">
                    <div className="agdash-feed-dot" style={{ background: a.c }} />
                    <div>
                      <div className="agdash-feed-main">{a.title}</div>
                      <div className="agdash-feed-sub">
                        {a.sub} · {a.t}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {addSourceOpen ? (
        <div className="gis-modal-overlay" role="presentation" onClick={closeAddSourceModal}>
          <div
            className="gis-modal gis-modal-compact ddb-add-source-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="agdash-add-source-title"
            onClick={e => e.stopPropagation()}
          >
            <div className="ddb-add-source-modal__head">
              <div className="gis-modal-compact-title" id="agdash-add-source-title">
                {t.modalTitle}
              </div>
              {addWizard !== 'home' ? (
                <button type="button" className="ddb-add-source-back" onClick={goAgroWizardHome}>
                  <i className={`fa-solid ${ar ? 'fa-arrow-right' : 'fa-arrow-left'}`} aria-hidden /> {t.allOptionsBack}
                </button>
              ) : null}
            </div>

            {addWizard === 'home' ? (
              <div className="ddb-add-source-home">
                <p className="ddb-add-source-lead">{t.modalLead}</p>
                <div className="ddb-source-option-grid" role="radiogroup" aria-label={t.modalOptsLegend}>
                  <button
                    type="button"
                    className="ddb-source-option-card"
                    role="radio"
                    aria-checked={false}
                    onClick={() => {
                      setDiscoverError(null)
                      setAddWizard('gis-list')
                    }}
                  >
                    <span className="ddb-source-option-indicator" aria-hidden />
                    <div className="ddb-source-option-icon-wrap">
                      <i className="fa-solid fa-layer-group" aria-hidden />
                    </div>
                    <div className="ddb-source-option-text">
                      <span className="ddb-source-option-title">{t.optGisTitle}</span>
                      <span className="ddb-source-option-desc">{t.optGisDesc}</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    className={`ddb-source-option-card${homePick === 'arcgis' ? ' is-selected' : ''}`}
                    role="radio"
                    aria-checked={homePick === 'arcgis'}
                    onClick={() => {
                      setDiscoverError(null)
                      setHomePick('arcgis')
                      setAddWizard('tabs')
                      setAddTab('arcgis')
                    }}
                  >
                    <span className="ddb-source-option-indicator" aria-hidden />
                    <div className="ddb-source-option-icon-wrap">
                      <i className="fa-solid fa-link" aria-hidden />
                    </div>
                    <div className="ddb-source-option-text">
                      <span className="ddb-source-option-title">{t.optArcTitle}</span>
                      <span className="ddb-source-option-desc">{t.optArcDesc}</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    className={`ddb-source-option-card${homePick === 'upload' ? ' is-selected' : ''}`}
                    role="radio"
                    aria-checked={homePick === 'upload'}
                    onClick={() => {
                      setDiscoverError(null)
                      setHomePick('upload')
                      setAddWizard('tabs')
                      setAddTab('upload')
                    }}
                  >
                    <span className="ddb-source-option-indicator" aria-hidden />
                    <div className="ddb-source-option-icon-wrap">
                      <i className="fa-solid fa-file-arrow-up" aria-hidden />
                    </div>
                    <div className="ddb-source-option-text">
                      <span className="ddb-source-option-title">{t.optUploadTitle}</span>
                      <span className="ddb-source-option-desc">{t.optUploadDesc}</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    className={`ddb-source-option-card${homePick === 'getdata' ? ' is-selected' : ''}`}
                    role="radio"
                    aria-checked={homePick === 'getdata'}
                    onClick={() => {
                      setDiscoverError(null)
                      setGetDataNotice(null)
                      setHomePick('getdata')
                      setAddWizard('get-data')
                    }}
                  >
                    <span className="ddb-source-option-indicator" aria-hidden />
                    <div className="ddb-source-option-icon-wrap ddb-source-option-icon-wrap--getdata">
                      <i className="fa-solid fa-database" aria-hidden />
                      <i className="fa-solid fa-table-cells" aria-hidden />
                    </div>
                    <div className="ddb-source-option-text">
                      <span className="ddb-source-option-title">{t.optGetDataTitle}</span>
                      <span className="ddb-source-option-desc">{t.optGetDataDesc}</span>
                    </div>
                  </button>
                </div>

                <button
                  type="button"
                  className="ddb-add-source-more"
                  onClick={() => {
                    setDiscoverError(null)
                    setAddWizard('tabs')
                    setAddTab('url')
                  }}
                >
                  {t.advancedBtn}
                </button>
              </div>
            ) : addWizard === 'get-data' ? (
              <div className="ddb-add-source-get-data-page gis-modal-body" role="region" aria-label={t.getDataRegionAria}>
                <div className="ddb-get-data-menu ddb-get-data-menu--page" role="navigation" aria-label={t.commonSources}>
                  <div className="ddb-get-data-toolbar-mimic">
                    <span className="ddb-get-data-toolbar-icon" aria-hidden>
                      <i className="fa-solid fa-database" />
                      <i className="fa-solid fa-table" />
                    </span>
                    <span className="ddb-get-data-toolbar-label">{t.getDataToolbar}</span>
                    <i className="fa-solid fa-chevron-down ddb-get-data-toolbar-chev" aria-hidden />
                  </div>
                  <div className="ddb-get-data-section-title">{t.commonSources}</div>
                  <ul className="ddb-get-data-list">
                    {GET_DATA_COMMON_SOURCES.map(row => (
                      <li key={row.id}>
                        <button type="button" className="ddb-get-data-row" onClick={() => pickGetDataSource(row.id)}>
                          <span className="ddb-get-data-row-icon" style={row.iconColor ? { color: row.iconColor } : undefined}>
                            <i className={row.icon} aria-hidden />
                          </span>
                          <span className="ddb-get-data-row-label">{row.label}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="ddb-get-data-divider" role="separator" />
                  <button
                    type="button"
                    className="ddb-get-data-row ddb-get-data-row--footer"
                    onClick={() => setGetDataNotice(t.templateNotice)}
                  >
                    <span className="ddb-get-data-row-icon ddb-get-data-row-icon--muted">
                      <i className="fa-solid fa-table-columns" aria-hidden />
                    </span>
                    <span className="ddb-get-data-row-label">{t.templateAppsRow}</span>
                    <i className="fa-solid fa-arrow-up-right-from-square ddb-get-data-external" aria-hidden />
                  </button>
                  <div className="ddb-get-data-divider" role="separator" />
                  <button
                    type="button"
                    className="ddb-get-data-more"
                    onClick={() => {
                      setDiscoverError(null)
                      setGetDataNotice(null)
                      setAddWizard('tabs')
                      setAddTab('arcgis')
                    }}
                  >
                    {t.moreEllipsis}
                  </button>
                </div>
                {getDataNotice ? (
                  <div className="ddb-get-data-notice" role="status">
                    <i className="fa-solid fa-circle-info" aria-hidden /> {getDataNotice}
                  </div>
                ) : null}
              </div>
            ) : addWizard === 'gis-list' ? (
              <div className="ddb-add-source-gis-list gis-modal-body agdash-gis-list-page">
                <div className="agdash-gis-list-banner">
                  <p className="ddb-add-source-gis-hint">
                    {t.gisHintBefore}
                    <strong>{t.gisHintStrong}</strong>
                    {t.gisHintAfter}
                  </p>
                </div>
                {gisContentLoading ? (
                  <div className="ddb-add-source-loading">
                    <i className="fa-solid fa-spinner fa-spin" aria-hidden /> {t.loadGisLabel}
                  </div>
                ) : gisContentLayers.length === 0 ? (
                  <div className="ddb-add-source-empty">
                    <i className="fa-regular fa-folder-open" aria-hidden />
                    <p>{t.gisEmptyBody}</p>
                  </div>
                ) : (
                  <ul className="ddb-gis-content-list">
                    {gisContentLayers.map(layer => {
                      const ok = gisLayerCanImportToDashboard(layer)
                      const busy = addingLayerKey === `gis:${String(layer.id)}`
                      return (
                        <li key={String(layer.id)} className="ddb-gis-content-row">
                          <div className="ddb-gis-content-meta">
                            <span className="ddb-gis-content-name">{layer.name}</span>
                            <span className="ddb-gis-content-badges">
                              <span className="ddb-gis-badge">{layer.type}</span>
                              {layer.source ? <span className="ddb-gis-badge ddb-gis-badge--muted">{layer.source}</span> : null}
                            </span>
                            {!ok ? <span className="ddb-gis-content-note">{t.wmsNote}</span> : null}
                          </div>
                          <button
                            type="button"
                            className="ddb-gis-content-add-btn"
                            disabled={!ok || busy}
                            onClick={() => void importGisContentLayer(layer)}
                          >
                            {busy ? t.addingLabel : t.addBtn}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
                {discoverError ? (
                  <div className="gis-inline-error" role="alert" style={{ marginTop: 12 }}>
                    <i className="fa-solid fa-triangle-exclamation" aria-hidden />
                    <span>{discoverError}</span>
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                <div className="gis-modal-compact-tabs" role="tablist" aria-label={t.modalOptsLegend}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={addTab === 'arcgis'}
                    className={(addTab === 'arcgis' ? 'gis-compact-tab active' : 'gis-compact-tab') + ' gis-compact-tab--icon'}
                    title="ArcGIS Feature Service"
                    onClick={() => switchAddTab('arcgis')}
                  >
                    <i className="fa-solid fa-cloud" aria-hidden />
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={addTab === 'database'}
                    className={(addTab === 'database' ? 'gis-compact-tab active' : 'gis-compact-tab') + ' gis-compact-tab--icon'}
                    title="Database connection"
                    onClick={() => switchAddTab('database')}
                  >
                    <i className="fa-solid fa-database" aria-hidden />
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={addTab === 'upload'}
                    className={(addTab === 'upload' ? 'gis-compact-tab active' : 'gis-compact-tab') + ' gis-compact-tab--icon'}
                    title="Upload file"
                    onClick={() => switchAddTab('upload')}
                  >
                    <i className="fa-solid fa-file-arrow-up" aria-hidden />
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={addTab === 'url'}
                    className={(addTab === 'url' ? 'gis-compact-tab active' : 'gis-compact-tab') + ' gis-compact-tab--icon'}
                    title="URL or web data"
                    onClick={() => switchAddTab('url')}
                  >
                    <i className="fa-solid fa-globe" aria-hidden />
                  </button>
                </div>

                <div className="gis-modal-body">
                  {addTab === 'arcgis' ? (
                    <div role="tabpanel" aria-label="ArcGIS Feature Service">
                      <input
                        className="gis-input"
                        type="text"
                        value={serviceUrl}
                        onChange={e => setServiceUrl(e.target.value)}
                        placeholder={t.featurePh}
                        autoComplete="off"
                        inputMode="url"
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            void discoverArcGisLayers()
                          }
                        }}
                      />
                      <input
                        className="gis-input"
                        type="text"
                        value={arcgisToken}
                        onChange={e => setArcgisToken(e.target.value)}
                        placeholder={t.tokenPh}
                        autoComplete="off"
                      />
                      <button
                        className="gis-btn-outline"
                        type="button"
                        onClick={() => void discoverArcGisLayers()}
                        disabled={isDiscovering || serviceUrl.trim() === ''}
                      >
                        <i className="fa-solid fa-link" aria-hidden />
                        {isDiscovering ? ` ${t.connecting}` : ` ${t.connectDiscover}`}
                      </button>
                      {discoverError ? (
                        <div className="gis-inline-error" role="alert">
                          <i className="fa-solid fa-triangle-exclamation" aria-hidden />
                          <span>{discoverError}</span>
                        </div>
                      ) : null}
                      {discoveredLayers.length > 0 ? (
                        <div className="gis-discover-panel" aria-label={t.selectLayerLbl}>
                          <div className="gis-discover-meta">{t.foundLayers(discoveredLayers.length)}</div>
                          <div className="gis-form-field">
                            <div className="gis-form-label">{t.selectLayerLbl}</div>
                            <div className="gis-select-wrap">
                              <select
                                className="gis-input gis-select"
                                value={selectedDiscoveredUrl}
                                onChange={e => {
                                  const next = e.target.value
                                  setSelectedDiscoveredUrl(next)
                                  const found = discoveredLayers.find(d => d.url === next)
                                  if (found && !layerModalName.trim()) setLayerModalName(found.name)
                                }}
                              >
                                {discoveredLayers.map(l => (
                                  <option key={l.url} value={l.url}>
                                    {l.kind === 'table' ? `${l.name} (Table)` : l.geometryType ? `${l.name} (${l.geometryType})` : l.name}
                                  </option>
                                ))}
                              </select>
                              <i className="fa-solid fa-chevron-down" aria-hidden />
                            </div>
                          </div>
                          <input
                            className="gis-input"
                            type="text"
                            value={layerModalName}
                            onChange={e => setLayerModalName(e.target.value)}
                            placeholder={t.layerNamePh}
                          />
                          <div className="gis-discovered-row">
                            <button
                              className="gis-discovered-add"
                              type="button"
                              onClick={() => {
                                const found = discoveredLayers.find(d => d.url === selectedDiscoveredUrl)
                                if (found) void addArcGisLayerToRegistry(found)
                              }}
                              disabled={!selectedDiscoveredUrl || addingLayerKey === `arcgis:${selectedDiscoveredUrl}`}
                            >
                              {addingLayerKey === `arcgis:${selectedDiscoveredUrl}` ? t.addingLabel : t.addBtn}
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : addTab === 'database' ? (
                    <div role="tabpanel" aria-label="Database connection" className="ddb-hint" style={{ padding: '8px 0', lineHeight: 1.5 }}>
                      {t.dbTabBefore}
                      <strong>{t.dbTabStrong}</strong>
                      {t.dbTabAfter}
                    </div>
                  ) : addTab === 'upload' ? (
                    <div role="tabpanel" aria-label="Upload file">
                      <input
                        ref={addLayerFileInputRef}
                        type="file"
                        accept=".kml,.kmz,.zip,.geojson,.json,.csv"
                        hidden
                        onChange={e => setUploadFile(e.target.files?.[0] ?? null)}
                      />
                      <button type="button" className="gis-btn-outline" onClick={() => addLayerFileInputRef.current?.click()}>
                        <i className="fa-solid fa-folder-open" aria-hidden /> {t.chooseFileBtn}
                      </button>
                      {uploadFile ? <div className="ddb-hint" style={{ marginTop: 8 }}>{uploadFile.name}</div> : null}
                      <p className="ddb-hint" style={{ marginTop: 6, textAlign: ar ? 'right' : 'left' }}>
                        {t.csvUploadHint}
                      </p>
                      <input
                        className="gis-input"
                        style={{ marginTop: 10 }}
                        type="text"
                        value={layerModalName}
                        onChange={e => setLayerModalName(e.target.value)}
                        placeholder={t.layerNamePh}
                      />
                      <button
                        className="gis-btn-outline"
                        type="button"
                        style={{ marginTop: 10 }}
                        disabled={!uploadFile || !!addingLayerKey}
                        onClick={() => void addUploadLayerToRegistry()}
                      >
                        <i className="fa-solid fa-plus" aria-hidden /> {t.addToRegistry}
                      </button>
                      {discoverError ? (
                        <div className="gis-inline-error" role="alert" style={{ marginTop: 10 }}>
                          <i className="fa-solid fa-triangle-exclamation" aria-hidden />
                          <span>{discoverError}</span>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div role="tabpanel" aria-label="URL">
                      <input
                        className="gis-input"
                        type="url"
                        value={remoteDataUrl}
                        onChange={e => setRemoteDataUrl(e.target.value)}
                        placeholder={t.urlPh}
                        autoComplete="off"
                      />
                      <input
                        className="gis-input"
                        type="text"
                        value={layerModalName}
                        onChange={e => setLayerModalName(e.target.value)}
                        placeholder={t.layerNamePh}
                      />
                      <button
                        className="gis-btn-outline"
                        type="button"
                        disabled={!remoteDataUrl.trim() || !!addingLayerKey}
                        onClick={() => void addUrlLayerToRegistry()}
                      >
                        <i className="fa-solid fa-link" aria-hidden /> {t.addFromUrlBtn}
                      </button>
                      {discoverError ? (
                        <div className="gis-inline-error" role="alert" style={{ marginTop: 10 }}>
                          <i className="fa-solid fa-triangle-exclamation" aria-hidden />
                          <span>{discoverError}</span>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              </>
            )}

            <div
              className="gis-modal-footer"
              style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 16px', borderTop: '1px solid rgba(226,232,240,0.9)' }}
            >
              <button type="button" className="gis-btn" onClick={closeAddSourceModal}>
                {t.cancelBtn}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
