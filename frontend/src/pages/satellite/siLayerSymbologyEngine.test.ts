import { describe, expect, it } from 'vitest';
import { arcgisDrawingInfoSupportsMapboxRender } from '../../lib/arcgisDrawingInfoMapbox';
import { SI_FORCED_LAYER_STROKE } from './siGlobalLayerStyleController';
import {
  applyLiveSymbologyDraftToLayerState,
  commitSymbologyStyleToLayerState,
  computeSiLayerStyleRevision,
  finalizeSymbologyDraftForCommit,
  pruneSymbologyCategoryMaps,
  reconcileSymbologyDraftWithLayer,
  resolveSiLayerMapboxStylePack,
  resolveSiLayerMapboxStylePackWithPreview,
  siLayerExplicitlyUsesArcgisOnlineSymbology,
  siLayerHasSavedCustomSymbology,
  siLayerPrefersCustomSymbology,
  siLayerHasAppSymbologyOverride,
  siLayerShouldUseArcgisDrawingInfo,
  siMapboxSymbologyInstanceId,
  siSymbologyDraftOverridesServiceRenderer,
  siSymbologyExternalLayerFingerprint,
  symbologyDraftFromLayer,
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
  it('defaults ArcGIS Online symbology ON for arcgis layers with drawingInfo', () => {
    expect(
      siLayerExplicitlyUsesArcgisOnlineSymbology({
        source: 'arcgis',
        arcgisDrawingInfo: arcgisUniqueDi,
      }),
    ).toBe(false);
    expect(siLayerPrefersCustomSymbology({ source: 'arcgis', arcgisDrawingInfo: arcgisUniqueDi })).toBe(true);
    expect(
      siLayerShouldUseArcgisDrawingInfo({
        source: 'arcgis',
        arcgisDrawingInfo: arcgisUniqueDi,
        geojson: {
          type: 'FeatureCollection',
          features: [
            { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { Structure_Type: 1 } },
          ],
        },
      }),
    ).toBe(true);
    const { draft } = symbologyDraftFromLayer({
      source: 'arcgis',
      arcgisDrawingInfo: arcgisUniqueDi,
      geojson: {
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { Structure_Type: 1 } },
        ],
      },
    });
    expect(draft.useArcGisOnline).toBe(true);
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

describe('symbology override vs ArcGIS service renderer', () => {
  it('uses ArcGIS service renderer when useArcGisOnline is enabled (even with userConfigured)', () => {
    const polygonDi = {
      renderer: {
        type: 'uniqueValue',
        field1: 'zone',
        uniqueValueInfos: [
          {
            value: '1001',
            symbol: {
              type: 'esriSFS',
              style: 'esriSFSSolid',
              color: [255, 0, 0, 180],
              outline: { color: [0, 0, 0, 255], width: 1 },
            },
          },
          {
            value: '1002',
            symbol: {
              type: 'esriSFS',
              style: 'esriSFSSolid',
              color: [0, 0, 255, 180],
              outline: { color: [0, 0, 0, 255], width: 1 },
            },
          },
        ],
      },
    };
    const layer = {
      source: 'arcgis' as const,
      geojson: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
            properties: { zone: '1001' },
          },
        ],
      },
      arcgisDrawingInfo: polygonDi,
      symbology: {
        useArcGisOnline: true,
        style: 'unique' as const,
        field: 'zone',
        userConfigured: true,
        categoryColors: { '1001': '#22c55e' },
      },
      useArcGisSymbology: true,
    };
    expect(siSymbologyDraftOverridesServiceRenderer(layer.symbology)).toBe(false);
    expect(siLayerHasAppSymbologyOverride(layer)).toBe(false);
    const preview = resolveSiLayerMapboxStylePackWithPreview({
      layer,
      draft: layer.symbology,
      appearance: {
        color: '#0f172a',
        fillColor: '#22c55e',
        weight: 2,
        opacity: 1,
        polygonFillAlpha: 0.65,
        pointRadius: 6,
        strokeStyle: 'solid',
        fillStyle: 'solid',
        blendMode: 'normal',
        previewCornerRadius: 8,
      },
    });
    expect(Array.isArray(preview.fillPaint['fill-color'])).toBe(true);
    expect(preview.fillPaint['fill-color']).not.toBe('#22c55e');
    const persisted = resolveSiLayerMapboxStylePack(layer);
    expect(Array.isArray(persisted.fillPaint['fill-color'])).toBe(true);
    expect(persisted.linePaint['line-color']).not.toBe(SI_FORCED_LAYER_STROKE);
  });
});

