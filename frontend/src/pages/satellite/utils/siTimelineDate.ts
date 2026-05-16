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
