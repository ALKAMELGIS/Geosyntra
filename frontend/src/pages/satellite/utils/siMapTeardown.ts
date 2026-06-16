import type { Map as MapboxMap } from 'mapbox-gl';
import { cancelScheduledGentleCustomLayersMapSync } from './siMapLayerRuntime';
import { terminateSiMapLayerGeoJsonWorker } from './siMapLayerGeoJsonWorkerClient';
import { uninstallSiMapLayerCameraSyncGuard } from './siMapLayerCameraSyncGuard';
import { uninstallSiMap3dTerrainCameraPerformance } from './siMap3dTerrainCameraPerformance';
import { cancelSiMapOverlayLayerStackSync } from './siMapOverlayLayerStackScheduler';
import { stopSiMapPerformanceMonitor } from './siMapPerformanceMonitor';

/** Central map teardown — release listeners, workers, schedulers, and WebGL context. */
export function teardownSiMapInstance(map: MapboxMap | null | undefined): void {
  cancelScheduledGentleCustomLayersMapSync();
  terminateSiMapLayerGeoJsonWorker();
  uninstallSiMapLayerCameraSyncGuard(map);
  uninstallSiMap3dTerrainCameraPerformance(map);
  if (map) {
    cancelSiMapOverlayLayerStackSync(map);
  }
  stopSiMapPerformanceMonitor();
}
