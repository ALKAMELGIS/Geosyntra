/** Normalize to YYYY-MM-DD or empty when invalid. */
export function normalizeTimelineIso(iso?: string | null): string {
  const s = (iso ?? '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

export type TimelineSeriesRange = {
  start: string;
  end: string;
};

/**
 * Resolve the analysis series window for legend, timeline chrome, and AOI panels.
 * Prefers explicit Generate Timeline start/end, then weekly chip extents.
 */
export function resolveTimelineSeriesRange(opts: {
  seriesStartIso?: string | null;
  seriesEndIso?: string | null;
  weeklyChipDates?: readonly (string | null | undefined)[];
}): TimelineSeriesRange {
  const start =
    normalizeTimelineIso(opts.seriesStartIso) ||
    normalizeTimelineIso(opts.weeklyChipDates?.[0]) ||
    '';
  const end =
    normalizeTimelineIso(opts.seriesEndIso) ||
    normalizeTimelineIso(opts.weeklyChipDates?.[opts.weeklyChipDates.length - 1]) ||
    '';
  return { start, end };
}

export function formatTimelineSeriesLine(range: TimelineSeriesRange): string | null {
  const { start, end } = range;
  if (start && end) return `${start} → ${end}`;
  if (end) return end;
  if (start) return start;
  return null;
}
