import { Suspense, lazy } from 'react'

/**
 * Eagerly start fetching the Spline runtime chunk at module-load time so
 * the network roundtrip for the heavy `@splinetool/react-spline` bundle
 * overlaps with React's first render — by the time `<SplineScene/>`
 * actually mounts, the chunk is usually already in the browser cache.
 * The `lazy()` call below reuses the same import so no double-fetch.
 */
const splineRuntime = import('@splinetool/react-spline')
const Spline = lazy(() => splineRuntime)

interface SplineSceneProps {
  scene: string
  className?: string
}

export function SplineScene({ scene, className }: SplineSceneProps) {
  return (
    <Suspense
      fallback={
        <div
          className={`gs-spline-skeleton h-full w-full ${className ?? ''}`}
          aria-hidden
        />
      }
    >
      <Spline scene={scene} className={className} />
    </Suspense>
  )
}
