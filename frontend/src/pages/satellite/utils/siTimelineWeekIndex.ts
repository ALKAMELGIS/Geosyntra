import { addTimelineInterval, dateToTimelineIso, timelineDateFromIso, timelineIsoToMs } from './siTimelineDate';
import type {
  SiTimeSliderMode,
  SiTimelineIntervalStrategy,
  SiTimelineIntervalUnit,
} from './siTimelineOptions';

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
    if (iso < weeks[0]!.startDate) return 0;
    if (iso > weeks[weeks.length - 1]!.endDate) return weeks.length - 1;
    let lo = 0;
    let hi = weeks.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (iso >= weeks[mid]!.startDate) lo = mid;
      else hi = mid - 1;
    }
    const w = weeks[lo]!;
    if (iso >= w.startDate && iso <= w.endDate) return lo;
    return lo < weeks.length - 1 ? lo + 1 : lo;
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

/** Focus ISO for timeline generate / end-date scrub — prefers panel end, else last week. */
export function siTimelineEndFocusIso(
  weeks: ReadonlyArray<Pick<WeeklyTimelineWeek, 'startDate' | 'endDate'>>,
  seriesEndIso: string,
): string {
  if (!weeks.length) return seriesEndIso.trim().slice(0, 10);
  const last = weeks[weeks.length - 1]!;
  return (seriesEndIso.trim() || last.endDate || last.startDate).slice(0, 10);
}

export type TimelineSeriesExtents = {
  startIso: string;
  endIso: string;
  focusIso: string;
  lastWeekEndIso: string;
};

/**
 * Canonical AOI / timeline series bounds from weekly chips + panel range.
 * Ensures End Date in UI matches the generated timeline (not a stale focus day only).
 */
export function resolveTimelineSeriesExtents(
  weeks: ReadonlyArray<Pick<WeeklyTimelineWeek, 'startDate' | 'endDate'>>,
  panelStartIso = '',
  panelEndIso = '',
): TimelineSeriesExtents {
  if (!weeks.length) {
    const startIso = panelStartIso.trim().slice(0, 10);
    const endIso = panelEndIso.trim().slice(0, 10);
    const focusIso = (endIso || startIso).slice(0, 10);
    return { startIso, endIso, focusIso, lastWeekEndIso: endIso };
  }
  const first = weeks[0]!;
  const last = weeks[weeks.length - 1]!;
  const weekStart = first.startDate.slice(0, 10);
  const weekEnd = last.endDate.slice(0, 10);
  const startIso = (panelStartIso.trim() || weekStart).slice(0, 10);
  let endIso = (panelEndIso.trim() || weekEnd).slice(0, 10);
  if (endIso < weekEnd) endIso = weekEnd;
  if (startIso > endIso) endIso = startIso;
  const focusIso = siTimelineEndFocusIso(weeks, endIso);
  return { startIso, endIso, focusIso, lastWeekEndIso: weekEnd };
}

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

/**
 * Sentinel Hub `TIME=` for timeline scrub / step / playback: one focus day so
 * chip changes and end-date edits always bust tiles (week-wide ranges often look unchanged).
 */
export function wmsTimeExtentForTimelineFocus(
  week: Pick<WeeklyTimelineWeek, 'startDate' | 'endDate'>,
  focusIsoRaw: string,
  opts?: WmsTimeExtentOptions,
): { start: string; end: string } {
  const extent = wmsTimeExtentForWeek(week, focusIsoRaw, opts);
  const day = focusIsoRaw.slice(0, 10);
  if (day.length >= 10 && day >= extent.start && day <= extent.end) {
    return { start: day, end: day };
  }
  return extent;
}

function clampWmsExtent(
  startRaw: string,
  endRaw: string,
  opts?: WmsTimeExtentOptions,
): { start: string; end: string } {
  const today = dateToTimelineIso(new Date());
  let start = startRaw.slice(0, 10);
  let end = endRaw.slice(0, 10);
  const seriesEnd = opts?.seriesEndIso?.trim().slice(0, 10);
  const seriesStart = opts?.seriesStartIso?.trim().slice(0, 10);
  if (seriesEnd && end > seriesEnd) end = seriesEnd;
  if (seriesStart && start < seriesStart) start = seriesStart;
  if (end > today) end = today;
  if (start > today) start = today;
  if (end < start) end = start;
  return { start, end };
}

export type WmsTimeExtentForModeParams = {
  mode: SiTimeSliderMode;
  focusIso: string;
  seriesStartIso: string;
  seriesEndIso: string;
  intervalUnit: SiTimelineIntervalUnit;
  intervalLength: number;
  week?: Pick<WeeklyTimelineWeek, 'startDate' | 'endDate'>;
  opts?: WmsTimeExtentOptions;
};

/**
 * Sentinel Hub `TIME=start/end` from Esri-style time slider mode + focus day.
 * `instant` keeps the single-day cache-bust behavior via `wmsTimeExtentForTimelineFocus`.
 */
