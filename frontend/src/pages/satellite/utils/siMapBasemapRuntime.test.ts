import { describe, expect, it } from 'vitest';
import { buildBasemapCatalog } from '../basemapCatalog';
import {
  SI_QUICK_BASEMAP_PRESETS,
  applySiMapBasemap,
  buildSiBasemapMapStyleForEntry,
  entrySupportsInPlaceBasemapSwap,
  findFirstNonBasemapLayerId,
  isSiMapBasemapEntryMounted,
  mapHasSiRasterBasemapStack,
} from './siMapBasemapRuntime';

describe('siMapBasemapRuntime', () => {
  const catalog = buildBasemapCatalog('', { includeMapboxVectorBasemaps: false });

  it('quick presets use lightweight Esri rasters', () => {
    for (const preset of SI_QUICK_BASEMAP_PRESETS) {
      const entry = catalog.find(e => e.id === preset.catalogId);
      expect(entry, preset.key).toBeDefined();
      expect(entrySupportsInPlaceBasemapSwap(entry)).toBe(true);
    }
  });

  it('findFirstNonBasemapLayerId skips basemap stack', () => {
    const map = {
      getStyle: () => ({
        layers: [
          { id: 'si-basemap-layer-0' },
          { id: 'si-basemap-layer-1' },
          { id: 'aoi-fill' },
        ],
      }),
    } as unknown as import('mapbox-gl').Map;
    expect(findFirstNonBasemapLayerId(map)).toBe('aoi-fill');
  });

  it('isSiMapBasemapEntryMounted tracks active entry', () => {
    const entry = catalog.find(e => e.id === 'google-earth')!;
    const map = {
      isStyleLoaded: () => true,
      getStyle: () => ({ layers: [{ id: 'aoi-fill' }] }),
      getLayer: () => undefined,
      getSource: () => undefined,
      addSource: () => {},
      addLayer: () => {},
      setLayoutProperty: () => {},
      setPaintProperty: () => {},
      moveLayer: () => {},
      triggerRepaint: () => {},
    } as unknown as import('mapbox-gl').Map;
    expect(isSiMapBasemapEntryMounted(entry.id)).toBe(false);
    applySiMapBasemap(map, entry, { fadeMs: 0 });
    expect(isSiMapBasemapEntryMounted(entry.id)).toBe(true);
  });

  it('applySiMapBasemap unloads previous entry when switching (lazy loading)', () => {
    const google = catalog.find(e => e.id === 'google-earth')!;
    const esri = catalog.find(e => e.id === 'satellite')!;
    const removedSources: string[] = [];
    const addedLayers: string[] = [];
    const layerIds = new Set<string>();
    const sourceIds = new Set<string>();
    const map = {
      isStyleLoaded: () => true,
      getStyle: () => ({ layers: [{ id: 'aoi-fill' }] }),
      getLayer: (id: string) => (layerIds.has(id) ? {} : undefined),
      getSource: (id: string) => (sourceIds.has(id) ? {} : undefined),
      addSource: (id: string) => {
        sourceIds.add(id);
      },
      addLayer: (layer: { id?: string; source?: string }) => {
        if (layer.id) {
          addedLayers.push(layer.id);
          layerIds.add(layer.id);
        }
        if (layer.source) sourceIds.add(layer.source);
      },
      removeLayer: (id: string) => {
        layerIds.delete(id);
      },
      removeSource: (id: string) => {
        removedSources.push(id);
        sourceIds.delete(id);
      },
      setLayoutProperty: () => {},
      setPaintProperty: () => {},
      moveLayer: () => {},
    } as unknown as import('mapbox-gl').Map;
    expect(applySiMapBasemap(map, google)).toBe(true);
    expect(applySiMapBasemap(map, esri)).toBe(true);
    expect(removedSources.some(id => id.includes('google-earth'))).toBe(true);
    expect(addedLayers.some(id => id.includes('satellite'))).toBe(true);
  });

  it('applySiMapBasemap mounts persistent entry-scoped layer ids', () => {
    const entry = catalog.find(e => e.id === 'google-earth')!;
    const addedLayers: string[] = [];
    const map = {
      isStyleLoaded: () => true,
      getStyle: () => ({ layers: [{ id: 'aoi-fill' }] }),
      getLayer: (id: string) => (addedLayers.includes(id) ? {} : undefined),
      getSource: () => undefined,
      addSource: () => {},
      addLayer: (layer: { id?: string }) => {
        if (layer.id) addedLayers.push(layer.id);
      },
      setLayoutProperty: () => {},
      setPaintProperty: () => {},
    } as unknown as import('mapbox-gl').Map;
    expect(applySiMapBasemap(map, entry)).toBe(true);
    expect(addedLayers.some(id => id.includes('google-earth'))).toBe(true);
  });

  it('buildSiBasemapMapStyleForEntry uses entry-scoped si-basemap layer ids', () => {
    const entry = catalog.find(e => e.id === 'google-earth')!;
    const style = buildSiBasemapMapStyleForEntry(entry) as { layers?: Array<{ id?: string }>; glyphs?: string };
    expect(style.layers?.[0]?.id).toBe('si-basemap-google-earth-layer-0');
    expect(style.glyphs).toContain('mapbox://fonts/mapbox/');
  });

  it('mapHasSiRasterBasemapStack detects in-place basemap layers', () => {
    const withBasemap = {
      getStyle: () => ({ layers: [{ id: 'si-basemap-layer-0' }, { id: 'wms-layer' }] }),
    } as unknown as import('mapbox-gl').Map;
    const empty = {
      getStyle: () => ({ layers: [{ id: 'wms-layer' }] }),
    } as unknown as import('mapbox-gl').Map;
    expect(mapHasSiRasterBasemapStack(withBasemap)).toBe(true);
    expect(mapHasSiRasterBasemapStack(empty)).toBe(false);
  });
});
