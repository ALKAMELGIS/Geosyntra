type WorkerResult =
  | { requestId: string; ok: true; geojson: unknown; featureCount: number }
  | { requestId: string; ok: false; error: string };

let worker: Worker | null = null;
let nextRequestId = 0;
const pending = new Map<
  string,
  { resolve: (value: WorkerResult) => void; reject: (reason?: unknown) => void }
>();

function ensureWorker(): Worker | null {
  if (typeof Worker === 'undefined' || typeof Blob === 'undefined') return null;
  if (worker) return worker;

  const code = `
self.onmessage = function(e) {
  var requestId = e.data.requestId;
  try {
    var geojson = e.data.geojson;
    var clone = JSON.parse(JSON.stringify(geojson));
    var features = clone && clone.features;
    var featureCount = Array.isArray(features) ? features.length : 0;
    self.postMessage({ requestId: requestId, ok: true, geojson: clone, featureCount: featureCount });
  } catch (err) {
    self.postMessage({ requestId: requestId, ok: false, error: String(err) });
  }
};
`;
  try {
    const blob = new Blob([code], { type: 'application/javascript' });
    worker = new Worker(URL.createObjectURL(blob));
    worker.onmessage = (ev: MessageEvent<WorkerResult>) => {
      const slot = pending.get(ev.data.requestId);
      if (!slot) return;
      pending.delete(ev.data.requestId);
      slot.resolve(ev.data);
    };
    worker.onerror = () => {
      /* fall back to main thread on next call */
      worker = null;
    };
  } catch {
    worker = null;
  }
  return worker;
}

/** Deep-clone + count GeoJSON off the main thread (falls back synchronously). */
export async function prepareGeoJsonInBackground(
  geojson: unknown,
): Promise<{ geojson: unknown; featureCount: number }> {
  const w = ensureWorker();
  const fc =
    geojson && typeof geojson === 'object' && Array.isArray((geojson as { features?: unknown[] }).features)
      ? (geojson as { features: unknown[] }).features.length
      : 0;

  if (!w || fc === 0) {
    return {
      geojson: fc > 0 ? JSON.parse(JSON.stringify(geojson)) : geojson,
      featureCount: fc,
    };
  }

  const requestId = `gj-${++nextRequestId}`;
  const result = await new Promise<WorkerResult>((resolve, reject) => {
    pending.set(requestId, { resolve, reject });
    w.postMessage({ requestId, geojson });
  });

  if (!result.ok) {
    return {
      geojson: JSON.parse(JSON.stringify(geojson)),
      featureCount: fc,
    };
  }
  return { geojson: result.geojson, featureCount: result.featureCount };
}

export function terminateSiMapLayerGeoJsonWorker(): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  pending.clear();
}
