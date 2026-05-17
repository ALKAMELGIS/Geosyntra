import { Suspense, lazy } from 'react'
import { lazyRoute } from '../../routes/lazyRoute'

/* All bind targets are now code-split — `DynamicBindPage` itself stays
 * a static import so the entry bundle can resolve user-defined custom
 * routes synchronously, but the actual page bodies (Overview / GIS /
 * Satellite) are lazy() so they don't bloat the entry chunk. */
const Overview = lazy(() => import('../dashboards/Overview'))
const GisMap = lazyRoute(() => import('../satellite/GisMap'))
const SatelliteIntelligence = lazyRoute(() => import('../satellite/SatelliteIntelligenceMain'))

function Placeholder({ title }: { title: string }) {
  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>{title}</h1>
      <p>This page is configured from System Settings — assign a binding target or replace this placeholder.</p>
    </div>
  )
}

/** `home` is preserved as a legacy value for stored CustomPageRecords; it now renders the placeholder. */
export type BindTarget = 'placeholder' | 'home' | 'gis' | 'satellite-indices' | 'dashboards-overview'

export default function DynamicBindPage({ bindTarget, title }: { bindTarget: BindTarget; title: string }) {
  const fb = null
  switch (bindTarget) {
    case 'gis':
      return (
        <Suspense fallback={fb}>
          <GisMap />
        </Suspense>
      )
    case 'satellite-indices':
      return (
        <Suspense fallback={fb}>
          <SatelliteIntelligence />
        </Suspense>
      )
    case 'dashboards-overview':
      return (
        <Suspense fallback={fb}>
          <Overview />
        </Suspense>
      )
    default:
      return <Placeholder title={title} />
  }
}
