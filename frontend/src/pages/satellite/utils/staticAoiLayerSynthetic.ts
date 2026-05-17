import { STATIC_AOI_CHART_LAYER_OPTIONS } from './staticAoiChartTypes';
import { coerceFiniteNumber } from './weeklyCompositeStats';

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function aoiNoise(aoiKey: string | null, layerId: string, weekIdx: number): number {
  const n = simpleHash(`${aoiKey ?? 'world'}|${layerId}|${weekIdx}`) % 2000;
  return n / 10000 - 0.1;
}

function metaFor(layerId: string) {
  return STATIC_AOI_CHART_LAYER_OPTIONS.find(o => o.id === layerId) ?? STATIC_AOI_CHART_LAYER_OPTIONS[0]!;
}

/** Per-layer weekly mean in physical range for that index (sample trajectory). */
export function staticAoiLayerMeanForWeek(
  layerId: string,
  weekIdx: number,
  totalWeeks: number,
  aoiKey: string | null,
  anchorWeeklyMean: number,
): number {
  const { range } = metaFor(layerId);
  const r0 = coerceFiniteNumber(range[0], -1);
  const r1 = coerceFiniteNumber(range[1], 1);
  const span = r1 - r0 || 1;
  const seasonal = Math.sin((weekIdx / Math.max(1, totalWeeks - 1)) * Math.PI);
  const phase = (simpleHash(layerId) % 23) / 120;
  const anchor = coerceFiniteNumber(anchorWeeklyMean, r0 + span / 2);
  const anchor01 =
    layerId === 'LST'
      ? (anchor - 15) / 30
      : Math.max(0, Math.min(1, (anchor - r0) / span));
  const mix = 0.55 * seasonal + 0.45 * (anchor01 * 2 - 1) * 0.35;
  const base =
    layerId === 'LST'
      ? 24 + seasonal * 11 + phase * 4
      : r0 + span * (0.38 + mix * 0.32 + phase * 0.08);
  const v = base + aoiNoise(aoiKey, layerId, weekIdx);
  if (!Number.isFinite(v)) return r0 + span / 2;
  if (layerId === 'LST') return Math.max(r0, Math.min(r1, v));
  return v;
}

export function formatStaticChartWeekLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDate.slice(5);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
}
