import type { Map as MapboxMap } from 'mapbox-gl';
import type { SiSentinelHubRasterRunLite } from '../components/SiSentinelHubRasterLayers';
import { isSiMapDataLayerMutationFrozen } from './siMapRasterPipelineGuard';

export type SiMapWmsRasterApplyFn = (
  map: MapboxMap,
  runs: SiSentinelHubRasterRunLite[] | null,
  legacyTileUrl?: string | null,
) => void;

type BufferSnapshot = {
  sig: string;
  runs: SiSentinelHubRasterRunLite[] | null;
  legacyTileUrl: string | null;
};

let frontSig: string | null = null;
let backBuffer: BufferSnapshot | null = null;

function buildWmsRasterSyncSignature(
  runs: SiSentinelHubRasterRunLite[] | null | undefined,
  legacyTileUrl: string | null | undefined,
): string {
  const legacy = legacyTileUrl ?? '';
  if (!runs?.length) return `legacy:${legacy}`;
  return runs.map(r => `${r.aoiId}:${r.stackKey}:${r.tileUrl}`).join('|') + `|legacy:${legacy}`;
}

/**
 * Double-buffered WMS tile sync — writes to the back buffer while frozen, swaps on flush.
 * Front buffer (GPU-mounted tiles) stays immutable during pan/zoom/hover.
 */
export function applySiMapWmsRasterDoubleBuffered(
  map: MapboxMap,
  runs: SiSentinelHubRasterRunLite[] | null | undefined,
  legacyTileUrl: string | null | undefined,
  apply: SiMapWmsRasterApplyFn,
): void {
  const sig = buildWmsRasterSyncSignature(runs, legacyTileUrl);
  const snapshot: BufferSnapshot = {
    sig,
    runs: runs ?? null,
    legacyTileUrl: legacyTileUrl ?? null,
  };

  if (isSiMapDataLayerMutationFrozen()) {
    backBuffer = snapshot;
    return;
  }

  if (sig === frontSig) return;
  apply(map, snapshot.runs, snapshot.legacyTileUrl);
  frontSig = sig;
  backBuffer = null;
}

/** Swap back buffer to front after camera / pointer pipeline unfreezes. */
export function flushSiMapWmsRasterDoubleBuffer(map: MapboxMap, apply: SiMapWmsRasterApplyFn): void {
  if (!backBuffer || isSiMapDataLayerMutationFrozen()) return;
  if (backBuffer.sig === frontSig) {
    backBuffer = null;
    return;
  }
  apply(map, backBuffer.runs, backBuffer.legacyTileUrl);
  frontSig = backBuffer.sig;
  backBuffer = null;
}

export function resetSiMapWmsRasterDoubleBufferForTests(): void {
  frontSig = null;
  backBuffer = null;
}
