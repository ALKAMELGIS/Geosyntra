import { describe, expect, it } from 'vitest';
import { siMapSwipeClipRectToGpuScissor } from './siMapSwipeGpuScissor';

describe('siMapSwipeClipRectToGpuScissor', () => {
  it('maps vertical trailing region to bottom-left WebGL scissor', () => {
    const layout = {
      clipLeft: 400,
      clipTop: 0,
      clipWidth: 400,
      clipHeight: 300,
      innerLeft: -400,
      innerTop: 0,
      innerWidth: 800,
      innerHeight: 300,
      clipPath: '',
    };
    const scissor = siMapSwipeClipRectToGpuScissor(layout, 800, 300, 2);
    expect(scissor.enabled).toBe(true);
    expect(scissor.x).toBe(800);
    expect(scissor.y).toBe(0);
    expect(scissor.width).toBe(800);
    expect(scissor.height).toBe(600);
  });

  it('returns disabled when clip has zero area', () => {
    const scissor = siMapSwipeClipRectToGpuScissor(
      {
        clipLeft: 0,
        clipTop: 0,
        clipWidth: 0,
        clipHeight: 0,
        innerLeft: 0,
        innerTop: 0,
        innerWidth: 100,
        innerHeight: 100,
        clipPath: '',
      },
      100,
      100,
      1,
    );
    expect(scissor.enabled).toBe(false);
  });
});