describe('siMapboxSymbologyInstanceId', () => {
  it('computeSiLayerStyleRevision uses draft key before forced default', () => {
    const layer = {
      geojson: { type: 'FeatureCollection', features: [] },
      symbology: { style: 'single' as const, userConfigured: false },
    };
    const appearance = {
      color: '#94a3b8',
      fillColor: '#ffffff',
      weight: 2,
      opacity: 1,
      polygonFillAlpha: 1,
      pointRadius: 6,
      strokeStyle: 'solid' as const,
      fillStyle: 'solid' as const,
      blendMode: 'normal' as const,
      previewCornerRadius: 8,
    };
    const draft = {
      useArcGisOnline: false,
      style: 'color' as const,
      field: 'height',
      classes: 5,
      method: 'equal_interval' as const,
      colorRamp: 'blues' as const,
      threshold: Number.NaN,
    };
    const rev = computeSiLayerStyleRevision(layer, { draft, appearance, mapOpacity: 1 });
    expect(rev.startsWith('pv|')).toBe(true);
    expect(rev).not.toBe('fd|1');
  });

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

describe('symbology studio sync', () => {
  const geo = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { zone: 'A', old: 1 } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [1, 1] }, properties: { zone: 'B', old: 2 } },
    ],
  };

  it('prunes unique-value category keys missing from data', () => {
    const pruned = pruneSymbologyCategoryMaps(geo, 'unique', 'zone', 12, { A: '#f00', B: '#0f0', stale: '#999' }, undefined);
    expect(pruned.categoryColors).toEqual({ A: '#f00', B: '#0f0' });
    expect(pruned.categoryColors?.stale).toBeUndefined();
  });

  it('detects external rename via fingerprint', () => {
    const layer = { id: 'x', name: 'Fields', geojson: geo, symbology: { style: 'unique' as const, field: 'zone', userConfigured: true } };
    const fp1 = siSymbologyExternalLayerFingerprint(layer);
    const fp2 = siSymbologyExternalLayerFingerprint({ ...layer, name: 'Renamed' });
    expect(fp1).not.toBe(fp2);
  });

  it('reconcile rebuilds draft when geojson schema changes', () => {
    const layer = {
      id: 'x',
      geojson: geo,
      symbology: { style: 'unique' as const, field: 'zone', classes: 12, userConfigured: true },
      color: '#22c55e',
      fillColor: '#38bdf8',
    };
    const { draft: initial } = symbologyDraftFromLayer(layer);
    const appearance = {
      color: '#22c55e',
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
    const syncedLayer = {
      ...layer,
      geojson: {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { type: 'X' } }],
      },
    };
    const out = reconcileSymbologyDraftWithLayer(syncedLayer, initial, appearance);
    expect(out.clearCategorySymbolEdit).toBe(true);
    expect(out.draft.field).not.toBe('zone');
  });

  it('siLayerHasAppSymbologyOverride requires userConfigured symbology', () => {
    const layer = {
      geojson: { type: 'FeatureCollection', features: [] },
      symbology: {
        style: 'unique' as const,
        field: 'zone',
        useArcGisOnline: false,
        userConfigured: false,
        categoryColors: { A: '#ff0000' },
      },
    };
    expect(siLayerHasAppSymbologyOverride(layer)).toBe(false);
    expect(
      siLayerHasAppSymbologyOverride({
        ...layer,
        symbology: { ...layer.symbology, userConfigured: true },
      }),
    ).toBe(true);
  });
});

