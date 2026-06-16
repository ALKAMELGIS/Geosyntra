import type { Map as MapboxMap } from 'mapbox-gl';

export type SiDrawSketchTool =
  | 'select'
  | 'move'
  | 'rectangle'
  | 'polygon'
  | 'circle'
  | 'polyline'
  | 'point'
  | 'freehand'
  | 'lasso'
  | 'text'
  | string;

export type SiActiveDrawSketchInput = {
  mapDrawTool: SiDrawSketchTool;
  polygonRingLength: number;
  hasPolylineStart: boolean;
  hasRectCirclePreview: boolean;
  hasCircleRefineDraft: boolean;
  dragRectCircleActive?: boolean;
  polygonVertexSketchDrag?: boolean;
};

/** True while the user is mid-sketch (vertices placed, box/circle drag, refine handles, etc.). */
export function isSiActiveDrawSketchSession(input: SiActiveDrawSketchInput): boolean {
  if (input.dragRectCircleActive || input.polygonVertexSketchDrag) return true;
  if (input.mapDrawTool === 'polygon' && input.polygonRingLength > 0) return true;
  if (input.mapDrawTool === 'polyline' && input.hasPolylineStart) return true;
  if (input.mapDrawTool === 'freehand' || input.mapDrawTool === 'lasso') return true;
  if (input.hasRectCirclePreview || input.hasCircleRefineDraft) return true;
  return false;
}

import { configureSiMapCameraControlsForView } from './siMapProjectionTerrain';

/** Lock/unlock Mapbox pan + rotate while sketching; restore Scene View or 2D controls when idle. */
export function syncSiMapSketchNavigationLock(
  map: MapboxMap | null | undefined,
  locked: boolean,
  opts?: { view3dOrbit?: boolean; elevation3d?: boolean },
): void {
  if (!map) return;
  try {
    if (locked) {
      map.dragPan?.disable?.();
      map.dragRotate?.disable?.();
    } else {
      configureSiMapCameraControlsForView(
        map,
        opts?.view3dOrbit ?? opts?.elevation3d ?? false,
      );
    }
  } catch {
    /* ignore */
  }
}

export function siMapDrawAssistHintForShape(
  shape: 'rectangle' | 'polygon' | 'circle' | 'freehand',
  opts?: { view3dOrbit?: boolean; elevation3d?: boolean },
): string {
  const view3d = opts?.view3dOrbit ?? opts?.elevation3d ?? false;
  const rotateHint = view3d
    ? 'LMB pan/select · RMB orbit/tilt · wheel zoom.'
    : 'LMB pan/select · RMB rotate · wheel zoom.';
  switch (shape) {
    case 'rectangle':
      return `Draw: drag for a box. ${rotateHint} Esc cancels.`;
    case 'circle':
      return `Touch: long-press for center, drag radius, release to save. Mouse: drag then Enter to apply. ${rotateHint} Esc cancels.`;
    case 'freehand':
      return 'Draw: click vertices; right-click or Enter to close. Esc cancels.';
    case 'polygon':
    default:
      return `Draw: click to add vertices; right-click to finish. ${rotateHint} Esc cancels.`;
  }
}
