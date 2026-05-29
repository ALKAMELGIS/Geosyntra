import { useCallback, useEffect, useRef, useState } from 'react'
import { loadVaultSecret, maskSecret } from '../vaultBridge'
import type { ProviderId } from '../types'

const REVEAL_MS = 12_000

export function useSecureTokens(providerId: ProviderId) {
  const [secrets, setSecrets] = useState<Record<string, string>>({})
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  const timers = useRef<Record<string, number>>({})

  useEffect(() => {
    const primary = loadVaultSecret(providerId)
    if (primary) {
      setSecrets(prev => ({ ...prev, _vaultPrimary: primary }))
    }
  }, [providerId])

  const setSecret = useCallback((fieldId: string, value: string) => {
    setSecrets(prev => ({ ...prev, [fieldId]: value }))
  }, [])

  const toggleReveal = useCallback((fieldId: string) => {
    setRevealed(prev => {
      const next = !prev[fieldId]
      if (timers.current[fieldId]) window.clearTimeout(timers.current[fieldId])
      if (next) {
        timers.current[fieldId] = window.setTimeout(() => {
          setRevealed(r => ({ ...r, [fieldId]: false }))
        }, REVEAL_MS)
      }
      return { ...prev, [fieldId]: next }
    })
  }, [])

  const copySecret = useCallback(async (fieldId: string) => {
    const value = secrets[fieldId]
    if (!value) return false
    try {
      await navigator.clipboard.writeText(value)
      return true
    } catch {
      return false
    }
  }, [secrets])

  const displayValue = useCallback(
    (fieldId: string, raw: string) => {
      if (!raw) return ''
      if (revealed[fieldId]) return raw
      return maskSecret(raw)
    },
    [revealed],
  )

  useEffect(() => {
    return () => {
      Object.values(timers.current).forEach(t => window.clearTimeout(t))
    }
  }, [])

  return { secrets, setSecret, revealed, toggleReveal, copySecret, displayValue }
}
