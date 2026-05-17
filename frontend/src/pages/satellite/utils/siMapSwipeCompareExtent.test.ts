import { describe, expect, it } from 'vitest';
import { buildWeeklyTimelineIndex } from './siTimelineWeekIndex';
import { resolveSiMapSwipeCompareTimeExtent } from './siMapSwipeCompareExtent';

describe('resolveSiMapSwipeCompareTimeExtent', () => {
  it('uses an earlier week when timeline index exists', () => {
    const index = buildWeeklyTimelineIndex([
      { weekIndex: 0, startDate: '2024-01-01', endDate: '2024-01-07', mean: 0.2 },
      { weekIndex: 1, startDate: '2024-01-08', endDate: '2024-01-14', mean: 0.3 },
    ]);
    const extent = resolveSiMapSwipeCompareTimeExtent('2024-01-10', index, -1);
    expect(extent.start).toBe('2024-01-01');
    expect(extent.end).toBe('2024-01-07');
  });
});
