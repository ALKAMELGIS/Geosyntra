import { describe, expect, it } from 'vitest';
import { MAPBOX_NAVIGATION_PROPS } from '../utils/MapMouseBehavior';
import { SI_MAP_RIGHT_DRAG_ELEVATION_COMMIT_PITCH } from '../utils/siMapRightDragElevation';
import { resolveSiRightDragElevationReleaseAction } from './useAgroCloudMapboxMouseHost';

describe('useAgroCloudMapboxMouseHost mapProps contract', () => {
  it('disables native dragRotate and dblclick zoom — GIS controller owns fly-to + 3D RMB orbit', () => {
    expect(MAPBOX_NAVIGATION_PROPS.dragRotate).toBe(false);
    expect(MAPBOX_NAVIGATION_PROPS.doubleClickZoom).toBe(false);
    expect(MAPBOX_NAVIGATION_PROPS.pitchWithRotate).toBe(false);
    expect(MAPBOX_NAVIGATION_PROPS.maxPitch).toBe(78);
    expect(MAPBOX_NAVIGATION_PROPS.cooperativeGestures).toBe(false);
    expect(MAPBOX_NAVIGATION_PROPS.renderWorldCopies).toBe(false);
  });
});

describe('resolveSiRightDragElevationReleaseAction', () => {
  it('commits 3D when 2D drag ends with enough pitch and dock still off', () => {
    expect(
      resolveSiRightDragElevationReleaseAction({
        startedFrom2dDock: true,
        elevation3dActive: false,
        moved: true,
        pitchNow: SI_MAP_RIGHT_DRAG_ELEVATION_COMMIT_PITCH,
      }).type,
    ).toBe('commit3d-interactive');
  });

  it('finalizes 3D orbit when dock was auto-enabled during drag', () => {
    expect(
      resolveSiRightDragElevationReleaseAction({
        startedFrom2dDock: true,
        elevation3dActive: true,
        moved: true,
        pitchNow: 24,
      }).type,
    ).toBe('finalize3d-orbit');
  });

  it('snaps flat when 2D drag pitch stays below commit threshold', () => {
    expect(
      resolveSiRightDragElevationReleaseAction({
        startedFrom2dDock: true,
        elevation3dActive: false,
        moved: true,
        pitchNow: 4,
      }).type,
    ).toBe('snap2d-flat');
  });
});
