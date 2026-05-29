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
