import { describe, expect, it, vi } from 'vitest';
import {
  clampSiViewStateForProjection,
  formatSiMapWgs84Coordinate,
  loadStoredSiMapProjectionMode,
  loadStoredSiTerrainExaggeration,
  loadStoredSiTerrainSettings,
  migrateSiMapProjectionToGlobeOnly,
  migrateSiTerrainContourDefaultOff,
  normalizeContourClassificationMode,
  SI_DEFAULT_TERRAIN_SETTINGS,
  SI_MAP_TERRAIN_CONTOUR_ENABLED_LS,
  SI_CONTOUR_MAIN_LINE_EVERY_DEFAULT,
  SI_ELEVATION_VIEW_TRANSITION_MS,
  SI_GLOBE_HOME_VIEW,
  clampContourIntervalM,
  configureSiMapCameraControlsForView,
  formatContourIntervalDisplay,
  parseContourIntervalDraft,
  siMapCameraOrbitFromDrag,
  siMapCameraOrbitModifierPressed,
  siMapShouldStartCameraOrbitDrag,
  siMapShouldStartCameraOrbitDragRight3d,
  siViewStatesNear,
} from './siMapProjectionTerrain';

describe('siMapProjectionTerrain', () => {
  it('defaults projection to globe', () => {
    expect(loadStoredSiMapProjectionMode()).toBe('globe');
  });

  it('uses centered globe home view (pitch 0)', () => {
    expect(SI_GLOBE_HOME_VIEW.pitch).toBe(0);
    expect(SI_GLOBE_HOME_VIEW.zoom).toBeGreaterThan(0);
  });

  it('formats WGS84 coordinates for status bar', () => {
    expect(formatSiMapWgs84Coordinate(55.2708, 25.2048)).toMatch(/25\.20480° N, 55\.27080° E/);
    expect(formatSiMapWgs84Coordinate(-74.006, 40.7128)).toMatch(/40\.71280° N, 74\.00600° W/);
  });

  it('migrates legacy 2d preference to globe', () => {
    const key = 'si-map-projection-mode-v1';
    localStorage.setItem(key, '2d');
    migrateSiMapProjectionToGlobeOnly();
    expect(localStorage.getItem(key)).toBe('globe');
    expect(loadStoredSiMapProjectionMode()).toBe('globe');
  });

  it('clamps terrain exaggeration', () => {
    expect(loadStoredSiTerrainExaggeration()).toBeGreaterThanOrEqual(0.5);
    expect(loadStoredSiTerrainExaggeration()).toBeLessThanOrEqual(3);
  });

  it('defaults contour lines off until the user enables them', () => {
    expect(SI_DEFAULT_TERRAIN_SETTINGS.contourEnabled).toBe(false);
    expect(SI_DEFAULT_TERRAIN_SETTINGS.contourLabelsEnabled).toBe(false);
    localStorage.removeItem('si-map-contour-opt-in-migration-v1');
    localStorage.setItem(SI_MAP_TERRAIN_CONTOUR_ENABLED_LS, '1');
    migrateSiTerrainContourDefaultOff();
    expect(localStorage.getItem(SI_MAP_TERRAIN_CONTOUR_ENABLED_LS)).toBe('0');
    const loaded = loadStoredSiTerrainSettings();
    expect(loaded.contourEnabled).toBe(false);
    expect(loaded.contourLabelsEnabled).toBe(false);
  });

  it('normalizes contour classification mode', () => {
    expect(normalizeContourClassificationMode('elevation')).toBe('elevation');
    expect(normalizeContourClassificationMode('density')).toBe('density');
    expect(normalizeContourClassificationMode('gradient')).toBe('gradient');
    expect(normalizeContourClassificationMode('invalid')).toBe('elevation');
  });

  it('defaults main contour index multiplier', () => {
    expect(SI_CONTOUR_MAIN_LINE_EVERY_DEFAULT).toBe(5);
  });

  it('siViewStatesNear treats epsilon float drift as equal', () => {
    const a = { longitude: 10, latitude: 20, zoom: 5, pitch: 0, bearing: 0 };
    const b = { ...a, longitude: a.longitude + 1e-7, zoom: a.zoom! + 1e-7 };
    expect(siViewStatesNear(a, b)).toBe(true);
    expect(siViewStatesNear(a, { ...a, zoom: 6 })).toBe(false);
  });

  it('uses smooth elevation view transition timing', () => {
    expect(SI_ELEVATION_VIEW_TRANSITION_MS).toBeGreaterThanOrEqual(600);
    expect(SI_ELEVATION_VIEW_TRANSITION_MS).toBeLessThanOrEqual(900);
  });

  it('clamps decimal contour intervals for flat terrain', () => {
    expect(clampContourIntervalM(0)).toBe(0.1);
    expect(clampContourIntervalM(0.25)).toBe(0.25);
    expect(clampContourIntervalM(0.123456)).toBe(0.1);
    expect(clampContourIntervalM(1.03)).toBe(1.05);
    expect(formatContourIntervalDisplay(0.5)).toBe('0.5');
    expect(parseContourIntervalDraft('0,75')).toBe(0.75);
    expect(parseContourIntervalDraft('abc')).toBeNull();
  });

  it('detects Ctrl/Meta for camera orbit drag (Google Earth)', () => {
    expect(siMapCameraOrbitModifierPressed({ ctrlKey: true })).toBe(true);
    expect(siMapCameraOrbitModifierPressed({ metaKey: true })).toBe(true);
    expect(siMapCameraOrbitModifierPressed({ shiftKey: true })).toBe(false);
    expect(siMapCameraOrbitModifierPressed({})).toBe(false);
  });

  it('maps vertical drag to pitch (Google Earth tilt)', () => {
    const { pitch } = siMapCameraOrbitFromDrag(10, 0, 0, -100);
    expect(pitch).toBeGreaterThan(10);
    const down = siMapCameraOrbitFromDrag(50, 0, 0, 100);
    expect(down.pitch).toBeLessThan(50);
  });

  it('disables Ctrl+orbit in 3D Scene View (right-drag rotate instead)', () => {
    expect(
      siMapShouldStartCameraOrbitDrag({
        button: 0,
        ctrlKey: true,
        elevation3d: true,
        mapDrawTool: 'select',
        polygonRingLength: 0,
        hasPolylineStart: false,
        hasCircleRefineDraft: false,
        hasRectCirclePreview: false,
      }),
    ).toBe(false);
  });

  it('enables right-drag rotate only in 3D elevation view', () => {
    expect(
      siMapShouldStartCameraOrbitDragRight3d({
        button: 2,
        elevation3d: true,
        mapDrawTool: 'select',
        polygonRingLength: 0,
        hasPolylineStart: false,
        hasCircleRefineDraft: false,
        hasRectCirclePreview: false,
      }),
    ).toBe(true);
    expect(
      siMapShouldStartCameraOrbitDragRight3d({
        button: 2,
        elevation3d: false,
        mapDrawTool: 'select',
        polygonRingLength: 0,
        hasPolylineStart: false,
        hasCircleRefineDraft: false,
        hasRectCirclePreview: false,
      }),
    ).toBe(false);
    expect(
      siMapShouldStartCameraOrbitDragRight3d({
        button: 2,
        shiftKey: true,
        elevation3d: true,
        mapDrawTool: 'select',
        polygonRingLength: 0,
        hasPolylineStart: false,
        hasCircleRefineDraft: false,
        hasRectCirclePreview: false,
      }),
    ).toBe(false);
  });

  it('disables native dragRotate; 3D uses custom right-drag orbit', () => {
    const dragPan = { enable: vi.fn(), disable: vi.fn() };
    const dragRotate = { enable: vi.fn(), disable: vi.fn() };
    const scrollZoom = { enable: vi.fn(), disable: vi.fn() };
    const map = {
      dragPan,
      dragRotate,
      scrollZoom,
      getCanvas: () => ({ addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    } as unknown as import('mapbox-gl').Map;

    configureSiMapCameraControlsForView(map, true);
    expect(dragPan.enable).toHaveBeenCalled();
    expect(scrollZoom.enable).toHaveBeenCalled();
    expect(dragRotate.disable).toHaveBeenCalled();
    expect(dragRotate.enable).not.toHaveBeenCalled();

    dragPan.enable.mockClear();
    dragRotate.enable.mockClear();
    dragRotate.disable.mockClear();
    scrollZoom.enable.mockClear();

    configureSiMapCameraControlsForView(map, false);
    expect(dragPan.enable).toHaveBeenCalled();
    expect(scrollZoom.enable).toHaveBeenCalled();
    expect(dragRotate.disable).toHaveBeenCalled();
    expect(dragRotate.enable).not.toHaveBeenCalled();
  });

  it('allows Ctrl+orbit when circle tool is idle (not while sketching)', () => {
    const base = {
      button: 0,
      ctrlKey: true,
      elevation3d: false,
      polygonRingLength: 0,
      hasPolylineStart: false,
      hasCircleRefineDraft: false,
      hasRectCirclePreview: false,
    };
    expect(
      siMapShouldStartCameraOrbitDrag({ ...base, mapDrawTool: 'select' }),
    ).toBe(true);
    expect(
      siMapShouldStartCameraOrbitDrag({ ...base, mapDrawTool: 'circle' }),
    ).toBe(true);
    expect(
      siMapShouldStartCameraOrbitDrag({
        ...base,
        mapDrawTool: 'circle',
        hasRectCirclePreview: true,
      }),
    ).toBe(false);
  });

  it('zeros pitch and bearing for 2D view state', () => {
    const clamped = clampSiViewStateForProjection(
      { longitude: 1, latitude: 2, zoom: 10, pitch: 55, bearing: 12 },
      '2d',
    );
    expect(clamped.pitch).toBe(0);
    expect(clamped.bearing).toBe(0);
    expect(clamped.zoom).toBe(10);
  });
});
