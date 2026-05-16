import { describe, expect, it } from 'vitest';
import { buildWeeklyTimelineIndex } from './siTimelineWeekIndex';

describe('buildWeeklyTimelineIndex', () => {
  const weeks = [
    { weekIndex: 1, startDate: '2024-02-10', endDate: '2024-02-16', mean: 0.5 },
    { weekIndex: 2, startDate: '2024-02-17', endDate: '2024-02-23', mean: 0.6 },
  ];

  it('maps the last week start date to the last index', () => {
    const idx = buildWeeklyTimelineIndex(weeks)!;
    expect(idx.pickWeekIdx('2024-02-17')).toBe(1);
    expect(idx.pickWeek('2024-02-17').startDate).toBe('2024-02-17');
  });

  it('maps dates after the series end to the last week', () => {
    const idx = buildWeeklyTimelineIndex(weeks)!;
    expect(idx.pickWeekIdx('2024-03-01')).toBe(1);
  });

  it('advances without skipping the final index before wrap', () => {
    const idx = buildWeeklyTimelineIndex(weeks)!;
    expect(idx.nextWeekIdx(0)).toBe(1);
    expect(idx.nextWeekIdx(1)).toBe(0);
  });
});
