import type { BuiltinSecretKey } from './apiSecretsServerPersistence'
import { persistArcgisPortalTokenInBrowser } from './arcgisPortalToken'
import { persistClaudeApiKeyInBrowser } from './claudeApiKey'
import { persistDeepseekApiKeyInBrowser } from './deepseekApiKey'
import { persistGeminiApiKeyInBrowser } from './geminiApiKey'
import { persistGraphHopperApiKeyInBrowser } from './graphHopperApiKey'
import { persistOpenWeatherMapApiKeyInBrowser } from './openWeatherMapApiKey'
import { persistOpenRouteServiceApiKeyInBrowser } from './openRouteServiceApiKey'
import { persistSentinelHubAccessTokenInBrowser } from './sentinelHubAccessToken'
import { persistSentinelHubWmsInstanceIdInBrowser } from './sentinelHubWmsInstance'

const CLEAR_HANDLERS: Record<BuiltinSecretKey, (v: string) => void> = {
  arcgisPortalToken: persistArcgisPortalTokenInBrowser,
  openWeatherMapApiKey: persistOpenWeatherMapApiKeyInBrowser,
  sentinelHubAccessToken: persistSentinelHubAccessTokenInBrowser,
  sentinelHubWmsInstanceId: persistSentinelHubWmsInstanceIdInBrowser,
  geminiApiKey: persistGeminiApiKeyInBrowser,
  claudeApiKey: persistClaudeApiKeyInBrowser,
  deepseekApiKey: persistDeepseekApiKeyInBrowser,
  orsApiKey: persistOpenRouteServiceApiKeyInBrowser,
  graphHopperApiKey: persistGraphHopperApiKeyInBrowser,
}

/** Clears in-browser builtin overrides before hydrating another user's session tokens. */
export function clearBuiltinTokenBrowserOverrides(): void {
  for (const fn of Object.values(CLEAR_HANDLERS)) {
    fn('')
  }
}
