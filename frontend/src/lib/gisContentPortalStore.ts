import { useEffect, useMemo, useState } from 'react'
import {
  GIS_CONTENT_ROWS,
  GIS_CONTENT_FOLDERS,
  GIS_CONTENT_DEFAULT_OWNER,
  gisPortalRowDemoGeoJson,
  isGisContentPortalCustomFolderId,
  type GisContentFolder,
  type GisContentFolderColor,
  type GisContentRow,
} from '../pages/settings/gis-content/gisContentPortalData'

const STORAGE_KEY = 'geosyntra.gisContent.portal.v1'
export const GIS_CONTENT_RECYCLE_FOLDER = 'recycle'
const SYSTEM_FOLDER_IDS = new Set(['all', GIS_CONTENT_RECYCLE_FOLDER])

export type GisContentItemComment = {
  id: string
  text: string
  at: string
}

export type GisContentItemDetails = {
  description?: string
  tags?: string[]
  comments?: GisContentItemComment[]
  schemaUpdated?: string
  viewCount?: number
  termsOfUse?: string
  acknowledgments?: string
  /** Custom item thumbnail (data URL or remote URL). */
  thumbnailDataUrl?: string
  /** GeoSyntra Dashboard builder state (saved App items). */
  geosyntraDashboard?: {
    theme: string
    timeZone: 'device' | 'specific'
    unitPrefixesExpanded?: boolean
    elements: { id: string; kind: string; label: string }[]
  }
}

type PortalPersist = {
  rows: GisContentRow[]
  favoriteIds: string[]
  /** Folder id before item was moved to recycle (for restore). */
  recycleOrigin: Record<string, string>
  /** User-created folders (persisted). */
  customFolders: GisContentFolder[]
  itemDetails: Record<string, GisContentItemDetails>
  /** Seed demo row ids the user permanently deleted (excluded on reload). */
  permanentlyDeletedIds?: string[]
}

type Listener = () => void
const listeners = new Set<Listener>()

function emit() {
  listeners.forEach(fn => fn())
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gis-content-portal-changed'))
  }
}

function emptyPersist(): PortalPersist {
  return {
    rows: [...GIS_CONTENT_ROWS],
    favoriteIds: ['4', '16'],
    recycleOrigin: {},
    customFolders: [],
    itemDetails: {},
  }
}

function migrateItemDetails(
  raw: Record<string, GisContentItemDetails> | undefined,
): Record<string, GisContentItemDetails> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, GisContentItemDetails> = {}
  for (const [id, details] of Object.entries(raw)) {
    if (!details || typeof details !== 'object') continue
    const legacy = details as GisContentItemDetails & { agroCloudDashboard?: GisContentItemDetails['geosyntraDashboard'] }
    if (legacy.agroCloudDashboard && !legacy.geosyntraDashboard) {
      const { agroCloudDashboard, ...rest } = legacy
      out[id] = { ...rest, geosyntraDashboard: agroCloudDashboard }
    } else {
      out[id] = details
    }
  }
  return out
}

