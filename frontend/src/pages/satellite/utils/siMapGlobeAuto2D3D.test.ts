import { describe, expect, it } from 'vitest';
import {
  loadStoredGlobeAuto2D3D,
  resolveSiGlobeAutoElevation3d,
  SI_GLOBE_AUTO_2D_ZOOM_EXIT,
  SI_GLOBE_AUTO_3D_ZOOM_ENTER,
  SI_MAP_GLOBE_AUTO_2D3D_LS,
  siGlobeAutoElevation3dForInitialZoom,
} from './siMapGlobeAuto2D3D';
describe('resolveSiGlobeAutoElevation3d', () => {
  it('enters 3D when zooming out below enter threshold', () => {
    expect(resolveSiGlobeAutoElevation3d(SI_GLOBE_AUTO_3D_ZOOM_ENTER, false)).toBe(true);
    expect(resolveSiGlobeAutoElevation3d(1.5, false)).toBe(true);
  });

  it('exits to 2D when zooming in above exit threshold', () => {
    expect(resolveSiGlobeAutoElevation3d(SI_GLOBE_AUTO_2D_ZOOM_EXIT, true)).toBe(false);
    expect(resolveSiGlobeAutoElevation3d(12, true)).toBe(false);
  });

  it('keeps hysteresis band stable', () => {
    const mid = (SI_GLOBE_AUTO_3D_ZOOM_ENTER + SI_GLOBE_AUTO_2D_ZOOM_EXIT) / 2;
    expect(resolveSiGlobeAutoElevation3d(mid, true)).toBe(true);
    expect(resolveSiGlobeAutoElevation3d(mid, false)).toBe(false);
  });
});

describe('siGlobeAutoElevation3dForInitialZoom', () => {
  it('starts 3D at globe home zoom', () => {
    expect(siGlobeAutoElevation3dForInitialZoom(1.52)).toBe(true);
  });
});

describe('loadStoredGlobeAuto2D3D', () => {
  it('defaults to manual mode (dock label “2D” in 3D) unless user opted in', () => {
    expect(loadStoredGlobeAuto2D3D()).toBe(false);
    window.localStorage.setItem(SI_MAP_GLOBE_AUTO_2D3D_LS, '1');
    expect(loadStoredGlobeAuto2D3D()).toBe(true);
    window.localStorage.removeItem(SI_MAP_GLOBE_AUTO_2D3D_LS);
  });
});