import { describe, expect, it } from 'vitest'
import { buildBasemapCatalog, mapboxGlStyleForEntry, partitionBasemapCatalog, resolveBasemapId, resolveStartupBasemapId } from './basemapCatalog'

describe('buildBasemapCatalog', () => {
  it('excludes Mapbox tile basemaps (Google/Esri/Carto only)', () => {
    const catalog = buildBasemapCatalog('pk.test.token', { includeMapboxVectorBasemaps: true })
    const ids = catalog.map(e => e.id)
    expect(ids).not.toContain('mapbox-standard-satellite')
    expect(ids).not.toContain('mapbox-hybrid')
    expect(ids).not.toContain('mb-streets')
    expect(ids).toContain('google-satellite')
    expect(ids).toContain('satellite')
    expect(ids).toContain('esri-imagery-hybrid')
  })

  it('does not include Google Photorealistic basemaps in the gallery', () => {
    const catalog = buildBasemapCatalog('pk.test.token')
    const ids = catalog.map(e => e.id)
    const labels = catalog.map(e => e.label.toLowerCase())
    expect(ids.some(id => id.includes('photorealistic'))).toBe(false)
    expect(labels.some(label => label.includes('photorealistic'))).toBe(false)
    expect(catalog.some(e => e.id === 'google-photorealistic-3d')).toBe(false)
    expect(catalog.some(e => e.id === 'google-photorealistic-hybrid-3d')).toBe(false)
  })

  it('does not include 3D Buildings basemaps in the gallery', () => {
    const catalog = buildBasemapCatalog()
    const ids = catalog.map(e => e.id)
    expect(ids).not.toContain('esri-3d-buildings')
    expect(ids).not.toContain('osm-3d-buildings')
  })

  it('partitions catalog with no 3D building section', () => {
    const catalog = buildBasemapCatalog()
    const { basemap3dEntries, basemapRasterEntries } = partitionBasemapCatalog(catalog)
    expect(basemap3dEntries).toEqual([])
    expect(basemapRasterEntries.length).toBe(catalog.length)
  })

  it('mapboxGlStyleForEntry uses raster tiles from catalog entry', () => {
    const catalog = buildBasemapCatalog()
    const entry = catalog.find(e => e.id === 'google-satellite')!
    const style = mapboxGlStyleForEntry(entry)
    expect(typeof style).toBe('object')
    expect((style as { layers?: unknown[] }).layers?.length).toBeGreaterThan(0)
  })

  it('resolveStartupBasemapId defaults to Esri Satellite', () => {
    const catalog = buildBasemapCatalog()
    expect(resolveStartupBasemapId(false, catalog)).toBe('satellite')
    expect(resolveStartupBasemapId(true, catalog)).toBe('satellite')
  })

  it('maps removed Mapbox basemap ids to Esri/Google equivalents', () => {
    expect(resolveBasemapId('mapbox-standard-satellite')).toBe('satellite')
    expect(resolveBasemapId('mapbox-hybrid')).toBe('esri-imagery-hybrid')
    expect(resolveBasemapId('mb-streets')).toBe('esri-streets')
  })

  it('maps removed 3D building basemap ids to Esri Satellite', () => {
    expect(resolveBasemapId('esri-3d-buildings')).toBe('satellite')
    expect(resolveBasemapId('osm-3d-buildings')).toBe('satellite')
    expect(resolveBasemapId('3d-ed-building')).toBe('satellite')
  })

  it('caps Google raster maxzoom to avoid "Map data not yet available" tiles', () => {
    const entry = buildBasemapCatalog().find(e => e.id === 'google-satellite')!
    const style = mapboxGlStyleForEntry(entry) as { sources?: Record<string, { maxzoom?: number }> }
    const src = Object.values(style.sources ?? {})[0]
    expect(src?.maxzoom).toBe(20)
  })
})
