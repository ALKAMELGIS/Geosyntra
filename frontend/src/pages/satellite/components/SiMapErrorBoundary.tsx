import { Component, type ReactNode } from 'react'
import { isRecoverableMapboxMapError } from '../../../lib/mapboxWorkerErrorGuard'

type Props = { children: ReactNode }
type State = { caught: unknown }

/**
 * Localized error boundary around the Mapbox GL map.
 *
 * react-map-gl applies prop/viewState updates synchronously during React's
 * commit phase. While zooming, Mapbox GL aborts in-flight tile fetches, and its
 * Web Worker transfer serializer cannot serialize the resulting `DOMException`
 * (AbortError), throwing:
 *
 *   Can't serialize object of unregistered class "DOMException".
 *
 * Because that throw happens inside the React commit, it is caught by a React
 * error boundary (not by window `error` / `unhandledrejection` listeners).
 * Previously the global boundary caught it and tore down the whole SPA.
 *
 * This boundary recovers locally: recoverable errors are transient — an aborted
 * tile is simply re-requested at the new viewport, and a "Style is not done
 * loading" thrown mid basemap-swap clears once the new style settles — so we
 * clear the error and let React re-mount only the map subtree. Any other (real)
 * error is re-thrown so the global boundary can handle it as before.
 */
export class SiMapErrorBoundary extends Component<Props, State> {
  state: State = { caught: null }

  /** Runaway guard: if recoveries come too fast, stop swallowing and bubble up. */
  private resetTimestamps: number[] = []

  static getDerivedStateFromError(error: unknown): State {
    return { caught: error }
  }

  componentDidCatch(error: unknown): void {
    if (!isRecoverableMapboxMapError(error)) return
    const now = Date.now()
    this.resetTimestamps = this.resetTimestamps.filter(t => now - t < 4000)
    this.resetTimestamps.push(now)
    if (this.resetTimestamps.length > 12) {
      // Too many recoveries in a short window — let render() re-throw so the
      // global boundary surfaces it instead of pinning the CPU in a loop.
      return
    }
    try {
      console.warn('[mapbox] Recovered map after recoverable error (aborted tile / style swap).')
    } catch {
      /* console may be unavailable */
    }
    this.setState({ caught: null })
  }

  render(): ReactNode {
    const { caught } = this.state
    if (caught && !isRecoverableMapboxMapError(caught)) {
      throw caught
    }
    if (caught && this.resetTimestamps.length > 12) {
      throw caught
    }
    return this.props.children
  }
}

export default SiMapErrorBoundary
