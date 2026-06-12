import { describe, expect, it } from 'vitest';
import { MAPBOX_NAVIGATION_PROPS } from '../utils/MapMouseBehavior';

describe('useAgroCloudMapboxMouseHost mapProps contract', () => {
  it('enables Mapbox dragRotate for right-button rotate per MAPBOX_NAVIGATION_PROPS', () => {
    expect(MAPBOX_NAVIGATION_PROPS.dragRotate).toBe(true);
    expect(MAPBOX_NAVIGATION_PROPS.pitchWithRotate).toBe(false);
    expect(MAPBOX_NAVIGATION_PROPS.maxPitch).toBe(78);
    expect(MAPBOX_NAVIGATION_PROPS.cooperativeGestures).toBe(false);
    expect(MAPBOX_NAVIGATION_PROPS.renderWorldCopies).toBe(false);
  });
});
