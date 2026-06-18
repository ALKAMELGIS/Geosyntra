import { describe, expect, it } from 'vitest';
import { DEFAULT_SI_MAP_WEATHER } from './siMapWeatherTypes';
import {
  buildSiMapInteractiveToolSnapshot,
  clearSiOrsIsochroneMapLayers,
  shouldShowSiOrsIsochroneLayer,
  SI_ORS_ISOCHRONE_LAYER_IDS,
  SI_ORS_ISOCHRONE_SOURCE_ID,
  siMapInteractiveToolOpenBlockedByFeaturePopups,
  siMapInteractiveToolPanelOpen,
  siMapInteractiveToolSuppressesIdentifyPopups,
  siMapFeaturePopupsEngaged,
  siMapFloatingFeaturePopupsAllowed,
  readSiMapFloatingIdentifyEnabled,
  persistSiMapFloatingIdentifyEnabled,
  siMapWeatherCanvasOverlayActive,
  siMapWeatherNativePrecipitationAllowed,
} from './siMapToolIntegration';

describe('siMapToolIntegration', () => {
  it('activates weather canvas overlay for rainy presets', () => {
    const rainy = { ...DEFAULT_SI_MAP_WEATHER, preset: 'rain' as const, precipitation: 80 };
    expect(siMapWeatherCanvasOverlayActive(rainy)).toBe(true);
  });

  it('allows native precipitation for weather settings', () => {
    expect(siMapWeatherNativePrecipitationAllowed(DEFAULT_SI_MAP_WEATHER)).toBe(true);
  });

  it('shows isochrone layers only in isochrone mode', () => {
    const fc = { type: 'FeatureCollection' as const, features: [] };
    expect(shouldShowSiOrsIsochroneLayer('route', true, fc)).toBe(false);
    expect(shouldShowSiOrsIsochroneLayer('loc-alloc', true, fc)).toBe(false);
    expect(shouldShowSiOrsIsochroneLayer('isochrone', false, fc)).toBe(false);
    expect(shouldShowSiOrsIsochroneLayer('isochrone', true, null)).toBe(false);
    expect(shouldShowSiOrsIsochroneLayer('isochrone', true, fc)).toBe(true);
  });

  it('blocks opening analysis tools while feature pop-ups are active', () => {
    expect(siMapFeaturePopupsEngaged({ mapFeaturePopupsActive: true })).toBe(true);
    expect(siMapInteractiveToolOpenBlockedByFeaturePopups({ mapFeaturePopupsActive: true })).toBe(true);
    expect(siMapInteractiveToolOpenBlockedByFeaturePopups({ mapFeaturePopupsActive: false })).toBe(false);
  });

  it('suppresses identify pop-ups while route map or weather tools are open', () => {
    expect(siMapInteractiveToolPanelOpen({ routeMapOpen: true })).toBe(true);
    expect(siMapInteractiveToolSuppressesIdentifyPopups({ mapWeatherOpen: true })).toBe(true);
    expect(siMapInteractiveToolSuppressesIdentifyPopups({ routeMapPickTarget: 'start' })).toBe(true);
    expect(siMapInteractiveToolSuppressesIdentifyPopups({ interactionMode: 'view' })).toBe(false);
    expect(siMapInteractiveToolSuppressesIdentifyPopups({ interactionMode: 'draw', mapDrawTool: 'select' })).toBe(
      true,
    );
    expect(siMapInteractiveToolSuppressesIdentifyPopups({ interactionMode: 'view', mapDrawTool: 'polygon' })).toBe(
      true,
    );
  });

  it('allows floating identify by default and respects opt-out', () => {
    persistSiMapFloatingIdentifyEnabled(false);
    expect(readSiMapFloatingIdentifyEnabled()).toBe(false);
    expect(siMapFloatingFeaturePopupsAllowed({ interactionMode: 'view', mapDrawTool: 'select' })).toBe(false);
    persistSiMapFloatingIdentifyEnabled(true);
    expect(readSiMapFloatingIdentifyEnabled()).toBe(true);
    expect(siMapFloatingFeaturePopupsAllowed({ interactionMode: 'view', mapDrawTool: 'select' })).toBe(true);
    expect(
      siMapFloatingFeaturePopupsAllowed({ interactionMode: 'view', mapDrawTool: 'polygon', drawSketchActive: true }),
    ).toBe(false);
    persistSiMapFloatingIdentifyEnabled(false);
  });

  it('buildSiMapInteractiveToolSnapshot marks active polygon sketch', () => {
    const snap = buildSiMapInteractiveToolSnapshot({
      routeMapOpen: false,
      mapWeatherIntelActive: false,
      mapWeatherOpen: false,
      mapSunSkyOpen: false,
      mapCropHealthOpen: false,
      mapLayerSwipeOpen: false,
      elevProfileOpen: false,
      elevProfileSketching: false,
      routeMapPickTarget: null,
      locAllocPickTarget: null,
      sunSkyLosSketchMode: null,
      interactionMode: 'draw',
      mapDrawTool: 'polygon',
      polygonRingLength: 2,
      hasPolylineStart: false,
      hasRectCirclePreview: false,
      hasCircleRefineDraft: false,
      dragRectCircleActive: false,
      polygonVertexSketchDrag: false,
      mapFeaturePopupsActive: false,
    });
    expect(snap.drawSketchActive).toBe(true);
    expect(siMapInteractiveToolSuppressesIdentifyPopups(snap)).toBe(true);
  });

  it('clears stale isochrone map layers imperatively', () => {
    const removedLayers: string[] = [];
    const removedSources: string[] = [];
    const map = {
      getStyle: () => ({ layers: [] }),
      getLayer: (id: string) => SI_ORS_ISOCHRONE_LAYER_IDS.includes(id as (typeof SI_ORS_ISOCHRONE_LAYER_IDS)[number]),
      removeLayer: (id: string) => {
        removedLayers.push(id);
      },
      getSource: (id: string) => (id === SI_ORS_ISOCHRONE_SOURCE_ID ? {} : null),
      removeSource: (id: string) => {
        removedSources.push(id);
      },
    };
    clearSiOrsIsochroneMapLayers(map as never);
    expect(removedLayers).toEqual([...SI_ORS_ISOCHRONE_LAYER_IDS]);
    expect(removedSources).toEqual([SI_ORS_ISOCHRONE_SOURCE_ID]);
  });
});
