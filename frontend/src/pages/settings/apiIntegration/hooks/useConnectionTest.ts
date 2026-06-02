import { useCallback, useState } from 'react'
import type { AuthType, IntegrationStatus, ProviderId } from '../types'
import { testVaultConnection } from '../vaultBridge'

export function useConnectionTest() {
  const [status, setStatus] = useState<IntegrationStatus>('pending')
  const [message, setMessage] = useState<string | null>(null)
  const [latencyMs, setLatencyMs] = useState<number | null>(null)
  const [testing, setTesting] = useState(false)

  const runTest = useCallback(
    async (params: {
      providerId: ProviderId
      authType: AuthType
      baseUrl: string
      config: Record<string, string>
      secrets: Record<string, string>
    }) => {
      setTesting(true)
      setStatus('testing')
      setMessage(null)
      try {
        const merged = { ...params.config, ...params.secrets }
        const result = await testVaultConnection(
          params.providerId,
          params.authType,
          merged,
          params.baseUrl,
        )
        setLatencyMs(result.latencyMs)
        setMessage(result.message)
        setStatus(result.ok ? 'connected' : 'invalid')
        return result
      } catch (e) {
        setStatus('invalid')
        const detail = e instanceof Error ? e.message : 'Unexpected error during connection test'
        setMessage(detail)
        return { ok: false, message: detail, latencyMs: 0 }
      } finally {
        setTesting(false)
      }
    },
    [],
  )

  const reset = useCallback(() => {
    setStatus('pending')
    setMessage(null)
    setLatencyMs(null)
  }, [])

  return { status, message, latencyMs, testing, runTest, reset }
}
