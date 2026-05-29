import { describe, expect, it } from 'vitest';
import {
  buildSiFloodStreamlines,
  computeD8FlowAccumulation,
  computeD8FlowDirection,
  idxFlood,
  routeSiFloodDepth,
  type SiFloodRasterCore,
} from './siMapFloodEngine';

function makeSlopeGrid(cols: number, rows: number): SiFloodRasterCore {
  const n = cols * rows;
  const inside = new Uint8Array(n).fill(1);
  const elev = new Float32Array(n);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      elev[idxFlood(cols, r, c)] = (rows - r) * 10 + c;
    }
  }
  const flowDir = computeD8FlowDirection(cols, rows, inside, elev);
  const accumulation = computeD8FlowAccumulation(cols, rows, inside, flowDir);
  return {
    cols,
    rows,
    inside,
    elev,
    flowDir,
    accumulation,
    depth: new Float32Array(n),
    velocity: new Float32Array(n),
    runoff: new Float32Array(n),
  };
}

describe('siMapFloodEngine', () => {
  it('routes water downhill (deeper at low end)', () => {
    const core = makeSlopeGrid(6, 6);
    routeSiFloodDepth(core, {
      precip01: 0.8,
      intensityFactor: 1,
      infiltration01: 0.1,
      roughness01: 0.2,
      initialWater01: 0,
    });
    const bottom = idxFlood(6, 5, 3);
    const top = idxFlood(6, 0, 3);
    expect(core.depth[bottom]!).toBeGreaterThan(core.depth[top]!);
  });

  it('builds deterministic streamlines without randomness', () => {
    const cols = 5;
    const rows = 5;
    const inside = new Uint8Array(cols * rows).fill(1);
    const elev = new Float32Array(cols * rows);
    const flowDir = new Int8Array(cols * rows).fill(3);
    const accumulation = new Float32Array(cols * rows).fill(2);
    const depth = new Float32Array(cols * rows).fill(0.4);
    const lines = buildSiFloodStreamlines(
      cols,
      rows,
      inside,
      flowDir,
      accumulation,
      depth,
      (c, r) => ({ x: c * 10, y: r * 10 }),
      5,
      8,
    );
    expect(lines.length).toBeGreaterThan(0);
    const again = buildSiFloodStreamlines(
      cols,
      rows,
      inside,
      flowDir,
      accumulation,
      depth,
      (c, r) => ({ x: c * 10, y: r * 10 }),
      5,
      8,
    );
    expect(again.length).toBe(lines.length);
  });
});
