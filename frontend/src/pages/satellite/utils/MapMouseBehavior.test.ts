import { describe, expect, it } from 'vitest';
import {
  MAPBOX_NAVIGATION_PROPS,
  MAP_MOUSE_BEHAVIOR_SPEC,
  SI_MAP_CAMERA_ORBIT_BEARING_SENS,
  SI_MAP_CAMERA_ORBIT_PITCH_SENS,
  SI_MAP_FREE_CAMERA_PITCH_MAX,
  SI_MAP_MOUSE_CONTROL_ROWS,
} from './MapMouseBehavior';

describe('MapMouseBehavior', () => {
  it('exports 3D orbit sensitivities from the behavior spec', () => {
    expect(SI_MAP_CAMERA_ORBIT_BEARING_SENS).toBe(0.42);
    expect(SI_MAP_CAMERA_ORBIT_PITCH_SENS).toBe(0.38);
    expect(SI_MAP_FREE_CAMERA_PITCH_MAX).toBe(MAP_MOUSE_BEHAVIOR_SPEC.orbit3d.pitchClamp.max);
  });

  it('keeps LMB pan and wheel zoom; 2D RMB bearing-only via Mapbox', () => {
    expect(MAPBOX_NAVIGATION_PROPS.dragRotate).toBe(true);
    expect(MAPBOX_NAVIGATION_PROPS.pitchWithRotate).toBe(false);
    expect(MAPBOX_NAVIGATION_PROPS.scrollZoom).toBe(true);
    expect(MAPBOX_NAVIGATION_PROPS.doubleClickZoom).toBe(MAP_MOUSE_BEHAVIOR_SPEC.zoom.doubleClick);
  });

  it('documents GIS mouse rows for 2D and 3D help panel', () => {
    expect(SI_MAP_MOUSE_CONTROL_ROWS.filter(r => r.section === 'general').length).toBe(7);
    expect(SI_MAP_MOUSE_CONTROL_ROWS.filter(r => r.section === 'mode3d').length).toBe(2);
    const pan = SI_MAP_MOUSE_CONTROL_ROWS.find(r => r.id === 'pan');
    const orbit3d = SI_MAP_MOUSE_CONTROL_ROWS.find(r => r.id === 'orbit-3d');
    expect(pan?.gestureEn).toContain('Left mouse');
    expect(orbit3d?.gestureEn).toContain('Right mouse');
  });
});
