import type { Map as MapboxMap } from 'mapbox-gl';
import type { Feature } from 'geojson';
import { pointInAnyRainFlowAoi } from './siMapRainFlowAoi';
import {
  buildSiFloodStreamlines,
  computeD8FlowAccumulation,
  computeD8FlowDirection,
  idxFlood,
  routeSiFloodDepth,
  siFloodRiskFromDepth,
  stepSiFloodRaster,
  type SiFloodRasterCore,
  type SiFloodRiskLevel,
  type SiFloodRoutingParams,
} from './siMapFloodEngine';

export type { SiFloodRiskLevel };

export type SiRainFlowGridCell = {
  x: number;
  y: number;
  lng: number;
  lat: number;
  elev: number;
  flowDir: number;
  accumulation: number;
  depth: number;
  pool: number;
  flood: number;
  velocity: number;
  risk: SiFloodRiskLevel;
};

export type SiRainFlowField = {
  cols: number;
  rows: number;
  cells: SiRainFlowGridCell[];
  /** Deterministic channel paths (D8 downstream), not random particles. */
  streamlines: Array<Array<{ x: number; y: number }>>;
  /** @deprecated Use streamlines — kept for callers. */
  paths: Array<Array<{ x: number; y: number }>>;
  /** Row-major hydrology rasters (0 outside AOI). */
  raster: SiFloodRasterCore;
  cellWidth: number;
  cellHeight: number;
  hasRealDem: boolean;
  clippedToAoi: boolean;
  /** Elapsed simulated time (hours) for playback. */
  simulatedHours: number;
};

function syntheticElevation(lng: number, lat: number): number {
  const a = Math.sin(lng * 11.3) * Math.cos(lat * 8.7);
  const b = Math.sin(lng * 2.4 + lat * 1.9) * 0.55;
  const c = Math.cos(lng * 0.85 - lat * 1.2) * 0.35;
  return (a + b + c) * 420 + lat * 18 - lng * 6;
}

function sampleElevation(map: MapboxMap, lng: number, lat: number, useDem: boolean): number {
  if (useDem) {
    try {
      const m = map.queryTerrainElevation?.({ lng, lat }, { exaggerated: true });
      if (m != null && Number.isFinite(m)) return m;
    } catch {
      /* terrain off */
    }
  }
  return syntheticElevation(lng, lat);
}

export type BuildSiMapRainFlowFieldOptions = {
  aoiFeatures?: ReadonlyArray<Feature>;
  infiltration01?: number;
  roughness01?: number;
  initialWater01?: number;
  /** Grid resolution: coarse | medium | fine */
  cellResolution?: 'coarse' | 'medium' | 'fine';
  highDetail?: boolean;
  durationHours?: number;
};

function gridStep(
  width: number,
  height: number,
  resolution: BuildSiMapRainFlowFieldOptions['cellResolution'],
  highDetail?: boolean,
): { step: number; maxCols: number; maxRows: number } {
  if (resolution === 'fine' || highDetail) return { step: 18, maxCols: 72, maxRows: 54 };
  if (resolution === 'coarse') return { step: 34, maxCols: 40, maxRows: 30 };
  return { step: 24, maxCols: 56, maxRows: 42 };
}

/**
 * Hydrologic flood field inside AOI: DEM → D8 flow direction → accumulation → runoff routing → depth/velocity.
 */
