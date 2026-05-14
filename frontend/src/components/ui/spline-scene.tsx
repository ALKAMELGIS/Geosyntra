import { Component, Suspense, lazy, memo, type ReactNode } from 'react'
import './spline-scene.css'

/**
 * GitHub Pages (and similar static hosts): remote `prod.spline.design` scene
 * fetch often fails (CORS/proxy/adblock) and react-spline throws into the root
 * error boundary. Skip loading the Spline runtime entirely — hero keeps layout.
 */
function isStaticGitHubPagesHost(): boolean {
  return typeof window !== 'undefined' && window.location.hostname.endsWith('github.io')
}

class SplineErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true }
  }

  componentDidCatch(error: unknown): void {
    console.warn('[SplineScene] runtime error; showing placeholder', error)
  }

  render(): ReactNode {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }
}

const Spline = lazy(async () => {
  try {
    return await import('@splinetool/react-spline')
  } catch (err) {
    console.warn('[SplineScene] @splinetool/react-spline chunk failed to load', err)
    const Fallback = () => <div className="gs-spline-skeleton h-full w-full" aria-hidden />
    return {
      default: Fallback as unknown as React.ComponentType<{ scene: string; className?: string }>,
    }
  }
})

interface SplineSceneProps {
  scene: string
  className?: string
}

function SplineFallback({ className }: { className?: string }) {
  return <div className={`gs-spline-skeleton h-full w-full ${className ?? ''}`} aria-hidden />
}

function SplineSceneInner({ scene, className }: SplineSceneProps) {
  const fallback = <SplineFallback className={className} />
  if (isStaticGitHubPagesHost()) return fallback

  return (
    <SplineErrorBoundary key={scene} fallback={fallback}>
      <Suspense fallback={fallback}>
        <Spline scene={scene} className={className} />
      </Suspense>
    </SplineErrorBoundary>
  )
}

export const SplineScene = memo(SplineSceneInner)
