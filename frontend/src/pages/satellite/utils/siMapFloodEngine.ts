/** D8 flow-direction offsets (screen grid: y increases downward). */
export const SI_FLOOD_D8_DX = [0, 1, 1, 1, 0, -1, -1, -1] as const;
export const SI_FLOOD_D8_DY = [-1, -1, 0, 1, 1, 1, 0, -1] as const;

export const SI_FLOOD_ROUTING_PASSES = 10;

export type SiFloodRiskLevel = 'low' | 'medium' | 'high';

export function siFloodRiskFromDepth(depth: number): SiFloodRiskLevel {
  if (depth >= 0.55) return 'high';
  if (depth >= 0.28) return 'medium';
  return 'low';
}

export type SiFloodRasterCore = {
  cols: number;
  rows: number;
  inside: Uint8Array;
  elev: Float32Array;
  flowDir: Int8Array;
  accumulation: Float32Array;
  depth: Float32Array;
  velocity: Float32Array;
  runoff: Float32Array;
};

export function idxFlood(cols: number, r: number, c: number): number {
  return r * cols + c;
}

/** D8 steepest descent on inside cells only. */
export function computeD8FlowDirection(
  cols: number,
  rows: number,
  inside: Uint8Array,
  elev: Float32Array,
): Int8Array {
  const flowDir = new Int8Array(cols * rows);
  flowDir.fill(-1);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const i = idxFlood(cols, r, c);
      if (!inside[i]) continue;
      let bestDir = -1;
      let bestDrop = 0;
      const e0 = elev[i]!;
      for (let d = 0; d < 8; d += 1) {
        const nc = c + SI_FLOOD_D8_DX[d]!;
        const nr = r + SI_FLOOD_D8_DY[d]!;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const ni = idxFlood(cols, nr, nc);
        if (!inside[ni]) continue;
        const drop = e0 - elev[ni]!;
        if (drop > bestDrop) {
          bestDrop = drop;
          bestDir = d;
        }
      }
      flowDir[i] = bestDir;
    }
  }
  return flowDir;
}

/** Upstream cell count (lite D8 accumulation). */
export function computeD8FlowAccumulation(
  cols: number,
  rows: number,
  inside: Uint8Array,
  flowDir: Int8Array,
): Float32Array {
  const acc = new Float32Array(cols * rows);
  for (let i = 0; i < acc.length; i += 1) {
    if (inside[i]) acc[i] = 1;
  }
  const passes = Math.min(cols + rows, 64);
  for (let pass = 0; pass < passes; pass += 1) {
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const i = idxFlood(cols, r, c);
        if (!inside[i]) continue;
        const d = flowDir[i]!;
        if (d < 0) continue;
        const tc = c + SI_FLOOD_D8_DX[d]!;
        const tr = r + SI_FLOOD_D8_DY[d]!;
        if (tc < 0 || tr < 0 || tc >= cols || tr >= rows) continue;
        const ti = idxFlood(cols, tr, tc);
        if (!inside[ti]) continue;
        acc[ti] += acc[i]!;
      }
    }
  }
  return acc;
}

export type SiFloodRoutingParams = {
  precip01: number;
  intensityFactor: number;
  infiltration01: number;
  roughness01: number;
  initialWater01: number;
  /** Scenario duration in hours — runoff = rate × hours − infiltration. */
  durationHours?: number;
};

/**
 * Runoff raster + simplified shallow-water routing.
 * depth(t+1) ≈ depth(t) + rainfall − infiltration − outflow + inflow (D8 downhill).
 */