export function buildSiMapRainFlowField(
  map: MapboxMap,
  width: number,
  height: number,
  precip01: number,
  intensityFactor: number,
  options?: BuildSiMapRainFlowFieldOptions,
): SiRainFlowField | null {
  const aoiFeatures = options?.aoiFeatures ?? [];
  if (!aoiFeatures.length) return null;

  const res = options?.cellResolution ?? (options?.highDetail ? 'fine' : 'medium');
  const { step, maxCols, maxRows } = gridStep(width, height, res, options?.highDetail);
  const cols = Math.max(12, Math.min(maxCols, Math.round(width / step)));
  const rows = Math.max(10, Math.min(maxRows, Math.round(height / step)));
  const cellWidth = width / cols;
  const cellHeight = height / rows;

  const infiltration01 = Math.max(0, Math.min(1, options?.infiltration01 ?? 0));
  const roughness01 = Math.max(0, Math.min(1, options?.roughness01 ?? 0));
  const initialWater01 = Math.max(0, Math.min(1, options?.initialWater01 ?? 0));
  const useDem = Boolean(map.getTerrain?.());

  const n = cols * rows;
  const inside = new Uint8Array(n);
  const elev = new Float32Array(n);
  let realSamples = 0;
  let insideCount = 0;

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const i = idxFlood(cols, r, c);
      const x = ((c + 0.5) / cols) * width;
      const y = ((r + 0.5) / rows) * height;
      const ll = map.unproject([x, y]);
      const inAoi = pointInAnyRainFlowAoi(ll.lng, ll.lat, aoiFeatures);
      inside[i] = inAoi ? 1 : 0;
      if (!inAoi) {
        elev[i] = 0;
        continue;
      }
      insideCount += 1;
      let e = sampleElevation(map, ll.lng, ll.lat, useDem);
      if (useDem) {
        try {
          const m = map.queryTerrainElevation?.({ lng: ll.lng, lat: ll.lat }, { exaggerated: true });
          if (m != null && Number.isFinite(m)) {
            e = m;
            realSamples += 1;
          }
        } catch {
          /* ignore */
        }
      }
      elev[i] = e;
    }
  }

  if (insideCount < 3) return null;

  const hasRealDem = useDem && realSamples > insideCount * 0.25;
  const flowDir = computeD8FlowDirection(cols, rows, inside, elev);
  const accumulation = computeD8FlowAccumulation(cols, rows, inside, flowDir);

  const raster: SiFloodRasterCore = {
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

  const durationHours = Math.max(1, Math.min(72, options?.durationHours ?? 6));
  const routing: SiFloodRoutingParams = {
    precip01,
    intensityFactor,
    infiltration01,
    roughness01,
    initialWater01,
    durationHours,
  };
  routeSiFloodDepth(raster, routing);

  const cellToScreen = (c: number, r: number) => ({
    x: ((c + 0.5) / cols) * width,
    y: ((r + 0.5) / rows) * height,
  });

  const streamlines = buildSiFloodStreamlines(
    cols,
    rows,
    inside,
    flowDir,
    accumulation,
    raster.depth,
    cellToScreen,
    Math.round(14 + precip01 * intensityFactor * 18),
  );

  const cells: SiRainFlowGridCell[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const i = idxFlood(cols, r, c);
      if (!inside[i]) continue;
      const x = ((c + 0.5) / cols) * width;
      const y = ((r + 0.5) / rows) * height;
      const ll = map.unproject([x, y]);
      const depth = raster.depth[i]!;
      const pool = depth * 0.92;
      cells.push({
        x,
        y,
        lng: ll.lng,
        lat: ll.lat,
        elev: elev[i]!,
        flowDir: flowDir[i]!,
        accumulation: accumulation[i]!,
        depth,
        pool,
        flood: depth > 0.12 ? depth * 1.05 : 0,
        velocity: raster.velocity[i] ?? 0,
        risk: siFloodRiskFromDepth(depth),
      });
    }
  }

  return {
    cols,
    rows,
    cells,
    streamlines,
    paths: streamlines,
    raster,
    cellWidth,
    cellHeight,
    hasRealDem,
    clippedToAoi: true,
    simulatedHours: durationHours,
  };
}

/** Rebuild channel streamlines after depth changes (deterministic D8 paths). */
export function refreshSiMapFloodStreamlines(
  field: SiRainFlowField,
  width: number,
  height: number,
  precip01: number,
  intensityFactor: number,
): void {
  const { cols, rows, raster } = field;
  const cellToScreen = (c: number, r: number) => ({
    x: ((c + 0.5) / cols) * width,
    y: ((r + 0.5) / rows) * height,
  });
  const streamlines = buildSiFloodStreamlines(
    cols,
    rows,
    raster.inside,
    raster.flowDir,
    raster.accumulation,
    raster.depth,
    cellToScreen,
    Math.round(16 + precip01 * intensityFactor * 20),
  );
  field.streamlines = streamlines;
  field.paths = streamlines;
}

/** Advance simulation one frame (shallow-water lite step). */
export function advanceSiMapRainFlowField(
  field: SiRainFlowField,
  precip01: number,
  intensityFactor: number,
  options: Pick<BuildSiMapRainFlowFieldOptions, 'infiltration01' | 'roughness01' | 'initialWater01'>,
  dt = 1,
): void {
  const stepH = Math.max(0.1, Math.min(2, dt));
  field.simulatedHours += stepH;
  stepSiFloodRaster(field.raster, {
    precip01,
    intensityFactor,
    infiltration01: options.infiltration01 ?? 0,
    roughness01: options.roughness01 ?? 0,
    initialWater01: options.initialWater01 ?? 0,
  }, stepH);

  const { cols, rows, raster, cells } = field;
  let ci = 0;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const i = idxFlood(cols, r, c);
      if (!raster.inside[i]) continue;
      const cell = cells[ci];
      if (!cell) break;
      ci += 1;
      const depth = raster.depth[i]!;
      cell.depth = depth;
      cell.pool = depth * 0.92;
      cell.flood = depth > 0.12 ? depth * 1.05 : 0;
      cell.velocity = raster.velocity[i]!;
      cell.risk = siFloodRiskFromDepth(depth);
    }
  }
}
