import { describe, expect, it } from 'vitest';
import {
  dateToTimelineIso,
  defaultImageryDateIso,
  defaultTimeSeriesWindow,
  freshImagerySessionDefaults,
  timelineDateFromIso,
} from './siTimelineDate';

describe('defaultImageryDateIso', () => {
  it('defaults to yesterday in local calendar time', () => {
    const now = new Date(2026, 4, 31, 15, 30, 0);
    expect(defaultImageryDateIso({ now })).toBe('2026-05-30');
  });

  it('can prefer today', () => {
    const now = new Date(2026, 4, 31, 8, 0, 0);
    expect(defaultImageryDateIso({ now, preferToday: true })).toBe('2026-05-31');
  });
});

describe('defaultTimeSeriesWindow', () => {
  it('spans 12 weeks ending at imagery date', () => {
    const win = defaultTimeSeriesWindow('2026-05-30');
    expect(win.end).toBe('2026-05-30');
    expect(win.start).toBe('2026-03-07');
  });
});

describe('freshImagerySessionDefaults', () => {
  it('aligns imagery and series end', () => {
    const now = new Date(2026, 4, 31, 12, 0, 0);
    const d = freshImagerySessionDefaults(now);
    expect(d.imageryIso).toBe('2026-05-30');
    expect(d.seriesEnd).toBe('2026-05-30');
    expect(timelineDateFromIso(d.imageryIso).getTime()).toBeLessThan(now.getTime());
    expect(dateToTimelineIso(timelineDateFromIso(d.seriesStart)) < d.seriesEnd).toBe(true);
  });
});
