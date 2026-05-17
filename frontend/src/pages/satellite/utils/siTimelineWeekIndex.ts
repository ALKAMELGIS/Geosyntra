import { dateToTimelineIso } from './siTimelineDate';

/** Fast week lookup for timeline scrubbing / playback (avoids repeated findIndex scans). */

export type WeeklyTimelineWeek = {
  weekIndex: number;
  startDate: string;
  endDate: string;
  mean: number;
};

export type WeeklyTimelineIndex = {
  weeks: WeeklyTimelineWeek[];
  pickWeekIdx(iso: string): number;
  pickWeek(iso: string): WeeklyTimelineWeek;
  nextWeekIdx(currentIdx: number): number;
};

export function buildWeeklyTimelineIndex(
  weekly: ReadonlyArray<{ weekIndex: number; startDate: string; endDate: string; mean: number }>,
): WeeklyTimelineIndex | null {
  if (!weekly.length) return null;
  const weeks: WeeklyTimelineWeek[] = weekly.map(w => ({
    weekIndex: w.weekIndex,
    startDate: w.startDate.slice(0, 10),
    endDate: w.endDate.slice(0, 10),
    mean: w.mean,
  }));

  const pickWeekIdx = (isoRaw: string): number => {
    const iso = isoRaw.slice(0, 10);
    for (let i = 0; i < weeks.length; i++) {
      const w = weeks[i]!;
      if (iso >= w.startDate && iso <= w.endDate) return i;
    }
    if (iso < weeks[0]!.startDate) return 0;
    return weeks.length - 1;
  };

  return {
    weeks,
    pickWeekIdx,
    pickWeek: (iso: string) => weeks[pickWeekIdx(iso)]!,
    nextWeekIdx: (currentIdx: number) => (currentIdx + 1) % weeks.length,
  };
}

/**
 * Sentinel Hub `TIME=start/end` for a timeline week + scrubber focus.
 * Keeps the focus day inside the window and avoids future end dates (no scenes → blank AOI).
 */
export type WmsTimeExtentOptions = {
  /** Last day with scenes in the loaded series (avoids empty WMS past imagery end). */
  seriesEndIso?: string | null;
  seriesStartIso?: string | null;
};

export function wmsTimeExtentForWeek(
  week: Pick<WeeklyTimelineWeek, 'startDate' | 'endDate'>,
  focusIsoRaw: string,
  opts?: WmsTimeExtentOptions,
): { start: string; end: string } {
  const focusIso = focusIsoRaw.slice(0, 10);
  const today = dateToTimelineIso(new Date());
  let start = week.startDate.slice(0, 10);
  let end = week.endDate.slice(0, 10);
  if (focusIso < start) start = focusIso;
  if (focusIso > end) end = focusIso;
  const seriesEnd = opts?.seriesEndIso?.trim().slice(0, 10);
  const seriesStart = opts?.seriesStartIso?.trim().slice(0, 10);
  if (seriesEnd && end > seriesEnd) end = seriesEnd;
  if (seriesStart && start < seriesStart) start = seriesStart;
  if (end > today) end = today;
  if (start > today) start = today;
  if (end < start) end = start;
  return { start, end };
}
