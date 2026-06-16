import { describe, expect, it } from 'vitest';
import {
  computeSiMapFullCompareClipLayout,
  computeSiMapSpyglassClipLayout,
  computeSiMapSwipeClipLayout,
} from './siMapSwipeClipLayout';
import { resolveSiMapSwipeClipRect } from './siMapLayerSwipeCatalog';

describe('siMapSwipeClipLayout', () => {
  const bounds = { width: 800, height: 600 };

  it('vertical clip exposes trailing on the right', () => {
    const layout = computeSiMapSwipeClipLayout(bounds, 40, 'vertical');
    expect(layout.clipLeft).toBe(320);
    expect(layout.clipWidth).toBe(480);
    expect(layout.innerLeft).toBe(-320);
  });

  it('horizontal clip exposes trailing below divider', () => {
    const layout = computeSiMapSwipeClipLayout(bounds, 25, 'horizontal');
    expect(layout.clipTop).toBe(150);
    expect(layout.clipHeight).toBe(450);
  });

  it('spyglass uses circular clip path', () => {
    const layout = computeSiMapSpyglassClipLayout(bounds, { x: 50, y: 50 }, 18);
    expect(layout.clipPath).toMatch(/^circle\(/);
  });

  it('full compare side b covers entire canvas', () => {
    const layout = computeSiMapFullCompareClipLayout(bounds, 'b');
    expect(layout.clipWidth).toBe(800);
    expect(layout.clipHeight).toBe(600);
  });

  it('resolveSiMapSwipeClipRect delegates by mode', () => {
    const spy = resolveSiMapSwipeClipRect(bounds, 'spyglass', 50, { x: 40, y: 60 }, 20, 'b');
    expect(spy.clipPath).toContain('circle');
    const full = resolveSiMapSwipeClipRect(bounds, 'full', 50, { x: 50, y: 50 }, 18, 'a');
    expect(full.clipWidth).toBe(0);
  });
});
