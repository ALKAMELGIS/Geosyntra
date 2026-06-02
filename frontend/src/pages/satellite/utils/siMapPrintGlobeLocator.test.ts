import { describe, expect, it } from 'vitest';
import { siMapPrintOrthoProject } from './siMapPrintGlobeLocator';

describe('siMapPrintGlobeLocator', () => {
  it('projects the center of the view to the globe center', () => {
    const p = siMapPrintOrthoProject(10, 20, 10, 20, 50, 50, 30);
    expect(p).not.toBeNull();
    expect(p!.x).toBeCloseTo(50, 0);
    expect(p!.y).toBeCloseTo(50, 0);
  });

  it('hides points on the far hemisphere', () => {
    const p = siMapPrintOrthoProject(-170, -60, 10, 20, 50, 50, 30);
    expect(p).toBeNull();
  });
});