export function wmsTimeExtentForMode(params: WmsTimeExtentForModeParams): { start: string; end: string } {
  const focus = params.focusIso.slice(0, 10);
  const seriesStart = params.seriesStartIso.trim().slice(0, 10);
  const seriesEnd = params.seriesEndIso.trim().slice(0, 10);
  const week =
    params.week ??
    ({ startDate: focus, endDate: focus } satisfies Pick<WeeklyTimelineWeek, 'startDate' | 'endDate'>);

  if (params.mode === 'instant') {
    return wmsTimeExtentForTimelineFocus(week, focus, params.opts);
  }

  let start: string;
  let end: string;
  switch (params.mode) {
    case 'time-window':
      start = addTimelineInterval(focus, params.intervalUnit, params.intervalLength, -1);
      end = focus;
      break;
    case 'cumulative-from-start':
      start = seriesStart || focus;
      end = focus;
      break;
    case 'cumulative-from-end':
      start = focus;
      end = seriesEnd || focus;
      break;
    default:
      start = focus;
      end = focus;
  }
  return clampWmsExtent(start, end, params.opts);
}

/** ISO stops from series start → end at the configured interval (default week preserves 7-day steps). */
export function buildTimelineStops(
  seriesStartIso: string,
  seriesEndIso: string,
  opts: {
    intervalUnit: SiTimelineIntervalUnit;
    intervalLength: number;
    intervalStrategy: SiTimelineIntervalStrategy;
  },
): string[] {
  const start = seriesStartIso.trim().slice(0, 10);
  const end = seriesEndIso.trim().slice(0, 10);
  if (!start && !end) return [];
  if (!start) return end ? [end] : [];
  if (!end || start > end) return [start];

  if (opts.intervalStrategy === 'equal-steps') {
    const steps = Math.max(1, Math.floor(opts.intervalLength));
    const startMs = timelineDateFromIso(start).getTime();
    const endMs = timelineDateFromIso(end).getTime();
    const span = Math.max(0, endMs - startMs);
    const stops: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = startMs + (span * i) / steps;
      stops.push(dateToTimelineIso(new Date(t)));
    }
    return [...new Set(stops)];
  }

  const stops: string[] = [start];
  let cur = start;
  const len = Math.max(1, Math.floor(opts.intervalLength));
  while (cur < end) {
    const next = addTimelineInterval(cur, opts.intervalUnit, len, 1);
    if (next <= cur) break;
    if (next >= end) {
      if (stops[stops.length - 1] !== end) stops.push(end);
      break;
    }
    stops.push(next);
    cur = next;
  }
  if (stops[stops.length - 1] !== end) stops.push(end);
  return stops;
}

/** Nearest stop index for scrub / step / playback (stops are sorted ascending). */
export function pickTimelineStopIdx(stops: readonly string[], isoRaw: string): number {
  if (!stops.length) return 0;
  const iso = isoRaw.slice(0, 10);
  if (iso <= stops[0]!) return 0;
  if (iso >= stops[stops.length - 1]!) return stops.length - 1;
  const focusMs = timelineIsoToMs(iso);
  let lo = 0;
  let hi = stops.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (timelineIsoToMs(stops[mid]!) < focusMs) lo = mid + 1;
    else hi = mid;
  }
  if (lo === 0) return 0;
  const prev = lo - 1;
  return Math.abs(timelineIsoToMs(stops[prev]!) - focusMs) <=
    Math.abs(timelineIsoToMs(stops[lo]!) - focusMs)
    ? prev
    : lo;
}

/** Nearest ISO stop for a continuous rail ratio (0–1) across sorted stops. */
export function pickTimelineStopIsoForRailRatio(
  stops: readonly string[],
  ratio: number,
): string {
  if (!stops.length) return '';
  const r = Math.max(0, Math.min(1, ratio));
  if (stops.length === 1) return stops[0]!.slice(0, 10);
  const startMs = timelineIsoToMs(stops[0]!);
  const endMs = timelineIsoToMs(stops[stops.length - 1]!);
  const targetMs = startMs + r * Math.max(0, endMs - startMs);
  let lo = 0;
  let hi = stops.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (timelineIsoToMs(stops[mid]!) < targetMs) lo = mid + 1;
    else hi = mid;
  }
  if (lo === 0) return stops[0]!.slice(0, 10);
  const prev = lo - 1;
  return Math.abs(timelineIsoToMs(stops[prev]!) - targetMs) <=
    Math.abs(timelineIsoToMs(stops[lo]!) - targetMs)
    ? stops[prev]!.slice(0, 10)
    : stops[lo]!.slice(0, 10);
}

export function nextTimelineStopIdx(currentIdx: number, stopsLength: number): number {
  if (stopsLength <= 0) return 0;
  return (currentIdx + 1) % stopsLength;
}
