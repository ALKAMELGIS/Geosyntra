/**
 * Persistent API vault — survives frontend rebuilds when `GEOSYNTRA_API_SECRETS_FILE` is on a volume.
 *
 * v4 store:
 *   • catalog.integrations + catalog.meta (no secret values — safe in JSON)
 *   • secrets (builtin + customSlots) — plaintext or AES-256-GCM envelope
 *   • auditLog for owner API management
 *
 * Env (GEOSYNTRA_* preferred; AGRI_* legacy):
 *   GEOSYNTRA_API_SECRETS_FILE — path (default geosyntra_api_secrets.json)
 *   GEOSYNTRA_API_SECRETS_TOKEN — optional guard header
 *   GEOSYNTRA_API_VAULT_MASTER_KEY — encrypt secrets at rest (hex 64 or passphrase)
 *   GEOSYNTRA_API_VAULT_BACKUP_DIR — auto-backup directory on each PUT
 */

import fs from 'fs'
import path from 'path'
import { verifyAccessToken } from './rbac/jwt.js'
import { isPlatformOwnerUserRecord } from './rbac/platformOwner.js'
import { decryptJsonEnvelope, encryptJsonEnvelope } from './apiVaultCrypto.js'
import { platformEnvVar } from './platformDataPaths.js'

const BUILTIN_KEYS = [
  'arcgisPortalToken',
  'openWeatherMapApiKey',
  'sentinelHubAccessToken',
  'sentinelHubWmsInstanceId',
  'geminiApiKey',
  'claudeApiKey',
  'deepseekApiKey',
  'orsApiKey',
]

const MAX_INTEGRATIONS = 200
const MAX_AUDIT = 500

function emptySecrets() {
  return { version: 3, builtin: {}, customSlots: {} }
}

function emptyVault() {
  return {
    version: 4,
    updatedAt: null,
    catalog: { updatedAt: null, integrations: [], meta: {} },
    secretsPlain: emptySecrets(),
    secretsEnvelope: null,
    auditLog: [],
  }
}

function resolveMasterKey() {
  return platformEnvVar('API_VAULT_MASTER_KEY') || platformEnvVar('BACKUP_MASTER_KEY')
}

function migrateLegacySecrets(raw) {
  if (!raw || typeof raw !== 'object') return emptySecrets()
  if (raw.version === 3 && raw.builtin && typeof raw.builtin === 'object') {
    return {
      version: 3,
      builtin: { ...raw.builtin },
      customSlots: typeof raw.customSlots === 'object' && raw.customSlots ? { ...raw.customSlots } : {},
    }
  }
  const builtin = {}
  for (const k of BUILTIN_KEYS) {
    if (Object.prototype.hasOwnProperty.call(raw, k) && typeof raw[k] === 'string') {
      builtin[k] = raw[k]
    }
  }
  return {
    version: 3,
    builtin,
    customSlots: typeof raw.customSlots === 'object' && raw.customSlots ? { ...raw.customSlots } : {},
  }
}

function readSecretsFromVault(vault, masterKey) {
  if (vault.secretsEnvelope && masterKey) {
    try {
      return migrateLegacySecrets(decryptJsonEnvelope(vault.secretsEnvelope, masterKey))
    } catch (e) {
      console.error('[api-vault] decrypt failed', e)
      return emptySecrets()
    }
  }
  return migrateLegacySecrets(vault.secretsPlain || vault)
}

function writeSecretsToVault(vault, secrets, masterKey) {
  const next = migrateLegacySecrets(secrets)
  if (masterKey) {
    vault.secretsEnvelope = encryptJsonEnvelope(next, masterKey)
    vault.secretsPlain = null
  } else {
    vault.secretsPlain = next
    vault.secretsEnvelope = null
  }
  return next
}

