/**
 * Web Worker: histogram + distribution from real AOI pixel arrays (off main thread).
 */
export type LiveAoiWorkerRequest = {
  id: string;
  values: number[];
  areaHa: number;
  layerId: string;
  histogramBins?: number;
};

export type LiveAoiWorkerHealthRow = {
  band: 'low' | 'medium' | 'high';
  label: string;
  pct: number;
  areaHa: number;
  meanIndex: number;
  color: string;
};

export type LiveAoiWorkerResponse = {
  id: string;
  stats: {
    mean: number;
    median: number;
    min: number;
    max: number;
    std: number;
    validCount: number;
    histogram: { binStart: number; binEnd: number; count: number }[];
  } | null;
  healthRows: LiveAoiWorkerHealthRow[];
};

function percentile(sorted: number[], p: number): number {
  const t = (sorted.length - 1) * p;
  const lo = Math.floor(t);
  const hi = Math.ceil(t);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! * (1 - (t - lo)) + sorted[hi]! * (t - lo);
}

function computeStats(values: number[], bins: number): LiveAoiWorkerResponse['stats'] {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return null;
  const sorted = [...finite].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = finite.reduce((a, b) => a + b, 0) / n;
  const min = sorted[0]!;
  const max = sorted[n - 1]!;
  const span = Math.max(1e-12, max - min);
  const histogram: { binStart: number; binEnd: number; count: number }[] = [];
  for (let i = 0; i < bins; i++) {
    histogram.push({
      binStart: min + (span * i) / bins,
      binEnd: min + (span * (i + 1)) / bins,
      count: 0,
    });
  }
  for (const v of finite) {
    let idx = Math.floor(((v - min) / span) * bins);
    if (idx >= bins) idx = bins - 1;
    histogram[idx]!.count += 1;
  }
  const variance = finite.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  return {
    mean,
    median: percentile(sorted, 0.5),
    min,
    max,
    std: Math.sqrt(variance),
    validCount: n,
    histogram,
  };
}

function healthRows(values: number[], areaHa: number): LiveAoiWorkerHealthRow[] {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return [];
  const sorted = [...finite].sort((a, b) => a - b);
  const p33 = percentile(sorted, 1 / 3);
  const p66 = percentile(sorted, 2 / 3);
  const areaPerPx = areaHa / finite.length;
  const bands: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high'];
  const colors = { low: '#ef4444', medium: '#eab308', high: '#22c55e' };
  const counts = { low: 0, medium: 0, high: 0 };
  const sums = { low: 0, medium: 0, high: 0 };
  for (const v of finite) {
    let band: 'low' | 'medium' | 'high' = 'high';
    if (v <= p33) band = 'low';
    else if (v <= p66) band = 'medium';
    counts[band] += 1;
    sums[band] += v;
  }
  return bands.map(band => {
    const n = counts[band];
    return {
      band,
      label: band === 'high' ? 'High' : band === 'medium' ? 'Medium' : 'Low',
      pct: (100 * n) / finite.length,
      areaHa: areaPerPx * n,
      meanIndex: n > 0 ? sums[band] / n : NaN,
      color: colors[band],
    };
  });
}

self.onmessage = (ev: MessageEvent<LiveAoiWorkerRequest>) => {
  const { id, values, areaHa, histogramBins = 24 } = ev.data;
  const stats = computeStats(values, histogramBins);
  const rows = healthRows(values, areaHa > 0 ? areaHa : 1);
  const msg: LiveAoiWorkerResponse = { id, stats, healthRows: rows };
  self.postMessage(msg);
};
