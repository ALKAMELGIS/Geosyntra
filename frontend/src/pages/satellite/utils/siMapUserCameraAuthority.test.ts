import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearSiMapUserCameraAuthority,
  commitSiMapUserCamera,
  hasSiMapUserCameraAuthority,
  isSiMapManualOrbitCooldownActive,
  markSiMapManualOrbitCooldown,
  readSiMapUserCamera,
  resetSiMapUserCameraAuthorityForTests,
  shouldBlockProgrammaticCameraMove,
} from './siMapUserCameraAuthority';

describe('siMapUserCameraAuthority', () => {
  beforeEach(() => {
    resetSiMapUserCameraAuthorityForTests();
  });

  it('commits and reads user camera snapshot', () => {
    commitSiMapUserCamera(
      { longitude: 10, latitude: 20, zoom: 5, bearing: 33, pitch: 44 },
      'orbit-drag',
    );
    expect(hasSiMapUserCameraAuthority()).toBe(true);
    expect(readSiMapUserCamera()).toEqual({
      longitude: 10,
      latitude: 20,
      zoom: 5,
      bearing: 33,
      pitch: 44,
    });
  });

  it('blocks programmatic moves while authority is active', () => {
    commitSiMapUserCamera(
      { longitude: 0, latitude: 0, zoom: 2, bearing: 15, pitch: 30 },
      'orbit-drag',
    );
    expect(shouldBlockProgrammaticCameraMove()).toBe(true);
    expect(shouldBlockProgrammaticCameraMove({ explicit: true })).toBe(false);
  });

  it('manual orbit cooldown blocks briefly then clears', () => {
    markSiMapManualOrbitCooldown(50);
    expect(isSiMapManualOrbitCooldownActive()).toBe(true);
    expect(shouldBlockProgrammaticCameraMove()).toBe(true);
    clearSiMapUserCameraAuthority();
    expect(hasSiMapUserCameraAuthority()).toBe(false);
  });
});