function migrateFileToVault(raw) {
  if (!raw || typeof raw !== 'object') return emptyVault()
  if (raw.version === 4) {
    const vault = emptyVault()
    vault.version = 4
    vault.updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : null
    vault.catalog = {
      updatedAt: raw.catalog?.updatedAt ?? null,
      integrations: Array.isArray(raw.catalog?.integrations) ? raw.catalog.integrations.slice(0, MAX_INTEGRATIONS) : [],
      meta: raw.catalog?.meta && typeof raw.catalog.meta === 'object' ? { ...raw.catalog.meta } : {},
    }
    vault.secretsEnvelope = raw.secretsEnvelope ?? null
    vault.secretsPlain = raw.secretsPlain ? migrateLegacySecrets(raw.secretsPlain) : null
    vault.auditLog = Array.isArray(raw.auditLog) ? raw.auditLog.slice(0, MAX_AUDIT) : []
    return vault
  }
  const vault = emptyVault()
  vault.secretsPlain = migrateLegacySecrets(raw)
  return vault
}

export function readVaultFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return { persisted: false, vault: null, secrets: null }
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    const vault = migrateFileToVault(raw)
    const masterKey = resolveMasterKey()
    const secrets = readSecretsFromVault(vault, masterKey)
    return { persisted: true, vault, secrets }
  } catch (e) {
    console.error('[api-vault] read failed', e)
    return { persisted: false, vault: null, secrets: null }
  }
}