describe('style engine Apply — unique vs graduated isolation', () => {
  const polygonLayer = {
    source: 'arcgis' as const,
    geojson: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
          },
          properties: { build_id: 1, height: 12 },
        },
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [[[2, 0], [3, 0], [3, 1], [2, 1], [2, 0]]],
          },
          properties: { build_id: 2, height: 24 },
        },
      ],
    },
    arcgisDrawingInfo: arcgisUniqueDi,
    color: '#94a3b8',
    fillColor: '#38bdf8',
  };

  it('finalizeSymbologyDraftForCommit strips class keys from unique style', () => {
    const draft = finalizeSymbologyDraftForCommit(polygonLayer, {
      useArcGisOnline: false,
      style: 'unique',
      field: 'build_id',
      classes: 5,
      method: 'equal-interval',
      colorRamp: 'viridis',
      threshold: Number.NaN,
      categoryColors: { __si_class_0: '#000', __si_class_1: '#111', '1': '#f00', '2': '#0f0' },
      arcgisMaxCategories: 8,
    });
    expect(draft.style).toBe('unique');
    expect(draft.categoryColors?.__si_class_0).toBeUndefined();
    expect(draft.categoryColors?.['1']).toBe('#f00');
  });

  it('commitSymbologyStyleToLayerState uses graduated step paints not unique match', () => {
    const patch = commitSymbologyStyleToLayerState(
      polygonLayer,
      {
        useArcGisOnline: false,
        style: 'color',
        field: 'build_id',
        classes: 5,
        method: 'equal-interval',
        colorRamp: 'blues',
        threshold: Number.NaN,
        categoryColors: { '1': '#ff0000', __si_class_0: '#aabbcc' },
        arcgisMaxCategories: 8,
      },
      {
        color: '#0f172a',
        fillColor: '#38bdf8',
        weight: 2,
        opacity: 1,
        polygonFillAlpha: 0.65,
        pointRadius: 6,
        strokeStyle: 'solid',
        fillStyle: 'solid',
        blendMode: 'normal',
        previewCornerRadius: 8,
      },
    );
    expect(patch.symbology?.userConfigured).toBe(true);
    expect(patch.symbology?.style).toBe('color');
    expect(patch.useArcGisSymbology).toBe(false);
    expect(patch.symbologyUseFallback).toBe(false);
    const pack = resolveSiLayerMapboxStylePack({ ...polygonLayer, ...patch });
    expect(Array.isArray(pack.fillPaint['fill-color'])).toBe(true);
    expect(String(pack.fillPaint['fill-color']?.[0])).toBe('step');
  });

  it('commitSymbologyStyleToLayerState applies unique category colors to 3D building map pack', () => {
    const appearance = {
      color: '#94a3b8',
      fillColor: '#ffffff',
      weight: 2,
      opacity: 1,
      polygonFillAlpha: 1,
      pointRadius: 6,
      strokeStyle: 'solid' as const,
      fillStyle: 'solid' as const,
      blendMode: 'normal' as const,
      previewCornerRadius: 8,
    };
    const patch = commitSymbologyStyleToLayerState(
      polygonLayer,
      {
        useArcGisOnline: false,
        style: 'unique',
        field: 'build_id',
        classes: 3,
        method: 'equal-interval',
        colorRamp: 'viridis',
        threshold: Number.NaN,
        categoryColors: { '1': '#a855f7', '2': '#14b8a6' },
        arcgisMaxCategories: 8,
      },
      appearance,
    );
    const pack = resolveSiLayerMapboxStylePack({ ...polygonLayer, ...patch });
    const fillColor = pack.fillPaint['fill-color'];
    expect(Array.isArray(fillColor)).toBe(true);
    expect(String(fillColor?.[0])).toBe('match');
    expect(JSON.stringify(fillColor)).toContain('#a855f7');
    expect(JSON.stringify(fillColor)).toContain('#14b8a6');
    expect(fillColor).not.toBe('#ffffff');
  });

  it('style revision changes when switching unique to graduated', () => {
    const appearance = {
      color: '#0f172a',
      fillColor: '#38bdf8',
      weight: 2,
      opacity: 1,
      polygonFillAlpha: 0.65,
      pointRadius: 6,
      strokeStyle: 'solid' as const,
      fillStyle: 'solid' as const,
      blendMode: 'normal' as const,
      previewCornerRadius: 8,
    };
    const uniquePatch = commitSymbologyStyleToLayerState(
      polygonLayer,
      {
        useArcGisOnline: false,
        style: 'unique',
        field: 'build_id',
        classes: 5,
        method: 'equal-interval',
        colorRamp: 'viridis',
        threshold: Number.NaN,
        arcgisMaxCategories: 8,
      },
      appearance,
    );
    const gradPatch = commitSymbologyStyleToLayerState(
      polygonLayer,
      {
        useArcGisOnline: false,
        style: 'color',
        field: 'build_id',
        classes: 5,
        method: 'equal-interval',
        colorRamp: 'blues',
        threshold: Number.NaN,
        arcgisMaxCategories: 8,
      },
      appearance,
    );
    const revUnique = computeSiLayerStyleRevision({ ...polygonLayer, ...uniquePatch });
    const revGrad = computeSiLayerStyleRevision({ ...polygonLayer, ...gradPatch });
    expect(revUnique).not.toBe(revGrad);
  });
});
