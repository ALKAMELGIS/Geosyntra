import { createAuthMiddleware } from '../rbac/middleware.js'
import { requirePlatformOwner } from '../rbac/platformOwner.js'
import { createSystemTokenStore } from './systemTokenStore.js'
import { createTokenManagerService } from './tokens.service.js'
import { registryEntry } from './tokenRegistry.js'
import { bumpTokenRevision, getTokenRevision } from './tokenRevision.js'
import { storeAwait } from '../storeAwait.js'
import { platformEnvVar } from '../platformDataPaths.js'

function requireOwner(req, res, next) {
  return requirePlatformOwner(req, res, next)
}

/**
 * Central API token registry — Owner-managed, encrypted in SQLite.
 *
 * @param {import('express').Express} app
 * @param {{
 *   store: ReturnType<import('../authDirectoryStore.js').createAuthDirectoryStore>
 *   sqlitePath?: string
 *   secretsFilePath?: string
 * }} deps
 */
export function registerSystemTokenRoutes(app, deps) {
  const tokenStore = createSystemTokenStore(deps.platformDb ?? deps.sqlitePath)
  const tokenManager = createTokenManagerService(tokenStore, { secretsFilePath: deps.secretsFilePath })
  const requireAuth = createAuthMiddleware(() => deps.store)

  app.get('/api/system/tokens/status', requireAuth, async (_req, res) => {
    return res.json({
      ok: true,
      tokens: await tokenManager.listRegistryStatus(),
      storeReady: tokenStore.ready,
      encrypted: Boolean(platformEnvVar('API_VAULT_MASTER_KEY')),
    })
  })

  app.get('/api/system/tokens', requireAuth, requireOwner, async (_req, res) => {
    return res.json({
      ok: true,
      tokens: await tokenManager.listMaskedForAdmin(),
      storeReady: tokenStore.ready,
    })
  })

  app.put('/api/system/tokens/:name', requireAuth, requireOwner, async (req, res) => {
    const name = String(req.params.name || '').trim().toLowerCase()
    const meta = registryEntry(name)
    if (!meta) return res.status(404).json({ ok: false, error: 'unknown_token' })
    if (meta.envOnly) {
      return res.status(400).json({
        ok: false,
        error: 'mapbox_env_only',
        message: 'Mapbox is configured via Hostinger MAPBOX environment variable only — not in API Manager or database.',
      })
    }
    if (!tokenStore.ready) {
      return res.status(503).json({
        ok: false,
        error: 'token_store_unavailable',
        message:
          'SQLite token store is not ready. Set GEOSYNTRA_DATA_DIR to a writable path on Hostinger and restart the Node app.',
      })
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const value = typeof body.value === 'string' ? body.value.trim() : ''
    if (!value) return res.status(400).json({ ok: false, error: 'value_required' })

    const actor = req.authPublic?.email || req.authUser?.email || null
    try {
      const result = await storeAwait(
        tokenStore.upsert({
          name,
          label: body.label || meta.label,
          category: body.category || meta.category,
          value,
          active: body.active !== false,
          expiresAt: body.expiresAt || null,
          updatedBy: actor,
        }),
      )
      tokenStore.appendAudit({
        tokenName: name,
        action: 'upsert',
        actorEmail: actor,
        detail: 'value rotated',
      })
      bumpTokenRevision('system_token_upsert')
      return res.json({ ok: true, token: result.row, revision: getTokenRevision() })
    } catch (e) {
      console.error('[system-tokens] upsert failed', name, e)
      return res.status(500).json({
        ok: false,
        error: 'token_persist_failed',
        message: e instanceof Error ? e.message : 'Failed to persist token',
      })
    }
  })

  app.patch('/api/system/tokens/:name', requireAuth, requireOwner, async (req, res) => {
    const name = String(req.params.name || '').trim().toLowerCase()
    const meta = registryEntry(name)
    if (!meta) return res.status(404).json({ ok: false, error: 'unknown_token' })
    if (meta.envOnly) {
      return res.status(400).json({
        ok: false,
        error: 'mapbox_env_only',
        message: 'Mapbox is configured via Hostinger MAPBOX environment variable only — not in API Manager or database.',
      })
    }
    if (!tokenStore.ready) return res.status(503).json({ ok: false, error: 'token_store_unavailable' })

    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const actor = req.authPublic?.email || req.authUser?.email || null

    if (typeof body.active === 'boolean') {
      await storeAwait(tokenStore.setActive(name, body.active, actor))
      tokenStore.appendAudit({
        tokenName: name,
        action: body.active ? 'enable' : 'disable',
        actorEmail: actor,
      })
    }

    if (typeof body.value === 'string' && body.value.trim()) {
      const meta = registryEntry(name)
      await storeAwait(
        tokenStore.upsert({
          name,
          label: meta.label,
          category: meta.category,
          value: body.value.trim(),
          active: body.active !== false,
          updatedBy: actor,
        }),
      )
      tokenStore.appendAudit({ tokenName: name, action: 'rotate', actorEmail: actor })
      bumpTokenRevision('system_token_rotate')
    }

    const masked = await storeAwait(tokenStore.listMasked())
    const row = masked.find(t => t.name === name)
    return res.json({ ok: true, token: row ?? null, revision: getTokenRevision() })
  })

  app.post('/api/system/tokens/:name/test', requireAuth, requireOwner, async (req, res) => {
    const name = String(req.params.name || '').trim().toLowerCase()
    if (!registryEntry(name)) return res.status(404).json({ ok: false, error: 'unknown_token' })

    const result = await tokenManager.testToken(name)
    if (tokenStore.ready) {
      tokenStore.recordTest(name, { ok: result.ok, message: result.message || result.error })
      tokenStore.appendAudit({
        tokenName: name,
        action: 'test',
        actorEmail: req.authPublic?.email || null,
        detail: result.message || result.error || '',
      })
    }
    return res.json({ ok: result.ok, ...result })
  })

  app.post('/api/system/tokens/migrate-from-vault', requireAuth, requireOwner, async (req, res) => {
    const actor = req.authPublic?.email || req.authUser?.email || null
    const result = await tokenManager.migrateFromLegacyVault(actor)
    if (result.ok && result.migrated > 0) bumpTokenRevision('migrate_from_vault')
    return res.json({ ...result, revision: getTokenRevision() })
  })

  return { tokenManager, tokenStore }
}
