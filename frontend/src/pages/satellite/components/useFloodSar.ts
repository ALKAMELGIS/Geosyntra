import { useCallback, useEffect, useRef, useState } from 'react'
import {
  runFloodAnalysis,
  type FloodResult,
} from '../../../lib/floodSar/floodEngine'

export type FloodRunParams = {
  thresholdDb: number
  preEventDate: string
  postEventDate: string
}

export type FloodSarController = {
  result: FloodResult | null
  isRunning: boolean
  progress: number
  error: string | null
  run: (params: FloodRunParams) => Promise<void>
  cancel: () => void
  reset: () => void
}

/**
 * Drives the SAR Flood Monitoring analysis for the active AOI. Async DEM fetch
 * + flood model with abortable run and progress. Never mutates the AOI.
 */
export function useFloodSar(
  aoi: GeoJSON.Polygon | GeoJSON.MultiPolygon | null,
): FloodSarController {
  const [result, setResult] = useState<FloodResult | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // A new AOI invalidates the previous flood result.
  useEffect(() => {
    setResult(null)
    setError(null)
    setProgress(0)
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
  }, [cancel])

  const run = useCallback(
    async (params: FloodRunParams) => {
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
        const res = await runFloodAnalysis(aoi, {
          thresholdDb: params.thresholdDb,
          preEventDate: params.preEventDate,
          postEventDate: params.postEventDate,
          signal: controller.signal,
          onProgress: f => setProgress(f),
        })
        if (controller.signal.aborted) return
        setResult(res)
        setProgress(1)
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return
        setError((e as Error)?.message || 'Flood analysis failed.')
      } finally {
        if (abortRef.current === controller) abortRef.current = null
        setIsRunning(false)
      }
    },
    [aoi],
  )

  return { result, isRunning, progress, error, run, cancel, reset }
}

export default useFloodSar
