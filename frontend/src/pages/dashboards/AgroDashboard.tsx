import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Chart from 'chart.js/auto'
import type { Chart as ChartInstance } from 'chart.js'
import { useLanguage } from '../../lib/i18n'
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

type AgroAddSourceOption = 'gis' | 'arcgis' | 'upload' | 'getdata'

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
            optGetDataDesc: 'فتح قائمة «مصادر البيانات الشائعة» مثل Power BI (Excel، CSV، SQL، Web، OData، …).',
            advancedBtn: '… قاعدة بيانات، رابط ويب وخيارات متقدمة…',
            advancedHint: 'سيتم دعم المصادر المتقدمة في تحديثات لاحقة لهذه اللوحة.',
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
            optGetDataDesc: 'Open the same “Common data sources” list as Power BI (Excel, CSV, SQL, Web, OData, …).',
            advancedBtn: '… Database, web URL & advanced…',
            advancedHint: 'Advanced sources will be supported in a future update on this dashboard.',
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

  const MO = ar ? MO_AR : MO_EN

  const [navIdx, setNavIdx] = useState(0)
  const [wfIdx, setWfIdx] = useState(1)
  const [addSourceOpen, setAddSourceOpen] = useState(false)
  const [addSourceChoice, setAddSourceChoice] = useState<AgroAddSourceOption>('gis')
  const [addSourceAdvancedHint, setAddSourceAdvancedHint] = useState(false)
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

  const closeAddSourceModal = useCallback(() => {
    setAddSourceOpen(false)
    setAddSourceAdvancedHint(false)
  }, [])

  useEffect(() => {
    if (!addSourceOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAddSourceModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [addSourceOpen, closeAddSourceModal])

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
                setAddSourceChoice('gis')
                setAddSourceAdvancedHint(false)
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
              <div className="agdash-kpi-val">7</div>
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

              <label
                className={`agdash-src-card${addSourceChoice === 'gis' ? ' agdash-src-card--on' : ''}`}
              >
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

              <label
                className={`agdash-src-card${addSourceChoice === 'arcgis' ? ' agdash-src-card--on' : ''}`}
              >
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

              <label
                className={`agdash-src-card${addSourceChoice === 'upload' ? ' agdash-src-card--on' : ''}`}
              >
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

              <label
                className={`agdash-src-card${addSourceChoice === 'getdata' ? ' agdash-src-card--on' : ''}`}
              >
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

            {addSourceAdvancedHint ? (
              <p className="agdash-src-advanced-hint" role="status">
                {t.advancedHint}
              </p>
            ) : null}

            <button type="button" className="agdash-src-advanced" onClick={() => setAddSourceAdvancedHint(true)}>
              {t.advancedBtn}
            </button>

            <div className="agdash-add-source-modal__footer">
              <button type="button" className="agdash-add-source-modal__cancel" onClick={closeAddSourceModal}>
                {t.cancelBtn}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
