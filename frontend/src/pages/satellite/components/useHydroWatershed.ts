import { useCallback, useEffect, useRef, useState } from 'react'
import {
  runHydroWatershed,
  type HydroStageKey,
  type HydroWatershedResult,
} from '../../../lib/hydroWatershed/hydroEngine'

export type HydroWatershedController = {
  result: HydroWatershedResult | null
  isRunning: boolean
  progress: number
  stage: HydroStageKey | null
  error: string | null
  run: () => Promise<void>
  cancel: () => void
  reset: () => void
}

/**
 * Drives the Hydro Watershed terrain-analysis workflow for the active AOI.
 * Async DEM fetch + flow/stream/watershed model with an abortable run and
 * per-stage progress. Never mutates the AOI.
 */
export function useHydroWatershed(
  aoi: GeoJSON.Polygon | GeoJSON.MultiPolygon | null,
): HydroWatershedController {
  const [result, setResult] = useState<HydroWatershedResult | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState<HydroStageKey | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // A new AOI invalidates the previous analysis.
  useEffect(() => {
    setResult(null)
    setError(null)
    setProgress(0)
    setStage(null)
  }, [aoi])

  useEffect(
    () => () => {
      abortRef.current?.abort()
    },
    [],
  )

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setIsRunning(false)
  }, [])

  const reset = useCallback(() => {
    cancel()
    setResult(null)
    setError(null)
    setProgress(0)
    setStage(null)
  }, [cancel])

  const run = useCallback(async () => {
    if (!aoi) {
      setError('Draw or select an AOI first.')
      return
    }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setIsRunning(true)
    setError(null)
    setProgress(0)
    try {
      const res = await runHydroWatershed(aoi, {
        signal: controller.signal,
        onStage: (s, p) => {
          setStage(s)
          setProgress(p)
        },
      })
      if (controller.signal.aborted) return
      setResult(res)
      setProgress(1)
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return
      setError((e as Error)?.message || 'Hydro analysis failed.')
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setIsRunning(false)
    }
  }, [aoi])

  return { result, isRunning, progress, stage, error, run, cancel, reset }
}

export default useHydroWatershed
