import { describe, expect, it } from 'vitest';
import { formatLocaleShortDate, isoDateToLocalNoon } from './localeDateFormat';

describe('localeDateFormat', () => {
  it('parses ISO dates at local noon', () => {
    const d = isoDateToLocalNoon('2026-06-02');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(5);
    expect(d!.getDate()).toBe(2);
  });

  it('formats with Intl short date style', () => {
    const d = isoDateToLocalNoon('2026-05-26');
    expect(d).not.toBeNull();
    const expected = new Intl.DateTimeFormat(undefined, { dateStyle: 'short' }).format(d!);
    expect(formatLocaleShortDate('2026-05-26')).toBe(expected);
  });
});
