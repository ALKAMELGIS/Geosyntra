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
      } catch {
        setStatus('invalid')
        setMessage('Unexpected error during connection test')
        return { ok: false, message: 'Unexpected error', latencyMs: 0 }
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
