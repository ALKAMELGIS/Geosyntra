import { useSyncExternalStore } from 'react'
import { getClaudeApiKey, subscribeClaudeApiKey } from '../lib/claudeApiKey'
import {
  isClientSecretHydrationAllowed,
  mustUseApiGateway,
  platformClaudeAvailable,
  usePlatformTokenRuntime,
} from '../lib/platformTokenRuntime'

const PLATFORM_SYNC_EVENT = 'geosyntra-platform-tokens-synced'

function subscribeClaudeAvailability(onStoreChange: () => void): () => void {
  const unsubs: Array<() => void> = []
  if (typeof window !== 'undefined') {
    const onPlatform = () => onStoreChange()
    window.addEventListener(PLATFORM_SYNC_EVENT, onPlatform)
    unsubs.push(() => window.removeEventListener(PLATFORM_SYNC_EVENT, onPlatform))
  }
  if (isClientSecretHydrationAllowed()) {
    unsubs.push(subscribeClaudeApiKey(onStoreChange))
  }
  unsubs.push(usePlatformTokenRuntime.subscribe(onStoreChange))
  return () => unsubs.forEach(u => u())
}

function getClaudeAvailabilitySnapshot(): boolean {
  if (mustUseApiGateway()) return platformClaudeAvailable()
  return Boolean(getClaudeApiKey().trim())
}

/** @deprecated Do not pass to vendor URLs — use `claudeGeoAiComplete` (gateway). */
export function useClaudeApiKey(): string {
  const available = useSyncExternalStore(
    subscribeClaudeAvailability,
    getClaudeAvailabilitySnapshot,
    getClaudeAvailabilitySnapshot,
  )
  if (!available) return ''
  if (mustUseApiGateway()) return '__gateway__'
  return getClaudeApiKey()
}

export function useClaudeAvailable(): boolean {
  return useSyncExternalStore(
    subscribeClaudeAvailability,
    getClaudeAvailabilitySnapshot,
    getClaudeAvailabilitySnapshot,
  )
}
