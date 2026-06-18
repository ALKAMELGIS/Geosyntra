import { describe, expect, it } from 'vitest';
import {
  SI_MAP_RIGHT_DRAG_ELEVATION_COMMIT_PITCH,
  siMapShouldStartRightDragElevationTilt,
} from './siMapRightDragElevation';

describe('siMapRightDragElevation', () => {
  it('starts on right button in 2D only', () => {
    expect(
      siMapShouldStartRightDragElevationTilt({
        button: 2,
        elevation3d: false,
        mapDrawTool: 'select',
        polygonRingLength: 0,
        hasPolylineStart: false,
        hasCircleRefineDraft: false,
        hasRectCirclePreview: false,
      }),
    ).toBe(true);
    expect(
      siMapShouldStartRightDragElevationTilt({
        button: 2,
        elevation3d: true,
        mapDrawTool: 'select',
        polygonRingLength: 0,
        hasPolylineStart: false,
        hasCircleRefineDraft: false,
        hasRectCirclePreview: false,
      }),
    ).toBe(false);
    expect(
      siMapShouldStartRightDragElevationTilt({
        button: 0,
        elevation3d: false,
        mapDrawTool: 'select',
        polygonRingLength: 0,
        hasPolylineStart: false,
        hasCircleRefineDraft: false,
        hasRectCirclePreview: false,
      }),
    ).toBe(false);
  });

  it('uses a moderate commit pitch threshold', () => {
    expect(SI_MAP_RIGHT_DRAG_ELEVATION_COMMIT_PITCH).toBeGreaterThanOrEqual(12);
    expect(SI_MAP_RIGHT_DRAG_ELEVATION_COMMIT_PITCH).toBeLessThanOrEqual(30);
  });
});
