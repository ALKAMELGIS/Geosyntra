import { useCallback, useMemo } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import { useLanguage } from '../../lib/i18n'
import './agri-design-dashboard.css'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

const copy = {
  en: {
    title: 'Dashboard',
    download: 'Download',
    kpiHarvest: 'Total Harvest',
    kpiWater: 'Water Usage Today',
    kpiFields: 'Active Fields',
    kpiEntries: "Today's Entries",
    waterDelta: '+0% vs yesterday',
    unitKg: 'Kg',
    unitL: 'L',
    harvestGrowth: 'Harvest Growth',
    harvestLegend: 'Harvest (Kg)',
    waterMonthly: 'Monthly Water & Fertilizer',
    legendWater: 'Water (L)',
    legendFert: 'Fertilizer (Kg)',
  },
  ar: {
    title: 'لوحة التحكم',
    download: 'تنزيل',
    kpiHarvest: 'إجمالي الحصاد',
    kpiWater: 'استهلاك المياه اليوم',
    kpiFields: 'حقول نشطة',
    kpiEntries: 'إدخالات اليوم',
    waterDelta: '+0% مقارنة بالأمس',
    unitKg: 'كغ',
    unitL: 'لتر',
    harvestGrowth: 'نمو الحصاد',
    harvestLegend: 'الحصاد (كغ)',
    waterMonthly: 'المياه والأسمدة الشهرية',
    legendWater: 'المياه (لتر)',
    legendFert: 'الأسمدة (كغ)',
  },
} as const

const MONTH_KEYS = ['mJan', 'mFeb', 'mMar', 'mApr', 'mMay', 'mJun', 'mJul', 'mAug', 'mSep', 'mOct', 'mNov', 'mDec'] as const

const monthLabels: Record<(typeof MONTH_KEYS)[number], { en: string; ar: string }> = {
  mJan: { en: 'Jan', ar: 'يناير' },
  mFeb: { en: 'Feb', ar: 'فبراير' },
  mMar: { en: 'Mar', ar: 'مارس' },
  mApr: { en: 'Apr', ar: 'أبريل' },
  mMay: { en: 'May', ar: 'مايو' },
  mJun: { en: 'Jun', ar: 'يونيو' },
  mJul: { en: 'Jul', ar: 'يوليو' },
  mAug: { en: 'Aug', ar: 'أغسطس' },
  mSep: { en: 'Sep', ar: 'سبتمبر' },
  mOct: { en: 'Oct', ar: 'أكتوبر' },
  mNov: { en: 'Nov', ar: 'نوفمبر' },
  mDec: { en: 'Dec', ar: 'ديسمبر' },
}

