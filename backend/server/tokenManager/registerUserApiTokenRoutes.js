import { createAuthMiddleware } from '../rbac/middleware.js'
import { requirePlatformOwner, isPlatformOwnerUserRecord } from '../rbac/platformOwner.js'
import { createUserApiTokenStore } from './userApiTokenStore.js'
import { buildPlatformSessionSecrets, buildSessionSecretsPayload } from './userTokenHydration.js'
import { buildPlatformCapabilities } from './platformCapabilities.js'
import { registryEntry } from './tokenRegistry.js'
import { bumpTokenRevision, getTokenRevision } from './tokenRevision.js'

function isOwnerRole(req) {
  return isPlatformOwnerUserRecord(req.authUser)
}

function requireOwner(req, res, next) {
  return requirePlatformOwner(req, res, next)
}

/**
 * Per-user token store (Owner writes) + session hydration (all authenticated users, platform keys only).
 */
export function registerUserApiTokenRoutes(app, deps) {
  const userTokenStore = createUserApiTokenStore(deps.sqlitePath)
  const systemTokenStore = deps.systemTokenStore ?? null
  const requireAuth = createAuthMiddleware(() => deps.store)

  app.get('/api/user/api-tokens', requireAuth, requireOwner, (req, res) => {
    if (!userTokenStore.ready) {
      return res.status(503).json({ ok: false, error: 'token_store_unavailable' })
    }
    const userId = Number(req.authUser?.id)
    return res.json({
      ok: true,
      tokens: userTokenStore.listMaskedForUser(userId),
      storeReady: true,
      encrypted: Boolean(process.env.AGRI_API_VAULT_MASTER_KEY?.trim()),
    })
  })

  /**
   * Session runtime — capabilities + revision for all users.
   * Plaintext secrets are opt-in legacy only (AGRI_ALLOW_CLIENT_SECRET_HYDRATION=true).
   */
  app.get('/api/user/api-tokens/session', requireAuth, (req, res) => {
    const owner = isOwnerRole(req)
    const userId = Number(req.authUser?.id)
    const allowClientHydration = process.env.AGRI_ALLOW_CLIENT_SECRET_HYDRATION === 'true'
    const secrets = userTokenStore.ready
      ? buildSessionSecretsPayload(userTokenStore, systemTokenStore, { userId, isOwner: owner })
      : buildPlatformSessionSecrets(systemTokenStore)
    const capabilities = buildPlatformCapabilities(systemTokenStore)
    const hasAny =
      Object.keys(secrets.builtin || {}).length > 0 || Object.keys(secrets.customSlots || {}).length > 0
    const payload = {
      ok: true,
      revision: getTokenRevision(),
      persisted: hasAny,
      capabilities,
      encrypted: Boolean(process.env.AGRI_API_VAULT_MASTER_KEY?.trim()),
      readOnly: !owner,
      gatewayMode: !allowClientHydration,
    }
    if (allowClientHydration) {
      payload.secrets = secrets
    }
    return res.json(payload)
  })

  app.put('/api/user/api-tokens/:provider', requireAuth, requireOwner, (req, res) => {
    const provider = String(req.params.provider || '').trim().toLowerCase()
    if (!provider) return res.status(400).json({ ok: false, error: 'provider_required' })
    const meta = registryEntry(provider)
    if (meta?.envOnly) {
      return res.status(400).json({
        ok: false,
        error: 'mapbox_env_only',
        message: 'Mapbox is configured via Hostinger MAPBOX environment variable only — not in API Manager or database.',
      })
    }
    if (!userTokenStore.ready) {
      return res.status(503).json({
        ok: false,
        error: 'token_store_unavailable',
        message:
          'SQLite token store is not ready. Set AGRI_DATA_DIR to a writable path on Hostinger and restart the Node app.',
      })
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const value = typeof body.value === 'string' ? body.value.trim() : ''
    if (!value) return res.status(400).json({ ok: false, error: 'value_required' })

    const userId = Number(req.authUser?.id)
    const email = req.authPublic?.email || req.authUser?.email || ''
    try {
      const result = userTokenStore.upsert({ userId, userEmail: email, provider, value })
      if (!result.ok) return res.status(400).json(result)

      if (systemTokenStore?.ready && registryEntry(provider)) {
        const meta = registryEntry(provider)
        systemTokenStore.upsert({
          name: provider,
          label: meta.label,
          category: meta.category,
          value,
          active: true,
          updatedBy: email,
        })
        bumpTokenRevision('user_api_token_upsert')
      }

      return res.json({ ok: true, token: result.row, revision: getTokenRevision() })
    } catch (e) {
      console.error('[user-api-tokens] upsert failed', provider, e)
      return res.status(500).json({
        ok: false,
        error: 'token_persist_failed',
        message: e instanceof Error ? e.message : 'Failed to persist token',
      })
    }
  })

  app.delete('/api/user/api-tokens/:provider', requireAuth, requireOwner, (req, res) => {
    const provider = String(req.params.provider || '').trim().toLowerCase()
    if (!userTokenStore.ready) return res.status(503).json({ ok: false, error: 'token_store_unavailable' })
    const userId = Number(req.authUser?.id)
    userTokenStore.remove(userId, provider)
    if (systemTokenStore?.ready && registryEntry(provider)) {
      systemTokenStore.setActive(provider, false, req.authPublic?.email || null)
      bumpTokenRevision('user_api_token_delete')
    }
    return res.json({ ok: true, revision: getTokenRevision() })
  })

  app.get('/api/system/user-api-tokens/overview', requireAuth, requireOwner, (req, res) => {
    if (!userTokenStore.ready) {
      return res.status(503).json({ ok: false, error: 'token_store_unavailable' })
    }
    return res.json({ ok: true, tokens: userTokenStore.listMaskedAll() })
  })

  return { userTokenStore }
}