function readPersist(): PortalPersist {
  if (typeof window === 'undefined') {
    return emptyPersist()
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return emptyPersist()
    }
    const parsed = JSON.parse(raw) as Partial<PortalPersist>
    const seedIds = new Set(GIS_CONTENT_ROWS.map(r => r.id))
    const permanentlyDeleted = new Set(
      Array.isArray(parsed.permanentlyDeletedIds)
        ? parsed.permanentlyDeletedIds.filter(id => seedIds.has(id))
        : [],
    )
    const storedRows = Array.isArray(parsed.rows) ? parsed.rows : []
    const byId = new Map<string, GisContentRow>()
    for (const seed of GIS_CONTENT_ROWS) {
      if (!permanentlyDeleted.has(seed.id)) byId.set(seed.id, { ...seed })
    }
    for (const row of storedRows) {
      if (!row?.id || permanentlyDeleted.has(row.id)) continue
      if (byId.has(row.id)) byId.set(row.id, { ...byId.get(row.id)!, ...row })
      else byId.set(row.id, row)
    }
    const customFolders = Array.isArray(parsed.customFolders)
      ? parsed.customFolders.filter(
          (f): f is GisContentFolder =>
            Boolean(f?.id && f?.name && !SYSTEM_FOLDER_IDS.has(f.id)),
        )
      : []
    return {
      rows: Array.from(byId.values()),
      favoriteIds: Array.isArray(parsed.favoriteIds) ? parsed.favoriteIds.filter(id => seedIds.has(id)) : ['4', '16'],
      recycleOrigin: parsed.recycleOrigin && typeof parsed.recycleOrigin === 'object' ? parsed.recycleOrigin : {},
      customFolders,
      itemDetails: migrateItemDetails(parsed.itemDetails as Record<string, GisContentItemDetails> | undefined),
      permanentlyDeletedIds: Array.from(permanentlyDeleted),
    }
  } catch {
    return emptyPersist()
  }
}

function writePersist(state: PortalPersist) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* ignore quota */
  }
  emit()
}

let cache = readPersist()

/** Test-only: reset in-memory portal state after localStorage is cleared. */
export function resetGisContentPortalForTests(): void {
  cache = emptyPersist()
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }
}

function refreshCache() {
  cache = readPersist()
}

export function subscribeGisContentPortal(listener: Listener): () => void {
  listeners.add(listener)
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      refreshCache()
      listener()
    }
  }
  const onCustom = () => {
    refreshCache()
    listener()
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage)
    window.addEventListener('gis-content-portal-changed', onCustom)
  }
  return () => {
    listeners.delete(listener)
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('gis-content-portal-changed', onCustom)
    }
  }
}

export function getGisContentPortalRows(): GisContentRow[] {
  return cache.rows.map(r => ({ ...r }))
}

export function getGisContentRowById(id: string): GisContentRow | undefined {
  return cache.rows.find(r => r.id === id)
}

export function getGisContentPortalFavorites(): Set<string> {
  return new Set(cache.favoriteIds)
}

export function isGisContentRowInRecycle(row: GisContentRow): boolean {
  return row.folderId === GIS_CONTENT_RECYCLE_FOLDER
}

export function filterGisContentRowsForFolder(
  rows: GisContentRow[],
  folderId: string,
): GisContentRow[] {
  if (folderId === GIS_CONTENT_RECYCLE_FOLDER) {
    return rows.filter(r => r.folderId === GIS_CONTENT_RECYCLE_FOLDER)
  }
  if (folderId === 'all') {
    return rows.filter(r => r.folderId !== GIS_CONTENT_RECYCLE_FOLDER)
  }
  return rows.filter(r => r.folderId === folderId)
}

export function getGisContentPortalFolders(): GisContentFolder[] {
  const seedIds = new Set(GIS_CONTENT_FOLDERS.map(f => f.id))
  const custom = (cache.customFolders ?? []).filter(f => !seedIds.has(f.id))
  const all = GIS_CONTENT_FOLDERS.find(f => f.id === 'all')!
  const recycle = GIS_CONTENT_FOLDERS.find(f => f.id === 'recycle')!
  const builtIn = GIS_CONTENT_FOLDERS.filter(f => f.id !== 'all' && f.id !== 'recycle')
  return [all, ...builtIn, ...custom, recycle]
}

export function createGisContentPortalFolder(
  name: string,
  color: GisContentFolderColor = 'default',
): { folder: GisContentFolder } | { error: string } {
  const trimmed = name.trim()
  if (!trimmed) return { error: 'Enter a folder name.' }

  const existing = getGisContentPortalFolders()
  if (existing.some(f => f.name.localeCompare(trimmed, undefined, { sensitivity: 'accent' }) === 0)) {
    return { error: 'A folder with this name already exists.' }
  }

  const slug = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const id = `custom-${slug || 'folder'}-${Date.now()}`
  const folder: GisContentFolder = { id, name: trimmed, parentId: null, color }
  cache = { ...cache, customFolders: [...(cache.customFolders ?? []), folder] }
  writePersist(cache)
  return { folder }
}

