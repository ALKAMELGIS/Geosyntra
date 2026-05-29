/**
 * Client-side encrypted backup for API secrets (Web Crypto).
 * Does not log passphrases or plaintext. Intended for operator-owned offline backups.
 */

const FORMAT_BYTE = 1
const SALT_LEN = 16
const IV_LEN = 12
const PBKDF2_ITER = 150_000

function enc() {
  return new TextEncoder()
}

async function deriveAesKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey('raw', enc().encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  const saltCopy = new Uint8Array(salt)
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltCopy, iterations: PBKDF2_ITER, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** Binary blob: [version u8][salt][iv][ciphertext] */
export async function encryptVaultJson(passphrase: string, jsonUtf8: string): Promise<ArrayBuffer> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN))
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN))
  const key = await deriveAesKey(passphrase, salt)
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc().encode(jsonUtf8))
  const ct = new Uint8Array(cipherBuf)
  const out = new Uint8Array(1 + SALT_LEN + IV_LEN + ct.byteLength)
  out[0] = FORMAT_BYTE
  out.set(salt, 1)
  out.set(iv, 1 + SALT_LEN)
  out.set(ct, 1 + SALT_LEN + IV_LEN)
  return out.buffer
}

export async function decryptVaultBlob(passphrase: string, blob: ArrayBuffer): Promise<string> {
  const u8 = new Uint8Array(blob)
  if (u8.length < 1 + SALT_LEN + IV_LEN + 16) throw new Error('truncated')
  if (u8[0] !== FORMAT_BYTE) throw new Error('unsupported format')
  const salt = new Uint8Array(u8.slice(1, 1 + SALT_LEN))
  const iv = new Uint8Array(u8.slice(1 + SALT_LEN, 1 + SALT_LEN + IV_LEN))
  const ct = u8.slice(1 + SALT_LEN + IV_LEN)
  const key = await deriveAesKey(passphrase, salt)
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
  return new TextDecoder().decode(plainBuf)
}

export function downloadBinaryFile(filename: string, buf: ArrayBuffer) {
  const blob = new Blob([buf], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
