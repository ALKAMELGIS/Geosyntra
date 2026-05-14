import { useEffect, startTransition } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../lib/i18n'
import { prefetchRoute } from '../routes/routePrefetch'
import './Home.css'

const PRIMARY_PATH = '/satellite/indices'
const SECONDARY_PATH = '/learn-more'

const copy = {
  en: {
    title: 'Geosyntra',
    subtitle: 'Geospatial intelligence platform',
    lede: 'Satellite indices, GIS workspace, and operational workflows in one place.',
    ctaPrimary: 'Open satellite intelligence',
    ctaSecondary: 'Learn more',
  },
  ar: {
    title: 'جيوسينترا',
    subtitle: 'منصة استخبارات جغرافية مكانية',
    lede: 'مؤشرات الأقمار الصناعية، مساحة عمل GIS، وسير العمل التشغيلي في مكان واحد.',
    ctaPrimary: 'فتح استخبارات الأقمار',
    ctaSecondary: 'اعرف المزيد',
  },
} as const

/**
 * Home (`/`) — lightweight hub after removal of the scroll-driven 3D landing
 * (Globe + Spline hero). Same entry routes as before: Satellite Indices and
 * Learn More, with idle prefetch of those chunks.
 */
export default function Home() {
  const navigate = useNavigate()
  const { language } = useLanguage()
  const t = copy[language]

  useEffect(() => {
    if (typeof window === 'undefined') return
    const ric = (
      window as unknown as {
        requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number
        cancelIdleCallback?: (id: number) => void
      }
    ).requestIdleCallback ?? null
    let id: number
    if (ric) {
      id = ric(
        () => {
          prefetchRoute(PRIMARY_PATH)
          prefetchRoute(SECONDARY_PATH)
        },
        { timeout: 1500 },
      )
      return () => {
        const cic = (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback
        if (cic) cic(id)
      }
    }
    const tid = window.setTimeout(() => {
      prefetchRoute(PRIMARY_PATH)
      prefetchRoute(SECONDARY_PATH)
    }, 600)
    return () => window.clearTimeout(tid)
  }, [])

  const goPrimary = () => startTransition(() => navigate(PRIMARY_PATH))
  const goSecondary = () => startTransition(() => navigate(SECONDARY_PATH))

  return (
    <div className="page page-tight home-dashboard" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <div className="home-dashboard__inner">
        <h1 className="home-dashboard__title">{t.title}</h1>
        <p className="home-dashboard__subtitle">{t.subtitle}</p>
        <p className="home-dashboard__lede">{t.lede}</p>
        <div className="home-dashboard__actions">
          <button type="button" className="gis-btn gis-btn-primary" onClick={goPrimary}>
            {t.ctaPrimary}
          </button>
          <button type="button" className="gis-btn gis-btn-outline" onClick={goSecondary}>
            {t.ctaSecondary}
          </button>
        </div>
      </div>
    </div>
  )
}
