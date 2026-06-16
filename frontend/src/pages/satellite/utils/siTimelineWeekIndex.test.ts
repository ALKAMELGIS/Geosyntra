import { describe, expect, it } from 'vitest';
import {
  buildTimelineStops,
  buildWeeklyTimelineIndex,
  pickTimelineStopIdx,
  pickTimelineStopIsoForRailRatio,
  resolveTimelineSeriesExtents,
  siTimelineEndFocusIso,
  wmsTimeExtentForMode,
  wmsTimeExtentForAgroDeltaLayer,
  wmsTimeExtentForTimelineFocus,
  wmsTimeExtentForWeek,
} from './siTimelineWeekIndex';

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

describe('resolveTimelineSeriesExtents', () => {
  const weeks = [
    { weekIndex: 1, startDate: '2023-11-18', endDate: '2023-11-24', mean: 0 },
    { weekIndex: 2, startDate: '2024-02-12', endDate: '2024-02-18', mean: 0 },
  ];

  it('uses panel end but not below last week end', () => {
    const ext = resolveTimelineSeriesExtents(weeks, '2023-11-18', '2024-02-10');
    expect(ext.startIso).toBe('2023-11-18');
    expect(ext.endIso).toBe('2024-02-18');
    expect(ext.lastWeekEndIso).toBe('2024-02-18');
  });
});

describe('siTimelineEndFocusIso', () => {
  it('prefers series end when provided', () => {
    const weeks = [
      { weekIndex: 1, startDate: '2024-02-01', endDate: '2024-02-07', mean: 0 },
      { weekIndex: 2, startDate: '2024-02-08', endDate: '2024-02-14', mean: 0 },
    ];
    expect(siTimelineEndFocusIso(weeks, '2024-02-18')).toBe('2024-02-18');
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

  it('collapses to a single focus day for timeline scrub', () => {
    const ext = wmsTimeExtentForTimelineFocus(
      { startDate: '2024-02-17', endDate: '2024-02-23' },
      '2024-02-20',
    );
    expect(ext.start).toBe('2024-02-20');
    expect(ext.end).toBe('2024-02-20');
  });

  it('builds weekly stops across a series', () => {
    const stops = buildTimelineStops('2024-02-01', '2024-02-22', {
      intervalUnit: 'week',
      intervalLength: 1,
      intervalStrategy: 'length',
    });
    expect(stops[0]).toBe('2024-02-01');
    expect(stops).toContain('2024-02-22');
    expect(stops.length).toBeGreaterThanOrEqual(3);
  });

  it('picks nearest stop for scrub focus', () => {
    const stops = ['2024-02-01', '2024-02-08', '2024-02-15'];
    expect(pickTimelineStopIdx(stops, '2024-02-10')).toBe(1);
  });

  it('picks nearest stop from rail ratio', () => {
    const stops = ['2024-02-01', '2024-02-08', '2024-02-15'];
    expect(pickTimelineStopIsoForRailRatio(stops, 0)).toBe('2024-02-01');
    expect(pickTimelineStopIsoForRailRatio(stops, 1)).toBe('2024-02-15');
    expect(pickTimelineStopIdx(stops, pickTimelineStopIsoForRailRatio(stops, 0.5))).toBe(1);
  });

  it('maps time-window mode to focus minus one week', () => {
    const ext = wmsTimeExtentForMode({
      mode: 'time-window',
      focusIso: '2024-02-20',
      seriesStartIso: '2024-02-01',
      seriesEndIso: '2024-02-28',
      intervalUnit: 'week',
      intervalLength: 1,
    });
    expect(ext.end).toBe('2024-02-20');
    expect(ext.start).toBe('2024-02-13');
  });

  it('maps cumulative-from-start through focus', () => {
    const ext = wmsTimeExtentForMode({
      mode: 'cumulative-from-start',
      focusIso: '2024-02-20',
      seriesStartIso: '2024-02-01',
      seriesEndIso: '2024-02-28',
      intervalUnit: 'week',
      intervalLength: 1,
    });
    expect(ext.start).toBe('2024-02-01');
    expect(ext.end).toBe('2024-02-20');
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

describe('wmsTimeExtentForAgroDeltaLayer', () => {
  it('never collapses to a single-day window (Δ layers need before/after)', () => {
    const ext = wmsTimeExtentForAgroDeltaLayer('2026-06-14', '2026-06-14', '2026-06-14');
    expect(ext.start).not.toBe(ext.end);
    expect(ext.end).toBe('2026-06-14');
  });

  it('uses series start through focus when timeline range exists', () => {
    const ext = wmsTimeExtentForAgroDeltaLayer('2026-06-14', '2026-03-01', '2026-06-14');
    expect(ext.start).toBe('2026-03-01');
    expect(ext.end).toBe('2026-06-14');
  });
});
