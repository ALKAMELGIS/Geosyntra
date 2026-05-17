/** Coerce timeline / zonal stats to finite numbers (avoids `.toFixed` on undefined). */

export function coerceFiniteNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function formatStatFixed(value: unknown, digits = 3): string {
  const n = coerceFiniteNumber(value, NaN);
  return Number.isFinite(n) ? n.toFixed(digits) : '—';
}

export function normalizeWeeklyCompositeStats(
  stats: { mean?: unknown; min?: unknown; max?: unknown },
  range: [number, number],
): { mean: number; min: number; max: number } {
  const r0 = coerceFiniteNumber(range[0], -1);
  const r1 = coerceFiniteNumber(range[1], 1);
  const lo = Math.min(r0, r1);
  const hi = Math.max(r0, r1);
  const span = hi - lo || 1;
  const mid = lo + span / 2;
  const mean = coerceFiniteNumber(stats.mean, mid);
  const min = coerceFiniteNumber(stats.min, Math.max(lo, mean - span * 0.08));
  const max = coerceFiniteNumber(stats.max, Math.min(hi, mean + span * 0.1));
  return { mean, min: Math.min(min, max), max: Math.max(min, max) };
}