export function routeSiFloodDepth(
  core: SiFloodRasterCore,
  params: SiFloodRoutingParams,
  passes = SI_FLOOD_ROUTING_PASSES,
): void {
  const { cols, rows, inside, elev, flowDir, accumulation, depth, velocity, runoff } = core;
  const n = cols * rows;
  let maxAcc = 1;
  for (let i = 0; i < n; i += 1) {
    if (inside[i] && accumulation[i]! > maxAcc) maxAcc = accumulation[i]!;
  }

  const durationH = Math.max(0.5, params.durationHours ?? 1);
  const hourlyRunoff =
    params.precip01 * params.intensityFactor * (1 - params.infiltration01 * 0.85);
  const rainRate = hourlyRunoff * Math.min(24, durationH);
  const init = params.initialWater01 * 0.12 + hourlyRunoff * durationH * 0.008;
  const manning = Math.max(0.12, 1 - params.roughness01 * 0.75);
  const routePasses = Math.min(
    28,
    SI_FLOOD_ROUTING_PASSES + Math.round(durationH * 0.85),
  );

  for (let i = 0; i < n; i += 1) {
    if (!inside[i]) {
      depth[i] = 0;
      velocity[i] = 0;
      runoff[i] = 0;
      continue;
    }
    runoff[i] = rainRate;
    depth[i] = init + rainRate * 0.35;
    velocity[i] = 0;
  }

  const scratch = new Float32Array(n);
  for (let pass = 0; pass < routePasses; pass += 1) {
    scratch.set(depth);
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const i = idxFlood(cols, r, c);
        if (!inside[i]) continue;

        const d = scratch[i]!;
        const accNorm = accumulation[i]! / maxAcc;
        const channelBoost = 1 + Math.log1p(accNorm * 5) * 0.45;

        let outTotal = 0;
        const dir = flowDir[i]!;
        if (dir >= 0) {
          const tc = c + SI_FLOOD_D8_DX[dir]!;
          const tr = r + SI_FLOOD_D8_DY[dir]!;
          if (tc >= 0 && tr >= 0 && tc < cols && tr < rows) {
            const ti = idxFlood(cols, tr, tc);
            if (inside[ti]) {
              const drop = Math.max(0, elev[i]! - elev[ti]!);
              const slope = Math.min(1, drop / 12);
              const transfer = Math.min(
                d * (0.22 + slope * 0.28) * manning * channelBoost,
                d * 0.55,
              );
              outTotal = transfer;
              depth[ti] = depth[ti]! + transfer;
            }
          }
        }

        const infilLoss = d * params.infiltration01 * 0.04;
        const rainAdd = rainRate * 0.018;
        depth[i] = Math.max(0, d - outTotal - infilLoss + rainAdd);
      }
    }
  }

  for (let i = 0; i < n; i += 1) {
    if (!inside[i]) continue;
    const d = depth[i]!;
    const dir = flowDir[i]!;
    let slope = 0.05;
    if (dir >= 0) {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const tc = c + SI_FLOOD_D8_DX[dir]!;
      const tr = r + SI_FLOOD_D8_DY[dir]!;
      const ti = idxFlood(cols, tr, tc);
      if (inside[ti]) slope = Math.max(0.02, (elev[i]! - elev[ti]!) / 15);
    }
    const accNorm = accumulation[i]! / maxAcc;
    velocity[i] = Math.min(1, Math.sqrt(slope) * (0.25 + d * 0.9) * manning * (1 + accNorm * 0.35));
    depth[i] = Math.min(1, d);
  }
}

