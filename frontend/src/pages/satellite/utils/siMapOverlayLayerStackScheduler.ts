import type { Map as MapboxMap } from 'mapbox-gl';
import { syncSiMapOverlayLayerStack } from './siMapCustomVectorLayerStack';
import { isSiMapCameraInteracting } from './siMapLayerCameraSyncGuard';

const stackOrderSigByMap = new WeakMap<MapboxMap, string>();
const rafHandleByMap = new WeakMap<MapboxMap, number>();
const idleHandleByMap = new WeakMap<MapboxMap, number>();
const pendingForceByMap = new WeakMap<MapboxMap, boolean>();

function readStackOrderSignature(map: MapboxMap): string {
  try {
    const layers = map.getStyle()?.layers ?? [];
    return layers.map(l => l.id).join('|');
  } catch {
    return '';
  }
}

function flushOverlayLayerStackSync(map: MapboxMap, force = false): void {
  if (!map.getStyle?.()) return;
  const sig = readStackOrderSignature(map);
  if (!force && stackOrderSigByMap.get(map) === sig) return;

  try {
    syncSiMapOverlayLayerStack(map);
    map.triggerRepaint?.();
    stackOrderSigByMap.set(map, readStackOrderSignature(map));
  } catch (e) {
    console.warn('[si-map] overlay stack sync failed', e);
  }
}

function cancelScheduledOverlayStackSync(map: MapboxMap): void {
  const raf = rafHandleByMap.get(map);
  if (raf != null) {
    cancelAnimationFrame(raf);
    rafHandleByMap.delete(map);
  }
  const idle = idleHandleByMap.get(map);
  if (idle != null && typeof window !== 'undefined') {
    if ('cancelIdleCallback' in window) {
      window.cancelIdleCallback(idle);
    } else {
      window.clearTimeout(idle);
    }
    idleHandleByMap.delete(map);
  }
}

/** Debounced, signature-gated layer Z-order sync — safe during pan/zoom. */
export function scheduleSiMapOverlayLayerStackSync(
  map: MapboxMap | null,
  opts?: { force?: boolean; immediate?: boolean; deferMs?: number },
): void {
  if (!map) return;
  if (opts?.immediate) {
    cancelScheduledOverlayStackSync(map);
    pendingForceByMap.delete(map);
    flushOverlayLayerStackSync(map, opts.force === true);
    return;
  }

  if (opts?.force) pendingForceByMap.set(map, true);

  if (rafHandleByMap.has(map)) return;

  const deferMs = opts?.deferMs ?? (isSiMapCameraInteracting() ? 160 : 48);
  const run = () => {
    rafHandleByMap.delete(map);
    const force = pendingForceByMap.get(map) === true;
    pendingForceByMap.delete(map);

    if (isSiMapCameraInteracting() && !force) {
      scheduleSiMapOverlayLayerStackSync(map, { force, deferMs: 140 });
      return;
    }

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window && !force) {
      const idle = window.requestIdleCallback(
        () => {
          idleHandleByMap.delete(map);
          flushOverlayLayerStackSync(map, force);
        },
        { timeout: Math.max(deferMs, 120) },
      );
      idleHandleByMap.set(map, idle);
      return;
    }

    window.setTimeout(() => flushOverlayLayerStackSync(map, force), deferMs);
  };

  rafHandleByMap.set(map, requestAnimationFrame(run));
}

export function cancelSiMapOverlayLayerStackSync(map: MapboxMap | null): void {
  if (!map) return;
  cancelScheduledOverlayStackSync(map);
  pendingForceByMap.delete(map);
  stackOrderSigByMap.delete(map);
}

export function resetSiMapOverlayLayerStackSyncForTests(map?: MapboxMap): void {
  if (map) cancelSiMapOverlayLayerStackSync(map);
}
