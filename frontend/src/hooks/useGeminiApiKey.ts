import { useSyncExternalStore } from 'react'
import { getGeminiApiKey, subscribeGeminiApiKey } from '../lib/geminiApiKey'
import {
  isClientSecretHydrationAllowed,
  mustUseApiGateway,
  platformGeminiAvailable,
  usePlatformTokenRuntime,
} from '../lib/platformTokenRuntime'

const PLATFORM_SYNC_EVENT = 'geosyntra-platform-tokens-synced'

function subscribeGeminiAvailability(onStoreChange: () => void): () => void {
  const unsubs: Array<() => void> = []
  if (typeof window !== 'undefined') {
    const onPlatform = () => onStoreChange()
    window.addEventListener(PLATFORM_SYNC_EVENT, onPlatform)
    unsubs.push(() => window.removeEventListener(PLATFORM_SYNC_EVENT, onPlatform))
  }
  if (isClientSecretHydrationAllowed()) {
    unsubs.push(subscribeGeminiApiKey(onStoreChange))
  }
  const unsubZustand = usePlatformTokenRuntime.subscribe(onStoreChange)
  unsubs.push(unsubZustand)
  return () => unsubs.forEach(u => u())
}

function getGeminiAvailabilitySnapshot(): boolean {
  if (mustUseApiGateway()) return platformGeminiAvailable()
  return Boolean(getGeminiApiKey().trim())
}

/**
 * @deprecated Do not pass the return value to vendor URLs — use `geminiGenerateContent` (gateway).
 * Returns a sentinel when gateway mode is active so legacy `if (apiKey)` checks still work.
 */
export function useGeminiApiKey(): string {
  const available = useSyncExternalStore(
    subscribeGeminiAvailability,
    getGeminiAvailabilitySnapshot,
    getGeminiAvailabilitySnapshot,
  )
  if (!available) return ''
  if (mustUseApiGateway()) return '__gateway__'
  return getGeminiApiKey()
}

/** Preferred hook — boolean only, never exposes the secret. */
export function useGeminiAvailable(): boolean {
  return useSyncExternalStore(
    subscribeGeminiAvailability,
    getGeminiAvailabilitySnapshot,
    getGeminiAvailabilitySnapshot,
  )
}
