export type SiExploreCarouselNav = 'prev' | 'next';

export function readNormalizedScrollLeft(el: HTMLElement): number {
  const isRtl = getComputedStyle(el).direction === 'rtl';
  if (!isRtl) return el.scrollLeft;
  const max = Math.max(0, el.scrollWidth - el.clientWidth);
  if (el.scrollLeft < 0) return -el.scrollLeft;
  return max - el.scrollLeft;
}

export const SI_EXPLORE_CAROUSEL_ARROW_INSET = 26;

export function readCarouselNavState(el: HTMLElement) {
  const max = Math.max(0, el.scrollWidth - el.clientWidth);
  const pos = readNormalizedScrollLeft(el);
  const overflow = max > 2;
  return {
    overflow,
    canPrevious: overflow && pos > 2,
    canNext: overflow && pos < max - 2,
  };
}

export function findFocusedCardIndex(
  cards: readonly HTMLElement[],
  scrollEl: HTMLElement,
  isRtl: boolean,
): number {
  if (!cards.length) return 0;

  const scrollRect = scrollEl.getBoundingClientRect();
  const anchorX = isRtl
    ? scrollRect.right - SI_EXPLORE_CAROUSEL_ARROW_INSET
    : scrollRect.left + SI_EXPLORE_CAROUSEL_ARROW_INSET;

  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < cards.length; i++) {
    const rect = cards[i].getBoundingClientRect();
    if (rect.right < scrollRect.left - 2 || rect.left > scrollRect.right + 2) continue;
    const dist = Math.abs(rect.left - anchorX);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }

  if (bestIdx >= 0) return bestIdx;

  const pos = readNormalizedScrollLeft(scrollEl);
  let nearest = 0;
  let nearestDist = Infinity;
  for (let i = 0; i < cards.length; i++) {
    const dist = Math.abs(cards[i].offsetLeft - pos);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = i;
    }
  }
  return nearest;
}

export function resolveAdjacentCardIndex(
  cards: readonly HTMLElement[],
  scrollEl: HTMLElement,
  direction: SiExploreCarouselNav,
  isRtl: boolean,
): number | null {
  if (!cards.length) return null;
  const current = findFocusedCardIndex(cards, scrollEl, isRtl);
  const delta = direction === 'next' ? 1 : -1;
  const target = current + delta;
  if (target < 0 || target >= cards.length) return null;
  return target;
}

export function measureCarouselCardStep(cards: readonly HTMLElement[], gap = 10): number {
  const first = cards[0];
  if (!first) return 118;
  return first.offsetWidth + gap;
}

export function scrollToCarouselCard(
  cards: readonly HTMLElement[],
  scrollEl: HTMLElement,
  direction: SiExploreCarouselNav,
  isRtl: boolean,
): boolean {
  const step = measureCarouselCardStep(cards);
  const targetIdx = resolveAdjacentCardIndex(cards, scrollEl, direction, isRtl);

  if (targetIdx == null) {
    scrollCarouselByStep(scrollEl, direction, step, isRtl);
    return false;
  }

  const card = cards[targetIdx];
  const scrollRect = scrollEl.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const anchorX = isRtl
    ? scrollRect.right - SI_EXPLORE_CAROUSEL_ARROW_INSET
    : scrollRect.left + SI_EXPLORE_CAROUSEL_ARROW_INSET;
  const delta = isRtl ? cardRect.right - anchorX : cardRect.left - anchorX;

  if (Math.abs(delta) < 1) {
    scrollCarouselByStep(scrollEl, direction, step, isRtl);
    return true;
  }

  scrollEl.scrollBy({ left: delta, behavior: 'smooth' });
  return true;
}

export function scrollCarouselByStep(
  scrollEl: HTMLElement,
  direction: SiExploreCarouselNav,
  step: number,
  isRtl: boolean,
): void {
  const delta = direction === 'next' ? step : -step;
  scrollEl.scrollBy({ left: isRtl ? -delta : delta, behavior: 'smooth' });
}
