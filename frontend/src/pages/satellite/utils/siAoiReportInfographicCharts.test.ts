import { describe, expect, it } from 'vitest';
import {
  formatTimelineAxisDate,
  pickTimelineLabelIndices,
  svgDonutSlicePath,
} from './siAoiReportInfographicCharts';

describe('siAoiReportInfographicCharts', () => {
  it('formats timeline axis dates as MM-DD', () => {
    expect(formatTimelineAxisDate('2026-03-08')).toBe('03-08');
  });

  it('picks evenly spaced label indices', () => {
    expect(pickTimelineLabelIndices(5, 8)).toEqual([0, 1, 2, 3, 4]);
    expect(pickTimelineLabelIndices(12, 4)).toEqual([0, 4, 7, 11]);
  });

  it('builds closed donut slice SVG path', () => {
    const d = svgDonutSlicePath(50, 50, 40, 20, 0, Math.PI / 2);
    expect(d.startsWith('M ')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
  });
});
