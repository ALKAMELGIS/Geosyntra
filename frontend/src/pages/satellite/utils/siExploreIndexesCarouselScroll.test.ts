import { describe, expect, it } from 'vitest';
import {
  findFocusedCardIndex,
  resolveAdjacentCardIndex,
} from './siExploreIndexesCarouselScroll';

function mockRect(left: number, width = 108) {
  return {
    left,
    right: left + width,
    top: 0,
    bottom: 108,
    width,
    height: 108,
    x: left,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

describe('siExploreIndexesCarouselScroll', () => {
  it('finds focused card from anchor in LTR', () => {
    const scrollEl = {
      getBoundingClientRect: () => mockRect(0, 400),
    } as HTMLElement;
    const cards = [
      { getBoundingClientRect: () => mockRect(10) },
      { getBoundingClientRect: () => mockRect(128) },
      { getBoundingClientRect: () => mockRect(246) },
    ] as HTMLElement[];

    expect(findFocusedCardIndex(cards, scrollEl, false)).toBe(0);
  });

  it('resolves next/prev indices in LTR', () => {
    const scrollEl = {
      getBoundingClientRect: () => mockRect(0, 400),
    } as HTMLElement;
    const cards = [
      { getBoundingClientRect: () => mockRect(10) },
      { getBoundingClientRect: () => mockRect(128) },
    ] as HTMLElement[];

    expect(resolveAdjacentCardIndex(cards, scrollEl, 'next', false)).toBe(1);
    expect(resolveAdjacentCardIndex(cards, scrollEl, 'prev', false)).toBe(null);
  });

  it('keeps reading-order next/prev indices in RTL', () => {
    const scrollEl = {
      getBoundingClientRect: () => mockRect(0, 400),
    } as HTMLElement;
    const cards = [
      { getBoundingClientRect: () => mockRect(282) },
      { getBoundingClientRect: () => mockRect(164) },
      { getBoundingClientRect: () => mockRect(46) },
    ] as HTMLElement[];

    expect(findFocusedCardIndex(cards, scrollEl, true)).toBe(0);
    expect(resolveAdjacentCardIndex(cards, scrollEl, 'next', true)).toBe(1);
    expect(resolveAdjacentCardIndex(cards, scrollEl, 'prev', true)).toBe(null);
  });
});
