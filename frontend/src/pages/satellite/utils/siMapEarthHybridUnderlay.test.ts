import { describe, expect, it, vi } from 'vitest';
import {
  buildBasemapCatalog,
  basemapSupportsEarthHybridUnderlay,
  catalogEntryById,
  isImageryForwardBasemapEntry,
} from '../basemapCatalog';
import {
  SI_EARTH_TERRAIN_UNDERLAY_LAYER_ID,
  SI_ESRI_ELEVATION_HILLSHADE_UNDERLAY_LAYER_ID,
  SI_ESRI_ELEVATION_HILLSHADE_UNDERLAY_SOURCE_ID,
  SI_EARTH_TERRAIN_UNDERLAY_SOURCE_ID,
  resolveSiMapEarthHybridUnderlay3dActive,
  resolveSiMapEarthHybridUnderlayOpacity,
  shouldMountEarthHybridUnderlayStack,
  syncSiMapEarthHybridUnderlay,
} from './siMapEarthHybridUnderlay';

describe('Esri World Terrain hybrid basemap helpers', () => {
  const catalog = buildBasemapCatalog();

  it('includes esri-world-terrain basemap entry', () => {
    const entry = catalogEntryById(catalog, 'esri-world-terrain');
    expect(entry?.label).toContain('World Terrain');
    expect(entry?.leafletLayers?.some(L => /World_Terrain_Base/i.test(L.url))).toBe(true);
  });

  it('treats imagery basemaps as imagery-forward for hybrid underlay', () => {
    expect(isImageryForwardBasemapEntry(catalogEntryById(catalog, 'esri'))).toBe(true);
    expect(isImageryForwardBasemapEntry(catalogEntryById(catalog, 'esri-imagery-hybrid'))).toBe(true);
  });

  it('skips hybrid underlay for pure terrain and Google Photorealistic basemaps', () => {
    const google3d = {
      id: 'google-photorealistic-3d',
      label: 'Photorealistic 3D (Google)',
      mapboxStyle: {},
      googlePhotorealistic3d: true,
    } as const;
    expect(isImageryForwardBasemapEntry(catalogEntryById(catalog, 'esri-world-terrain'))).toBe(false);
    expect(isImageryForwardBasemapEntry(google3d)).toBe(false);
    expect(isImageryForwardBasemapEntry(catalogEntryById(catalog, 'terrain-opentopo'))).toBe(false);
  });

  it('basemapSupportsEarthHybridUnderlay covers streets, topo, and OpenTopo', () => {
    expect(basemapSupportsEarthHybridUnderlay(catalogEntryById(catalog, 'esri'))).toBe(true);
    expect(basemapSupportsEarthHybridUnderlay(catalogEntryById(catalog, 'esri-streets'))).toBe(true);
    expect(basemapSupportsEarthHybridUnderlay(catalogEntryById(catalog, 'esri-topo'))).toBe(true);
    expect(basemapSupportsEarthHybridUnderlay(catalogEntryById(catalog, 'terrain-opentopo'))).toBe(true);
    expect(basemapSupportsEarthHybridUnderlay(catalogEntryById(catalog, 'esri-dark-gray'))).toBe(true);
  });

  it('shouldMountEarthHybridUnderlayStack mounts for 3D imagery basemaps only', () => {
    const esriImagery = catalogEntryById(catalog, 'esri');
    expect(shouldMountEarthHybridUnderlayStack(esriImagery, { elevation3d: false })).toBe(false);
    expect(shouldMountEarthHybridUnderlayStack(esriImagery, { elevation3d: true })).toBe(true);
    expect(shouldMountEarthHybridUnderlayStack(catalogEntryById(catalog, 'esri-world-terrain'), { elevation3d: true })).toBe(
      false,
    );
  });

  it('resolveSiMapEarthHybridUnderlay3dActive is true during 3D dock transition before pitch rises', () => {
    expect(
      resolveSiMapEarthHybridUnderlay3dActive({
        pitchDeg: 0,
        elevationDock3d: false,
        globeExtrusion3d: false,
        elevationTransitioningTo3d: true,
      }),
    ).toBe(true);
    expect(
      resolveSiMapEarthHybridUnderlayOpacity(catalogEntryById(catalog, 'esri'), {
        pitchDeg: 0,
        elevationDock3d: true,
        globeExtrusion3d: true,
        elevationTransitioningTo3d: true,
      }),
    ).toBe(1);
  });
});

describe('syncSiMapEarthHybridUnderlay', () => {
  const catalog = buildBasemapCatalog();
  const esriImagery = catalogEntryById(catalog, 'esri')!;

  function createMockMap() {
    const layers = new Map<string, { paint?: Record<string, unknown> }>();
    const sources = new Map<string, unknown>();
    const styleLayers: { id: string }[] = [{ id: 'si-basemap-esri-layer-0' }];
    return {
      isStyleLoaded: vi.fn(() => true),
      getStyle: vi.fn(() => ({ layers: styleLayers })),
      getSource: vi.fn((id: string) => (sources.has(id) ? sources.get(id) : undefined)),
      getLayer: vi.fn((id: string) => (layers.has(id) ? { id, ...layers.get(id) } : undefined)),
      addSource: vi.fn((id: string, spec: unknown) => {
        sources.set(id, spec);
      }),
      addLayer: vi.fn((layer: { id: string; paint?: Record<string, unknown> }, _before?: string) => {
        layers.set(layer.id, { paint: { ...layer.paint } });
        styleLayers.splice(0, 0, { id: layer.id });
      }),
      removeLayer: vi.fn((id: string) => {
        layers.delete(id);
      }),
      removeSource: vi.fn((id: string) => {
        sources.delete(id);
      }),
      setPaintProperty: vi.fn(),
      setLayoutProperty: vi.fn(),
      moveLayer: vi.fn(),
    };
  }

  it('mounts terrain base + hillshade under the basemap in 3D', () => {
    const map = createMockMap();
    syncSiMapEarthHybridUnderlay(map as never, { enabled: true, basemapEntry: esriImagery, opacity: 0.88 });
    expect(map.addSource).toHaveBeenCalledWith(
      SI_EARTH_TERRAIN_UNDERLAY_SOURCE_ID,
      expect.objectContaining({ type: 'raster' }),
    );
    expect(map.addSource).toHaveBeenCalledWith(
      SI_ESRI_ELEVATION_HILLSHADE_UNDERLAY_SOURCE_ID,
      expect.objectContaining({ type: 'raster' }),
    );
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: SI_EARTH_TERRAIN_UNDERLAY_LAYER_ID }),
      'si-basemap-esri-layer-0',
    );
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: SI_ESRI_ELEVATION_HILLSHADE_UNDERLAY_LAYER_ID }),
      'si-basemap-esri-layer-0',
    );
  });

  it('strips underlay when disabled', () => {
    const map = createMockMap();
    map.getLayer = vi.fn((id: string) =>
      id === SI_EARTH_TERRAIN_UNDERLAY_LAYER_ID || id === SI_ESRI_ELEVATION_HILLSHADE_UNDERLAY_LAYER_ID
        ? { id }
        : undefined,
    );
    syncSiMapEarthHybridUnderlay(map as never, { enabled: false, basemapEntry: esriImagery });
    expect(map.removeLayer).toHaveBeenCalledWith(SI_ESRI_ELEVATION_HILLSHADE_UNDERLAY_LAYER_ID);
    expect(map.removeLayer).toHaveBeenCalledWith(SI_EARTH_TERRAIN_UNDERLAY_LAYER_ID);
  });
});