export default function AgriDesignDashboard() {
  const { language, direction } = useLanguage()
  const t = copy[language]
  const isAr = language === 'ar'

  const monthAxis = useMemo(() => MONTH_KEYS.map(k => monthLabels[k][isAr ? 'ar' : 'en']), [isAr])

  const todayLabel = useMemo(() => {
    const d = new Date()
    return d.toLocaleDateString(isAr ? 'ar-AE' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }, [isAr])

  const harvestGrowthData = useMemo(
    () => ({
      labels: monthAxis,
      datasets: [
        {
          label: t.harvestLegend,
          data: [0, 0, 0, 1000, 0, 0, 0, 0, 0, 0, 0, 0],
          backgroundColor: '#22c55e',
          borderRadius: 6,
          maxBarThickness: 36,
        },
      ],
    }),
    [monthAxis, t.harvestLegend],
  )

  const waterMonthlyData = useMemo(
    () => ({
      labels: monthAxis,
      datasets: [
        {
          label: t.legendWater,
          data: [0, 920, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          backgroundColor: '#3b82f6',
          borderRadius: 5,
          maxBarThickness: 28,
        },
        {
          label: t.legendFert,
          data: [0, 380, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          backgroundColor: '#f97316',
          borderRadius: 5,
          maxBarThickness: 28,
        },
      ],
    }),
    [monthAxis, t.legendWater, t.legendFert],
  )

  const chartCommonOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index' as const, intersect: false },
      plugins: {
        legend: {
          position: 'bottom' as const,
          rtl: isAr,
          labels: {
            usePointStyle: true,
            padding: 14,
            font: { size: 12, family: 'system-ui, sans-serif' },
            color: '#64748b',
          },
        },
        tooltip: {
          backgroundColor: 'rgba(15,23,42,0.9)',
          titleFont: { size: 12 },
          bodyFont: { size: 12 },
          padding: 10,
          cornerRadius: 8,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#64748b', maxRotation: 0, font: { size: 11 } },
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(148,163,184,0.2)' },
          ticks: { color: '#64748b', font: { size: 11 } },
        },
      },
    }),
    [isAr],
  )

  const onDownload = useCallback(() => {
    const rows = [
      ['metric', 'value'],
      [t.kpiHarvest, `0 ${t.unitKg}`],
      [t.kpiWater, `0 ${t.unitL}`],
      [t.kpiFields, '0'],
      [t.kpiEntries, '0'],
    ]
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dashboard-export.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [t])

  return (
    <div className="page agdash-page" dir={direction}>
      <header className="agdash-header">
        <h1 className="agdash-title">{t.title}</h1>
        <div className="agdash-header-actions">
          <span className="agdash-date-pill">{todayLabel}</span>
          <button type="button" className="agdash-btn-download" onClick={onDownload}>
            <i className="fa-solid fa-download" aria-hidden />
            {t.download}
          </button>
        </div>
      </header>

      <section className="agdash-kpi-row" aria-label="KPI summary">
        <article className="agdash-kpi-card">
          <div className="agdash-kpi-icon agdash-kpi-icon--harvest" aria-hidden>
            <i className="fa-solid fa-tractor" />
          </div>
          <div className="agdash-kpi-body">
            <div className="agdash-kpi-label">{t.kpiHarvest}</div>
            <div className="agdash-kpi-value">
              0 {t.unitKg}
            </div>
          </div>
        </article>
        <article className="agdash-kpi-card">
          <div className="agdash-kpi-icon agdash-kpi-icon--water" aria-hidden>
            <i className="fa-solid fa-droplet" />
          </div>
          <div className="agdash-kpi-body">
            <div className="agdash-kpi-label">{t.kpiWater}</div>
            <div className="agdash-kpi-value">
              0 {t.unitL}
            </div>
            <span className="agdash-kpi-badge">{t.waterDelta}</span>
          </div>
        </article>
        <article className="agdash-kpi-card">
          <div className="agdash-kpi-icon agdash-kpi-icon--fields" aria-hidden>
            <i className="fa-solid fa-seedling" />
          </div>
          <div className="agdash-kpi-body">
            <div className="agdash-kpi-label">{t.kpiFields}</div>
            <div className="agdash-kpi-value">0</div>
          </div>
        </article>
        <article className="agdash-kpi-card">
          <div className="agdash-kpi-icon agdash-kpi-icon--entries" aria-hidden>
            <i className="fa-solid fa-clipboard-list" />
          </div>
          <div className="agdash-kpi-body">
            <div className="agdash-kpi-label">{t.kpiEntries}</div>
            <div className="agdash-kpi-value">0</div>
          </div>
        </article>
      </section>

      <div className="agdash-grid">
        <section className="agdash-chart-card">
          <h2 className="agdash-chart-card-title">{t.harvestGrowth}</h2>
          <div className="agdash-chart-body">
            <Bar data={harvestGrowthData} options={chartCommonOptions} />
          </div>
        </section>

        <section className="agdash-chart-card">
          <h2 className="agdash-chart-card-title">{t.waterMonthly}</h2>
          <div className="agdash-chart-body">
            <Bar
              data={waterMonthlyData}
              options={{
                ...chartCommonOptions,
                scales: {
                  ...chartCommonOptions.scales,
                  x: {
                    ...chartCommonOptions.scales.x,
                    stacked: false,
                  },
                  y: {
                    ...chartCommonOptions.scales.y,
                    stacked: false,
                  },
                },
              }}
            />
          </div>
        </section>
      </div>
    </div>
  )
}
