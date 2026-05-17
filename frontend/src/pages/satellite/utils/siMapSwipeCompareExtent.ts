import type { WeeklyTimelineIndex } from './siTimelineWeekIndex';
import { wmsTimeExtentForWeek, type WmsTimeExtentOptions } from './siTimelineWeekIndex';
import { dateToTimelineIso, timelineDateFromIso } from './siTimelineDate';

export type WmsTimeExtent = { start: string; end: string };

/** Pick a compare week relative to the current scrubber date (negative = earlier). */
export function resolveSiMapSwipeCompareTimeExtent(
  currentIso: string,
  weeklyTimelineIndex: WeeklyTimelineIndex | null,
  weekOffset: number,
  seriesOpts?: WmsTimeExtentOptions,
): WmsTimeExtent {
  const iso = currentIso.slice(0, 10);
  if (weeklyTimelineIndex?.weeks.length) {
    const idx = weeklyTimelineIndex.pickWeekIdx(iso);
    const target = Math.max(0, Math.min(weeklyTimelineIndex.weeks.length - 1, idx + weekOffset));
    const w = weeklyTimelineIndex.weeks[target]!;
    const focus = w.startDate.slice(0, 10);
    return wmsTimeExtentForWeek(w, focus, seriesOpts);
  }
  const d = timelineDateFromIso(iso);
  d.setUTCDate(d.getUTCDate() + weekOffset * 7);
  const shifted = dateToTimelineIso(d);
  return wmsTimeExtentForWeek({ startDate: shifted, endDate: shifted }, shifted, seriesOpts);
}
