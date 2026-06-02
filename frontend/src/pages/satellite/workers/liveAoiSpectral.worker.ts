/**
 * Off-main-thread pixel statistics from AOI-clipped value arrays (no synthetic data).
 */
export type LiveAoiWorkerStatsRequest = {
  id: string;
  layers: Record<string, number[]>;
};

export type LiveAoiWorkerStatsLayer = {
  mean: number;
  median: number;
  min: number;
  max: number;
  std: number;
  validCount: number;
  totalCount: number;
};

export type LiveAoiWorkerStatsResponse = {
  id: string;
  layers: Record<string, LiveAoiWorkerStatsLayer>;
};

function stats(values: number[]): LiveAoiWorkerStatsLayer | null {
  const finite = values.filter(v => typeof v === 'number' && Number.isFinite(v));
  if (!finite.length) return null;
  const sorted = [...finite].sort((a, b) => a - b);
  const n = finite.length;
  const mean = finite.reduce((a, b) => a + b, 0) / n;
  const median = sorted[Math.floor((n - 1) / 2)]!;
  const min = sorted[0]!;
  const max = sorted[n - 1]!;
  const variance = finite.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  return {
    mean,
    median,
    min,
    max,
    std: Math.sqrt(variance),
    validCount: n,
    totalCount: values.length,
  };
}

self.onmessage = (ev: MessageEvent<LiveAoiWorkerStatsRequest>) => {
  const { id, layers } = ev.data;
  const out: Record<string, LiveAoiWorkerStatsLayer> = {};
  for (const [lid, vals] of Object.entries(layers)) {
    const st = stats(vals);
    if (st) out[lid] = st;
  }
  const msg: LiveAoiWorkerStatsResponse = { id, layers: out };
  self.postMessage(msg);
};
