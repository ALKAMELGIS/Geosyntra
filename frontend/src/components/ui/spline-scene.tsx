import { Suspense, lazy, memo } from 'react'

/**
 * Eagerly start fetching the Spline runtime chunk at module-load time so
 * the network roundtrip overlaps with first paint. Rejections are handled so
 * a blocked CDN / flaky network never becomes `unhandledrejection` (GitHub Pages).
 */
const splineRuntime = import('@splinetool/react-spline').catch((err) => {
  console.warn('[SplineScene] @splinetool/react-spline chunk failed to load', err)
  return {
    default: () => <div className="gs-spline-skeleton h-full w-full" aria-hidden />,
  } as unknown as Awaited<typeof import('@splinetool/react-spline')>
})

const Spline = lazy(() => splineRuntime)

interface SplineSceneProps {
  scene: string
  className?: string
}

function SplineSceneInner({ scene, className }: SplineSceneProps) {
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

export const SplineScene = memo(SplineSceneInner)