/** Deterministic channel streamlines from high accumulation (no random seeds). */
export function buildSiFloodStreamlines(
  cols: number,
  rows: number,
  inside: Uint8Array,
  flowDir: Int8Array,
  accumulation: Float32Array,
  depth: Float32Array,
  cellToScreen: (c: number, r: number) => { x: number; y: number },
  maxLines = 24,
  maxSteps = 36,
): Array<Array<{ x: number; y: number }>> {
  const seeds: Array<{ c: number; r: number; score: number }> = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const i = idxFlood(cols, r, c);
      if (!inside[i] || depth[i]! < 0.06) continue;
      seeds.push({ c, r, score: accumulation[i]! * (0.4 + depth[i]!) });
    }
  }
  seeds.sort((a, b) => b.score - a.score);
  const lines: Array<Array<{ x: number; y: number }>> = [];
  const used = new Set<number>();

  for (const seed of seeds) {
    if (lines.length >= maxLines) break;
    let c = seed.c;
    let r = seed.r;
    const key0 = idxFlood(cols, r, c);
    if (used.has(key0)) continue;
    const line: Array<{ x: number; y: number }> = [];
    for (let step = 0; step < maxSteps; step += 1) {
      const i = idxFlood(cols, r, c);
      if (!inside[i]) break;
      used.add(i);
      line.push(cellToScreen(c, r));
      const dir = flowDir[i]!;
      if (dir < 0) break;
      const nc = c + SI_FLOOD_D8_DX[dir]!;
      const nr = r + SI_FLOOD_D8_DY[dir]!;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) break;
      c = nc;
      r = nr;
    }
    if (line.length >= 3) lines.push(line);
  }
  return lines;
}

/** One hydrologic hour step — rainfall minus infiltration, D8 downhill transfer (no particles). */
export function stepSiFloodRaster(
  core: SiFloodRasterCore,
  params: SiFloodRoutingParams,
  dtHours: number,
): void {
  const { cols, rows, inside, elev, flowDir, accumulation, depth, velocity } = core;
  const n = cols * rows;
  const dt = Math.max(0.05, Math.min(4, dtHours));
  const hourlyRunoff =
    params.precip01 * params.intensityFactor * (1 - params.infiltration01 * 0.85);
  const rainAdd = hourlyRunoff * dt * 0.024;
  const infilLossScale = params.infiltration01 * 0.045 * dt;
  const manning = Math.max(0.12, 1 - params.roughness01 * 0.75);

  let maxAcc = 1;
  for (let i = 0; i < n; i += 1) {
    if (inside[i] && accumulation[i]! > maxAcc) maxAcc = accumulation[i]!;
  }

  const scratch = new Float32Array(n);
  scratch.set(depth);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const i = idxFlood(cols, r, c);
      if (!inside[i]) continue;

      const d = scratch[i]!;
      const accNorm = accumulation[i]! / maxAcc;
      const channelBoost = 1 + Math.log1p(accNorm * 5) * 0.45;

      let outTotal = 0;
      const dir = flowDir[i]!;
      if (dir >= 0) {
        const tc = c + SI_FLOOD_D8_DX[dir]!;
        const tr = r + SI_FLOOD_D8_DY[dir]!;
        if (tc >= 0 && tr >= 0 && tc < cols && tr < rows) {
          const ti = idxFlood(cols, tr, tc);
          if (inside[ti]) {
            const drop = Math.max(0, elev[i]! - elev[ti]!);
            const slope = Math.min(1, drop / 12);
            const transfer = Math.min(
              d * (0.24 + slope * 0.32) * manning * channelBoost,
              d * 0.58,
            );
            outTotal = transfer;
            depth[ti] = depth[ti]! + transfer;
          }
        }
      }

      const infilLoss = d * infilLossScale;
      depth[i] = Math.max(0, Math.min(1, d - outTotal - infilLoss + rainAdd));
    }
  }

  for (let i = 0; i < n; i += 1) {
    if (!inside[i]) continue;
    const d = depth[i]!;
    const dir = flowDir[i]!;
    let slope = 0.05;
    if (dir >= 0) {
      const c = i % cols;
      const rr = Math.floor(i / cols);
      const tc = c + SI_FLOOD_D8_DX[dir]!;
      const tr = rr + SI_FLOOD_D8_DY[dir]!;
      const ti = idxFlood(cols, tr, tc);
      if (inside[ti]) slope = Math.max(0.02, (elev[i]! - elev[ti]!) / 15);
    }
    const accNorm = accumulation[i]! / maxAcc;
    velocity[i] = Math.min(1, Math.sqrt(slope) * (0.28 + d * 0.95) * manning * (1 + accNorm * 0.4));
  }
}
