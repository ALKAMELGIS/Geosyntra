import { describe, expect, it } from 'vitest';

/** Regression: vendor manualChunks + cross-chunk preload caused TDZ on GitHub Pages. */
describe('SatelliteIntelligence module init', () => {
  it('imports without temporal-dead-zone errors', { timeout: 120_000 }, async () => {
    const mod = await import('./SatelliteIntelligenceMain');
    expect(mod.default).toBeTypeOf('function');
  });
});
