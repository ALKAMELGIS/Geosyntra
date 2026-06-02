/**
 * Platform token runtime sync after login — capabilities via API gateway (no secrets by default).
 */
import { applyPersistedApiSecretsToBrowser } from './apiSecretsServerPersistence'
import { canManagePlatformApiTokens } from './apiTokenOwnerPolicy'
import { useApiTokenStore } from './apiTokenStore'
import { hydratePlatformConfigFromServer } from './apiConfigClient'
import { readAccessToken, readCurrentUser } from './auth'
import { clearBuiltinTokenBrowserOverrides } from './clearBuiltinTokenOverrides'
import { fetchUserApiTokenSession, fetchUserApiTokensMasked } from './userApiTokensApi'
import { hydrateApiVaultCatalogFromServer } from './apiVaultPersistence'
import {
  isClientSecretHydrationAllowed,
  mustUseApiGateway,
  usePlatformTokenRuntime,
} from './platformTokenRuntime'
let lastHydratedUserId: number | null = null
let lastAppliedRevision: number | null = null

export type UserTokenSyncResult = {
  ok: boolean
  hydrated?: boolean
  error?: string
}

export type UserTokenSyncOptions = {
  force?: boolean
  revision?: number
}

export async function syncUserApiTokensForSession(
  options: UserTokenSyncOptions = {},
): Promise<UserTokenSyncResult> {
  const user = readCurrentUser()
  const access = readAccessToken()
  if (!user || !access) {
    lastHydratedUserId = null
    lastAppliedRevision = null
    useApiTokenStore.getState().reset()
    usePlatformTokenRuntime.getState().reset()
    return { ok: false, error: 'not_authenticated' }
  }

  const userId = typeof user.id === 'number' ? user.id : Number(user.id)
  if (!Number.isFinite(userId)) return { ok: false, error: 'invalid_user' }

  const isOwner = canManagePlatformApiTokens()

  if (lastHydratedUserId !== null && lastHydratedUserId !== userId) {
    clearBuiltinTokenBrowserOverrides()
    lastAppliedRevision = null
  }
  lastHydratedUserId = userId

  if (
    !options.force &&
    typeof options.revision === 'number' &&
    lastAppliedRevision === options.revision
  ) {
    return { ok: true, hydrated: true }
  }

  if (isOwner) {
    useApiTokenStore.getState().setSyncing(true)
  }

  const sessionRes = await fetchUserApiTokenSession()
  if (isOwner) {
    const maskedRes = await fetchUserApiTokensMasked()
    if (maskedRes.ok && maskedRes.tokens) {
      useApiTokenStore.getState().setMasked(maskedRes.tokens)
    }
  }

  if (sessionRes.ok) {
    const allowBrowserSecrets = isClientSecretHydrationAllowed()
    const gatewayMode = sessionRes.gatewayMode !== false && !allowBrowserSecrets

    usePlatformTokenRuntime.getState().setRuntime({
      revision: sessionRes.revision ?? null,
      capabilities: sessionRes.capabilities ?? null,
      gatewayMode,
      lastSyncAt: new Date().toISOString(),
      lastError: null,
    })

    if (allowBrowserSecrets && sessionRes.secrets) {
      const hasBuiltin = Object.values(sessionRes.secrets.builtin ?? {}).some(
        v => typeof v === 'string' && v.trim(),
      )
      const hasSlots = Object.values(sessionRes.secrets.customSlots ?? {}).some(
        v => typeof v === 'string' && v.trim(),
      )
      if (hasBuiltin || hasSlots) {
        applyPersistedApiSecretsToBrowser(sessionRes.secrets)
      }
    } else if (gatewayMode) {
      clearBuiltinTokenBrowserOverrides()
      const platformConfig = await hydratePlatformConfigFromServer()
      const runtimePatch: {
        capabilities?: typeof sessionRes.capabilities
        revision?: number | null
        sentinelAccessToken?: string | null
        sentinelWmsInstanceId?: string | null
      } = {}
      if (platformConfig.ok) {
        if (platformConfig.capabilities) runtimePatch.capabilities = platformConfig.capabilities
        if (typeof platformConfig.revision === 'number') runtimePatch.revision = platformConfig.revision
        runtimePatch.sentinelAccessToken = platformConfig.sentinelAccessToken?.trim() || null
        runtimePatch.sentinelWmsInstanceId = platformConfig.sentinelWmsInstanceId?.trim() || null
      }
      usePlatformTokenRuntime.getState().setRuntime(runtimePatch)
    }

    lastAppliedRevision =
      typeof sessionRes.revision === 'number' ? sessionRes.revision : Date.now()

    await hydrateApiVaultCatalogFromServer()
    if (isOwner) {
      useApiTokenStore.getState().markSynced()
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('geosyntra-user-api-tokens-hydrated'))
      window.dispatchEvent(new Event('geosyntra-api-secrets-hydrated'))
      window.dispatchEvent(new Event('geosyntra-platform-tokens-synced'))
    }
    return { ok: true, hydrated: true }
  }

  if (isOwner) {
    useApiTokenStore.getState().setError(sessionRes.error ?? 'session_hydrate_failed')
  }
  usePlatformTokenRuntime.getState().setRuntime({
    lastError: sessionRes.error ?? 'session_hydrate_failed',
  })
  await hydrateApiVaultCatalogFromServer()
  return { ok: false, error: isOwner ? sessionRes.error ?? 'session_hydrate_failed' : undefined }
}

export function resetUserTokenSessionSync(): void {
  lastHydratedUserId = null
  lastAppliedRevision = null
  clearBuiltinTokenBrowserOverrides()
  useApiTokenStore.getState().reset()
  usePlatformTokenRuntime.getState().reset()
}
