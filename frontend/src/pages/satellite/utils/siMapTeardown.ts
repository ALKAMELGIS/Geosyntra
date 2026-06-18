import type { Map as MapboxMap } from 'mapbox-gl';
import { cancelScheduledGentleCustomLayersMapSync } from './siMapLayerRuntime';
import { terminateSiMapLayerGeoJsonWorker } from './siMapLayerGeoJsonWorkerClient';
import { uninstallSiMapLayerCameraSyncGuard } from './siMapLayerCameraSyncGuard';
import { cancelSiMapOverlayLayerStackSync } from './siMapOverlayLayerStackScheduler';
import { stopSiMapPerformanceMonitor } from './siMapPerformanceMonitor';

/** Central map teardown — release listeners, workers, schedulers, and WebGL context. */
export function teardownSiMapInstance(map: MapboxMap | null | undefined): void {
  cancelScheduledGentleCustomLayersMapSync();
  terminateSiMapLayerGeoJsonWorker();
  uninstallSiMapLayerCameraSyncGuard(map);
  if (map) {
    cancelSiMapOverlayLayerStackSync(map);
  }
  stopSiMapPerformanceMonitor();
}
