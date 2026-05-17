/**
 * Account profile v2 — browser-only, isolated from legacy `user_profiles_v1` / admin directory.
 * Stores avatar and optional display tweaks per normalized email.
 */
import { normalizeEmail } from '../auth'

export const GEOSYNTRA_ACCOUNT_PROFILE_V2_KEY = 'geosyntra_account_profile_v2'

export type GeosyntraAccountProfileV2 = {
  avatarDataUrl?: string
  updatedAt?: string
}

export const ACCOUNT_PROFILE_CHANGE_EVENT = 'geosyntra-account-profile-change'

function readAll(): Record<string, GeosyntraAccountProfileV2> {
  try {
    const raw = localStorage.getItem(GEOSYNTRA_ACCOUNT_PROFILE_V2_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, GeosyntraAccountProfileV2>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeAll(all: Record<string, GeosyntraAccountProfileV2>): void {
  localStorage.setItem(GEOSYNTRA_ACCOUNT_PROFILE_V2_KEY, JSON.stringify(all))
  window.dispatchEvent(new Event('storage'))
  window.dispatchEvent(new Event(ACCOUNT_PROFILE_CHANGE_EVENT))
}

export function readGeosyntraAccountProfile(email: string): GeosyntraAccountProfileV2 {
  const key = normalizeEmail(email)
  if (!key) return {}
  return readAll()[key] ?? {}
}

export function writeGeosyntraAccountProfile(
  email: string,
  patch: Partial<GeosyntraAccountProfileV2>,
): GeosyntraAccountProfileV2 {
  const key = normalizeEmail(email)
  if (!key) return {}
  const all = readAll()
  const merged: GeosyntraAccountProfileV2 = {
    ...(all[key] ?? {}),
    ...patch,
    updatedAt: new Date().toISOString(),
  }
  all[key] = merged
  writeAll(all)
  return merged
}

export function clearGeosyntraAccountProfile(email: string): void {
  const key = normalizeEmail(email)
  if (!key) return
  const all = readAll()
  delete all[key]
  writeAll(all)
}

export function accountProfileInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase()
  const one = parts[0] ?? 'U'
  return one.slice(0, 2).toUpperCase()
}

const MAX_AVATAR_BYTES = 2 * 1024 * 1024
const AVATAR_MAX_EDGE = 256

/** Resize and encode avatar for local profile storage. */
export async function imageFileToAvatarDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file (PNG, JPG, or WebP).')
  }
  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error('Image must be under 2 MB.')
  }
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, AVATAR_MAX_EDGE / Math.max(bitmap.width, bitmap.height, 1))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not process image.')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()
  return canvas.toDataURL('image/jpeg', 0.88)
}
