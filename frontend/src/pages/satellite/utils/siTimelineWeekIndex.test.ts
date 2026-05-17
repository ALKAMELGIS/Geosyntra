import { describe, expect, it } from 'vitest';
import { buildWeeklyTimelineIndex, wmsTimeExtentForWeek } from './siTimelineWeekIndex';

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

describe('wmsTimeExtentForWeek', () => {
  it('keeps the full week when focus is inside the window', () => {
    const ext = wmsTimeExtentForWeek(
      { startDate: '2024-02-17', endDate: '2024-02-23' },
      '2024-02-20',
    );
    expect(ext.start).toBe('2024-02-17');
    expect(ext.end).toBe('2024-02-23');
  });

  it('clamps week end to series end when imagery stops mid-week', () => {
    const ext = wmsTimeExtentForWeek(
      { startDate: '2024-02-17', endDate: '2024-02-23' },
      '2024-02-17',
      { seriesEndIso: '2024-02-17' },
    );
    expect(ext.start).toBe('2024-02-17');
    expect(ext.end).toBe('2024-02-17');
  });

  it('clamps future week end to today', () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 2);
    const tIso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    const ext = wmsTimeExtentForWeek({ startDate: tIso, endDate: tIso }, tIso);
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    expect(ext.end).toBe(todayIso);
  });
});
