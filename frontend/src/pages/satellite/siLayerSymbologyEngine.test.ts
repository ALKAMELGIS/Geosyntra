import { describe, expect, it } from 'vitest';
import { arcgisDrawingInfoSupportsMapboxRender } from '../../lib/arcgisDrawingInfoMapbox';
import { SI_FORCED_LAYER_STROKE } from './siGlobalLayerStyleController';
import {
  applyLiveSymbologyDraftToLayerState,
  computeSiLayerStyleRevision,
  resolveSiLayerMapboxStylePack,
  resolveSiLayerMapboxStylePackWithPreview,
  siLayerExplicitlyUsesArcgisOnlineSymbology,
  siLayerHasSavedCustomSymbology,
  siLayerPrefersCustomSymbology,
  siLayerShouldUseArcgisDrawingInfo,
  siMapboxSymbologyInstanceId,
} from './siLayerSymbologyEngine';

const arcgisUniqueDi = {
  renderer: {
    type: 'uniqueValue',
    field1: 'Structure_Type',
    uniqueValueInfos: [
      { value: '1', symbol: { type: 'esriSMS', color: [255, 0, 0, 255], size: 8 } },
      { value: '2', symbol: { type: 'esriSMS', color: [0, 255, 0, 255], size: 8 } },
    ],
  },
};

describe('global forced layer style', () => {
  it('renders ArcGIS portal symbology for arcgis uniqueValue by default', () => {
    const layer = {
      source: 'arcgis' as const,
      geojson: {
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { Structure_Type: 1 } },
        ],
      },
      arcgisDrawingInfo: arcgisUniqueDi,
      symbology: { useArcGisOnline: true, style: 'unique' as const, field: 'Structure_Type', userConfigured: false },
      useArcGisSymbology: true,
    };
    const pack = resolveSiLayerMapboxStylePack(layer);
    expect(Array.isArray(pack.circlePaint['circle-color'])).toBe(true);
    expect(pack.linePaint['line-color']).not.toBe(SI_FORCED_LAYER_STROKE);
  });

  it('renders visible default outline for non-arcgis layers until user saves symbology', () => {
    const layer = {
      source: 'upload' as const,
      geojson: {
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} },
        ],
      },
    };
    const pack = resolveSiLayerMapboxStylePack(layer);
    expect(pack.linePaint['line-color']).toBe(SI_FORCED_LAYER_STROKE);
    expect(pack.fillPaint['fill-opacity']).toBe(0.42);
  });
});

describe('siLayerExplicitlyUsesArcgisOnlineSymbology', () => {
  it('defaults to custom symbology for arcgis layers without an explicit flag', () => {
    expect(
      siLayerExplicitlyUsesArcgisOnlineSymbology({
        source: 'arcgis',
        arcgisDrawingInfo: arcgisUniqueDi,
      }),
    ).toBe(false);
    expect(siLayerPrefersCustomSymbology({ source: 'arcgis', arcgisDrawingInfo: arcgisUniqueDi })).toBe(true);
  });

  it('uses ArcGIS only when useArcGisOnline is explicitly true', () => {
    const layer = {
      source: 'arcgis' as const,
      arcgisDrawingInfo: arcgisUniqueDi,
      symbology: { useArcGisOnline: true, style: 'unique' as const, field: 'Structure_Type', userConfigured: true },
      useArcGisSymbology: true,
    };
    expect(siLayerExplicitlyUsesArcgisOnlineSymbology(layer)).toBe(true);
    expect(siLayerPrefersCustomSymbology(layer)).toBe(false);
    expect(siLayerShouldUseArcgisDrawingInfo(layer)).toBe(true);
  });
});

describe('live symbology draft → layer state', () => {
  it('applies single-symbol custom renderer when user picks Single symbol', () => {
    const layer = {
      id: 'lyr-1',
      geojson: {
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { Structure_Type: 1 } },
        ],
      },
      source: 'arcgis' as const,
      arcgisDrawingInfo: arcgisUniqueDi,
      color: '#f97316',
      fillColor: '#f97316',
    };
    const draft = {
      useArcGisOnline: false,
      style: 'single' as const,
      field: 'Structure_Type',
      classes: 5,
      method: 'equal-interval' as const,
      colorRamp: 'viridis' as const,
      threshold: Number.NaN,
    };
    const appearance = {
      color: '#f97316',
      fillColor: '#f97316',
      weight: 2,
      opacity: 1,
      polygonFillAlpha: 0.35,
      pointRadius: 8,
      strokeStyle: 'solid' as const,
      fillStyle: 'solid' as const,
      blendMode: 'normal' as const,
      previewCornerRadius: 8,
    };
    const patch = applyLiveSymbologyDraftToLayerState(layer, draft, appearance);
    expect(patch.useArcGisSymbology).toBe(false);
    expect(patch.symbology?.useArcGisOnline).toBe(false);
    expect(patch.symbology?.style).toBe('single');

    const pack = resolveSiLayerMapboxStylePackWithPreview({ layer: { ...layer, ...patch }, draft, appearance });
    expect(pack.circlePaint['circle-color']).toBe('#f97316');
    expect(Array.isArray(pack.circlePaint['circle-color'])).toBe(false);

    const persistedBeforeSave = resolveSiLayerMapboxStylePack({ ...layer, ...patch });
    expect(persistedBeforeSave.linePaint['line-color']).toBe(SI_FORCED_LAYER_STROKE);

    const persisted = resolveSiLayerMapboxStylePack({
      ...layer,
      ...patch,
      symbology: { ...patch.symbology!, userConfigured: true },
    });
    expect(persisted.circlePaint['circle-color']).toBe('#f97316');
  });

  it('treats userConfigured flag as saved custom symbology', () => {
    expect(siLayerHasSavedCustomSymbology({ userConfigured: true, style: 'single' })).toBe(true);
    expect(
      siLayerHasSavedCustomSymbology({
        useArcGisOnline: true,
        style: 'unique',
        field: 'Structure_Type',
        categoryColors: { A: '#ff0000' },
      }),
    ).toBe(false);
  });
});

describe('arcgisDrawingInfoSupportsMapboxRender', () => {
  it('supports unique-value point markers without polygon fill', () => {
    expect(arcgisDrawingInfoSupportsMapboxRender(arcgisUniqueDi)).toBe(true);
  });
});

describe('siMapboxSymbologyInstanceId', () => {
  it('changes when studio style revision changes', () => {
    const layer = {
      geojson: { type: 'FeatureCollection', features: [] },
      symbology: { userConfigured: true, style: 'unique' as const, field: 'type', categoryColors: { x: '#00ff00' } },
      mapOpacity: 1,
    };
    const appearance = {
      color: '#94a3b8',
      fillColor: '#38bdf8',
      weight: 2,
      opacity: 1,
      polygonFillAlpha: 0.35,
      pointRadius: 6,
      strokeStyle: 'solid' as const,
      fillStyle: 'solid' as const,
      blendMode: 'normal' as const,
      previewCornerRadius: 8,
    };
    const a = computeSiLayerStyleRevision(layer, { draft: layer.symbology, appearance, mapOpacity: 1 });
    const b = computeSiLayerStyleRevision(layer, {
      draft: { ...layer.symbology, style: 'single' },
      appearance,
      mapOpacity: 1,
    });
    expect(siMapboxSymbologyInstanceId('lyr-1', a)).not.toBe(siMapboxSymbologyInstanceId('lyr-1', b));
  });
});
