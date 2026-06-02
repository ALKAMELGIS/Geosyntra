import type { Map as MapboxMap } from 'mapbox-gl';

export const SI_FLOOD_RESULTS_LAYER_GROUP = 'Flood Simulation Results';

/** react-map-gl flood analysis overlays (SiMapFloodGeoLayers). */
export const SI_FLOOD_ANALYSIS_SOURCE_IDS = [
  'si-flood-bluespot',
  'si-flood-depth-poly',
  'si-flood-stream-net',
  'si-flood-flow-dir',
  'si-flood-velocity',
  'si-flood-risk',
] as const;

export const SI_FLOOD_ANALYSIS_LAYER_IDS = [
  'si-flood-bluespot-fill',
  'si-flood-depth-fill',
  'si-flood-stream-network-line',
  'si-flood-flow-dir-line',
  'si-flood-velocity-line',
  'si-flood-risk-fill',
] as const;

export type FloodResultLayerRef = {
  id?: string;
  layerGroup?: string;
  source?: string;
};

export function isSiFloodSimulationResultLayer(layer: FloodResultLayerRef): boolean {
  if (layer.layerGroup === SI_FLOOD_RESULTS_LAYER_GROUP) return true;
  if (layer.source === 'flood-simulation') return true;
  return Boolean(layer.id?.startsWith('flood-'));
}

/** Remove transient flood GeoJSON overlays from the Mapbox style (react-map-gl or stale mounts). */
export function clearSiFloodAnalysisMapLayers(map: MapboxMap | null | undefined): void {
  if (!map?.getStyle?.()) return;
  for (const layerId of SI_FLOOD_ANALYSIS_LAYER_IDS) {
    try {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
    } catch {
      /* layer removed mid-style rebuild */
    }
  }
  for (const sourceId of SI_FLOOD_ANALYSIS_SOURCE_IDS) {
    try {
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    } catch {
      /* source removed mid-style rebuild */
    }
  }
}
