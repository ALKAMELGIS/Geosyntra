import { useMemo } from 'react';
import { Layer, Source } from 'react-map-gl/mapbox';
import { buildSiFloodGeoJsonBundle } from '../utils/siMapFloodGeoJson';
import type { SiRainFlowField } from '../utils/siMapRainFlowField';
import type { SiMapWeatherSettings } from '../utils/siMapWeatherTypes';

export type SiMapFloodGeoLayersProps = {
  field: SiRainFlowField | null;
  settings: SiMapWeatherSettings;
  active: boolean;
};

/**
 * Optional debug overlays only — primary flood view is the canvas hydrologic surface
 * (no point/circle scatter; ArcGIS-style continuous streamflow).
 */
export function SiMapFloodGeoLayers({ field, settings, active }: SiMapFloodGeoLayersProps) {
  const bundle = useMemo(() => buildSiFloodGeoJsonBundle(field), [field]);

  if (
    !active ||
    !settings.rainFlowEnabled ||
    !settings.floodAnalysisMapLayers ||
    !bundle
  ) {
    return null;
  }

  const anyLayer =
    settings.floodShowDepth ||
    settings.floodShowFlowDir ||
    settings.floodShowAccumulation;

  if (!anyLayer) return null;

  return (
    <>
      {settings.floodShowFlowDir && bundle.flowDir.features.length ? (
        <Source id="si-flood-flow-dir" type="geojson" data={bundle.flowDir as any}>
          <Layer
            id="si-flood-flow-dir-line"
            type="line"
            paint={{
              'line-color': '#67e8f9',
              'line-width': ['interpolate', ['linear'], ['get', 'velocity'], 0, 1, 1, 2.5] as any,
              'line-opacity': 0.75,
            }}
          />
        </Source>
      ) : null}

      {settings.floodShowDepth && bundle.flowDir.features.length ? (
        <Source id="si-flood-depth-lines" type="geojson" data={bundle.flowDir as any}>
          <Layer
            id="si-flood-depth-line-glow"
            type="line"
            paint={{
              'line-color': '#2563eb',
              'line-width': 3,
              'line-opacity': 0.35,
              'line-blur': 1,
            }}
          />
        </Source>
      ) : null}

      {settings.floodShowAccumulation && bundle.flowDir.features.length ? (
        <Source id="si-flood-accum-line" type="geojson" data={bundle.flowDir as any}>
          <Layer
            id="si-flood-accumulation-line"
            type="line"
            paint={{
              'line-color': '#22d3ee',
              'line-width': 1.5,
              'line-opacity': 0.5,
              'line-dasharray': [2, 2] as any,
            }}
          />
        </Source>
      ) : null}
    </>
  );
}
