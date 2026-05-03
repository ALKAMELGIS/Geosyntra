import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import Chart from 'chart.js/auto'
import type { Chart as ChartInstance } from 'chart.js'
import { useLanguage } from '../../lib/i18n'
import { loadGisMapSavedLayers } from '../../lib/gisMapLayerStore'
import {
  aggregateGeoJsonToSource,
  aggregateRowsToSource,
  loadAgroDashSources,
  mergeSourcesForCharts,
  saveAgroDashSources,
  type AgroDashSource,
} from '../../lib/agroDashboardAnalytics'
import { parseFile, parseRemoteUrlAsFile } from '../../utils/FileLoader'
import type { LayerData } from '../satellite/components/LayerManager'
import './agro-dashboard.css'

const MO_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const
const MO_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'] as const

type QuarterKey = 'all' | 'q1' | 'q2' | 'q3' | 'q4'

const QUARTER_SLICE: Record<Exclude<QuarterKey, 'all'>, readonly [number, number]> = {
  q1: [0, 3],
  q2: [3, 6],
  q3: [6, 9],
  q4: [9, 12],
}

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

const PIE_PALETTE = [COLORS.accent, COLORS.teal, COLORS.amber, COLORS.violet, COLORS.accentM, COLORS.tealM] as const

const LS_SOURCES = 'agro-dashboard-sources-v1'
const FEED_KEY = 'agro-dashboard-feed-v1'

type AgroFeedItem = { id: string; title: string; sub: string; at: number; c: string }

