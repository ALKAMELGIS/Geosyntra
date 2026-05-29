/**
 * AES-256-GCM envelope for API secrets at rest (optional when AGRI_API_VAULT_MASTER_KEY is set).
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

export function vaultKeyFromEnv(secret) {
  const raw = String(secret || '').trim()
  if (!raw) return null
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex')
  return scryptSync(raw, 'agri-api-vault-salt-v1', 32)
}

export function encryptJsonEnvelope(payload, masterSecret) {
  const key = vaultKeyFromEnv(masterSecret)
  if (!key) throw new Error('API vault master key not configured')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8')
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    alg: 'aes-256-gcm-scrypt-v1',
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    ciphertext: enc.toString('base64'),
  }
}

export function decryptJsonEnvelope(envelope, masterSecret) {
  const key = vaultKeyFromEnv(masterSecret)
  if (!key) throw new Error('API vault master key not configured')
  if (!envelope || typeof envelope !== 'object') throw new Error('Invalid envelope')
  const iv = Buffer.from(String(envelope.iv || ''), 'hex')
  const tag = Buffer.from(String(envelope.tag || ''), 'hex')
  const ciphertext = Buffer.from(String(envelope.ciphertext || ''), 'base64')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return JSON.parse(plain.toString('utf8'))
}
