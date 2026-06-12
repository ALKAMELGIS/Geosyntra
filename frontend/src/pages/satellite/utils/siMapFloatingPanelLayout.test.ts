import { describe, expect, it } from 'vitest';
import {
  siMapNorthPopoutFixedPosition,
  siMapRightPopoutFixedPosition,
  siMapTerrainDockPopoutFixedPosition,
} from './siMapFloatingPanelLayout';

describe('siMapNorthPopoutFixedPosition', () => {
  it('falls back near the north edge when map canvas is missing', () => {
    const pos = siMapNorthPopoutFixedPosition(248, 380, 'start');
    expect(pos.left).toBeGreaterThanOrEqual(16);
    expect(pos.top).toBeGreaterThanOrEqual(12);
  });
});

describe('siMapTerrainDockPopoutFixedPosition', () => {
  it('falls back above bottom-left dock stack when map canvas is missing', () => {
    const north = siMapNorthPopoutFixedPosition(248, 400, 'start');
    const dock = siMapTerrainDockPopoutFixedPosition(248, 400);
    expect(dock.left).toBeGreaterThanOrEqual(24);
    expect(dock.top).toBeGreaterThan(north.top);
    if (typeof window !== 'undefined') {
      expect(dock.top + 400).toBeLessThanOrEqual(window.innerHeight - 80);
    }
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
