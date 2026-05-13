import { Suspense, lazy } from 'react'

/**
 * SplineScene — lazy wrapper around `@splinetool/react-spline`.
 *
 * The Spline runtime is heavy (1.4 MB+ gzipped), so we defer the chunk via
 * `React.lazy` + `<Suspense>`. While the scene streams, a soft skeleton
 * pulses in place so the host card never collapses to a 0×0 box.
 *
 * Used by the LearnMore hero to render the upstream interactive 3D robot
 * scene shipped by the 21st.dev integration brief
 * (`prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode`).
 */
const Spline = lazy(() => import('@splinetool/react-spline'))

interface SplineSceneProps {
  scene: string
  className?: string
}

export function SplineScene({ scene, className }: SplineSceneProps) {
  return (
    <Suspense
      fallback={
        <div
          className={`gs-spline-skeleton flex h-full w-full items-center justify-center ${className ?? ''}`}
          aria-hidden
        >
          <div className="gs-spline-skeleton__pulse" />
        </div>
      }
    >
      <Spline scene={scene} className={className} />
    </Suspense>
  )
}
