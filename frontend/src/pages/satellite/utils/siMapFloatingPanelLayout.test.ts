import { describe, expect, it } from 'vitest';
import { siMapNorthPopoutFixedPosition, siMapRightPopoutFixedPosition } from './siMapFloatingPanelLayout';

describe('siMapNorthPopoutFixedPosition', () => {
  it('falls back near the north edge when map canvas is missing', () => {
    const pos = siMapNorthPopoutFixedPosition(248, 380, 'start');
    expect(pos.left).toBeGreaterThanOrEqual(16);
    expect(pos.top).toBeGreaterThanOrEqual(12);
  });
});

describe('siMapRightPopoutFixedPosition', () => {
  it('falls back to viewport trailing edge when map canvas is missing', () => {
    const pos = siMapRightPopoutFixedPosition(248, 380, 0.08);
    expect(pos.left).toBeGreaterThanOrEqual(24);
    expect(pos.top).toBeGreaterThanOrEqual(24);
    if (typeof window !== 'undefined') {
      expect(pos.left + 248).toBeLessThanOrEqual(window.innerWidth - 24);
    }
  });
});
