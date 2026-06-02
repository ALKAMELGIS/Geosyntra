import type { SiTimelineIntervalUnit } from './siTimelineOptions';

/** Calendar ISO (YYYY-MM-DD) in local time — avoids UTC shift from `Date#toISOString`. */
export function dateToTimelineIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Noon local on the given calendar day (stable for timeline pick / WMS). */
export function timelineDateFromIso(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}

const isoMsCache = new Map<string, number>();

/** Cached epoch ms for timeline stop / rail snap (avoids repeated Date parsing). */
export function timelineIsoToMs(iso: string): number {
  const key = iso.slice(0, 10);
  const hit = isoMsCache.get(key);
  if (hit !== undefined) return hit;
  const ms = timelineDateFromIso(key).getTime();
  if (isoMsCache.size > 600) isoMsCache.clear();
  isoMsCache.set(key, ms);
  return ms;
}

/** Shift a calendar ISO by `length` × `unit`; `sign` is +1 forward or −1 backward. */
export function addTimelineInterval(
  iso: string,
  unit: SiTimelineIntervalUnit,
  length: number,
  sign: 1 | -1,
): string {
  const n = Math.max(1, Math.floor(length)) * sign;
  const d = timelineDateFromIso(iso);
  switch (unit) {
    case 'day':
      d.setDate(d.getDate() + n);
      break;
    case 'week':
      d.setDate(d.getDate() + n * 7);
      break;
    case 'month':
      d.setMonth(d.getMonth() + n);
      break;
    case 'year':
      d.setFullYear(d.getFullYear() + n);
      break;
    default:
      break;
  }
  return dateToTimelineIso(d);
}

/** Default imagery day on each app open — yesterday (Sentinel availability) or today when `preferToday`. */
export function defaultImageryDateIso(opts?: { now?: Date; preferToday?: boolean }): string {
  const now = opts?.now ?? new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  if (!opts?.preferToday) d.setDate(d.getDate() - 1);
  return dateToTimelineIso(d);
}

/** Default analysis window (~12 weeks) ending at the fresh imagery date. */
export function defaultTimeSeriesWindow(endIso?: string): { start: string; end: string } {
  const end = endIso ?? defaultImageryDateIso();
  const start = addTimelineInterval(end, 'week', 12, -1);
  return { start, end };
}

export function freshImagerySessionDefaults(now: Date = new Date()): {
  imageryIso: string;
  seriesStart: string;
  seriesEnd: string;
} {
  const imageryIso = defaultImageryDateIso({ now });
  const { start, end } = defaultTimeSeriesWindow(imageryIso);
  return { imageryIso, seriesStart: start, seriesEnd: end };
}
