import { describe, expect, it } from 'vitest';
import { arcgisSymbologyLikelyInvisibleForGeoJson } from '../../../lib/arcgisSymbologyGeoJsonProbe';
import { buildSiForcedDefaultVectorStylePack, buildSi3dBuildingDefaultVectorStylePack, SI_3D_BUILDING_FILL, SI_3D_BUILDING_STROKE, SI_FORCED_LAYER_FILL, SI_FORCED_LAYER_STROKE } from '../siGlobalLayerStyleController';
import {
  appendPreparedCustomLayers,
  buildCustomLayerMapboxStyleKey,
  buildSiHeightExtrusionPaint,
  countGeoJsonFeatures,
  customLayerMapboxStyleKey,
  detectSiCustomLayerHeightExtrusionField,
  prepareCustomLayerForMap,
  resolveSiLayerMapboxStylePackForMap,
  resolveVisibleSiLayerMapboxStylePackForMap,
  siCustomLayerQualifiesForHeightExtrusionDefaultStyle,
  shouldSiCustomLayerUseHeightExtrusion,
  stageCustomLayerForImmediateDisplay,
} from './siMapCustomLayerRegistry';

describe('siMapCustomLayerRegistry', () => {
  it('prepareCustomLayerForMap forces visibility and opacity', () => {
    const out = prepareCustomLayerForMap({
      id: 'a',
      name: 'Test',
      visible: false,
      mapOpacity: 0,
      geojson: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [0, 0] } }] },
    });
    expect(out.visible).toBe(false);
    expect(out.mapOpacity).toBeGreaterThanOrEqual(0.05);
    expect(out.loadStatus).toBe('loaded');
  });

  it('appendPreparedCustomLayers prepares each layer', () => {
    const next = appendPreparedCustomLayers([], {
      id: 'b',
      name: 'L',
      geojson: { type: 'FeatureCollection', features: [] },
      visible: true,
    });
    expect(next).toHaveLength(1);
    expect(countGeoJsonFeatures(next[0].geojson)).toBe(0);
    expect(next[0].loadStatus).toBe('empty');
  });

  it('preserves loading status until layer view is ready', () => {
    const out = prepareCustomLayerForMap({
      id: 'c',
      name: 'Loading',
      loadStatus: 'loading',
      geojson: {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [0, 0] } }],
      },
      visible: true,
    });
    expect(out.loadStatus).toBe('loading');
  });

  it('mapbox style key uses r-prefix revision suffix (matches map render)', () => {
    const layer = {
      id: 'custom-1',
      geojson: {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [0, 0] } }],
      },
      mapRenderRevision: 3,
      mapOpacity: 1,
    };
    expect(customLayerMapboxStyleKey(layer)).toMatch(/\|r3(\||$)/);
    expect(buildCustomLayerMapboxStyleKey(layer)).toBe(customLayerMapboxStyleKey(layer));
  });

  it('uses stable style key during symbology studio live preview', () => {
    const layer = {
      id: 'builds-1',
      geojson: { type: 'FeatureCollection', features: [] },
      mapRenderRevision: 9,
      symbologyPreview: true,
    };
    const stable = buildCustomLayerMapboxStyleKey(layer, { symbologyStudioLive: true });
    expect(stable).toMatch(/^sp-stable\|builds-1\|/);
    expect(stable).not.toMatch(/\|r9(\||$)/);
    const bumped = buildCustomLayerMapboxStyleKey({ ...layer, mapRenderRevision: 99 });
    expect(bumped).not.toBe(stable);
  });

  it('detects unique-value field mismatch', () => {
    const di = {
      renderer: {
        type: 'uniqueValue',
        field1: 'MISSING_FIELD',
        uniqueValueInfos: [{ value: 'A', symbol: { color: [255, 0, 0, 255] } }],
        defaultSymbol: { style: 'esriSFSNull', color: [0, 0, 0, 0] },
      },
    };
    const gj = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: { real_field: 'A' }, geometry: { type: 'Point', coordinates: [1, 2] } }],
    };
    expect(arcgisSymbologyLikelyInvisibleForGeoJson(di, gj)).toBe(true);
  });

  it('matches coded values to feature labels for hollow polygons', () => {
    const di = {
      renderer: {
        type: 'uniqueValue',
        field1: 'Structure_Type',
        uniqueValueInfos: [
          {
            value: '1',
            label: 'Dates Farm',
            symbol: {
              style: 'esriSFSNull',
              color: [0, 0, 0, 0],
              outline: { color: [128, 0, 128, 255], width: 3 },
            },
          },
        ],
        defaultSymbol: { style: 'esriSFSNull', color: [0, 0, 0, 0] },
      },
    };
    const gj = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { Structure_Type: 'Dates Farm' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 0],
              ],
            ],
          },
        },
      ],
    };
    expect(arcgisSymbologyLikelyInvisibleForGeoJson(di, gj)).toBe(false);
  });

  it('prepareCustomLayerForMap falls back when ArcGIS symbology is invisible for GeoJSON fields', () => {
    const di = {
      renderer: {
        type: 'uniqueValue',
        field1: 'MISSING_FIELD',
        uniqueValueInfos: [{ value: 'A', symbol: { color: [255, 0, 0, 255] } }],
        defaultSymbol: { style: 'esriSFSNull', color: [0, 0, 0, 0] },
      },
    };
    const gj = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { real_field: 'A' },
          geometry: { type: 'Point', coordinates: [1, 2] },
        },
      ],
    };
    const out = prepareCustomLayerForMap({
      id: 'agro',
      name: 'Agro_Structures',
      source: 'arcgis',
      useArcGisSymbology: true,
      arcgisDrawingInfo: di,
      geojson: gj,
      visible: true,
    });
    expect(out.symbologyUseFallback).toBe(true);
    expect(out.useArcGisSymbology).toBe(false);
  });

  it('stageCustomLayerForImmediateDisplay bumps render revision', () => {
    const out = stageCustomLayerForImmediateDisplay({
      id: 'x',
      name: 'X',
      geojson: { type: 'FeatureCollection', features: [] },
      mapRenderRevision: 0,
    });
    expect(out.mapRenderRevision).toBeGreaterThan(0);
  });

  it('detects height_fin for 3D extrusion layers', () => {
    const gj = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { height_fin: 12, build_id: '1' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 0],
              ],
            ],
          },
        },
      ],
    };
    expect(detectSiCustomLayerHeightExtrusionField({ geojson: gj }, { elevation3d: true })).toBe('height_fin');
    expect(detectSiCustomLayerHeightExtrusionField({ geojson: gj })).toBeNull();
    expect(detectSiCustomLayerHeightExtrusionField({ geojson: gj }, { elevation3d: false })).toBeNull();
    expect(
      shouldSiCustomLayerUseHeightExtrusion(
        { id: 'b', name: 'builds', geojson: gj, visible: true },
        true,
      ),
    ).toBe(true);
    expect(
      shouldSiCustomLayerUseHeightExtrusion(
        { id: 'b', name: 'builds', geojson: gj, visible: true, renderMode: 'bim' },
        false,
      ),
    ).toBe(false);
  });

  it('materializes standard visible style for height extrusion layers on add', () => {
    const gj = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { height_fin: 8 },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 0],
              ],
            ],
          },
        },
      ],
    };
    const out = stageCustomLayerForImmediateDisplay({
      id: 'builds',
      name: 'builds',
      source: 'upload',
      geojson: gj,
      visible: true,
    });
    expect(siCustomLayerQualifiesForHeightExtrusionDefaultStyle(out)).toBe(true);
    expect(out.color).toBe(SI_3D_BUILDING_STROKE);
    expect(out.fillColor).toBe(SI_3D_BUILDING_FILL);
    expect(out.symbologyUseFallback).toBe(true);
    const pack = resolveVisibleSiLayerMapboxStylePackForMap(out);
    expect(pack.linePaint['line-color']).toBe(SI_3D_BUILDING_STROKE);
    expect(Number(pack.fillPaint['fill-opacity'])).toBeGreaterThan(0.04);
  });

  it('materializes default renderer on add without symbology Apply', () => {
    const gj = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 0],
              ],
            ],
          },
        },
      ],
    };
    const out = stageCustomLayerForImmediateDisplay({
      id: 'upload-1',
      name: 'Agro_Structures',
      source: 'upload',
      geojson: gj,
      visible: true,
    });
    expect(out.symbology?.userConfigured).not.toBe(true);
    expect(out.symbologyUseFallback).toBe(true);
    expect(out.color).toBeTruthy();
    expect(out.fillColor).toBeTruthy();
    expect(out.mapRenderRevision).toBeGreaterThan(0);
  });

  it('materializes visible custom renderer for ArcGIS layers with invisible symbology', () => {
    const di = {
      renderer: {
        type: 'uniqueValue',
        field1: 'MISSING_FIELD',
        uniqueValueInfos: [{ value: 'A', symbol: { color: [255, 0, 0, 255] } }],
        defaultSymbol: { style: 'esriSFSNull', color: [0, 0, 0, 0] },
      },
    };
    const gj = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { real_field: 'A' },
          geometry: { type: 'Point', coordinates: [1, 2] },
        },
      ],
    };
    const out = stageCustomLayerForImmediateDisplay({
      id: 'agro-arcgis',
      name: 'Agro_Structures',
      source: 'arcgis',
      useArcGisSymbology: true,
      arcgisDrawingInfo: di,
      geojson: gj,
      visible: true,
    });
    expect(out.symbology?.userConfigured).not.toBe(true);
    expect(out.symbologyUseFallback).toBe(true);
    expect(out.useArcGisSymbology).toBe(false);
    expect(out.color).toBeTruthy();
  });

  it('uses ArcGIS service colors on add when drawingInfo is renderable', () => {
    const di = {
      renderer: {
        type: 'simple',
        symbol: { type: 'esriSFS', color: [255, 128, 0, 180], outline: { color: [0, 0, 0, 255], width: 1 } },
      },
    };
    const gj = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { zone: 'A' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 0],
              ],
            ],
          },
        },
      ],
    };
    const out = stageCustomLayerForImmediateDisplay({
      id: 'arcgis-svc',
      name: 'Parcels',
      source: 'arcgis',
      useArcGisSymbology: true,
      arcgisDrawingInfo: di,
      geojson: gj,
      visible: true,
    });
    expect(out.symbology?.userConfigured).not.toBe(true);
    expect(out.symbology?.useArcGisOnline).toBe(true);
    expect(out.useArcGisSymbology).toBe(true);
    expect(out.symbologyUseFallback).not.toBe(true);
  });

  it('buildSiHeightExtrusionPaint uses data-driven fill-color for color ramps', () => {
    const colorStep: unknown[] = ['step', ['coalesce', ['to-number', ['get', 'count']], 0], '#111111'];
    const pack = {
      ...buildSiForcedDefaultVectorStylePack(),
      fillPaint: { 'fill-color': colorStep, 'fill-opacity': 0.5 },
    };
    const paint = buildSiHeightExtrusionPaint(pack, { fillColor: '#22c55e', color: '#22c55e' }, 1);
    expect(paint['fill-extrusion-color']).toEqual(colorStep);
    expect(paint['fill-extrusion-opacity']).toBe(1);
  });

  it('buildSiHeightExtrusionPaint uses unique-value match fill when footprint fill-opacity is 0', () => {
    const colorMatch: unknown[] = [
      'match',
      ['to-string', ['coalesce', ['get', 'build_id'], ['literal', '']]],
      '244',
      '#a855f7',
      '#94a3b8',
    ];
    const pack = {
      ...buildSiForcedDefaultVectorStylePack(),
      fillPaint: { 'fill-color': colorMatch, 'fill-opacity': 0 },
    };
    const paint = buildSiHeightExtrusionPaint(
      pack,
      { fillColor: SI_3D_BUILDING_FILL, color: SI_3D_BUILDING_STROKE },
      1,
    );
    expect(paint['fill-extrusion-color']).toEqual(colorMatch);
    expect(paint['fill-extrusion-color']).not.toBe(SI_3D_BUILDING_FILL);
  });

  it('buildSiHeightExtrusionPaint prefers style pack fill over stale layer fillColor', () => {
    const pack = {
      ...buildSiForcedDefaultVectorStylePack(),
      fillPaint: { 'fill-color': '#ff8800', 'fill-opacity': 1 },
    };
    const paint = buildSiHeightExtrusionPaint(pack, { fillColor: '#22c55e', color: '#22c55e' }, 1);
    expect(paint['fill-extrusion-color']).toBe('#ff8800');
    expect(paint['fill-extrusion-opacity']).toBe(1);
  });

  it('buildSiHeightExtrusionPaint uses full opacity for standard forced style packs', () => {
    const pack = resolveVisibleSiLayerMapboxStylePackForMap({
      id: 'builds',
      name: 'builds',
      geojson: {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: { height_fin: 10 }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } }],
      },
      symbologyUseFallback: true,
    });
    const paint = buildSiHeightExtrusionPaint(pack, { fillColor: '#22c55e', color: '#22c55e' }, 1);
    expect(paint['fill-extrusion-opacity']).toBe(1);
  });

  it('buildSiHeightExtrusionPaint uses full map opacity for 3D building transparent footprints', () => {
    const pack = buildSi3dBuildingDefaultVectorStylePack();
    const paint = buildSiHeightExtrusionPaint(
      pack,
      { fillColor: SI_3D_BUILDING_FILL, color: SI_3D_BUILDING_STROKE },
      1,
    );
    expect(paint['fill-extrusion-color']).toBe(SI_3D_BUILDING_FILL);
    expect(paint['fill-extrusion-opacity']).toBe(1);
    expect(paint['fill-extrusion-vertical-gradient']).toBe(true);
    const scaled = buildSiHeightExtrusionPaint(
      pack,
      { fillColor: SI_3D_BUILDING_FILL, color: SI_3D_BUILDING_STROKE },
      0.5,
    );
    expect(scaled['fill-extrusion-opacity']).toBe(0.5);
  });

  it('resolveVisibleSiLayerMapboxStylePackForMap ignores unpersisted studio symbology fields', () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { zone: 'A' },
          geometry: { type: 'Point', coordinates: [0, 0] },
        },
      ],
    };
    const pack = resolveVisibleSiLayerMapboxStylePackForMap({
      id: 'u1',
      name: 'Upload',
      source: 'upload',
      geojson,
      symbology: {
        style: 'unique',
        field: 'zone',
        classes: 5,
        method: 'equal_interval',
        colorRamp: 'viridis',
        threshold: Number.NaN,
        useArcGisOnline: false,
        userConfigured: false,
        categoryColors: { A: '#ff0000' },
      },
    });
    expect(pack.circlePaint['circle-color']).toBe(SI_FORCED_LAYER_FILL);
  });

  it('resolveSiLayerMapboxStylePackForMap uses forced visible pack for uploads', () => {
    const pack = resolveSiLayerMapboxStylePackForMap({
      id: 'u1',
      name: 'Upload',
      source: 'upload',
      geojson: {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [0, 0] } }],
      },
      symbology: {
        style: 'single',
        field: '',
        classes: 5,
        method: 'equal_interval',
        colorRamp: 'viridis',
        threshold: NaN,
        userConfigured: true,
        useArcGisOnline: false,
      },
    });
    expect(Number(pack.fillPaint['fill-opacity'])).toBeGreaterThan(0.04);
  });

  it('resolveSiLayerMapboxStylePackForMap honors user colors when symbologyUseFallback is still set', () => {
    const pack = resolveSiLayerMapboxStylePackForMap({
      id: 'u2',
      name: 'Builds',
      source: 'upload',
      symbologyUseFallback: true,
      color: '#334155',
      fillColor: '#ffffff',
      geojson: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [0, 0],
                  [1, 0],
                  [1, 1],
                  [0, 1],
                  [0, 0],
                ],
              ],
            },
          },
        ],
      },
      symbology: {
        style: 'single',
        field: '',
        classes: 5,
        method: 'equal_interval',
        colorRamp: 'viridis',
        threshold: NaN,
        userConfigured: true,
        useArcGisOnline: false,
      },
    });
    expect(pack.fillPaint['fill-color']).toBe('#ffffff');
    expect(pack.linePaint['line-color']).toBe('#334155');
  });

  it('prepareCustomLayerForMap clears symbologyUseFallback after user Apply', () => {
    const out = prepareCustomLayerForMap({
      id: 'u3',
      name: 'Layer',
      source: 'upload',
      visible: true,
      symbologyUseFallback: true,
      color: '#ffffff',
      fillColor: '#ffffff',
      geojson: {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [0, 0] } }],
      },
      symbology: {
        style: 'single',
        field: '',
        classes: 5,
        method: 'equal_interval',
        colorRamp: 'viridis',
        threshold: NaN,
        userConfigured: true,
        useArcGisOnline: false,
      },
    });
    expect(out.symbologyUseFallback).toBe(false);
  });
});
