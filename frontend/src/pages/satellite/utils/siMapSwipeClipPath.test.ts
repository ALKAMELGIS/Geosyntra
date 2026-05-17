import { describe, expect, it } from 'vitest';
import { buildSiMapSwipeClipPath } from './siMapSwipeClipPath';

describe('buildSiMapSwipeClipPath', () => {
  it('builds vertical inset from the left', () => {
    expect(buildSiMapSwipeClipPath('vertical', 0.25, 0.5)).toBe('inset(0 0 0 25.0000%)');
  });

  it('builds horizontal inset from the top', () => {
    expect(buildSiMapSwipeClipPath('horizontal', 0.5, 0.4)).toBe('inset(40.0000% 0 0 0)');
  });

  it('builds spyglass circle', () => {
    expect(buildSiMapSwipeClipPath('spyglass', 0.5, 0.5, { spyglassRadiusPx: 80 })).toBe(
      'circle(80px at 50.0000% 50.0000%)',
    );
  });
});
