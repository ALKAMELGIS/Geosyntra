import { describe, expect, it, vi } from 'vitest';
import {
  isSiMapBasemapMapboxLayerId,
  isSiMapCustomLayerAuxMapboxLayerId,
  isSiMapCustomVectorMapboxLayerId,
  isSiMapUiOverlayLayerId,
  lowerSiMapBasemapLayersToBottom,
  raiseSiMapCustomVectorLayersToTop,
  syncSiMapOverlayLayerStack,
} from './siMapCustomVectorLayerStack';

describe('isSiMapCustomVectorMapboxLayerId', () => {
  it('matches symbology instance vector layers', () => {
    expect(isSiMapCustomVectorMapboxLayerId('arcgis-1--ag-fill')).toBe(true);
    expect(isSiMapCustomVectorMapboxLayerId('arcgis-1--ag-line')).toBe(true);
    expect(isSiMapCustomVectorMapboxLayerId('arcgis-1--ag-circle')).toBe(true);
    expect(isSiMapCustomVectorMapboxLayerId('arcgis-1--ag-label-point')).toBe(true);
    expect(isSiMapCustomVectorMapboxLayerId('arcgis-1--ag-label-line')).toBe(true);
    expect(isSiMapCustomVectorMapboxLayerId('arcgis-1--ag-label-poly')).toBe(true);
    expect(isSiMapCustomVectorMapboxLayerId('si-multi-aoi-line')).toBe(false);
  });
});

describe('isSiMapUiOverlayLayerId', () => {
  it('matches draw and AOI overlay layers', () => {
    expect(isSiMapUiOverlayLayerId('si-draw-draft-fill')).toBe(true);
    expect(isSiMapUiOverlayLayerId('si-aoi-fields-line')).toBe(true);
    expect(isSiMapCustomVectorMapboxLayerId('si-aoi-fields-line')).toBe(false);
  });
});

describe('isSiMapCustomLayerAuxMapboxLayerId', () => {
  it('matches extent outline and image raster layers', () => {
    expect(isSiMapCustomLayerAuxMapboxLayerId('parcel-1-extent-line')).toBe(true);
    expect(isSiMapCustomLayerAuxMapboxLayerId('parcel-1-raster')).toBe(true);
    expect(isSiMapCustomLayerAuxMapboxLayerId('arcgis-1--ag-fill')).toBe(false);
  });
});

describe('isSiMapBasemapMapboxLayerId', () => {
  it('matches in-place basemap raster layers only', () => {
    expect(isSiMapBasemapMapboxLayerId('si-basemap-layer-0')).toBe(true);
    expect(isSiMapBasemapMapboxLayerId('si-basemap-layer-1')).toBe(true);
    expect(isSiMapBasemapMapboxLayerId('si-basemap-satellite-layer-0')).toBe(true);
    expect(isSiMapBasemapMapboxLayerId('si-basemap-google-earth-layer-0')).toBe(true);
    expect(isSiMapBasemapMapboxLayerId('arcgis-1--fd-fill')).toBe(false);
    expect(isSiMapBasemapMapboxLayerId('si-sentinel-layer-a-b')).toBe(false);
  });
});

describe('lowerSiMapBasemapLayersToBottom', () => {
  it('only moves basemap layers that sit above the first operational layer', () => {
    const moveLayer = vi.fn();
    const map = {
      getStyle: () => ({
        layers: [
          { id: 'si-basemap-layer-0' },
          { id: 'arcgis-1--fd-fill' },
          { id: 'si-basemap-layer-1' },
        ],
      }),
      getLayer: () => ({}),
      moveLayer,
    };
    lowerSiMapBasemapLayersToBottom(map as never);
    expect(moveLayer).toHaveBeenCalledTimes(1);
    expect(moveLayer.mock.calls[0]).toEqual(['si-basemap-layer-1', 'arcgis-1--fd-fill']);
  });

  it('is a no-op when there is no operational layer to sit above', () => {
    const moveLayer = vi.fn();
    const map = {
      getStyle: () => ({ layers: [{ id: 'si-basemap-layer-0' }] }),
      getLayer: () => ({}),
      moveLayer,
    };
    lowerSiMapBasemapLayersToBottom(map as never);
    expect(moveLayer).not.toHaveBeenCalled();
  });
});

describe('raiseSiMapCustomVectorLayersToTop', () => {
  it('raises geometry layers first, then label layers on top', () => {
    const moveLayer = vi.fn();
    const map = {
      getStyle: () => ({
        layers: [
          { id: 'arcgis-1--ag-fill' },
          { id: 'arcgis-1--ag-label-poly' },
          { id: 'arcgis-1--ag-circle' },
          { id: 'arcgis-1--ag-label-point' },
        ],
      }),
      getLayer: () => ({}),
      moveLayer,
    };
    raiseSiMapCustomVectorLayersToTop(map as never);
    expect(moveLayer.mock.calls.map(c => c[0])).toEqual([
      'arcgis-1--ag-fill',
      'arcgis-1--ag-circle',
      'arcgis-1--ag-label-poly',
      'arcgis-1--ag-label-point',
    ]);
  });
});

describe('syncSiMapOverlayLayerStack', () => {
  it('raises WMS, custom vectors, then UI overlays', () => {
    const moveLayer = vi.fn();
    const map = {
      getStyle: () => ({
        layers: [
          { id: 'background' },
          { id: 'si-sentinel-layer-a-b' },
          { id: 'arcgis-1--fd-fill' },
          { id: 'si-draw-draft-line' },
        ],
      }),
      getLayer: (id: string) => (id !== 'background' ? {} : null),
      moveLayer,
    };
    syncSiMapOverlayLayerStack(map as never);
    expect(moveLayer).toHaveBeenCalledTimes(3);
    expect(moveLayer.mock.calls[0]?.[0]).toBe('si-sentinel-layer-a-b');
    expect(moveLayer.mock.calls[1]?.[0]).toBe('arcgis-1--fd-fill');
    expect(moveLayer.mock.calls[2]?.[0]).toBe('si-draw-draft-line');
  });

  it('lowers basemap when it was inserted above a custom vector layer', () => {
    const moveLayer = vi.fn();
    const map = {
      getStyle: () => ({
        layers: [
          { id: 'arcgis-1--fd-fill' },
          { id: 'si-basemap-layer-0' },
          { id: 'si-sentinel-layer-a-b' },
        ],
      }),
      getLayer: () => ({}),
      moveLayer,
    };
    syncSiMapOverlayLayerStack(map as never);
    expect(moveLayer.mock.calls[0]).toEqual(['si-basemap-layer-0', 'arcgis-1--fd-fill']);
  });

  it('pins the basemap below operational layers before raising them', () => {
    const moveLayer = vi.fn();
    const map = {
      getStyle: () => ({
        layers: [
          { id: 'si-basemap-layer-0' },
          { id: 'si-sentinel-layer-a-b' },
          { id: 'arcgis-1--fd-fill' },
          { id: 'si-draw-draft-line' },
        ],
      }),
      getLayer: () => ({}),
      moveLayer,
    };
    syncSiMapOverlayLayerStack(map as never);
    // basemap already below operational stack — only 3 raises.
    expect(moveLayer).toHaveBeenCalledTimes(3);
    expect(moveLayer.mock.calls[0]?.[0]).toBe('si-sentinel-layer-a-b');
    expect(moveLayer.mock.calls[1]?.[0]).toBe('arcgis-1--fd-fill');
    expect(moveLayer.mock.calls[2]?.[0]).toBe('si-draw-draft-line');
  });
});
