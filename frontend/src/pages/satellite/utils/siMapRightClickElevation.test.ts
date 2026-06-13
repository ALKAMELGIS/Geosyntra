import { describe, expect, it } from 'vitest';
import {
  SI_MAP_RIGHT_CLICK_3D_ORBIT_DRAG_THRESHOLD_PX,
  SI_MAP_RIGHT_CLICK_DRAG_THRESHOLD_PX,
  siMapIsRightPointerRelease,
  siMapRightClickExceededDragThreshold,
  siMapShouldStartElevationRightClickToggle,
} from './siMapRightClickElevation';

describe('siMapRightClickElevation', () => {
  const base = {
    mapDrawTool: 'select',
    polygonRingLength: 0,
    hasPolylineStart: false,
    hasCircleRefineDraft: false,
    hasRectCirclePreview: false,
  };

  it('allows right-click toggle in 2D and 3D', () => {
    expect(
      siMapShouldStartElevationRightClickToggle({ ...base, button: 2, shiftKey: false }),
    ).toBe(true);
    expect(
      siMapShouldStartElevationRightClickToggle({ ...base, button: 2, shiftKey: true }),
    ).toBe(false);
    expect(
      siMapShouldStartElevationRightClickToggle({ ...base, button: 0 }),
    ).toBe(false);
  });

  it('blocks toggle while sketching', () => {
    expect(
      siMapShouldStartElevationRightClickToggle({
        ...base,
        button: 2,
        mapDrawTool: 'polygon',
        polygonRingLength: 2,
      }),
    ).toBe(false);
  });

  it('detects drag vs click', () => {
    expect(siMapRightClickExceededDragThreshold(0, 0)).toBe(false);
    expect(
      siMapRightClickExceededDragThreshold(
        SI_MAP_RIGHT_CLICK_DRAG_THRESHOLD_PX,
        0,
      ),
    ).toBe(false);
    expect(
      siMapRightClickExceededDragThreshold(
        SI_MAP_RIGHT_CLICK_DRAG_THRESHOLD_PX + 1,
        0,
      ),
    ).toBe(true);
  });

  it('uses a higher orbit threshold in 3D', () => {
    expect(SI_MAP_RIGHT_CLICK_3D_ORBIT_DRAG_THRESHOLD_PX).toBeGreaterThan(
      SI_MAP_RIGHT_CLICK_DRAG_THRESHOLD_PX,
    );
    expect(
      siMapRightClickExceededDragThreshold(
        SI_MAP_RIGHT_CLICK_DRAG_THRESHOLD_PX + 2,
        0,
        SI_MAP_RIGHT_CLICK_3D_ORBIT_DRAG_THRESHOLD_PX,
      ),
    ).toBe(false);
  });

  it('detects right-button release across browsers', () => {
    expect(siMapIsRightPointerRelease({ button: 2 })).toBe(true);
    expect(siMapIsRightPointerRelease({ which: 3 })).toBe(true);
    expect(siMapIsRightPointerRelease({ button: 0 })).toBe(false);
  });
});
