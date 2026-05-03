import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import Chart from 'chart.js/auto'
import type { Chart as ChartInstance, ChartConfiguration } from 'chart.js'
import { useLanguage } from '../../lib/i18n'
import { loadGisMapSavedLayers } from '../../lib/gisMapLayerStore'
import type { LayerData } from '../satellite/components/LayerManager'
import { parseFile, parseRemoteUrlAsFile } from '../../utils/FileLoader'
import './develop-dashboard.css'
import './agro-dashboard.css'
import {
  type AgroVizType,
  type FieldAxisRolesMap,
  type FieldChartSlot,
  VIZ_OPTIONS,
  buildSlotVisualization,
  rowsFromFeatureCollection,
  trimRows,
  DEFAULT_FIELD_CHART,
  coerceNumber,
} from './agroDashboardCharts'

const MO_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const
const MO_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'] as const

function zeros(n: number): number[] {
  return Array.from({ length: n }, () => 0)
}

const DATA = {
  all: { h: zeros(12), t: zeros(12) },
  q1: { h: zeros(3), t: zeros(3) },
  q2: { h: zeros(3), t: zeros(3) },
  q3: { h: zeros(3), t: zeros(3) },
  q4: { h: zeros(3), t: zeros(3) },
} as const

type QuarterKey = keyof typeof DATA

type AgroFieldRow = {
  n: string
  kg: number
  pct: number
  s: string
  sc: { background: string; color: string }
}

const FIELDS: readonly AgroFieldRow[] = []

type AgroActRow = { title: string; sub: string; t: string; c: string }

const ACTS: readonly AgroActRow[] = []

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

