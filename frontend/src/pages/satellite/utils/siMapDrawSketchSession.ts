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
  opts?: { elevation3d?: boolean },
): void {
  if (!map) return;
  try {
    if (locked) {
      map.dragPan?.disable?.();
      map.dragRotate?.disable?.();
    } else {
      configureSiMapCameraControlsForView(map, opts?.elevation3d ?? false);
    }
  } catch {
    /* ignore */
  }
}

export function siMapDrawAssistHintForShape(
  shape: 'rectangle' | 'polygon' | 'circle' | 'freehand',
  opts?: { elevation3d?: boolean },
): string {
  const rotateHint = opts?.elevation3d
    ? 'Left-drag pan · right-drag rotate.'
    : 'Left-drag pan · Ctrl+left-drag tilt toward the horizon.';
  switch (shape) {
    case 'rectangle':
      return `Draw: drag for a box. ${rotateHint} Esc cancels.`;
    case 'circle':
      return `Draw: drag for radius. ${rotateHint} Esc cancels.`;
    case 'freehand':
      return 'Draw: click vertices; right-click or Enter to close. Esc cancels.';
    case 'polygon':
    default:
      return `Draw: click to add vertices; right-click to finish. ${rotateHint} Esc cancels.`;
  }
}
