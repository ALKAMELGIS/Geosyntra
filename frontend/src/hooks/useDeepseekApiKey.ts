import { useSyncExternalStore } from 'react'
import { getDeepseekApiKey, subscribeDeepseekApiKey } from '../lib/deepseekApiKey'
import {
  isClientSecretHydrationAllowed,
  mustUseApiGateway,
  platformDeepseekAvailable,
  usePlatformTokenRuntime,
} from '../lib/platformTokenRuntime'

const PLATFORM_SYNC_EVENT = 'geosyntra-platform-tokens-synced'

function subscribeDeepseekAvailability(onStoreChange: () => void): () => void {
  const unsubs: Array<() => void> = []
  if (typeof window !== 'undefined') {
    const onPlatform = () => onStoreChange()
    window.addEventListener(PLATFORM_SYNC_EVENT, onPlatform)
    unsubs.push(() => window.removeEventListener(PLATFORM_SYNC_EVENT, onPlatform))
  }
  if (isClientSecretHydrationAllowed()) {
    unsubs.push(subscribeDeepseekApiKey(onStoreChange))
  }
  unsubs.push(usePlatformTokenRuntime.subscribe(onStoreChange))
  return () => unsubs.forEach(u => u())
}

function getDeepseekAvailabilitySnapshot(): boolean {
  if (mustUseApiGateway()) return platformDeepseekAvailable()
  return Boolean(getDeepseekApiKey().trim())
}

/** @deprecated Do not pass to vendor URLs — use `geosyntraChatWithDeepSeek` (gateway). */
export function useDeepseekApiKey(): string {
  const available = useSyncExternalStore(
    subscribeDeepseekAvailability,
    getDeepseekAvailabilitySnapshot,
    getDeepseekAvailabilitySnapshot,
  )
  if (!available) return ''
  if (mustUseApiGateway()) return '__gateway__'
  return getDeepseekApiKey()
}

export function useDeepseekAvailable(): boolean {
  return useSyncExternalStore(
    subscribeDeepseekAvailability,
    getDeepseekAvailabilitySnapshot,
    getDeepseekAvailabilitySnapshot,
  )
}
