import type { Map as MapboxMap } from 'mapbox-gl';
import { warmSiMapElevationScene } from './siMapElevationTransition';
import {
  SI_ELEVATION_VIEW_PITCH,
  SI_TERRAIN_EXAGGERATION_MAX,
  SI_TERRAIN_EXAGGERATION_MIN,
  clampElevationPitch,
  configureSiMapGoogleEarthCameraControls,
  ensureSiTerrainRenderDemSource,
  normalizeSiTerrainElevationProvider,
  readSiMapboxProjectionName,
  siElevationPitchScreenOffset,
  siMapApplyCameraOrbitDrag,
  siMapBeginCameraOrbitDrag,
  siMapCameraOrbitFromDrag,
  type SiMapCameraOrbitDragSession,
  type SiMapTerrainSettings,
} from './siMapProjectionTerrain';

/** Commit 3D elevation view after right-drag tilt passes this pitch (degrees). */
export const SI_MAP_RIGHT_DRAG_ELEVATION_COMMIT_PITCH = 16;

function clampExag(n: number): number {
  return Math.min(SI_TERRAIN_EXAGGERATION_MAX, Math.max(SI_TERRAIN_EXAGGERATION_MIN, n));
}

function prepGlobeAndDem(map: MapboxMap): void {
  warmSiMapElevationScene(map);
  try {
    if (readSiMapboxProjectionName(map) !== 'globe') {
      map.setProjection({ name: 'globe' });
    }
  } catch {
    /* ignore */
  }
}

/** Same draw-tool guards as 3D right-drag — but only in 2D (not yet in elevation view). */
export function siMapShouldStartRightDragElevationTilt(opts: {
  button: number;
  shiftKey?: boolean;
  elevation3d?: boolean;
  mapDrawTool: string;
  polygonRingLength: number;
  hasPolylineStart: boolean;
  hasCircleRefineDraft: boolean;
  hasRectCirclePreview: boolean;
}): boolean {
  if (opts.elevation3d) return false;
  if (opts.button !== 2) return false;
  if (opts.shiftKey) return false;
  if (opts.mapDrawTool === 'polygon' && opts.polygonRingLength > 0) return false;
  if (opts.mapDrawTool === 'rectangle' && opts.hasRectCirclePreview) return false;
  if (
    opts.mapDrawTool === 'circle' &&
    (opts.hasCircleRefineDraft || opts.hasRectCirclePreview)
  ) {
    return false;
  }
  if (opts.mapDrawTool === 'polyline' && opts.hasPolylineStart) return false;
  if (opts.mapDrawTool === 'lasso' || opts.mapDrawTool === 'freehand' || opts.mapDrawTool === 'text') {
    return false;
  }
  return true;
}

/** Begin 2D right-drag tilt (globe + flat DEM preloaded; pan disabled). */
export function siMapBeginRightDragElevationTilt(
  map: MapboxMap,
  clientX: number,
  clientY: number,
): SiMapCameraOrbitDragSession {
  prepGlobeAndDem(map);
  configureSiMapGoogleEarthCameraControls(map);
  return siMapBeginCameraOrbitDrag(map, clientX, clientY);
}

/**
 * Interactive 2D → 3D tilt: pitch/bearing follow drag; terrain exaggeration ramps with pitch.
 * Center, zoom, and bearing at drag start are preserved (jumpTo only updates pitch/bearing/offset).
 */
export function siMapApplyRightDragElevationTilt(
  map: MapboxMap,
  session: SiMapCameraOrbitDragSession,
  clientX: number,
  clientY: number,
  terrain: SiMapTerrainSettings,
): { pitch: number; bearing: number; tiltT: number } {
  const dx = clientX - session.startX;
  const dy = clientY - session.startY;
  if (Math.abs(dx) + Math.abs(dy) > 2) session.moved = true;

  const targetPitch = clampElevationPitch(terrain.elevationPitch ?? SI_ELEVATION_VIEW_PITCH);
  const { pitch: rawPitch, bearing } = siMapCameraOrbitFromDrag(
    session.pitch0,
    session.bearing0,
    dx,
    dy,
  );
  const pitch = Math.min(targetPitch, rawPitch);
  const targetExag = clampExag(terrain.exaggeration);
  const tiltT = targetPitch > 0 ? Math.min(1, pitch / targetPitch) : 0;
  const exag = targetExag * tiltT;

  prepGlobeAndDem(map);

  try {
    const demSourceId = ensureSiTerrainRenderDemSource(
      map,
      normalizeSiTerrainElevationProvider(terrain.elevationProvider),
    );
    if (map.getSource(demSourceId)) {
      map.setTerrain({ source: demSourceId, exaggeration: exag });
    }
  } catch {
    /* style not ready */
  }

  try {
    map.jumpTo({
      pitch,
      bearing,
      offset: siElevationPitchScreenOffset(map, pitch),
      duration: 0,
    });
  } catch {
    /* ignore */
  }

  return { pitch, bearing, tiltT };
}

/** Reuse 3D right-drag apply when elevation view is already active. */
export function siMapApplyRightDragElevationTiltOr3d(
  map: MapboxMap,
  session: SiMapCameraOrbitDragSession,
  clientX: number,
  clientY: number,
  elevation3d: boolean,
  terrain: SiMapTerrainSettings,
): { pitch: number; bearing: number; tiltT: number } {
  if (!elevation3d) {
    return siMapApplyRightDragElevationTilt(map, session, clientX, clientY, terrain);
  }
  const { pitch, bearing } = siMapApplyCameraOrbitDrag(map, session, clientX, clientY);
  return { pitch, bearing, tiltT: 1 };
}