function newAgroSourceId() {
  return `src-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function agroFieldKey(sourceId: string, field: string) {
  return `${sourceId}|||${field}`
}

function parseAgroFieldKey(key: string): { sourceId: string; field: string } {
  const i = key.indexOf('|||')
  if (i === -1) return { sourceId: key, field: '' }
  return { sourceId: key.slice(0, i), field: key.slice(i + 3) }
}

function fieldsFromFeatureCollection(fc: GeoJSON.FeatureCollection): string[] {
  const f0 = fc.features[0]?.properties
  if (!f0 || typeof f0 !== 'object') return []
  return Object.keys(f0 as Record<string, unknown>)
}

type AgroSourceLayer = {
  id: string
  name: string
  fields: string[]
  kind: 'feature' | 'table'
  rows: Record<string, unknown>[]
}

function agroPlaceholderChartConfig(labels: string[]): ChartConfiguration {
  return {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          data: labels.map(() => 0),
          borderColor: '#e4e7ef',
          borderWidth: 2,
          tension: 0.35,
          pointRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: { ticks: { maxRotation: 0, font: { size: 9 } }, grid: { display: false } },
        y: { min: 0, max: 1, ticks: { display: false }, grid: { color: 'rgba(0,0,0,0.04)' } },
      },
    },
  }
}

const CHART_VIZ_OPTIONS = VIZ_OPTIONS.filter(o => o.id !== 'table' && o.id !== 'map')

/** OSM embed (Gulf region) — lightweight geographic preview without Mapbox token. */
const AGRO_MAP_EMBED_SRC =
  'https://www.openstreetmap.org/export/embed.html?bbox=50.2%2C22.4%2C56.8%2C26.6&layer=mapnik'

function AgroVizToolbar(props: {
  value: AgroVizType
  onChange: (v: AgroVizType) => void
  groupAriaLabel: string
  analysisTitle: string
  mapTitle: string
  tableTitle: string
}) {
  const { value, onChange, groupAriaLabel, analysisTitle, mapTitle, tableTitle } = props
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const clusterOptsId = useId()
  const analysisActive = value !== 'table' && value !== 'map'

  return (
    <div className="agdash-viz-toolbar" role="group" aria-label={groupAriaLabel}>
      <div className={`agdash-viz-cluster${analysisOpen ? ' agdash-viz-cluster--open' : ''}`}>
        <button
          type="button"
          className={`agdash-viz-cluster-toggle${analysisActive ? ' agdash-viz-btn--on' : ''}`}
          aria-expanded={analysisOpen}
          aria-controls={clusterOptsId}
          title={analysisTitle}
          onClick={() => setAnalysisOpen(o => !o)}
        >
          <i className="fa-solid fa-chart-column" aria-hidden />
          <i
            className={`fa-solid fa-chevron-down agdash-viz-cluster-chevron${analysisOpen ? ' agdash-viz-cluster-chevron--up' : ''}`}
            aria-hidden
          />
        </button>
        <div
          id={clusterOptsId}
          className={`agdash-viz-cluster-options${analysisOpen ? '' : ' agdash-viz-cluster-options--collapsed'}`}
          role="group"
          aria-label={analysisTitle}
        >
          {CHART_VIZ_OPTIONS.map(opt => (
            <button
              key={opt.id}
              type="button"
              title={opt.title}
              className={`agdash-viz-btn${value === opt.id ? ' agdash-viz-btn--on' : ''}`}
              onClick={() => {
                onChange(opt.id)
                setAnalysisOpen(false)
              }}
            >
              <i className={opt.icon} aria-hidden />
            </button>
          ))}
        </div>
        <span className="agdash-viz-cluster-divider" aria-hidden />
        <button
          type="button"
          title={mapTitle}
          aria-pressed={value === 'map'}
          className={`agdash-viz-btn agdash-viz-btn--mode${value === 'map' ? ' agdash-viz-btn--on' : ''}`}
          onClick={() => {
            onChange('map')
            setAnalysisOpen(false)
          }}
        >
          <span className="agdash-viz-mode-icon agdash-viz-mode-icon--map" aria-hidden>
            <i className="fa-solid fa-map agdash-viz-map-fold" />
            <i className="fa-solid fa-location-dot agdash-viz-map-pin" />
          </span>
          <span className="agdash-viz-mode-label">{mapTitle}</span>
        </button>
        <button
          type="button"
          title={tableTitle}
          aria-pressed={value === 'table'}
          className={`agdash-viz-btn agdash-viz-btn--mode${value === 'table' ? ' agdash-viz-btn--on' : ''}`}
          onClick={() => {
            onChange('table')
            setAnalysisOpen(false)
          }}
        >
          <i className="fa-solid fa-table-cells" aria-hidden />
          <span className="agdash-viz-mode-label">{tableTitle}</span>
        </button>
      </div>
    </div>
  )
}

function AgroMapPreview(props: { title: string; hint: string }) {
  const { title, hint } = props
  return (
    <div className="agdash-chart-map">
      <iframe
        title={title}
        src={AGRO_MAP_EMBED_SRC}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="agdash-chart-map-frame"
      />
      <p className="agdash-map-hint">{hint}</p>
    </div>
  )
}

export default function AgroDashboard() {
  const { language, direction } = useLanguage()
  const ar = language === 'ar'

  const t = useMemo(
    () =>
      ar
        ? {
            srTitle: 'لوحة تحليلات زراعية — مؤشرات، رسوم، جدول حقول، ونشاط',
            brand: 'جيو',
            brandBold: 'داش',
            nav: ['نظرة عامة', 'عرض الخريطة', 'التقارير', 'المصادر'],
            dataset: [{ v: 'default', l: 'مجموعة البيانات' }],
            emptyTable: 'لا صفوف بعد. اربط مصدر بيانات لعرض الحقول.',
            emptyActivity: 'لا يوجد نشاط بعد.',
            pieNoData: 'لا توجد بيانات توزيع بعد',
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
            wfModalTitle: 'إعداد الطبقات والحقول',
            wfModalOpenBtn: 'طبقات وحقول',
            wfModalOpenBtnTitle: 'فتح نافذة إضافة الطبقات واختيار الحقول للمساحات والرسوم',
            wfModalDone: 'تم',
            wfModalCloseAria: 'إغلاق النافذة',
            wfSummary: (layers: number, fields: number) => `${layers} طبقة · ${fields} حقل`,
            wfPanelLayerTitle: 'اختيار الطبقات للوحة',
            wfPanelLayerEmpty: 'لم تُضف طبقات بعد. استخدم «إضافة مصدر» في الشريط العلوي لاستيراد طبقة من GIS أو ملف أو خدمة.',
            wfPanelLayerPickHint: 'فعّل الطبقات التي تريد عرضها في لوحة التحكم والرسوم.',
            wfPanelSelectTitle: 'اختيار الحقول حسب الطبقة',
            wfPanelSelectEmpty: 'لا توجد حقول حتى تُضاف طبقة تحتوي على جدول سمات أو أعمدة.',
            wfPanelSelectNeedLayers: 'فعّل طبقة واحدة على الأقل في قائمة الطبقات أعلاه لاختيار الحقول.',
            fieldPickerHint: 'اضغط طبقة لفتح قائمة الحقول في طبقة عائمة دون توسيع الصفحة.',
            fieldPickerMenuTitle: (name: string) => `حقول: ${name}`,
            fieldSearchLabel: 'بحث في الحقول',
            fieldSearchPlaceholder: 'ابحث باسم الحقل…',
            fieldSearchNoMatch: 'لا توجد حقول مطابقة للبحث.',
            fieldsBadge: (sel: number, tot: number) => `${sel}/${tot}`,
            wfPanelPinSubtitle: 'تعيين الحقول للرسوم',
            wfFieldsTablistAria: 'خطوات اختيار الحقول وتعيين الرسوم',
            wfTabStep: (cur: number, tot: number) => `الخطوة ${cur} من ${tot}`,
            wfTabFields: 'الحقول',
            wfTabCharts: 'تعيين الرسوم',
            wfTabNextCharts: 'التالي: تعيين الرسوم ←',
            wfTabBackFields: '→ السابق: الحقول',
            wfPanelsTitle: 'لوحات العرض',
            wfPanelsSub: 'أين يظهر هذا الحقل على اللوحة؟',
            wfChartColumnsTitle: 'أعمدة الرسم (X · Y · القيمة)',
            wfChartColumnsHint:
              'اختر من الحقول التي فعّلتها في التبويب السابق. لأنواع الأعمدة والخط والمساحة والشريط، يفضّل أن يكون المحور X وحقول القيمة/المحور Y من نفس الطبقة. نوع الرسم يُختار من شريط أدوات كل بطاقة في اللوحة.',
            wfChartsTabEmpty: 'لم تُختر حقول بعد. ارجع إلى تبويب «الحقول» وفعّل الحقول المطلوبة.',
            chartEmpty: 'اختر حقولاً وفعّل اللوحات وأنواع الرسوم في نافذة «طبقات وحقول».',
            wfAssignCharts: 'أي أنواع رسوم تستخدم هذا الحقل؟',
            wfAxisTitle: 'المحاور والقيمة والوسيلة',
            wfAxisHint:
              'للأعمدة، الخط، المساحة، الانتشار، الفقاعات، والشريط (أفقي/عمودي): عيّن دور كل حقل. المحور X عادةً فئات؛ القيمة/المحور Y أرقام؛ الوسيلة تلوّن النقاط أو الأعمدة.',
            wfAxisNone: 'بدون',
            wfAxisX: 'المحور X',
            wfAxisY: 'المحور Y',
            wfAxisValue: 'القيمة',
            wfAxisLegend: 'الوسيلة',
            slotMain: 'رئيسي',
            slotPie: 'دائرة',
            slotBot: 'خط',
            chartTypesAria: 'عرض الرسم أو الخريطة أو الجدول',
            vizAnalysisTitle: 'تحليل — اختر نوع الرسم',
            vizMapTitle: 'خريطة',
            vizTableTitle: 'جدول',
            mapEmbedTitle: 'معاينة خريطة جغرافية',
            mapViewPill: 'عرض الخريطة',
            mapHint: 'خريطة مرجعية (OpenStreetMap). للطبقات والتحرير المكاني استخدم خريطة GIS من التطبيق.',
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
            kpi3Val: '0 كغ',
            chartMainAria: 'رسم الحصاد الشهري',
            chartPieAria: 'رسم التوزيع حسب المنطقة',
            chartLineAria: 'رسم الإنتاج مقابل المطر',
            topFields: 'أعلى الحقول',
            topFieldsSub: 'حسب حجم الإخراج',
            activity: 'نشاط حديث',
            activitySub: 'تحديثات مباشرة',
            tblField: 'حقل',
            tblKg: 'كغ',
            tblProg: 'التقدم',
            tblStatus: 'الحالة',
            analyze: 'تحليل ↗',
            legHarvest: 'الحصاد (كغ)',
            legTarget: 'الهدف',
            legYield: 'مؤشر الإنتاج',
            legRain: 'المطر (مم)',
          }
        : {
            srTitle: 'Agro analytics dashboard — KPI cards, charts, field table, and activity feed',
            brand: 'Geo',
            brandBold: 'Dash',
            nav: ['Overview', 'Map view', 'Reports', 'Sources'],
            dataset: [{ v: 'default', l: 'Dataset' }],
            emptyTable: 'No rows yet. Connect a data source to show fields.',
            emptyActivity: 'No activity yet.',
            pieNoData: 'No distribution data yet',
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
            wfModalTitle: 'Layers & fields setup',
            wfModalOpenBtn: 'Layers & fields',
            wfModalOpenBtnTitle: 'Open dialog to add layers and select fields for areas and charts',
            wfModalDone: 'Done',
            wfModalCloseAria: 'Close dialog',
            wfSummary: (layers: number, fields: number) => `${layers} layer(s) · ${fields} field(s)`,
            wfPanelLayerTitle: 'Choose layers for the dashboard',
            wfPanelLayerEmpty: 'No layers yet. Use Add source in the top bar to import from GIS, a file, or a service.',
            wfPanelLayerPickHint: 'Turn on the layers you want to show on the dashboard and in charts.',
            wfPanelSelectTitle: 'Select fields by layer',
            wfPanelSelectEmpty: 'No fields until you add a layer with attribute columns.',
            wfPanelSelectNeedLayers: 'Turn on at least one layer in the layer list above to select fields.',
            fieldPickerHint: 'Click a layer to open its fields in a compact overlay — keeps the layout tidy.',
            fieldPickerMenuTitle: (name: string) => `Fields — ${name}`,
            fieldSearchLabel: 'Search fields',
            fieldSearchPlaceholder: 'Filter by field name…',
            fieldSearchNoMatch: 'No fields match your search.',
            fieldsBadge: (sel: number, tot: number) => `${sel} / ${tot}`,
            wfPanelPinSubtitle: 'Chart assignments',
            wfFieldsTablistAria: 'Fields and chart assignment steps',
            wfTabStep: (cur: number, tot: number) => `Step ${cur} of ${tot}`,
            wfTabFields: 'Fields',
            wfTabCharts: 'Chart assignments',
            wfTabNextCharts: 'Next: chart assignments →',
            wfTabBackFields: '← Back: fields',
            wfPanelsTitle: 'Dashboard panels',
            wfPanelsSub: 'Where should this field appear?',
            wfChartColumnsTitle: 'Chart columns (X · Y · Value)',
            wfChartColumnsHint:
              'Pick from the fields you checked in the previous tab. For bar, line, area, and similar charts, X and value (and optional Y) should normally come from the same layer. Choose chart type on each card toolbar on the dashboard.',
            wfChartsTabEmpty: 'No fields selected yet. Open the Fields tab and check the columns you need.',
            chartEmpty: 'Select fields and enable panels / chart types in Layers & fields.',
            wfAssignCharts: 'Which chart types use this field?',
            wfAxisTitle: 'X-Axis · Y-Axis · Value · Legend',
            wfAxisHint:
              'For column, line, area, scatter, bubble, and bar charts: assign how this field is used. X is usually categories; Value / Y are numeric measures; Legend drives point or bar colors.',
            wfAxisNone: 'None',
            wfAxisX: 'X-Axis',
            wfAxisY: 'Y-Axis',
            wfAxisValue: 'Value',
            wfAxisLegend: 'Legend',
            slotMain: 'Main',
            slotPie: 'Pie',
            slotBot: 'Line',
            chartTypesAria: 'Chart, map, or table view',
            vizAnalysisTitle: 'Analysis — choose a chart type',
            vizMapTitle: 'Map',
            vizTableTitle: 'Table',
            mapEmbedTitle: 'Geographic map preview',
            mapViewPill: 'Map view',
            mapHint: 'Reference map (OpenStreetMap). Use GIS Map in the app for full spatial layers and editing.',
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
            kpi3Val: '0 kg',
            chartMainAria: 'Monthly harvest chart',
            chartPieAria: 'Regional distribution chart',
            chartLineAria: 'Yield versus rainfall chart',
            topFields: 'Top fields',
            topFieldsSub: 'By output volume',
            activity: 'Recent activity',
            activitySub: 'Live updates',
            tblField: 'Field',
            tblKg: 'Kg',
            tblProg: 'Progress',
            tblStatus: 'Status',
            analyze: 'Analyze ↗',
            legHarvest: 'Harvest (kg)',
            legTarget: 'Target',
            legYield: 'Yield index',
            legRain: 'Rainfall (mm)',
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
  const [addSourceOpen, setAddSourceOpen] = useState(false)
  const [wfModalOpen, setWfModalOpen] = useState(false)
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
  const [agroSources, setAgroSources] = useState<AgroSourceLayer[]>([])
  /** Layer IDs included on the dashboard (charts / KPIs). */
  const [dashboardLayerIds, setDashboardLayerIds] = useState<string[]>([])
  const [includedFieldKeys, setIncludedFieldKeys] = useState<string[]>([])
  const [pinnedFieldKeys, setPinnedFieldKeys] = useState<string[]>([])
  const [homePick, setHomePick] = useState<'gis' | 'arcgis' | 'upload' | 'getdata'>('gis')
  const addLayerFileInputRef = useRef<HTMLInputElement | null>(null)
  const [vizMain, setVizMain] = useState<AgroVizType>('bar')
  const [vizPie, setVizPie] = useState<AgroVizType>('doughnut')
  const [vizBot, setVizBot] = useState<AgroVizType>('line')
  const [fieldChartPlacement, setFieldChartPlacement] = useState<Record<string, FieldChartSlot>>({})
  const [quarter, setQuarter] = useState<QuarterKey>('all')
  /** Per-layer field name filter in the Layers & fields modal (opt-in selection; search narrows the list). */
  const [wfFieldFilterBySource, setWfFieldFilterBySource] = useState<Record<string, string>>({})
  const wfFieldSearchId = useId()
  const wfFieldsTabIds = useId()
  const [wfFieldsTab, setWfFieldsTab] = useState<'fields' | 'charts'>('fields')
  /** Optional filter: field included in a slot only when the card viz matches one of these types. */
  const [fieldChartStyles, setFieldChartStyles] = useState<Record<string, AgroVizType[]>>({})
  /** Optional X / Y / Value / Legend mapping for cartesian chart types (see agroDashboardCharts). */
  const [fieldChartAxisRoles, setFieldChartAxisRoles] = useState<FieldAxisRolesMap>({})

  useEffect(() => {
    const valid = new Set(agroSources.map(s => s.id))
    setDashboardLayerIds(prev => prev.filter(id => valid.has(id)))
    setIncludedFieldKeys(prev => prev.filter(k => valid.has(parseAgroFieldKey(k).sourceId)))
    setWfFieldFilterBySource(prev => {
      const next: Record<string, string> = {}
      for (const id of valid) {
        if (prev[id] !== undefined) next[id] = prev[id]!
      }
      return next
    })
  }, [agroSources])

  useEffect(() => {
    if (!wfModalOpen) {
      setWfFieldFilterBySource({})
      setWfFieldsTab('fields')
    }
  }, [wfModalOpen])

  useEffect(() => {
    const valid = new Set(pinnedFieldKeys)
    setFieldChartStyles(prev => {
      const next = { ...prev }
      for (const k of Object.keys(next)) {
        if (!valid.has(k)) delete next[k]
      }
      return next
    })
  }, [pinnedFieldKeys])

  useEffect(() => {
    const valid = new Set(pinnedFieldKeys)
    setFieldChartAxisRoles(prev => {
      const next = { ...prev }
      for (const k of Object.keys(next)) {
        if (!valid.has(k)) delete next[k]
      }
      return next
    })
  }, [pinnedFieldKeys])

  useEffect(() => {
    setFieldChartPlacement(prev => {
      const next: Record<string, FieldChartSlot> = {}
      for (const k of pinnedFieldKeys) {
        next[k] = prev[k] ? { ...prev[k]! } : { ...DEFAULT_FIELD_CHART }
      }
      return next
    })
  }, [pinnedFieldKeys])

  const agroSourcesOnDashboard = useMemo(
    () => agroSources.filter(s => dashboardLayerIds.includes(s.id)),
    [agroSources, dashboardLayerIds],
  )

  const pinnedFieldKeysOnDashboard = useMemo(
    () =>
      pinnedFieldKeys.filter(k => {
        const { sourceId } = parseAgroFieldKey(k)
        return dashboardLayerIds.includes(sourceId)
      }),
    [pinnedFieldKeys, dashboardLayerIds],
  )

  const includedFieldKeysOnDashboard = useMemo(
    () =>
      includedFieldKeys.filter(k => {
        const { sourceId } = parseAgroFieldKey(k)
        return dashboardLayerIds.includes(sourceId)
      }),
    [includedFieldKeys, dashboardLayerIds],
  )

  const kpi1 = useMemo(() => {
    const keys = pinnedFieldKeysOnDashboard.filter(k => (fieldChartPlacement[k] ?? DEFAULT_FIELD_CHART).main)
    if (!keys.length) return '0'
    const key = keys[0]!
    const { sourceId, field } = parseAgroFieldKey(key)
    const L = agroSourcesOnDashboard.find(s => s.id === sourceId)
    if (!L || !field) return '0'
    let s = 0
    for (const r of L.rows) {
      const n = coerceNumber(r[field])
      if (n !== null) s += n
    }
    if (!Number.isFinite(s)) return '0'
    const abs = Math.abs(s)
    return abs >= 1000 ? `${(s / 1000).toFixed(1)}k` : String(Math.round(s))
  }, [pinnedFieldKeysOnDashboard, fieldChartPlacement, agroSourcesOnDashboard])

  const kpi2 = useMemo(() => String(includedFieldKeysOnDashboard.length), [includedFieldKeysOnDashboard.length])

  const mainCanvasRef = useRef<HTMLCanvasElement>(null)
  const pieCanvasRef = useRef<HTMLCanvasElement>(null)
  const lineCanvasRef = useRef<HTMLCanvasElement>(null)
  const mainChartRef = useRef<ChartInstance | null>(null)
  const pieChartRef = useRef<ChartInstance | null>(null)
  const lineChartRef = useRef<ChartInstance | null>(null)

  const mainSlot = useMemo(
    () =>
      buildSlotVisualization(
        'main',
        vizMain,
        pinnedFieldKeysOnDashboard,
        fieldChartPlacement,
        agroSourcesOnDashboard,
        t.chartEmpty,
        fieldChartStyles,
        fieldChartAxisRoles,
      ),
    [
      vizMain,
      pinnedFieldKeysOnDashboard,
      fieldChartPlacement,
      agroSourcesOnDashboard,
      t.chartEmpty,
      fieldChartStyles,
      fieldChartAxisRoles,
    ],
  )
  const pieSlot = useMemo(
    () =>
      buildSlotVisualization(
        'pie',
        vizPie,
        pinnedFieldKeysOnDashboard,
        fieldChartPlacement,
        agroSourcesOnDashboard,
        t.pieNoData,
        fieldChartStyles,
        fieldChartAxisRoles,
      ),
    [
      vizPie,
      pinnedFieldKeysOnDashboard,
      fieldChartPlacement,
      agroSourcesOnDashboard,
      t.pieNoData,
      fieldChartStyles,
      fieldChartAxisRoles,
    ],
  )
  const botSlot = useMemo(
    () =>
      buildSlotVisualization(
        'bot',
        vizBot,
        pinnedFieldKeysOnDashboard,
        fieldChartPlacement,
        agroSourcesOnDashboard,
        t.chartEmpty,
        fieldChartStyles,
        fieldChartAxisRoles,
      ),
    [
      vizBot,
      pinnedFieldKeysOnDashboard,
      fieldChartPlacement,
      agroSourcesOnDashboard,
      t.chartEmpty,
      fieldChartStyles,
      fieldChartAxisRoles,
    ],
  )

  useEffect(() => {
    mainChartRef.current?.destroy()
    mainChartRef.current = null
    const canvas = mainCanvasRef.current
    if (!canvas || vizMain === 'table' || vizMain === 'map') return
    if (mainSlot.kind === 'chart') {
      mainChartRef.current = new Chart(canvas, mainSlot.config)
    } else if (mainSlot.kind === 'empty') {
      mainChartRef.current = new Chart(canvas, agroPlaceholderChartConfig([...MO]))
    }
    return () => {
      mainChartRef.current?.destroy()
      mainChartRef.current = null
    }
  }, [mainSlot, vizMain, MO])

  useEffect(() => {
    pieChartRef.current?.destroy()
    pieChartRef.current = null
    const canvas = pieCanvasRef.current
    if (!canvas || vizPie === 'table' || vizPie === 'map') return
    if (pieSlot.kind === 'chart') {
      pieChartRef.current = new Chart(canvas, pieSlot.config)
    } else if (pieSlot.kind === 'empty') {
      pieChartRef.current = new Chart(canvas, agroPlaceholderChartConfig([...MO].slice(0, 6)))
    }
    return () => {
      pieChartRef.current?.destroy()
      pieChartRef.current = null
    }
  }, [pieSlot, vizPie, MO])

  useEffect(() => {
    lineChartRef.current?.destroy()
    lineChartRef.current = null
    const canvas = lineCanvasRef.current
    if (!canvas || vizBot === 'table' || vizBot === 'map') return
    if (botSlot.kind === 'chart') {
      lineChartRef.current = new Chart(canvas, botSlot.config)
    } else if (botSlot.kind === 'empty') {
      lineChartRef.current = new Chart(canvas, agroPlaceholderChartConfig([...MO]))
    }
    return () => {
      lineChartRef.current?.destroy()
      lineChartRef.current = null
    }
  }, [botSlot, vizBot, MO])

  useEffect(() => {
    if (vizMain !== 'map') return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [vizMain])

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

  const registerAgroSource = useCallback(
    (layer: AgroSourceLayer) => {
      setAgroSources(prev => [...prev, layer])
      setDashboardLayerIds(prev => (prev.includes(layer.id) ? prev : [...prev, layer.id]))
      closeAddSourceModal()
      setWfModalOpen(true)
    },
    [closeAddSourceModal],
  )

  const closeWfModal = useCallback(() => setWfModalOpen(false), [])

  const toggleDashboardLayer = useCallback((sourceId: string, checked: boolean) => {
    if (checked) {
      setDashboardLayerIds(prev => (prev.includes(sourceId) ? prev : [...prev, sourceId]))
    } else {
      setDashboardLayerIds(prev => prev.filter(id => id !== sourceId))
      setIncludedFieldKeys(prev => prev.filter(k => parseAgroFieldKey(k).sourceId !== sourceId))
    }
  }, [])

  const toggleIncludedFieldKey = useCallback((key: string) => {
    setIncludedFieldKeys(prev => {
      const on = prev.includes(key)
      return on ? prev.filter(k => k !== key) : [...prev, key]
    })
  }, [])

  useEffect(() => {
    setPinnedFieldKeys(includedFieldKeys)
  }, [includedFieldKeys])

  const orderedIncludedPinKeys = useMemo(() => {
    const set = new Set(includedFieldKeys)
    const out: string[] = []
    for (const src of agroSources) {
      if (!dashboardLayerIds.includes(src.id)) continue
      for (const f of src.fields) {
        const k = agroFieldKey(src.id, f)
        if (set.has(k)) out.push(k)
      }
    }
    return out
  }, [agroSources, includedFieldKeys, dashboardLayerIds])

  const toggleFieldChartSlot = useCallback((key: string, slot: keyof FieldChartSlot) => {
    setFieldChartPlacement(prev => {
      const cur = prev[key] ?? { ...DEFAULT_FIELD_CHART }
      return { ...prev, [key]: { ...cur, [slot]: !cur[slot] } }
    })
  }, [])

  /** One field per axis role: X / Y / Value, chosen from included fields (chart tab). */
  const assignAxisBindingField = useCallback((role: 'x' | 'y' | 'value', targetKey: string) => {
    setFieldChartAxisRoles(prev => {
      const next = { ...prev }
      for (const k of Object.keys(next)) {
        if (next[k] === role) delete next[k]
      }
      if (targetKey) next[targetKey] = role
      return next
    })
  }, [])

  const labelIncludedFieldKey = useCallback(
    (k: string) => {
      const { sourceId, field } = parseAgroFieldKey(k)
      const src = agroSources.find(s => s.id === sourceId)
      return src && field ? `${src.name} — ${field}` : field || k
    },
    [agroSources],
  )

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

  useEffect(() => {
    if (!wfModalOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeWfModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [wfModalOpen, closeWfModal])

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
        let outKind: 'feature' | 'table' = 'feature'

        if (isFeatureCollection(layer.data)) {
          data = layer.data
          if (data.features.length === 0) throw new Error('Layer has no features.')
        } else if (layer.url && layer.source === 'arcgis') {
          const def = layer.arcgisLayerDefinition
          const isTable = def?.type === 'table' || String(def?.type || '').toLowerCase() === 'table'
          outKind = isTable ? 'table' : 'feature'
          const kind: 'layer' | 'table' = isTable ? 'table' : 'layer'
          const token = layer.authToken || ''
          data = await fetchArcGisFeatureCollection(layer.url, token, kind)
        } else {
          throw new Error('Unsupported layer format for this dashboard.')
        }

        const fields = fieldsFromFeatureCollection(data)
        const rows = rowsFromFeatureCollection(data)
        registerAgroSource({
          id: newAgroSourceId(),
          name: displayName,
          fields,
          kind: outKind,
          rows,
        })
      } catch (e: unknown) {
        setDiscoverError(e instanceof Error ? e.message : 'Failed to add layer from GIS Content.')
      } finally {
        setAddingLayerKey(null)
      }
    },
    [registerAgroSource],
  )

  const addArcGisLayerToRegistry = useCallback(
    async (l: DiscoveredArcLayer) => {
      const opKey = `arcgis:${l.url}`
      setAddingLayerKey(opKey)
      setDiscoverError(null)
      try {
        const data = await fetchArcGisFeatureCollection(l.url, arcgisToken, l.kind)
        const displayName = layerModalName.trim() || l.name
        if (!data.features.length) throw new Error('Layer has no rows or features.')
        const fields = fieldsFromFeatureCollection(data)
        const rows = rowsFromFeatureCollection(data)
        registerAgroSource({
          id: newAgroSourceId(),
          name: displayName,
          fields,
          kind: l.kind === 'table' ? 'table' : 'feature',
          rows,
        })
      } catch (e: unknown) {
        setDiscoverError(e instanceof Error ? e.message : 'Failed to add layer.')
      } finally {
        setAddingLayerKey(null)
      }
    },
    [arcgisToken, layerModalName, registerAgroSource],
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
        registerAgroSource({
          id: newAgroSourceId(),
          name: displayName,
          fields: columns,
          kind: 'table',
          rows: trimRows(rows),
        })
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
      const fields = fieldsFromFeatureCollection(fc)
      const rows = rowsFromFeatureCollection(fc)
      registerAgroSource({
        id: newAgroSourceId(),
        name: displayName,
        fields,
        kind: 'feature',
        rows,
      })
    } catch (e: unknown) {
      setDiscoverError(e instanceof Error ? e.message : 'Failed to import file.')
    } finally {
      setAddingLayerKey(null)
    }
  }, [uploadFile, layerModalName, registerAgroSource])

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
      const fields = fieldsFromFeatureCollection(fc)
      const rows = rowsFromFeatureCollection(fc)
      registerAgroSource({
        id: newAgroSourceId(),
        name: displayName,
        fields,
        kind: 'feature',
        rows,
      })
    } catch (e: unknown) {
      setDiscoverError(e instanceof Error ? e.message : 'Failed to import from URL.')
    } finally {
      setAddingLayerKey(null)
    }
  }, [remoteDataUrl, layerModalName, registerAgroSource])

  const mapFullPage = vizMain === 'map'

  return (
    <div
      className={`page${mapFullPage ? ' page-tight' : ''} agro-dash-root${mapFullPage ? ' agro-dash-root--map-fullpage' : ''}`}
      dir={direction}
    >
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
            <select className="agdash-nav-sel" aria-label={ar ? 'مجموعة البيانات' : 'Dataset'} defaultValue="default">
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
                setWfModalOpen(false)
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
            <div className="agdash-nav-wf-tools">
              <button
                type="button"
                className="agdash-wf-open-btn"
                onClick={() => setWfModalOpen(true)}
                title={t.wfModalOpenBtnTitle}
              >
                <i className="fa-solid fa-layer-group" aria-hidden />
                <span>{t.wfModalOpenBtn}</span>
              </button>
              <span className="agdash-wf-toolbar-summary">
                {t.wfSummary(dashboardLayerIds.length, includedFieldKeysOnDashboard.length)}
              </span>
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
        </nav>

        <div className={`agdash-body${mapFullPage ? ' agdash-body--map-full' : ''}`}>
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
              </div>
              <div className="agdash-kpi-val">{kpi1}</div>
              <div className="agdash-kpi-lbl">{t.kpi1}</div>
              <div className="agdash-kpi-bar">
                <div className="agdash-kpi-fill" style={{ width: '0%', background: 'var(--agdash-accent)' }} />
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
              </div>
              <div className="agdash-kpi-val">{kpi2}</div>
              <div className="agdash-kpi-lbl">{t.kpi2}</div>
              <div className="agdash-kpi-bar">
                <div
                  className="agdash-kpi-fill"
                  style={{
                    width: includedFieldKeysOnDashboard.length
                      ? `${Math.min(100, includedFieldKeysOnDashboard.length * 8)}%`
                      : '0%',
                    background: 'var(--agdash-teal)',
                  }}
                />
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
              </div>
              <div className="agdash-kpi-val">{t.kpi3Val}</div>
              <div className="agdash-kpi-lbl">{t.kpi3}</div>
              <div className="agdash-kpi-bar">
                <div className="agdash-kpi-fill" style={{ width: '0%', background: 'var(--agdash-amber)' }} />
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
              </div>
              <div className="agdash-kpi-val">{dashboardLayerIds.length}</div>
              <div className="agdash-kpi-lbl">{t.kpi4}</div>
              <div className="agdash-kpi-bar">
                <div
                  className="agdash-kpi-fill"
                  style={{
                    width: dashboardLayerIds.length ? `${Math.min(100, dashboardLayerIds.length * 20)}%` : '0%',
                    background: 'var(--agdash-violet)',
                  }}
                />
              </div>
            </div>
          </div>

          <div className="agdash-mid">
            <div className={`agdash-card agdash-card--viz${mapFullPage ? ' agdash-card--map-hero' : ''}`}>
              <div className="agdash-ch agdash-ch--headless">
                <div className="agdash-ch-tools agdash-ch-tools--viz">
                  <AgroVizToolbar
                    value={vizMain}
                    onChange={setVizMain}
                    groupAriaLabel={t.chartTypesAria}
                    analysisTitle={t.vizAnalysisTitle}
                    mapTitle={t.vizMapTitle}
                    tableTitle={t.vizTableTitle}
                  />
                  {mapFullPage ? (
                    <span className="agdash-map-view-pill" role="status">
                      {t.mapViewPill}
                    </span>
                  ) : null}
                  <button type="button" className="agdash-action-link">
                    {t.analyze}
                  </button>
                </div>
              </div>
              <div className={`agdash-chart-wrap${mapFullPage ? ' agdash-chart-wrap--map-full' : ''}`}>
                {vizMain === 'map' || mainSlot.kind === 'map' ? (
                  <AgroMapPreview title={t.mapEmbedTitle} hint={t.mapHint} />
                ) : vizMain === 'table' && mainSlot.kind === 'table' ? (
                  <div className="agdash-mini-table-scroll">
                    <table className="agdash-mini-table">
                      <thead>
                        <tr>
                          {mainSlot.columns.map(c => (
                            <th key={c}>{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {mainSlot.rows.map((r, i) => (
                          <tr key={i}>
                            {mainSlot.columns.map(c => (
                              <td key={c}>{String(r[c] ?? '')}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : vizMain === 'table' ? (
                  <div className="agdash-chart-fallback agdash-li--muted">
                    {mainSlot.kind === 'empty' ? mainSlot.message : t.chartEmpty}
                  </div>
                ) : (
                  <canvas ref={mainCanvasRef} role="img" aria-label={t.chartMainAria} />
                )}
              </div>
              {mainSlot.kind === 'empty' && vizMain !== 'table' && vizMain !== 'map' ? (
                <div className="agdash-leg">
                  <div className="agdash-li agdash-li--muted">{mainSlot.message}</div>
                </div>
              ) : null}
            </div>

            <div className="agdash-card agdash-card--viz">
              <div className="agdash-ch agdash-ch--headless">
                <div className="agdash-ch-tools agdash-ch-tools--viz agdash-ch-tools--col">
                  <AgroVizToolbar
                    value={vizPie}
                    onChange={setVizPie}
                    groupAriaLabel={t.chartTypesAria}
                    analysisTitle={t.vizAnalysisTitle}
                    mapTitle={t.vizMapTitle}
                    tableTitle={t.vizTableTitle}
                  />
                </div>
              </div>
              <div className="agdash-chart-wrap agdash-chart-sm">
                {vizPie === 'map' || pieSlot.kind === 'map' ? (
                  <AgroMapPreview title={t.mapEmbedTitle} hint={t.mapHint} />
                ) : vizPie === 'table' && pieSlot.kind === 'table' ? (
                  <div className="agdash-mini-table-scroll">
                    <table className="agdash-mini-table">
                      <thead>
                        <tr>
                          {pieSlot.columns.map(c => (
                            <th key={c}>{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pieSlot.rows.map((r, i) => (
                          <tr key={i}>
                            {pieSlot.columns.map(c => (
                              <td key={c}>{String(r[c] ?? '')}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : vizPie === 'table' ? (
                  <div className="agdash-chart-fallback agdash-li--muted">
                    {pieSlot.kind === 'empty' ? pieSlot.message : t.chartEmpty}
                  </div>
                ) : (
                  <canvas ref={pieCanvasRef} role="img" aria-label={t.chartPieAria} />
                )}
              </div>
              {pieSlot.kind === 'empty' && vizPie !== 'table' && vizPie !== 'map' ? (
                <div className="agdash-leg" style={{ justifyContent: 'center' }}>
                  <div className="agdash-li agdash-li--muted">{pieSlot.message}</div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="agdash-bot">
            <div className="agdash-card agdash-card--viz">
              <div className="agdash-ch agdash-ch--headless">
                <div className="agdash-ch-tools agdash-ch-tools--viz agdash-ch-tools--line">
                  <AgroVizToolbar
                    value={vizBot}
                    onChange={setVizBot}
                    groupAriaLabel={t.chartTypesAria}
                    analysisTitle={t.vizAnalysisTitle}
                    mapTitle={t.vizMapTitle}
                    tableTitle={t.vizTableTitle}
                  />
                  <button type="button" className="agdash-action-link">
                    {t.analyze}
                  </button>
                </div>
              </div>
              <div className="agdash-chart-wrap agdash-chart-xs">
                {vizBot === 'map' || botSlot.kind === 'map' ? (
                  <AgroMapPreview title={t.mapEmbedTitle} hint={t.mapHint} />
                ) : vizBot === 'table' && botSlot.kind === 'table' ? (
                  <div className="agdash-mini-table-scroll">
                    <table className="agdash-mini-table">
                      <thead>
                        <tr>
                          {botSlot.columns.map(c => (
                            <th key={c}>{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {botSlot.rows.map((r, i) => (
                          <tr key={i}>
                            {botSlot.columns.map(c => (
                              <td key={c}>{String(r[c] ?? '')}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : vizBot === 'table' ? (
                  <div className="agdash-chart-fallback agdash-li--muted">
                    {botSlot.kind === 'empty' ? botSlot.message : t.chartEmpty}
                  </div>
                ) : (
                  <canvas ref={lineCanvasRef} role="img" aria-label={t.chartLineAria} />
                )}
              </div>
              {botSlot.kind === 'empty' && vizBot !== 'table' && vizBot !== 'map' ? (
                <div className="agdash-leg" style={{ marginTop: 10 }}>
                  <div className="agdash-li agdash-li--muted">{botSlot.message}</div>
                </div>
              ) : null}
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
                  {FIELDS.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="agdash-empty-td">
                        {t.emptyTable}
                      </td>
                    </tr>
                  ) : (
                    FIELDS.map(f => (
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
                    ))
                  )}
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
                {ACTS.length === 0 ? (
                  <p className="agdash-empty-act">{t.emptyActivity}</p>
                ) : (
                  ACTS.map(a => (
                    <div key={a.title} className="agdash-feed-item">
                      <div className="agdash-feed-dot" style={{ background: a.c }} />
                      <div>
                        <div className="agdash-feed-main">{a.title}</div>
                        <div className="agdash-feed-sub">
                          {a.sub} · {a.t}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {wfModalOpen ? (
        <div className="gis-modal-overlay agdash-wf-modal-overlay" role="presentation" onClick={closeWfModal}>
          <div
            className="gis-modal agdash-wf-modal-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="agdash-wf-modal-title"
            onClick={e => e.stopPropagation()}
          >
            <div className="agdash-wf-modal-head">
              <h2 id="agdash-wf-modal-title" className="agdash-wf-modal-title">
                {t.wfModalTitle}
              </h2>
              <button
                type="button"
                className="agdash-wf-modal-close"
                onClick={closeWfModal}
                aria-label={t.wfModalCloseAria}
              >
                <i className="fa-solid fa-xmark" aria-hidden />
              </button>
            </div>
            <div className="agdash-wf-modal-body">
              <div className="agro-dash-root agdash-wf-modal-scoped" dir={direction}>
                <div className="agdash-wf-panel agdash-wf-panel--select-fields" role="region" aria-labelledby="agdash-wf-panel-title">
                  <div className="agdash-wf-panel-head">
                    <h3 id="agdash-wf-panel-title" className="agdash-wf-panel-title">
                      {t.wfModalTitle}
                    </h3>
                  </div>
                  <div className="agdash-wf-panel-body agdash-wf-panel-body--select-fields agdash-wf-panel-body--combined">
                    <div className="agdash-wf-subpanel">
                      <h4 className="agdash-wf-subpanel-title">{t.wfPanelLayerTitle}</h4>
                      {agroSources.length === 0 ? (
                        <p className="agdash-wf-panel-empty">{t.wfPanelLayerEmpty}</p>
                      ) : (
                        <>
                          <p className="agdash-wf-panel-hint agdash-wf-panel-hint--pick">{t.wfPanelLayerPickHint}</p>
                          <ul className="agdash-wf-layer-pick-list">
                            {agroSources.map(s => {
                              const on = dashboardLayerIds.includes(s.id)
                              return (
                                <li key={s.id} className={`agdash-wf-layer-pick-item${on ? ' agdash-wf-layer-pick-item--on' : ''}`}>
                                  <label className="agdash-wf-layer-pick-label">
                                    <input
                                      type="checkbox"
                                      checked={on}
                                      onChange={e => toggleDashboardLayer(s.id, e.target.checked)}
                                      aria-label={ar ? `عرض ${s.name} في اللوحة` : `Show ${s.name} on dashboard`}
                                    />
                                    <span className="agdash-wf-layer-pick-name">{s.name}</span>
                                    {s.fields.length > 0 ? (
                                      <span className="agdash-wf-layer-pick-meta">
                                        {s.fields.length} {ar ? 'حقل' : 'fields'}
                                      </span>
                                    ) : null}
                                  </label>
                                </li>
                              )
                            })}
                          </ul>
                        </>
                      )}
                    </div>
                    <div className="agdash-wf-subpanel agdash-wf-subpanel--fields">
                      <h4 className="agdash-wf-subpanel-title">{t.wfPanelSelectTitle}</h4>
                      {agroSources.length === 0 ? (
                        <p className="agdash-wf-panel-empty">{t.wfPanelSelectEmpty}</p>
                      ) : dashboardLayerIds.length === 0 ? (
                        <p className="agdash-wf-panel-empty agdash-wf-panel-hint">{t.wfPanelSelectNeedLayers}</p>
                      ) : (
                        <>
                          <p className="agdash-wf-tab-step">{t.wfTabStep(wfFieldsTab === 'fields' ? 1 : 2, 2)}</p>
                          <div className="agdash-wf-fields-tablist" role="tablist" aria-label={t.wfFieldsTablistAria}>
                            <button
                              type="button"
                              role="tab"
                              id={`${wfFieldsTabIds}-tab-fields`}
                              aria-selected={wfFieldsTab === 'fields'}
                              aria-controls={`${wfFieldsTabIds}-panel-fields`}
                              className={`agdash-wf-fields-tab${wfFieldsTab === 'fields' ? ' agdash-wf-fields-tab--active' : ''}`}
                              onClick={() => setWfFieldsTab('fields')}
                            >
                              <span className="agdash-wf-tab-num" aria-hidden>
                                1
                              </span>
                              <span className="agdash-wf-tab-txt">{t.wfTabFields}</span>
                            </button>
                            <button
                              type="button"
                              role="tab"
                              id={`${wfFieldsTabIds}-tab-charts`}
                              aria-selected={wfFieldsTab === 'charts'}
                              aria-controls={`${wfFieldsTabIds}-panel-charts`}
                              className={`agdash-wf-fields-tab${wfFieldsTab === 'charts' ? ' agdash-wf-fields-tab--active' : ''}`}
                              onClick={() => setWfFieldsTab('charts')}
                            >
                              <span className="agdash-wf-tab-num" aria-hidden>
                                2
                              </span>
                              <span className="agdash-wf-tab-txt">{t.wfTabCharts}</span>
                              {orderedIncludedPinKeys.length > 0 ? (
                                <span className="agdash-wf-tab-badge">{orderedIncludedPinKeys.length}</span>
                              ) : null}
                            </button>
                          </div>
                          <div
                            id={`${wfFieldsTabIds}-panel-fields`}
                            role="tabpanel"
                            aria-labelledby={`${wfFieldsTabIds}-tab-fields`}
                            hidden={wfFieldsTab !== 'fields'}
                            className="agdash-wf-tabpanel"
                          >
                            <div className="agdash-field-picker agdash-field-picker--flat">
                              <p className="agdash-field-picker-hint">{t.fieldPickerHint}</p>
                              {agroSourcesOnDashboard.map(src => {
                                const rawFilter = wfFieldFilterBySource[src.id] ?? ''
                                const q = rawFilter.trim().toLowerCase()
                                const filteredFields =
                                  q.length === 0 ? src.fields : src.fields.filter(f => f.toLowerCase().includes(q))
                                return (
                                  <details key={src.id} className="agdash-field-layer-block" open>
                                    <summary className="agdash-field-layer-summary">
                                      <i className="fa-solid fa-table-list" aria-hidden />
                                      <span>{src.name}</span>
                                      <span className="agdash-field-layer-summary-meta">
                                        {t.fieldsBadge(
                                          src.fields.filter(f => includedFieldKeys.includes(agroFieldKey(src.id, f)))
                                            .length,
                                          Math.max(src.fields.length, 1),
                                        )}
                                      </span>
                                    </summary>
                                    <div className="agdash-field-search-row">
                                      <label className="agdash-field-search-lbl" htmlFor={`${wfFieldSearchId}-${src.id}`}>
                                        {t.fieldSearchLabel}
                                      </label>
                                      <input
                                        id={`${wfFieldSearchId}-${src.id}`}
                                        type="search"
                                        className="agdash-field-search-input"
                                        placeholder={t.fieldSearchPlaceholder}
                                        value={rawFilter}
                                        onChange={e =>
                                          setWfFieldFilterBySource(prev => ({
                                            ...prev,
                                            [src.id]: e.target.value,
                                          }))
                                        }
                                        autoComplete="off"
                                        spellCheck={false}
                                      />
                                    </div>
                                    <ul className="agdash-field-flat-list">
                                      {src.fields.length === 0 ? (
                                        <li className="agdash-field-flat-empty">{t.wfPanelSelectEmpty}</li>
                                      ) : filteredFields.length === 0 ? (
                                        <li className="agdash-field-flat-empty">{t.fieldSearchNoMatch}</li>
                                      ) : (
                                        filteredFields.map(field => {
                                          const key = agroFieldKey(src.id, field)
                                          return (
                                            <li key={key} className="agdash-field-flat-item">
                                              <label className="agdash-wf-check agdash-field-flat-check">
                                                <input
                                                  type="checkbox"
                                                  checked={includedFieldKeys.includes(key)}
                                                  onChange={() => toggleIncludedFieldKey(key)}
                                                />
                                                <span>{field}</span>
                                              </label>
                                            </li>
                                          )
                                        })
                                      )}
                                    </ul>
                                  </details>
                                )
                              })}
                            </div>
                            {orderedIncludedPinKeys.length > 0 ? (
                              <button
                                type="button"
                                className="agdash-wf-tab-nav-next"
                                onClick={() => setWfFieldsTab('charts')}
                              >
                                {t.wfTabNextCharts}
                              </button>
                            ) : null}
                          </div>
                          <div
                            id={`${wfFieldsTabIds}-panel-charts`}
                            role="tabpanel"
                            aria-labelledby={`${wfFieldsTabIds}-tab-charts`}
                            hidden={wfFieldsTab !== 'charts'}
                            className="agdash-wf-tabpanel agdash-wf-tabpanel--charts"
                          >
                            {orderedIncludedPinKeys.length === 0 ? (
                              <div className="agdash-wf-tabpanel-empty">
                                <p className="agdash-wf-panel-empty">{t.wfChartsTabEmpty}</p>
                                <button
                                  type="button"
                                  className="agdash-wf-tab-nav-back"
                                  onClick={() => setWfFieldsTab('fields')}
                                >
                                  {t.wfTabBackFields}
                                </button>
                              </div>
                            ) : (
                              <>
                                <p className="agdash-wf-tabpanel-lead">{t.wfPanelPinSubtitle}</p>
                                <div className="agdash-wf-chart-columns">
                                  <div className="agdash-wf-chart-columns-head">
                                    <span className="agdash-wf-assign-section-title">{t.wfChartColumnsTitle}</span>
                                    <p className="agdash-wf-styles-hint">{t.wfChartColumnsHint}</p>
                                  </div>
                                  <div className="agdash-wf-axis-field-grid">
                                    <div className="agdash-wf-axis-field">
                                      <label htmlFor={`${wfFieldsTabIds}-axis-x`}>{t.wfAxisX}</label>
                                      <select
                                        id={`${wfFieldsTabIds}-axis-x`}
                                        className="agdash-wf-axis-select"
                                        value={orderedIncludedPinKeys.find(fk => fieldChartAxisRoles[fk] === 'x') ?? ''}
                                        onChange={e => assignAxisBindingField('x', e.target.value)}
                                      >
                                        <option value="">{t.wfAxisNone}</option>
                                        {orderedIncludedPinKeys.map(fk => (
                                          <option key={fk} value={fk}>
                                            {labelIncludedFieldKey(fk)}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                    <div className="agdash-wf-axis-field">
                                      <label htmlFor={`${wfFieldsTabIds}-axis-y`}>{t.wfAxisY}</label>
                                      <select
                                        id={`${wfFieldsTabIds}-axis-y`}
                                        className="agdash-wf-axis-select"
                                        value={orderedIncludedPinKeys.find(fk => fieldChartAxisRoles[fk] === 'y') ?? ''}
                                        onChange={e => assignAxisBindingField('y', e.target.value)}
                                      >
                                        <option value="">{t.wfAxisNone}</option>
                                        {orderedIncludedPinKeys.map(fk => (
                                          <option key={fk} value={fk}>
                                            {labelIncludedFieldKey(fk)}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                    <div className="agdash-wf-axis-field">
                                      <label htmlFor={`${wfFieldsTabIds}-axis-val`}>{t.wfAxisValue}</label>
                                      <select
                                        id={`${wfFieldsTabIds}-axis-val`}
                                        className="agdash-wf-axis-select"
                                        value={orderedIncludedPinKeys.find(fk => fieldChartAxisRoles[fk] === 'value') ?? ''}
                                        onChange={e => assignAxisBindingField('value', e.target.value)}
                                      >
                                        <option value="">{t.wfAxisNone}</option>
                                        {orderedIncludedPinKeys.map(fk => (
                                          <option key={fk} value={fk}>
                                            {labelIncludedFieldKey(fk)}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                </div>
                                <ul className="agdash-wf-assign-list">
                                  {orderedIncludedPinKeys.map(key => {
                                    const { sourceId, field } = parseAgroFieldKey(key)
                                    const src = agroSources.find(s => s.id === sourceId)
                                    const label = src && field ? `${src.name} — ${field}` : field || key
                                    const slot = fieldChartPlacement[key] ?? DEFAULT_FIELD_CHART
                                    return (
                                      <li key={key} className="agdash-wf-assign-card">
                                        <div className="agdash-wf-assign-card-head">
                                          <span className="agdash-wf-field-label">{label}</span>
                                        </div>
                                        <div className="agdash-wf-assign-section">
                                          <span className="agdash-wf-assign-section-title">{t.wfPanelsTitle}</span>
                                          <span className="agdash-wf-assign-section-sub">{t.wfPanelsSub}</span>
                                        </div>
                                        <div className="agdash-wf-slot-btns agdash-wf-slot-btns--green agdash-wf-slot-btns--panels">
                                          <button
                                            type="button"
                                            className={`agdash-slot-chip${slot.main ? ' agdash-slot-chip--on' : ''}`}
                                            onClick={() => toggleFieldChartSlot(key, 'main')}
                                          >
                                            {t.slotMain}
                                          </button>
                                          <button
                                            type="button"
                                            className={`agdash-slot-chip${slot.pie ? ' agdash-slot-chip--on' : ''}`}
                                            onClick={() => toggleFieldChartSlot(key, 'pie')}
                                          >
                                            {t.slotPie}
                                          </button>
                                          <button
                                            type="button"
                                            className={`agdash-slot-chip${slot.bot ? ' agdash-slot-chip--on' : ''}`}
                                            onClick={() => toggleFieldChartSlot(key, 'bot')}
                                          >
                                            {t.slotBot}
                                          </button>
                                        </div>
                                      </li>
                                    )
                                  })}
                                </ul>
                                <button
                                  type="button"
                                  className="agdash-wf-tab-nav-back agdash-wf-tab-nav-back--footer"
                                  onClick={() => setWfFieldsTab('fields')}
                                >
                                  {t.wfTabBackFields}
                                </button>
                              </>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="agdash-wf-modal-foot">
              <button type="button" className="agdash-wf-modal-done" onClick={closeWfModal}>
                {t.wfModalDone}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