export function updateGisContentPortalFolder(
  id: string,
  patch: { name?: string; color?: GisContentFolderColor },
): { folder: GisContentFolder } | { error: string } {
  if (!isGisContentPortalCustomFolderId(id)) {
    return { error: 'This folder cannot be edited.' }
  }
  const idx = (cache.customFolders ?? []).findIndex(f => f.id === id)
  if (idx < 0) return { error: 'Folder not found.' }

  const current = cache.customFolders[idx]
  const nextName = patch.name !== undefined ? patch.name.trim() : current.name
  if (!nextName) return { error: 'Enter a folder name.' }

  if (patch.name !== undefined) {
    const duplicate = getGisContentPortalFolders().some(
      f => f.id !== id && f.name.localeCompare(nextName, undefined, { sensitivity: 'accent' }) === 0,
    )
    if (duplicate) return { error: 'A folder with this name already exists.' }
  }

  const folder: GisContentFolder = {
    ...current,
    name: nextName,
    color: patch.color ?? current.color ?? 'default',
  }
  const customFolders = [...cache.customFolders]
  customFolders[idx] = folder
  cache = { ...cache, customFolders }
  writePersist(cache)
  return { folder }
}

export function deleteGisContentPortalFolder(id: string): { ok: true } | { error: string } {
  if (SYSTEM_FOLDER_IDS.has(id) || !isGisContentPortalCustomFolderId(id)) {
    return { error: 'This folder cannot be deleted.' }
  }
  if (!(cache.customFolders ?? []).some(f => f.id === id)) {
    return { error: 'Folder not found.' }
  }

  const rows = cache.rows.map(r => (r.folderId === id ? { ...r, folderId: 'all' } : r))
  const customFolders = (cache.customFolders ?? []).filter(f => f.id !== id)
  cache = { ...cache, rows, customFolders }
  writePersist(cache)
  return { ok: true }
}

export function moveGisContentRowsToFolder(rowIds: string[], folderId: string): number {
  if (folderId === 'all' || folderId === GIS_CONTENT_RECYCLE_FOLDER) return 0
  const validFolder = getGisContentPortalFolders().some(f => f.id === folderId)
  if (!validFolder) return 0

  let moved = 0
  const idSet = new Set(rowIds)
  const recycleOrigin = { ...cache.recycleOrigin }
  const rows = cache.rows.map(r => {
    if (!idSet.has(r.id) || r.folderId === folderId) return r
    moved += 1
    if (r.folderId === GIS_CONTENT_RECYCLE_FOLDER) delete recycleOrigin[r.id]
    return {
      ...r,
      folderId,
      modified: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    }
  })
  if (moved > 0) {
    cache = { ...cache, rows, recycleOrigin }
    writePersist(cache)
  }
  return moved
}

export function getGisContentItemDetails(id: string): GisContentItemDetails {
  return { ...(cache.itemDetails?.[id] ?? {}) }
}

export function updateGisContentItemDetails(
  id: string,
  patch: Partial<GisContentItemDetails>,
): GisContentItemDetails {
  const next = { ...(cache.itemDetails?.[id] ?? {}), ...patch }
  cache = { ...cache, itemDetails: { ...cache.itemDetails, [id]: next } }
  writePersist(cache)
  return next
}

export function incrementGisContentItemViewCount(id: string): number {
  const current = cache.itemDetails?.[id]?.viewCount ?? 1200 + Number.parseInt(id, 10) * 47
  const viewCount = current + 1
  updateGisContentItemDetails(id, { viewCount })
  return viewCount
}