function loadFeed(): AgroFeedItem[] {
  try {
    const raw = localStorage.getItem(FEED_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as AgroFeedItem[]
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function pad12(arr: number[]): number[] {
  if (arr.length >= 12) return arr.slice(0, 12)
  return [...arr, ...new Array(12 - arr.length).fill(0)]
}

function sliceQuarterData(
  monthly: number[],
  secondary: number[],
  MO: readonly string[],
  quarter: QuarterKey,
) {
  const m = pad12(monthly)
  const s = pad12(secondary)
  const maxH = Math.max(1, ...m)
  if (quarter === 'all') {
    const target = m.map(v => Math.round(v * 1.08 + maxH * 0.03))
    return { labels: [...MO], h: [...m], t: target, sec: [...s] }
  }
  const [a, b] = QUARTER_SLICE[quarter]
  const h = m.slice(a, b)
  const sec = s.slice(a, b)
  const maxQ = Math.max(1, ...h)
  const t = h.map(v => Math.round(v * 1.08 + maxQ * 0.03))
  return { labels: MO.slice(a, b), h, t, sec }
}

function gridOpts() {
  return { color: COLORS.grid, drawBorder: false }
}

function tickOpts() {
  return { font: { size: 10 }, color: COLORS.tick }
}

function noLegend() {
  return { legend: { display: false } }
}

function halfYearTrend(monthly: number[]): string | null {
  const m = pad12(monthly)
  const a = m.slice(0, 6).reduce((x, y) => x + y, 0)
  const b = m.slice(6).reduce((x, y) => x + y, 0)
  if (a === 0 && b === 0) return null
  if (a === 0) return `▲ ${b > 0 ? '100' : '0'}%`
  const pct = ((b - a) / a) * 100
  return `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}%`
}

function statusStyle(s: string): CSSProperties {
  const u = s.toLowerCase()
  if (u === 'done') return { background: '#EBF1FD', color: '#1e55c0' }
  if (u === 'fallow') return { background: '#FEF3E2', color: '#854F0B' }
  return { background: '#E3F7F1', color: '#085041' }
}

function relTime(at: number, ar: boolean): string {
  const sec = Math.max(0, Math.floor((Date.now() - at) / 1000))
  if (sec < 60) return ar ? `${sec} ث` : `${sec}s`
  const m = Math.floor(sec / 60)
  if (m < 60) return ar ? `${m} د` : `${m}m`
  const h = Math.floor(m / 60)
  if (h < 48) return ar ? `${h} س` : `${h}h`
  const d = Math.floor(h / 24)
  return ar ? `${d} ي` : `${d}d`
}

type AgroAddSourceOption = 'gis' | 'arcgis' | 'upload' | 'getdata'

function gisLayerHasGeoData(l: LayerData): boolean {
  return l.type === 'geojson' && l.data != null
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
            datasetAll: 'كل المصادر',
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
            optGetDataDesc: 'Excel، CSV، GeoJSON عبر رابط ويب (مثل Power BI).',
            advancedBtn: '… قاعدة بيانات، رابط ويب وخيارات متقدمة…',
            advancedHint: 'سيتم دعم المصادر المتقدمة في تحديثات لاحقة لهذه اللوحة.',
            cancelBtn: 'إلغاء',
            applyBtn: 'تطبيق',
            loading: 'جاري التحميل…',
            wf: ['إضافة طبقة', 'إضافة بيانات', 'اختيار الحقول', 'تثبيت الحقول'],
            quarter: [
              { v: 'all' as const, l: 'كل السنة' },
              { v: 'q1' as const, l: 'الربع 1' },
              { v: 'q2' as const, l: 'الربع 2' },
              { v: 'q3' as const, l: 'الربع 3' },
              { v: 'q4' as const, l: 'الربع 4' },
            ],
            export: 'تصدير ↗',
            save: 'حفظ',
            kpi1: 'إجمالي الحصاد (كغ)',
            kpi2: 'المعالم / الحقول',
            kpi3: 'متوسط القيمة / معلم',
            kpi4: 'مصادر البيانات',
            chartMain: 'حجم الحصاد الشهري',
            chartPie: 'التوزيع حسب الفئة',
            chartLine: 'المقياس الأساسي مقابل الثانوي',
            chartLineSub: 'سلاسل زمنية مبنية على البيانات المضافة',
            topFields: 'أعلى السجلات',
            topFieldsSub: 'حسب الحقل الرقمي المختار تلقائيًا',
            activity: 'نشاط حديث',
            activitySub: 'تحديثات مباشرة',
            tblField: 'التسمية',
            tblValue: 'القيمة',
            tblProg: 'التقدم',
            tblStatus: 'الحالة',
            analyze: 'تحليل ↗',
            dist: 'التوزيع',
            legHarvest: 'القيمة الأساسية',
            legTarget: 'الهدف',
            legYield: 'أساسي',
            legRain: 'ثانوي',
            metaAll: 'يناير – ديسمبر · مصادر مدمجة',
            metaQ: (q: string) => `${q.toUpperCase()} · مصادر مدمجة`,
            emptyDash: 'لا توجد مصادر بعد. اضغط «إضافة مصدر» واربط طبقة GIS أو ملفًا أو رابطًا.',
            selectGisLayer: 'اختر طبقة',
            noGisLayers: 'لا توجد طبقات GeoJSON محفوظة في خريطة GIS. أضف طبقة من صفحة الخريطة ثم ارجع هنا.',
            urlPlaceholderArc: 'https://…/FeatureServer/0 أو …/query?where=1=1&f=geojson',
            urlPlaceholderGet: 'رابط ملف CSV أو GeoJSON أو KML (https)',
            chooseFile: 'اختيار ملف',
            feedGis: 'تم ربط طبقة GIS',
            feedUrl: 'تم الاستيراد من الرابط',
            feedUpload: 'تم رفع الملف',
            errGeneric: 'تعذر إضافة المصدر.',
            errNoLayer: 'اختر طبقة تحتوي على بيانات.',
            errNoGeo: 'الطبقة لا تحتوي على GeoJSON قابل للتحليل.',
            errNoUrl: 'أدخل رابطًا صالحًا.',
            errNoFeatures: 'لم يُعثر على معالم أو أرقام في البيانات.',
            errParse: 'تعذر تحليل الملف أو الرابط.',
            live: 'مباشر',
          }
        : {
            srTitle: 'Harvest analytics dashboard — KPI cards, charts, field table, and activity feed',
            brand: 'Geo',
            brandBold: 'Dash',
            nav: ['Overview', 'Map view', 'Reports', 'Sources'],
            datasetAll: 'All sources',
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
            advancedBtn: '… Database, web URL & advanced…',
            advancedHint: 'Advanced sources will be supported in a future update on this dashboard.',
            cancelBtn: 'Cancel',
            applyBtn: 'Apply',
            loading: 'Loading…',
            wf: ['Add layer', 'Add source data', 'Select fields', 'Pin fields'],
            quarter: [
              { v: 'all' as const, l: 'Full year' },
              { v: 'q1' as const, l: 'Q1' },
              { v: 'q2' as const, l: 'Q2' },
              { v: 'q3' as const, l: 'Q3' },
              { v: 'q4' as const, l: 'Q4' },
            ],
            export: 'Export ↗',
            save: 'Save',
            kpi1: 'Total primary (kg)',
            kpi2: 'Features / fields',
            kpi3: 'Avg value / feature',
            kpi4: 'Data sources',
            chartMain: 'Monthly primary volume',
            chartPie: 'Share by category',
            chartLine: 'Primary vs secondary',
            chartLineSub: 'Series derived from added sources',
            topFields: 'Top records',
            topFieldsSub: 'Auto-picked numeric field',
            activity: 'Recent activity',
            activitySub: 'Live updates',
            tblField: 'Label',
            tblValue: 'Value',
            tblProg: 'Progress',
            tblStatus: 'Status',
            analyze: 'Analyze ↗',
            dist: 'Distribution',
            legHarvest: 'Primary',
            legTarget: 'Target',
            legYield: 'Primary',
            legRain: 'Secondary',
            metaAll: 'Jan – Dec · merged sources',
            metaQ: (q: string) => `${q.toUpperCase()} · merged sources`,
            emptyDash: 'No sources yet. Use Add source to connect a GIS layer, file, or URL.',
            selectGisLayer: 'Select layer',
            noGisLayers: 'No GeoJSON layers found in GIS Map. Add a layer on the map page, then return here.',
            urlPlaceholderArc: 'https://…/FeatureServer/0 or …/query?where=1=1&f=geojson',
            urlPlaceholderGet: 'HTTPS URL to CSV, GeoJSON, or KML',
            chooseFile: 'Choose file',
            feedGis: 'GIS layer linked',
            feedUrl: 'Imported from URL',
            feedUpload: 'File uploaded',
            errGeneric: 'Could not add this source.',
            errNoLayer: 'Pick a layer that has data.',
            errNoGeo: 'Layer has no analyzable GeoJSON.',
            errNoUrl: 'Enter a valid URL.',
            errNoFeatures: 'No features or numeric values found.',
            errParse: 'Could not parse the file or URL.',
            live: 'Live',
          },
    [ar],
  )

  const MO = ar ? MO_AR : MO_EN

  const [navIdx, setNavIdx] = useState(0)
  const [wfIdx, setWfIdx] = useState(1)
  const [addSourceOpen, setAddSourceOpen] = useState(false)
  const [addSourceChoice, setAddSourceChoice] = useState<AgroAddSourceOption>('gis')
  const [addSourceAdvancedHint, setAddSourceAdvancedHint] = useState(false)
  const [mainType, setMainType] = useState<'bar' | 'line' | 'area'>('bar')
  const [pieType, setPieType] = useState<'pie' | 'doughnut'>('pie')
  const [quarter, setQuarter] = useState<QuarterKey>('all')
  const [sources, setSources] = useState<AgroDashSource[]>(() => loadAgroDashSources())
  const [feed, setFeed] = useState<AgroFeedItem[]>(() => loadFeed())
  const [datasetId, setDatasetId] = useState<string>('all')
  const [gisLayers, setGisLayers] = useState<LayerData[]>([])
  const [gisLayerId, setGisLayerId] = useState<string>('')
  const [arcgisUrl, setArcgisUrl] = useState('')
  const [getDataUrl, setGetDataUrl] = useState('')
  const [modalBusy, setModalBusy] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    saveAgroDashSources(sources)
  }, [sources])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_SOURCES && e.newValue) {
        try {
          const next = JSON.parse(e.newValue) as AgroDashSource[]
          if (Array.isArray(next)) setSources(next)
        } catch {
          /* */
        }
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    if (datasetId !== 'all' && !sources.some(s => s.id === datasetId)) setDatasetId('all')
  }, [sources, datasetId])

  const activeSources = useMemo(() => {
    if (datasetId === 'all') return sources
    return sources.filter(s => s.id === datasetId)
  }, [sources, datasetId])

  const derived = useMemo(() => mergeSourcesForCharts(activeSources), [activeSources])

  const mainMeta = quarter === 'all' ? t.metaAll : t.metaQ(quarter)

  const slice = useMemo(
    () => sliceQuarterData(derived.monthly, derived.secondary, MO, quarter),
    [derived.monthly, derived.secondary, MO, quarter],
  )

  const kpi1 = useMemo(() => {
    const sum = slice.h.reduce((a, b) => a + b, 0)
    return Math.round(sum).toLocaleString(ar ? 'ar' : 'en')
  }, [slice.h, ar])

  const kpi1Badge = useMemo(() => halfYearTrend(derived.monthly), [derived.monthly])

  const kpi2 = useMemo(() => derived.totals.features.toLocaleString(ar ? 'ar' : 'en'), [derived.totals.features, ar])

  const kpi3 = useMemo(() => {
    const n = derived.totals.features
    const v = n > 0 ? Math.round(derived.totals.sum / n) : 0
    return `${v.toLocaleString(ar ? 'ar' : 'en')} kg`
  }, [derived.totals, ar])

  const kpi4 = useMemo(() => String(derived.totals.count), [derived.totals.count])

  const kpi3Badge = useMemo(() => halfYearTrend(derived.secondary), [derived.secondary])

  const peakMonthly = useMemo(() => Math.max(1, ...pad12(derived.monthly)), [derived.monthly])
  const kpi1Bar = useMemo(() => {
    const sum = derived.totals.sum
    return Math.min(100, Math.round((sum / (peakMonthly * 12)) * 100))
  }, [derived.totals.sum, peakMonthly])

  const kpi2Bar = useMemo(
    () => Math.min(100, Math.round((derived.totals.features / Math.max(derived.totals.features, 80)) * 100)),
    [derived.totals.features],
  )

  const kpi3Bar = useMemo(() => {
    const n = derived.totals.features
    const avg = n > 0 ? derived.totals.sum / n : 0
    return Math.min(100, Math.round((avg / Math.max(avg, peakMonthly * 0.5)) * 100))
  }, [derived.totals, peakMonthly])

  const kpi4Bar = useMemo(() => Math.min(100, derived.totals.count * 18), [derived.totals.count])

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
    const labs = slice.labels.length ? slice.labels : [...MO]
    const h = slice.h.length ? slice.h : new Array(labs.length).fill(0)
    const tgt = slice.t.length ? slice.t : h.map(() => 0)
    const isLine = mainType === 'line' || mainType === 'area'
    const chartType = isLine ? 'line' : 'bar'

    mainChartRef.current = new Chart(ctx, {
      type: chartType,
      data: {
        labels: labs,
        datasets: [
          {
            label: t.legHarvest,
            data: [...h],
            backgroundColor: mainType === 'bar' ? COLORS.accent : 'transparent',
            borderColor: COLORS.accent,
            borderWidth: isLine ? 2 : 0,
            fill: mainType === 'area' ? 'origin' : false,
            tension: 0.4,
            pointRadius: isLine ? 3 : 0,
            borderRadius: mainType === 'bar' ? 5 : 0,
          },
          {
            label: t.legTarget,
            data: [...tgt],
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
  }, [MO, mainType, slice, t.legHarvest, t.legTarget])

  const buildPie = useCallback(() => {
    const ctx = pieCanvasRef.current
    if (!ctx) return
    pieChartRef.current?.destroy()
    const pie = derived.pie.length
      ? derived.pie
      : [{ label: '—', value: 100 }]
    pieChartRef.current = new Chart(ctx, {
      type: pieType,
      data: {
        labels: pie.map(p => p.label),
        datasets: [
          {
            data: pie.map(p => p.value),
            backgroundColor: pie.map((_, i) => PIE_PALETTE[i % PIE_PALETTE.length]),
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
              label: c => {
                const v = typeof c.raw === 'number' ? c.raw : 0
                return ` ${c.label}: ${v}%`
              },
            },
          },
        },
      },
    })
  }, [derived.pie, pieType])

  const buildLine = useCallback(() => {
    const ctx = lineCanvasRef.current
    if (!ctx) return
    lineChartRef.current?.destroy()
    const m = pad12(derived.monthly)
    const s = pad12(derived.secondary)
    lineChartRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [...MO],
        datasets: [
          {
            label: t.legYield,
            data: [...m],
            borderColor: COLORS.accent,
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.4,
            fill: false,
          },
          {
            label: t.legRain,
            data: [...s],
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
  }, [MO, derived.monthly, derived.secondary, t.legRain, t.legYield])

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

  const appendFeed = useCallback((title: string, sub: string, c: string) => {
    const item: AgroFeedItem = { id: `a-${Date.now()}`, title, sub, at: Date.now(), c }
    setFeed(prev => {
      const next = [item, ...prev].slice(0, 40)
      try {
        localStorage.setItem(FEED_KEY, JSON.stringify(next))
      } catch {
        /* */
      }
      return next
    })
  }, [])

  const closeAddSourceModal = useCallback(() => {
    setAddSourceOpen(false)
    setAddSourceAdvancedHint(false)
    setModalError(null)
  }, [])

  const refreshGisLayers = useCallback(async () => {
    const list = await loadGisMapSavedLayers()
    setGisLayers(list)
    const geo = list.filter(gisLayerHasGeoData)
    setGisLayerId(prev => {
      if (prev && geo.some(l => String(l.id) === prev)) return prev
      return geo[0] ? String(geo[0].id) : ''
    })
  }, [])

  useEffect(() => {
    if (!addSourceOpen) return
    void refreshGisLayers()
  }, [addSourceOpen, refreshGisLayers])

  useEffect(() => {
    if (!addSourceOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAddSourceModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [addSourceOpen, closeAddSourceModal])

  const ingestParsed = useCallback(
    (parsed: { type: 'geojson' | 'table'; data: unknown; filename: string }, kind: AgroDashSource['kind']) => {
      if (parsed.type === 'geojson') {
        return aggregateGeoJsonToSource({ name: parsed.filename, kind, geojson: parsed.data })
      }
      const rows = Array.isArray(parsed.data) ? (parsed.data as Record<string, unknown>[]) : []
      return aggregateRowsToSource({ name: parsed.filename, kind, rows })
    },
    [],
  )

  const applyAddSource = useCallback(async () => {
    setModalError(null)
    setModalBusy(true)
    try {
      let next: AgroDashSource | null = null
      let feedTitle = ''
      let feedSub = ''
      const col = '#12A97B'

      if (addSourceChoice === 'gis') {
        const layer = gisLayers.find(l => String(l.id) === gisLayerId)
        if (!layer) throw new Error(t.errNoLayer)
        if (!gisLayerHasGeoData(layer)) throw new Error(t.errNoGeo)
        next = aggregateGeoJsonToSource({ name: layer.name, kind: 'gis', geojson: layer.data })
        feedTitle = t.feedGis
        feedSub = layer.name
      } else if (addSourceChoice === 'arcgis') {
        const url = arcgisUrl.trim()
        if (!url) throw new Error(t.errNoUrl)
        const file = await parseRemoteUrlAsFile(url)
        const parsed = await parseFile(file)
        next = ingestParsed(parsed, 'arcgis')
        feedTitle = t.feedUrl
        feedSub = file.name || url.slice(0, 80)
      } else if (addSourceChoice === 'getdata') {
        const url = getDataUrl.trim()
        if (!url) throw new Error(t.errNoUrl)
        const file = await parseRemoteUrlAsFile(url)
        const parsed = await parseFile(file)
        next = ingestParsed(parsed, 'url')
        feedTitle = t.feedUrl
        feedSub = file.name || url.slice(0, 80)
      }

      if (!next) throw new Error(t.errNoFeatures)

      setSources(prev => [...prev, next!])
      appendFeed(feedTitle, feedSub, col)
      setWfIdx(2)
      setDatasetId('all')
      closeAddSourceModal()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('Invalid URL') || msg === t.errNoUrl) setModalError(t.errNoUrl)
      else if (msg === t.errNoLayer || msg === t.errNoGeo) setModalError(msg)
      else if (msg === t.errNoFeatures) setModalError(t.errNoFeatures)
      else if (/parse|fetch|Failed to fetch|Unsupported/i.test(msg)) setModalError(t.errParse)
      else setModalError(t.errGeneric)
    } finally {
      setModalBusy(false)
    }
  }, [
    addSourceChoice,
    appendFeed,
    arcgisUrl,
    closeAddSourceModal,
    getDataUrl,
    gisLayerId,
    gisLayers,
    ingestParsed,
    t,
  ])

  const onUploadPick = useCallback(
    async (files: FileList | null) => {
      const file = files?.[0]
      if (!file) return
      setModalError(null)
      setModalBusy(true)
      try {
        const parsed = await parseFile(file)
        const next = ingestParsed(parsed, 'upload')
        if (!next) throw new Error(t.errNoFeatures)
        setSources(prev => [...prev, next])
        appendFeed(t.feedUpload, file.name, '#2D6BE4')
        setWfIdx(2)
        setDatasetId('all')
        closeAddSourceModal()
      } catch {
        setModalError(t.errParse)
      } finally {
        setModalBusy(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    },
    [appendFeed, closeAddSourceModal, ingestParsed, t],
  )

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
            <select
              className="agdash-nav-sel"
              aria-label={ar ? 'مجموعة البيانات' : 'Dataset'}
              value={datasetId}
              onChange={e => setDatasetId(e.target.value)}
            >
              <option value="all">{t.datasetAll}</option>
              {sources.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="agdash-add-btn"
              onClick={() => {
                setAddSourceChoice('gis')
                setAddSourceAdvancedHint(false)
                setModalError(null)
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
            <div className="agdash-nav-avatar" aria-hidden>
              AM
            </div>
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
          {sources.length === 0 ? <div className="agdash-empty-hint">{t.emptyDash}</div> : null}

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
                {kpi1Badge ? (
                  <span
                    className={`agdash-kpi-badge${kpi1Badge.startsWith('▼') ? ' agdash-dn' : ' agdash-up'}`}
                  >
                    {kpi1Badge}
                  </span>
                ) : null}
              </div>
              <div className="agdash-kpi-val">{kpi1}</div>
              <div className="agdash-kpi-lbl">{t.kpi1}</div>
              <div className="agdash-kpi-bar">
                <div
                  className="agdash-kpi-fill"
                  style={{ width: `${kpi1Bar}%`, background: 'var(--agdash-accent)' }}
                />
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
                {derived.totals.features > 0 ? (
                  <span className="agdash-kpi-badge agdash-nt">{t.live}</span>
                ) : null}
              </div>
              <div className="agdash-kpi-val">{kpi2}</div>
              <div className="agdash-kpi-lbl">{t.kpi2}</div>
              <div className="agdash-kpi-bar">
                <div
                  className="agdash-kpi-fill"
                  style={{ width: `${kpi2Bar}%`, background: 'var(--agdash-teal)' }}
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
                {kpi3Badge ? (
                  <span
                    className={`agdash-kpi-badge${kpi3Badge.startsWith('▼') ? ' agdash-dn' : ' agdash-up'}`}
                  >
                    {kpi3Badge}
                  </span>
                ) : null}
              </div>
              <div className="agdash-kpi-val">{kpi3}</div>
              <div className="agdash-kpi-lbl">{t.kpi3}</div>
              <div className="agdash-kpi-bar">
                <div
                  className="agdash-kpi-fill"
                  style={{ width: `${kpi3Bar}%`, background: 'var(--agdash-amber)' }}
                />
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
                {derived.totals.count > 0 ? (
                  <span className="agdash-kpi-badge agdash-nt">{`${derived.totals.count}`}</span>
                ) : null}
              </div>
              <div className="agdash-kpi-val">{kpi4}</div>
              <div className="agdash-kpi-lbl">{t.kpi4}</div>
              <div className="agdash-kpi-bar">
                <div
                  className="agdash-kpi-fill"
                  style={{ width: `${kpi4Bar}%`, background: 'var(--agdash-violet)' }}
                />
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
              <div className="agdash-leg" style={{ justifyContent: 'center', flexWrap: 'wrap', gap: 8 }}>
                {(derived.pie.length ? derived.pie : [{ label: '—', value: 0 }]).map((p, i) => (
                  <div key={`${p.label}-${i}`} className="agdash-li">
                    <div
                      className="agdash-lsq"
                      style={{ background: PIE_PALETTE[i % PIE_PALETTE.length] }}
                    />
                    {p.label} {derived.pie.length ? `${p.value}%` : ''}
                  </div>
                ))}
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
                    <th style={{ width: '22%' }}>{t.tblValue}</th>
                    <th style={{ width: '24%' }}>{t.tblProg}</th>
                    <th style={{ width: '16%' }}>{t.tblStatus}</th>
                  </tr>
                </thead>
                <tbody>
                  {derived.table.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ color: 'var(--agdash-muted, #5c6370)', fontSize: '0.875rem' }}>
                        {t.emptyDash}
                      </td>
                    </tr>
                  ) : (
                    derived.table.map((f, idx) => (
                      <tr key={`${f.label}-${idx}`}>
                        <td style={{ fontWeight: 500 }}>{f.label}</td>
                        <td>{f.value.toLocaleString(ar ? 'ar' : 'en')}</td>
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
                          <span className="agdash-fbadge" style={statusStyle(f.status)}>
                            {f.status}
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
                {feed.length === 0 ? (
                  <div style={{ fontSize: '0.875rem', color: 'var(--agdash-muted, #5c6370)' }}>{t.emptyDash}</div>
                ) : (
                  feed.map(a => (
                    <div key={a.id} className="agdash-feed-item">
                      <div className="agdash-feed-dot" style={{ background: a.c }} />
                      <div>
                        <div className="agdash-feed-main">{a.title}</div>
                        <div className="agdash-feed-sub">
                          {a.sub} · {relTime(a.at, ar)}
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

      <input
        ref={fileInputRef}
        type="file"
        className="agdash-sr-only"
        accept=".geojson,.json,.kml,.kmz,.zip,.csv,application/geo+json,application/json"
        onChange={e => void onUploadPick(e.target.files)}
      />

      {addSourceOpen ? (
        <div className="agdash-modal-overlay" role="presentation" onClick={closeAddSourceModal}>
          <div
            className="agdash-modal agdash-add-source-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="agdash-add-source-title"
            onClick={e => e.stopPropagation()}
          >
            <h2 id="agdash-add-source-title" className="agdash-add-source-modal__title">
              {t.modalTitle}
            </h2>
            <p className="agdash-add-source-modal__lead">{t.modalLead}</p>

            <fieldset className="agdash-src-fieldset">
              <legend className="agdash-sr-only">{t.modalOptsLegend}</legend>

              <label className={`agdash-src-card${addSourceChoice === 'gis' ? ' agdash-src-card--on' : ''}`}>
                <input
                  type="radio"
                  name="agdash-add-source"
                  className="agdash-src-radio"
                  checked={addSourceChoice === 'gis'}
                  onChange={() => setAddSourceChoice('gis')}
                />
                <span className="agdash-src-card-icon" aria-hidden>
                  <i className="fa-solid fa-layer-group" />
                </span>
                <span className="agdash-src-card-text">
                  <span className="agdash-src-card-title">{t.optGisTitle}</span>
                  <span className="agdash-src-card-desc">{t.optGisDesc}</span>
                </span>
              </label>

              <label className={`agdash-src-card${addSourceChoice === 'arcgis' ? ' agdash-src-card--on' : ''}`}>
                <input
                  type="radio"
                  name="agdash-add-source"
                  className="agdash-src-radio"
                  checked={addSourceChoice === 'arcgis'}
                  onChange={() => setAddSourceChoice('arcgis')}
                />
                <span className="agdash-src-card-icon" aria-hidden>
                  <i className="fa-solid fa-link" />
                </span>
                <span className="agdash-src-card-text">
                  <span className="agdash-src-card-title">{t.optArcTitle}</span>
                  <span className="agdash-src-card-desc">{t.optArcDesc}</span>
                </span>
              </label>

              <label className={`agdash-src-card${addSourceChoice === 'upload' ? ' agdash-src-card--on' : ''}`}>
                <input
                  type="radio"
                  name="agdash-add-source"
                  className="agdash-src-radio"
                  checked={addSourceChoice === 'upload'}
                  onChange={() => setAddSourceChoice('upload')}
                />
                <span className="agdash-src-card-icon" aria-hidden>
                  <i className="fa-solid fa-file-arrow-up" />
                </span>
                <span className="agdash-src-card-text">
                  <span className="agdash-src-card-title">{t.optUploadTitle}</span>
                  <span className="agdash-src-card-desc">{t.optUploadDesc}</span>
                </span>
              </label>

              <label className={`agdash-src-card${addSourceChoice === 'getdata' ? ' agdash-src-card--on' : ''}`}>
                <input
                  type="radio"
                  name="agdash-add-source"
                  className="agdash-src-radio"
                  checked={addSourceChoice === 'getdata'}
                  onChange={() => setAddSourceChoice('getdata')}
                />
                <span className="agdash-src-card-icon agdash-src-card-icon--dual" aria-hidden>
                  <i className="fa-solid fa-database" />
                  <i className="fa-solid fa-table-cells" />
                </span>
                <span className="agdash-src-card-text">
                  <span className="agdash-src-card-title">{t.optGetDataTitle}</span>
                  <span className="agdash-src-card-desc">{t.optGetDataDesc}</span>
                </span>
              </label>
            </fieldset>

            {addSourceChoice === 'gis' ? (
              <div className="agdash-src-panel">
                <label htmlFor="agdash-gis-layer">{t.selectGisLayer}</label>
                <select
                  id="agdash-gis-layer"
                  value={gisLayerId}
                  onChange={e => setGisLayerId(e.target.value)}
                  disabled={modalBusy}
                >
                  <option value="" disabled>
                    {t.selectGisLayer}
                  </option>
                  {gisLayers.filter(gisLayerHasGeoData).map(l => (
                    <option key={String(l.id)} value={String(l.id)}>
                      {l.name}
                    </option>
                  ))}
                </select>
                {gisLayers.filter(gisLayerHasGeoData).length === 0 ? (
                  <p className="agdash-src-err" style={{ color: 'var(--agdash-muted, #5c6370)' }}>
                    {t.noGisLayers}
                  </p>
                ) : null}
              </div>
            ) : null}

            {addSourceChoice === 'arcgis' ? (
              <div className="agdash-src-panel">
                <label htmlFor="agdash-arc-url">URL</label>
                <input
                  id="agdash-arc-url"
                  type="url"
                  value={arcgisUrl}
                  onChange={e => setArcgisUrl(e.target.value)}
                  placeholder={t.urlPlaceholderArc}
                  disabled={modalBusy}
                  autoComplete="off"
                />
              </div>
            ) : null}

            {addSourceChoice === 'getdata' ? (
              <div className="agdash-src-panel">
                <label htmlFor="agdash-get-url">URL</label>
                <input
                  id="agdash-get-url"
                  type="url"
                  value={getDataUrl}
                  onChange={e => setGetDataUrl(e.target.value)}
                  placeholder={t.urlPlaceholderGet}
                  disabled={modalBusy}
                  autoComplete="off"
                />
              </div>
            ) : null}

            {addSourceChoice === 'upload' ? (
              <div className="agdash-src-panel">
                <button type="button" className="agdash-add-source-modal__apply" onClick={() => fileInputRef.current?.click()} disabled={modalBusy}>
                  {t.chooseFile}
                </button>
              </div>
            ) : null}

            {modalError ? (
              <p className="agdash-src-err" role="alert">
                {modalError}
              </p>
            ) : null}

            {addSourceAdvancedHint ? (
              <p className="agdash-src-advanced-hint" role="status">
                {t.advancedHint}
              </p>
            ) : null}

            <button type="button" className="agdash-src-advanced" onClick={() => setAddSourceAdvancedHint(true)}>
              {t.advancedBtn}
            </button>

            <div className="agdash-add-source-modal__footer">
              <button type="button" className="agdash-add-source-modal__cancel" onClick={closeAddSourceModal} disabled={modalBusy}>
                {t.cancelBtn}
              </button>
              {addSourceChoice !== 'upload' ? (
                <button
                  type="button"
                  className="agdash-add-source-modal__apply"
                  onClick={() => void applyAddSource()}
                  disabled={modalBusy}
                >
                  {modalBusy ? t.loading : t.applyBtn}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
