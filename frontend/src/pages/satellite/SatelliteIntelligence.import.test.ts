import { describe, expect, it } from 'vitest';

/** Regression: ESM init cycles on this chunk caused `Cannot access '…' before initialization` on GitHub Pages. */
describe('SatelliteIntelligence module init', () => {
  it('imports without temporal-dead-zone errors', { timeout: 120_000 }, async () => {
    const mod = await import('./SatelliteIntelligence');
    expect(mod.default).toBeTypeOf('function');
  });
});