export function addGisContentItemComment(id: string, text: string): GisContentItemComment | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const comment: GisContentItemComment = {
    id: `c-${Date.now()}`,
    text: trimmed,
    at: new Date().toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }),
  }
  const prev = cache.itemDetails?.[id]?.comments ?? []
  updateGisContentItemDetails(id, { comments: [...prev, comment] })
  return comment
}

export function updateGisContentRow(id: string, patch: Partial<GisContentRow>): GisContentRow | null {
  const row = cache.rows.find(r => r.id === id)
  if (!row) return null
  const rows = cache.rows.map(r => (r.id === id ? { ...r, ...patch } : r))
  cache = { ...cache, rows }
  writePersist(cache)
  return rows.find(r => r.id === id) ?? null
}

export function upsertGisContentPortalApp(input: {
  id?: string
  title: string
  sharing?: GisContentRow['sharing']
  folderId?: string
}): GisContentRow {
  const now = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const id = input.id?.trim() || `app-${Date.now()}`
  const existing = cache.rows.find(r => r.id === id)
  const row: GisContentRow = {
    id,
    title: input.title.trim() || 'Untitled dashboard',
    type: 'app',
    typeLabel: 'App',
    modified: now,
    created: existing?.created ?? now,
    sharing: input.sharing ?? existing?.sharing ?? 'organization',
    folderId: input.folderId ?? existing?.folderId ?? 'all',
    owner: existing?.owner ?? GIS_CONTENT_DEFAULT_OWNER,
  }
  const rows = existing ? cache.rows.map(r => (r.id === id ? row : r)) : [...cache.rows, row]
  cache = { ...cache, rows }
  writePersist(cache)
  return row
}

export function setGisContentFavorite(id: string, favorite: boolean): void {
  const next = new Set(cache.favoriteIds)
  if (favorite) next.add(id)
  else next.delete(id)
  cache = { ...cache, favoriteIds: Array.from(next) }
  writePersist(cache)
}

function touchModified(row: GisContentRow): GisContentRow {
  return {
    ...row,
    modified: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
  }
}

export function bulkUpdateGisContentRows(rowIds: string[], patch: Partial<GisContentRow>): number {
  const idSet = new Set(rowIds)
  let updated = 0
  const rows = cache.rows.map(r => {
    if (!idSet.has(r.id)) return r
    updated += 1
    return touchModified({ ...r, ...patch })
  })
  if (updated > 0) {
    cache = { ...cache, rows }
    writePersist(cache)
  }
  return updated
}

export function moveGisContentRowsToRecycleBin(rowIds: string[]): { moved: number; skippedProtected: number } {
  let moved = 0
  let skippedProtected = 0
  for (const id of rowIds) {
    const row = cache.rows.find(r => r.id === id)
    if (!row || row.folderId === GIS_CONTENT_RECYCLE_FOLDER) continue
    if (row.deleteProtected) {
      skippedProtected += 1
      continue
    }
    if (moveGisContentToRecycleBin(id)) moved += 1
  }
  return { moved, skippedProtected }
}

export function permanentlyDeleteGisContentRows(rowIds: string[]): number {
  const idSet = new Set(rowIds)
  const seedIds = new Set(GIS_CONTENT_ROWS.map(r => r.id))
  const toDelete = cache.rows.filter(
    r => idSet.has(r.id) && r.folderId === GIS_CONTENT_RECYCLE_FOLDER,
  )
  if (!toDelete.length) return 0

  const deletedIds = new Set(toDelete.map(r => r.id))
  const permanentlyDeletedIds = new Set(cache.permanentlyDeletedIds ?? [])
  for (const row of toDelete) {
    if (seedIds.has(row.id)) permanentlyDeletedIds.add(row.id)
  }

  const rows = cache.rows.filter(r => !deletedIds.has(r.id))
  const recycleOrigin = { ...cache.recycleOrigin }
  for (const id of deletedIds) delete recycleOrigin[id]
  const favoriteIds = cache.favoriteIds.filter(id => !deletedIds.has(id))
  const itemDetails = { ...cache.itemDetails }
  for (const id of deletedIds) delete itemDetails[id]

  cache = {
    ...cache,
    rows,
    recycleOrigin,
    favoriteIds,
    itemDetails,
    permanentlyDeletedIds: Array.from(permanentlyDeletedIds),
  }
  writePersist(cache)
  return toDelete.length
}

