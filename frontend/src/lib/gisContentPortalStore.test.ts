import { afterEach, describe, expect, it } from 'vitest'
import {
  bulkUpdateGisContentRows,
  createGisContentPortalFolder,
  deleteGisContentPortalFolder,
  filterGisContentRowsForFolder,
  getGisContentPortalFolders,
  getGisContentPortalRows,
  moveGisContentRowsToFolder,
  moveGisContentRowsToRecycleBin,
  moveGisContentToRecycleBin,
  permanentlyDeleteGisContentRows,
  resetGisContentPortalForTests,
  restoreGisContentFromRecycleBin,
  subscribeGisContentPortal,
  updateGisContentPortalFolder,
  upsertGisContentPortalApp,
} from './gisContentPortalStore'

describe('gisContentPortalStore', () => {
  afterEach(() => {
    resetGisContentPortalForTests()
  })

  it('excludes recycle bin items from All my content', () => {
    moveGisContentToRecycleBin('3')
    const all = filterGisContentRowsForFolder(getGisContentPortalRows(), 'all')
    expect(all.some(r => r.id === '3')).toBe(false)
    const recycle = filterGisContentRowsForFolder(getGisContentPortalRows(), 'recycle')
    expect(recycle.some(r => r.id === '3')).toBe(true)
  })

  it('moves delete targets to recycle bin and can restore', () => {
    const moved = moveGisContentToRecycleBin('7')
    expect(moved?.folderId).toBe('recycle')
    const restored = restoreGisContentFromRecycleBin('7')
    expect(restored?.folderId).toBe('field-ops')
  })

  it('creates a custom folder and persists in folder list', () => {
    const result = createGisContentPortalFolder('Saved map layers', 'green')
    expect('folder' in result).toBe(true)
    if (!('folder' in result)) return
    expect(result.folder.color).toBe('green')
    expect(getGisContentPortalFolders().some(f => f.id === result.folder.id)).toBe(true)
    expect(createGisContentPortalFolder('Saved map layers')).toEqual({
      error: 'A folder with this name already exists.',
    })
  })

  it('updates and deletes custom folders', () => {
    const created = createGisContentPortalFolder('Temp folder', 'blue')
    if (!('folder' in created)) return
    const updated = updateGisContentPortalFolder(created.folder.id, { name: 'Renamed folder', color: 'green' })
    expect('folder' in updated).toBe(true)
    if ('folder' in updated) expect(updated.folder.name).toBe('Renamed folder')
    expect(updateGisContentPortalFolder('field-ops', { name: 'X' })).toEqual({
      error: 'This folder cannot be edited.',
    })
    moveGisContentRowsToFolder(['2'], created.folder.id)
    const deleted = deleteGisContentPortalFolder(created.folder.id)
    expect(deleted).toEqual({ ok: true })
    expect(getGisContentPortalRows().find(r => r.id === '2')?.folderId).toBe('all')
  })

  it('bulk updates sharing and skips delete-protected rows on bulk recycle', () => {
    bulkUpdateGisContentRows(['2', '3'], { sharing: 'public' })
    expect(getGisContentPortalRows().find(r => r.id === '2')?.sharing).toBe('public')
    bulkUpdateGisContentRows(['3'], { deleteProtected: true })
    const { moved, skippedProtected } = moveGisContentRowsToRecycleBin(['2', '3'])
    expect(moved).toBe(1)
    expect(skippedProtected).toBe(1)
    expect(moveGisContentRowsToFolder(['2'], 'analysis')).toBe(1)
    expect(getGisContentPortalRows().find(r => r.id === '2')?.folderId).toBe('analysis')
  })

  it('permanently deletes recycle items and keeps them removed after reload', () => {
    expect(getGisContentPortalRows().some(r => r.id === '19')).toBe(true)
    expect(permanentlyDeleteGisContentRows(['19'])).toBe(1)
    expect(getGisContentPortalRows().some(r => r.id === '19')).toBe(false)

    let rowsAfterReload = getGisContentPortalRows()
    const unsub = subscribeGisContentPortal(() => {
      rowsAfterReload = getGisContentPortalRows()
    })
    window.dispatchEvent(new CustomEvent('gis-content-portal-changed'))
    unsub()
    expect(rowsAfterReload.some(r => r.id === '19')).toBe(false)
  })

  it('moves items out of recycle bin into a folder', () => {
    moveGisContentToRecycleBin('7')
    expect(moveGisContentRowsToFolder(['7'], 'analysis')).toBe(1)
    expect(getGisContentPortalRows().find(r => r.id === '7')?.folderId).toBe('analysis')
    const recycle = filterGisContentRowsForFolder(getGisContentPortalRows(), 'recycle')
    expect(recycle.some(r => r.id === '7')).toBe(false)
  })

  it('upserts App rows for GIS Content portal table', () => {
    const row = upsertGisContentPortalApp({ title: 'GeoSyntra Test Dashboard' })
    expect(row.type).toBe('app')
    expect(row.typeLabel).toBe('App')
    const rows = getGisContentPortalRows()
    expect(rows.some(r => r.id === row.id && r.title === 'GeoSyntra Test Dashboard')).toBe(true)
    const updated = upsertGisContentPortalApp({ id: row.id, title: 'GeoSyntra Renamed' })
    expect(updated.id).toBe(row.id)
    expect(getGisContentPortalRows().find(r => r.id === row.id)?.title).toBe('GeoSyntra Renamed')
  })
})
