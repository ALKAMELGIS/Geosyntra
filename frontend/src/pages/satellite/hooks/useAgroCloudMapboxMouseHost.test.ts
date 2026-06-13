import { describe, expect, it } from 'vitest';
import { MAPBOX_NAVIGATION_PROPS } from '../utils/MapMouseBehavior';

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
