/**
 * Thin route entry — keeps the lazy chunk initializer minimal (avoids TDZ on GitHub Pages).
 * All Satellite Intelligence UI lives in `SatelliteIntelligenceMain.tsx`.
 */
import { lazy, Suspense } from 'react'

const SatelliteIntelligenceMain = lazy(() => import('./SatelliteIntelligenceMain'))

export default function SatelliteIntelligence() {
  return (
    <Suspense
      fallback={
        <div className="si-page-boot" style={{ display: 'grid', placeItems: 'center', minHeight: '60vh', color: '#94a3b8' }}>
          Loading Satellite Intelligence…
        </div>
      }
    >
      <SatelliteIntelligenceMain />
    </Suspense>
  )
}
