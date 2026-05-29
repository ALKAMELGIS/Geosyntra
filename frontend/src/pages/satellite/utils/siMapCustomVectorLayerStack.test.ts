import { describe, expect, it, vi } from 'vitest';
import {
  isSiMapCustomVectorMapboxLayerId,
  isSiMapUiOverlayLayerId,
  syncSiMapOverlayLayerStack,
} from './siMapCustomVectorLayerStack';

describe('isSiMapCustomVectorMapboxLayerId', () => {
  it('matches symbology instance vector layers', () => {
    expect(isSiMapCustomVectorMapboxLayerId('arcgis-1--ag-fill')).toBe(true);
    expect(isSiMapCustomVectorMapboxLayerId('arcgis-1--ag-line')).toBe(true);
    expect(isSiMapCustomVectorMapboxLayerId('arcgis-1--ag-circle')).toBe(true);
    expect(isSiMapCustomVectorMapboxLayerId('arcgis-1--ag-label-point')).toBe(true);
    expect(isSiMapCustomVectorMapboxLayerId('arcgis-1--ag-label-line')).toBe(true);
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
});