/** Soft-delete: always moves to Recycle bin (also used for Delete menu action). */
export function moveGisContentToRecycleBin(id: string): GisContentRow | null {
  const row = cache.rows.find(r => r.id === id)
  if (!row || row.folderId === GIS_CONTENT_RECYCLE_FOLDER || row.deleteProtected) return null
  const recycleOrigin = { ...cache.recycleOrigin, [id]: row.folderId }
  const rows = cache.rows.map(r =>
    r.id === id
      ? {
          ...r,
          folderId: GIS_CONTENT_RECYCLE_FOLDER,
          modified: new Date().toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }),
        }
      : r,
  )
  cache = { ...cache, rows, recycleOrigin }
  writePersist(cache)
  return rows.find(r => r.id === id) ?? null
}

export function restoreGisContentFromRecycleBin(id: string): GisContentRow | null {
  const row = cache.rows.find(r => r.id === id)
  if (!row || row.folderId !== GIS_CONTENT_RECYCLE_FOLDER) return null
  const origin = cache.recycleOrigin[id] ?? 'all'
  const recycleOrigin = { ...cache.recycleOrigin }
  delete recycleOrigin[id]
  const rows = cache.rows.map(r =>
    r.id === id ? { ...r, folderId: origin === GIS_CONTENT_RECYCLE_FOLDER ? 'all' : origin } : r,
  )
  cache = { ...cache, rows, recycleOrigin }
  writePersist(cache)
  return rows.find(r => r.id === id) ?? null
}

export type GisContentMapLayerPayload = {
  id: string
  name: string
  geojson: ReturnType<typeof gisPortalRowDemoGeoJson>
  sourceUrl: string
  portalRowId: string
}

export function buildGisContentMapLayerPayload(row: GisContentRow): GisContentMapLayerPayload {
  return {
    id: `portal-${row.id}-${Date.now()}`,
    name: row.title,
    geojson: gisPortalRowDemoGeoJson(row),
    sourceUrl: `gis-content://${row.id}`,
    portalRowId: row.id,
  }
}

export function useGisContentPortal() {
  const [version, setVersion] = useState(0)
  useEffect(() => subscribeGisContentPortal(() => setVersion(v => v + 1)), [])
  return useMemo(
    () => ({
      version,
      rows: getGisContentPortalRows(),
      folders: getGisContentPortalFolders(),
      favorites: getGisContentPortalFavorites(),
      moveToRecycleBin: moveGisContentToRecycleBin,
      restoreFromRecycleBin: restoreGisContentFromRecycleBin,
      createFolder: createGisContentPortalFolder,
      updateFolder: updateGisContentPortalFolder,
      deleteFolder: deleteGisContentPortalFolder,
      isCustomFolder: isGisContentPortalCustomFolderId,
      moveRowsToFolder: moveGisContentRowsToFolder,
      moveRowsToRecycleBin: moveGisContentRowsToRecycleBin,
      permanentlyDeleteRows: permanentlyDeleteGisContentRows,
      bulkUpdateRows: bulkUpdateGisContentRows,
      setFavorite: setGisContentFavorite,
      getRowById: getGisContentRowById,
      getItemDetails: getGisContentItemDetails,
      updateItemDetails: updateGisContentItemDetails,
      incrementViewCount: incrementGisContentItemViewCount,
      addItemComment: addGisContentItemComment,
      updateRow: updateGisContentRow,
      upsertApp: upsertGisContentPortalApp,
    }),
    [version],
  )
}
