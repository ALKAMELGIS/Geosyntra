import { describe, expect, it } from 'vitest'
import {
  buildBasemapCatalog,
  GOOGLE_RASTER_MAX_ZOOM,
  isGoogleBasemapId,
  mapboxGlStyleForEntry,
  partitionBasemapCatalog,
  rasterMaxZoomForTileUrl,
  rasterStyleFromTiles,
  reconcileBasemapId,
  resolveBasemapId,
  resolveStartupBasemapId,
} from './basemapCatalog'

describe('buildBasemapCatalog', () => {
  it('excludes Mapbox tile basemaps and unofficial Google rasters', () => {
    const catalog = buildBasemapCatalog('pk.test.token', { includeMapboxVectorBasemaps: true })
    const ids = catalog.map(e => e.id)
    expect(ids).not.toContain('mapbox-standard-satellite')
    expect(ids).not.toContain('mapbox-hybrid')
    expect(ids).not.toContain('mb-streets')
    expect(ids).not.toContain('google-satellite')
    expect(ids).toContain('google-earth')
    expect(ids).toContain('esri')
    expect(ids).not.toContain('satellite')
    expect(ids).toContain('esri-imagery-hybrid')
  })

  it('excludes World Terrain (Esri) from the gallery catalog', () => {
    const catalog = buildBasemapCatalog()
    expect(catalog.some(e => e.id === 'esri-world-terrain')).toBe(false)
    expect(catalog.some(e => e.id === 'esri-terrain-labels')).toBe(true)
    const terrainLabels = catalog.find(e => e.id === 'esri-terrain-labels')!
    expect(terrainLabels.leafletLayers?.[0]?.url).toContain('World_Terrain_Base')
  })

  it('maps legacy esri-world-elevation-terrain id to Esri World Imagery', () => {
    expect(resolveBasemapId('esri-world-elevation-terrain')).toBe('esri')
    expect(resolveBasemapId('world-elevation-terrain')).toBe('esri')
    const catalog = buildBasemapCatalog()
    expect(catalog.some(e => e.id === 'esri-world-elevation-terrain')).toBe(false)
  })

  it('includes Google Earth as a 2D satellite raster basemap', () => {
    const catalog = buildBasemapCatalog('pk.test.token')
    const entry = catalog.find(e => e.id === 'google-earth')
    expect(entry?.label).toBe('Google Earth')
    expect(entry?.googlePhotorealistic3d).toBeFalsy()
    expect(entry?.badges).toBeUndefined()
    expect(entry?.leafletLayers?.[0]?.url).toContain('google.com/vt/lyrs=s')
    const { basemapRasterEntries, basemap3dEntries } = partitionBasemapCatalog(catalog)
    expect(basemapRasterEntries.some(e => e.id === 'google-earth')).toBe(true)
    expect(basemap3dEntries.some(e => e.id === 'google-earth')).toBe(false)
  })

  it('does not include Esri 3D Buildings basemaps in the gallery', () => {
    const catalog = buildBasemapCatalog()
    const ids = catalog.map(e => e.id)
    expect(ids).not.toContain('esri-3d-buildings')
    expect(ids).not.toContain('osm-3d-buildings')
  })

  it('partitions catalog without Esri 3D Buildings gallery section', () => {
    const catalog = buildBasemapCatalog()
    const { basemap3dEntries, basemapRasterEntries } = partitionBasemapCatalog(catalog)
    expect(basemap3dEntries.length).toBe(0)
    expect(basemapRasterEntries.length).toBe(catalog.length)
    expect(basemapRasterEntries.some(e => e.id === 'google-earth')).toBe(true)
  })

  it('mapboxGlStyleForEntry uses raster tiles from catalog entry', () => {
    const catalog = buildBasemapCatalog()
    const entry = catalog.find(e => e.id === 'esri')!
    const style = mapboxGlStyleForEntry(entry)
    expect(typeof style).toBe('object')
    expect((style as { layers?: unknown[] }).layers?.length).toBeGreaterThan(0)
  })

  it('resolveStartupBasemapId defaults to Esri World Imagery', () => {
    const catalog = buildBasemapCatalog()
    expect(resolveStartupBasemapId(false, catalog)).toBe('esri')
    expect(resolveStartupBasemapId(true, catalog)).toBe('esri')
  })

  it('maps legacy world-terrain ids to Terrain with labels (Esri)', () => {
    expect(resolveBasemapId('terrain')).toBe('esri-terrain-labels')
    expect(resolveBasemapId('world-terrain')).toBe('esri-terrain-labels')
    expect(resolveBasemapId('esri-world-terrain')).toBe('esri-terrain-labels')
  })

  it('maps removed Mapbox basemap ids to Esri equivalents', () => {
    expect(resolveBasemapId('mapbox-standard-satellite')).toBe('esri')
    expect(resolveBasemapId('mapbox-hybrid')).toBe('esri-imagery-hybrid')
    expect(resolveBasemapId('mb-streets')).toBe('esri-streets')
  })

  it('maps legacy Google basemap ids to Google Earth or Esri equivalents', () => {
    expect(resolveBasemapId('google-earth')).toBe('google-earth')
    expect(resolveBasemapId('google')).toBe('google-earth')
    expect(resolveBasemapId('google-satellite')).toBe('google-earth')
    expect(resolveBasemapId('google-streets')).toBe('esri-streets')
    expect(resolveBasemapId('google-photorealistic-3d')).toBe('esri')
    expect(resolveBasemapId('google-photorealistic-hybrid-3d')).toBe('esri')
    expect(isGoogleBasemapId('google-earth')).toBe(true)
  })

  it('reconcileBasemapId migrates legacy Google ids to Google Earth or Esri', () => {
    const catalog = buildBasemapCatalog()
    expect(reconcileBasemapId('google-earth', false, catalog)).toBe('google-earth')
    expect(reconcileBasemapId('google-satellite', false, catalog)).toBe('google-earth')
    expect(reconcileBasemapId('google-photorealistic-3d', false, catalog)).toBe('esri')
    expect(reconcileBasemapId('satellite', false, catalog)).toBe('esri')
  })

  it('maps removed 3D building basemap ids to Esri World Imagery', () => {
    expect(resolveBasemapId('esri-3d-buildings')).toBe('esri')
    expect(resolveBasemapId('osm-3d-buildings')).toBe('esri')
    expect(resolveBasemapId('3d-ed-building')).toBe('esri')
  })

  it('caps Google raster maxzoom to avoid "Map data not yet available" tiles', () => {
    expect(rasterMaxZoomForTileUrl('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}')).toBe(
      GOOGLE_RASTER_MAX_ZOOM,
    )
    const style = rasterStyleFromTiles([
      { url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', attribution: '© Google' },
    ]) as { sources?: Record<string, { maxzoom?: number }> }
    const src = Object.values(style.sources ?? {})[0]
    expect(src?.maxzoom).toBe(GOOGLE_RASTER_MAX_ZOOM)
  })
})