function atomicWriteJson(filePath, data) {
  const dir = path.dirname(filePath)
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch {
    /* ignore */
  }
  const tmp = `${filePath}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  fs.renameSync(tmp, filePath)
}

function writeAutoVaultBackup(filePath, vault, masterKey, backupDir) {
  if (!backupDir || !masterKey) return
  try {
    fs.mkdirSync(backupDir, { recursive: true })
    const secrets = readSecretsFromVault(vault, masterKey)
    const blob = encryptJsonEnvelope(
      { version: 4, catalog: vault.catalog, secrets, exportedAt: new Date().toISOString() },
      masterKey,
    )
    const name = `api-vault-${new Date().toISOString().replace(/[:.]/g, '-')}.enc.json`
    fs.writeFileSync(path.join(backupDir, name), JSON.stringify(blob), 'utf8')
    const files = fs
      .readdirSync(backupDir)
      .filter(f => f.startsWith('api-vault-') && f.endsWith('.enc.json'))
      .map(f => ({ f, t: fs.statSync(path.join(backupDir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)
    for (const x of files.slice(30)) {
      try {
        fs.unlinkSync(path.join(backupDir, x.f))
      } catch {
        /* ignore */
      }
    }
  } catch (e) {
    console.error('[api-vault] auto-backup failed', e)
  }
}

function appendAudit(vault, entry) {
  const log = Array.isArray(vault.auditLog) ? [...vault.auditLog] : []
  log.unshift({
    at: new Date().toISOString(),
    ...entry,
  })
  vault.auditLog = log.slice(0, MAX_AUDIT)
}

export function mergeAndWriteApiSecrets(filePath, patch, opts = {}) {
  const masterKey = resolveMasterKey()
  const backupDir = platformEnvVar('API_VAULT_BACKUP_DIR')
  const prevState = readVaultFile(filePath)
  const vault = prevState.vault ? { ...prevState.vault } : emptyVault()
  const prev = readSecretsFromVault(vault, masterKey)
  const builtin = { ...prev.builtin }
  const customSlots = { ...prev.customSlots }

  for (const k of BUILTIN_KEYS) {
    if (Object.prototype.hasOwnProperty.call(patch, k) && typeof patch[k] === 'string') {
      if (!patch[k].trim()) delete builtin[k]
      else builtin[k] = patch[k]
    }
  }

  if (patch.customSlots && typeof patch.customSlots === 'object') {
    for (const [slotId, val] of Object.entries(patch.customSlots)) {
      if (!slotId) continue
      const s = val === null || val === undefined ? '' : String(val)
      if (!s.trim()) delete customSlots[slotId]
      else customSlots[slotId] = s
    }
  }

  const nextSecrets = { version: 3, builtin, customSlots }
  writeSecretsToVault(vault, nextSecrets, masterKey)
  vault.updatedAt = new Date().toISOString()
  appendAudit(vault, {
    action: 'secrets.patch',
    actor: opts.actor || null,
    meta: { keys: Object.keys(patch).filter(k => k !== 'customSlots') },
  })
  atomicWriteJson(filePath, vault)
  writeAutoVaultBackup(filePath, vault, masterKey, backupDir)
  return { persisted: true, secrets: nextSecrets, vault }
}

export function mergeAndWriteApiVaultCatalog(filePath, catalogPatch, opts = {}) {
  const masterKey = resolveMasterKey()
  const backupDir = platformEnvVar('API_VAULT_BACKUP_DIR')
  const prevState = readVaultFile(filePath)
  const vault = prevState.vault ? JSON.parse(JSON.stringify(prevState.vault)) : emptyVault()

  if (Array.isArray(catalogPatch?.integrations)) {
    vault.catalog.integrations = catalogPatch.integrations.slice(0, MAX_INTEGRATIONS)
  }
  if (catalogPatch?.meta && typeof catalogPatch.meta === 'object') {
    vault.catalog.meta = { ...vault.catalog.meta, ...catalogPatch.meta }
  }
  if (catalogPatch?.integrationsMeta && typeof catalogPatch.integrationsMeta === 'object') {
    vault.catalog.meta = { ...vault.catalog.meta, ...catalogPatch.integrationsMeta }
  }

  vault.catalog.updatedAt = new Date().toISOString()
  vault.updatedAt = vault.catalog.updatedAt
  appendAudit(vault, {
    action: 'catalog.sync',
    actor: opts.actor || null,
    meta: { integrationCount: vault.catalog.integrations.length },
  })
  atomicWriteJson(filePath, vault)
  writeAutoVaultBackup(filePath, vault, masterKey, backupDir)
  const secrets = readSecretsFromVault(vault, masterKey)
  return { persisted: true, vault, secrets }
}

/** @deprecated use readVaultFile */
export function readApiSecretsFile(filePath) {
  const { persisted, secrets } = readVaultFile(filePath)
  return { persisted, secrets }
}

/**
 * @param {import('express').Express} app
 * @param {{ secretsFilePath: string, accessToken?: string, blockClientSecretReads?: boolean, getStore?: () => unknown }} opts
 */
export function registerApiSecretsRoutes(app, opts) {
  const { secretsFilePath, accessToken, blockClientSecretReads = true } = opts
  const token = String(accessToken || '').trim()
  const masterKey = resolveMasterKey()

  async function ownerJwtAllowed(req) {
    const getStore = opts.getStore
    if (typeof getStore !== 'function') return false
    const store = getStore()
    if (!store?.getUserById) return false
    const auth = String(req.headers.authorization || '')
      .replace(/^Bearer\s+/i, '')
      .trim()
    if (!auth) return false
    const verified = verifyAccessToken(auth)
    if (!verified.ok) return false
    const user = await Promise.resolve(store.getUserById(Number(verified.payload.sub)))
    return isPlatformOwnerUserRecord(user)
  }

  async function guard(req, res, next) {
    if (await ownerJwtAllowed(req)) {
      req._apiSecretsLegacyBypass = true
      return next()
    }
    if (!token) {
      req._apiSecretsLegacyBypass = false
      return next()
    }
    const hdr = String(req.headers['x-agri-api-secrets-token'] || '').trim()
    const auth = String(req.headers.authorization || '')
      .replace(/^Bearer\s+/i, '')
      .trim()
    if (hdr === token || auth === token) {
      req._apiSecretsLegacyBypass = true
      return next()
    }
    return res.status(401).json({ error: 'Invalid or missing X-Agri-Api-Secrets-Token / Authorization.' })
  }

  function actorFromReq(req) {
    const email = String(req.headers['x-agri-vault-actor'] || '').trim()
    return email || null
  }

  app.get('/api/system/api-secrets', guard, (req, res) => {
    const { persisted, secrets } = readVaultFile(secretsFilePath)
    if (!persisted || !secrets) {
      return res.json({ ok: true, persisted: false })
    }
    if (blockClientSecretReads && !req._apiSecretsLegacyBypass) {
      return res.json({
        ok: true,
        persisted: true,
        encrypted: Boolean(masterKey),
        clientSecretsDisabled: true,
        message:
          'Platform API tokens are server-side only. Owners manage credentials at GET /api/system/tokens (JWT). Users call GeoSyntra backend proxies.',
        statusEndpoint: '/api/system/tokens/status',
      })
    }
    return res.json({ ok: true, persisted: true, secrets, encrypted: Boolean(masterKey) })
  })

  app.put('/api/system/api-secrets', guard, (req, res) => {
    try {
      const patch = req.body && typeof req.body === 'object' ? req.body : {}
      const { secrets } = mergeAndWriteApiSecrets(secretsFilePath, patch, { actor: actorFromReq(req) })
      return res.json({ ok: true, persisted: true, secrets, encrypted: Boolean(masterKey) })
    } catch (e) {
      console.error('[api-secrets] write failed', e)
      return res.status(500).json({ error: 'Failed to persist API secrets.' })
    }
  })

  app.get('/api/system/api-vault', guard, (req, res) => {
    const { persisted, vault, secrets } = readVaultFile(secretsFilePath)
    if (!persisted || !vault) {
      return res.json({ ok: true, persisted: false })
    }
    if (blockClientSecretReads && !req._apiSecretsLegacyBypass) {
      return res.json({
        ok: true,
        persisted: true,
        encrypted: Boolean(masterKey),
        updatedAt: vault.updatedAt,
        catalog: vault.catalog,
        clientSecretsDisabled: true,
        auditLog: vault.auditLog ?? [],
        message: 'Secret values are not returned to browsers. Use Owner Token Manager APIs.',
      })
    }
    return res.json({
      ok: true,
      persisted: true,
      encrypted: Boolean(masterKey),
      updatedAt: vault.updatedAt,
      catalog: vault.catalog,
      secrets,
      auditLog: vault.auditLog ?? [],
    })
  })

  app.put('/api/system/api-vault', guard, (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {}
      const actor = actorFromReq(req)
      let result = readVaultFile(secretsFilePath)
      if (body.secrets && typeof body.secrets === 'object') {
        result = mergeAndWriteApiSecrets(secretsFilePath, body.secrets, { actor })
      }
      if (body.catalog && typeof body.catalog === 'object') {
        result = mergeAndWriteApiVaultCatalog(secretsFilePath, body.catalog, { actor })
      }
      const fresh = readVaultFile(secretsFilePath)
      return res.json({
        ok: true,
        persisted: true,
        encrypted: Boolean(masterKey),
        updatedAt: fresh.vault?.updatedAt ?? null,
        catalog: fresh.vault?.catalog ?? { integrations: [], meta: {} },
        secrets: fresh.secrets,
      })
    } catch (e) {
      console.error('[api-vault] write failed', e)
      return res.status(500).json({ error: 'Failed to persist API vault.' })
    }
  })

  app.get('/api/system/api-vault/backup', guard, (_req, res) => {
    if (!masterKey) {
      return res.status(400).json({ error: 'Set GEOSYNTRA_API_VAULT_MASTER_KEY to enable encrypted backup export.' })
    }
    const { persisted, vault, secrets } = readVaultFile(secretsFilePath)
    if (!persisted || !vault) {
      return res.status(404).json({ error: 'No vault data to export.' })
    }
    try {
      const envelope = encryptJsonEnvelope(
        { version: 4, catalog: vault.catalog, secrets, exportedAt: new Date().toISOString() },
        masterKey,
      )
      return res.json({ ok: true, envelope })
    } catch (e) {
      console.error('[api-vault] backup export failed', e)
      return res.status(500).json({ error: 'Backup export failed.' })
    }
  })
}
