import { describe, expect, it } from 'vitest';
import { formatTimelineSeriesLine, resolveTimelineSeriesRange } from './siTimelineDateRange';

describe('siTimelineDateRange', () => {
  it('prefers explicit series start/end over chip dates', () => {
    const r = resolveTimelineSeriesRange({
      seriesStartIso: '2023-11-18',
      seriesEndIso: '2024-02-18',
      weeklyChipDates: ['2024-01-01'],
    });
    expect(r.start).toBe('2023-11-18');
    expect(r.end).toBe('2024-02-18');
  });

  it('falls back to chip extents when series end is missing', () => {
    const r = resolveTimelineSeriesRange({
      seriesStartIso: '',
      seriesEndIso: '',
      weeklyChipDates: ['2023-12-01', '2024-02-18'],
    });
    expect(r.start).toBe('2023-12-01');
    expect(r.end).toBe('2024-02-18');
  });

  it('formats series line', () => {
    expect(formatTimelineSeriesLine({ start: '2023-11-18', end: '2024-02-18' })).toBe(
      '2023-11-18 → 2024-02-18',
    );
    expect(formatTimelineSeriesLine({ start: '', end: '2024-02-18' })).toBe('2024-02-18');
  });
});
