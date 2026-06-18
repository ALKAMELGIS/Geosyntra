import { describe, expect, it, vi } from 'vitest';
import { ensureSiMapTerrainDemSource } from './siMapTerrainDemRuntime';
import { isMapboxStyleReady, siMapboxSourcesAccessible, whenMapboxStyleReady } from './mapboxStyleReady';

describe('mapboxStyleReady', () => {
  it('isMapboxStyleReady reflects map.isStyleLoaded()', () => {
    expect(isMapboxStyleReady(null)).toBe(false);
    expect(isMapboxStyleReady({ isStyleLoaded: () => false } as any)).toBe(false);
    expect(isMapboxStyleReady({ isStyleLoaded: () => true } as any)).toBe(true);
  });

  it('siMapboxSourcesAccessible requires style loaded and getStyle()', () => {
    expect(siMapboxSourcesAccessible(null)).toBe(false);
    expect(
      siMapboxSourcesAccessible({ isStyleLoaded: () => false, getStyle: () => ({}) } as any),
    ).toBe(false);
    expect(
      siMapboxSourcesAccessible({
        isStyleLoaded: () => true,
        getStyle: () => {
          throw new Error('style reload');
        },
      } as any),
    ).toBe(false);
    expect(
      siMapboxSourcesAccessible({ isStyleLoaded: () => true, getStyle: () => ({}) } as any),
    ).toBe(true);
  });

  it('ensureSiMapTerrainDemSource no-ops when style is not accessible', () => {
    const map = {
      isStyleLoaded: () => false,
      getSource: vi.fn(),
      addSource: vi.fn(),
    } as any;
    expect(ensureSiMapTerrainDemSource(map)).toBe(false);
    expect(map.getSource).not.toHaveBeenCalled();
  });

  it('whenMapboxStyleReady calls onReady when already loaded', async () => {
    const onReady = vi.fn();
    const map = { isStyleLoaded: () => true, once: vi.fn(), off: vi.fn() } as any;
    whenMapboxStyleReady(map, onReady);
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    expect(onReady).toHaveBeenCalled();
  });

  it('whenMapboxStyleReady waits for style.load', async () => {
    const handlers: Record<string, () => void> = {};
    let loaded = false;
    const map = {
      isStyleLoaded: () => loaded,
      once: (ev: string, fn: () => void) => {
        handlers[ev] = fn;
      },
      off: vi.fn(),
    } as any;
    const onReady = vi.fn();
    whenMapboxStyleReady(map, onReady);
    expect(onReady).not.toHaveBeenCalled();
    loaded = true;
    handlers['style.load']?.();
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    expect(onReady).toHaveBeenCalled();
  });
});
