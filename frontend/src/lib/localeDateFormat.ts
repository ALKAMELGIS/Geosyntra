/** Parse YYYY-MM-DD at local noon (stable across time zones). */
export function isoDateToLocalNoon(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

let shortDateFormatter: Intl.DateTimeFormat | null = null;
let mediumDateFormatter: Intl.DateTimeFormat | null = null;

function localeShortDateFormatter(): Intl.DateTimeFormat {
  shortDateFormatter ??= new Intl.DateTimeFormat(undefined, { dateStyle: 'short' });
  return shortDateFormatter;
}

function localeMediumDateFormatter(): Intl.DateTimeFormat {
  mediumDateFormatter ??= new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
  return mediumDateFormatter;
}

/** OS / browser short date (e.g. 26/05/2026 vs 5/26/26 per locale). */
export function formatLocaleShortDate(iso: string): string {
  const d = isoDateToLocalNoon(iso);
  if (!d) return iso;
  return localeShortDateFormatter().format(d);
}

/** Longer label for titles and aria (still locale-driven). */
export function formatLocaleMediumDate(iso: string): string {
  const d = isoDateToLocalNoon(iso);
  if (!d) return iso;
  return localeMediumDateFormatter().format(d);
}
