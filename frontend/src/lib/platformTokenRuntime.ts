/**
 * Centralized platform token runtime — capabilities only (no secrets in memory by default).
 */
import { create } from 'zustand'
import type { GeminiContent } from './geoExplorerContracts'

export type PlatformProviderCapability = {
  label: string
  category: string
  configured: boolean
  active: boolean
  legacyBuiltin: string | null
}

export type PlatformCapabilities = {
  version: number
  providers: Record<string, PlatformProviderCapability>
  gemini: boolean
  openai: boolean
  claude: boolean
  deepseek: boolean
  mapbox: boolean
  arcgis: boolean
  sentinelhub: boolean
  openrouteservice?: boolean
  graphhopper?: boolean
  openweathermap?: boolean
}

type PlatformTokenRuntimeState = {
  revision: number | null
  capabilities: PlatformCapabilities | null
  gatewayMode: boolean
  mapboxPublicToken: string | null
  /** In-memory only — fetched from server session; never written to localStorage. */
  sentinelAccessToken: string | null
  sentinelWmsInstanceId: string | null
  lastSyncAt: string | null
  lastError: string | null
  setRuntime: (patch: Partial<PlatformTokenRuntimeState>) => void
  reset: () => void
}

export const usePlatformTokenRuntime = create<PlatformTokenRuntimeState>(set => ({
  revision: null,
  capabilities: null,
  gatewayMode: true,
  mapboxPublicToken: null,
  sentinelAccessToken: null,
  sentinelWmsInstanceId: null,
  lastSyncAt: null,
  lastError: null,
  setRuntime: patch => set(patch),
  reset: () =>
    set({
      revision: null,
      capabilities: null,
      gatewayMode: true,
      mapboxPublicToken: null,
      sentinelAccessToken: null,
      sentinelWmsInstanceId: null,
      lastSyncAt: null,
      lastError: null,
    }),
}))

export function isClientSecretHydrationAllowed(): boolean {
  return import.meta.env.VITE_ALLOW_CLIENT_API_SECRET_HYDRATION === 'true'
}

/** Production and default deployments: vendor secrets stay on the server. */
export function mustUseApiGateway(): boolean {
  if (isClientSecretHydrationAllowed()) return false
  if (import.meta.env.PROD) return true
  return import.meta.env.VITE_USE_API_GATEWAY !== 'false'
}

export function isGeminiGatewayPreferred(): boolean {
  return mustUseApiGateway()
}

export function platformClaudeAvailable(): boolean {
  const caps = usePlatformTokenRuntime.getState().capabilities
  if (caps?.claude) return true
  if (isClientSecretHydrationAllowed()) {
    try {
      return Boolean(localStorage.getItem('agri_claude_api_key_v1')?.trim())
    } catch {
      return false
    }
  }
  return false
}

export function platformDeepseekAvailable(): boolean {
  const caps = usePlatformTokenRuntime.getState().capabilities
  if (caps?.deepseek) return true
  if (isClientSecretHydrationAllowed()) {
    try {
      return Boolean(localStorage.getItem('agri_deepseek_api_key_v1')?.trim())
    } catch {
      return false
    }
  }
  return false
}

export function platformGeminiAvailable(): boolean {
  const caps = usePlatformTokenRuntime.getState().capabilities
  if (caps?.gemini) return true
  if (isClientSecretHydrationAllowed()) {
    try {
      const raw = localStorage.getItem('agri_gemini_api_key_v1')
      return Boolean(raw?.trim())
    } catch {
      return false
    }
  }
  return false
}

export type GatewayGeminiParams = {
  systemInstruction: string
  contents: GeminiContent[]
}
