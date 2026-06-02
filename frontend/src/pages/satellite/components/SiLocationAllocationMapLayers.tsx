import { Layer, Source } from 'react-map-gl/mapbox';
import type { FeatureCollection } from 'geojson';
import type { LaPoint } from '../utils/siLocationAllocationTypes';
import { buildLaInputPointsGeoJson } from '../utils/siLocationAllocationDataImport';
import {
  DEFAULT_LA_ALLOCATION_SYMBOLOGY,
  laLineDashArray,
  laGlowLineWidth,
  laMainLineWidth,
  laLabelTextSizeRamp,
  type LaAllocationSymbology,
} from '../utils/siLocationAllocationSymbology';
import type { LaServiceAreaSymbology } from '../utils/siLocationAllocationServiceAreas';

export type SiLocationAllocationMapLayersProps = {
  active: boolean;
  inputFacilities: LaPoint[];
  inputDemand: LaPoint[];
  showInputPoints: boolean;
  facilitiesGj: FeatureCollection | null;
  demandGj: FeatureCollection | null;
  linksGj: FeatureCollection | null;
  serviceAreasGj?: FeatureCollection | null;
  serviceAreaSymbology?: LaServiceAreaSymbology;
  servedDemandIds?: string[];
  symbology?: LaAllocationSymbology;
  selectedLinkId?: string | null;
};

const CLUSTER_MAX_ZOOM = 14;
const CLUSTER_RADIUS = 48;

function clusterLayers(sourceId: string, pointColor: string, strokeColor: string, labelFontSize: number) {
  const countSize = Math.max(9, Math.min(14, labelFontSize + 1));
  return (
    <>
      <Layer
        id={`${sourceId}-cluster`}
        type="circle"
        source={sourceId}
        filter={['has', 'point_count']}
        paint={{
          'circle-color': pointColor,
          'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 50, 22],
          'circle-stroke-width': 2,
          'circle-stroke-color': strokeColor,
          'circle-opacity': 0.92,
        }}
      />
      <Layer
        id={`${sourceId}-cluster-count`}
        type="symbol"
        source={sourceId}
        filter={['has', 'point_count']}
        layout={{
          'text-field': '{point_count_abbreviated}',
          'text-size': countSize,
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
        }}
        paint={{ 'text-color': '#ffffff' }}
      />
      <Layer
        id={`${sourceId}-point`}
        type="circle"
        source={sourceId}
        filter={['!', ['has', 'point_count']]}
        paint={{
          'circle-color': pointColor,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 4, 10, 6, 14, 8],
          'circle-stroke-width': 2,
          'circle-stroke-color': strokeColor,
          'circle-opacity': 0.95,
        }}
      />
      <Layer
        id={`${sourceId}-label`}
        type="symbol"
        source={sourceId}
        filter={['!', ['has', 'point_count']]}
        layout={{
          'text-field': ['coalesce', ['get', 'label'], '•'],
          'text-size': laLabelTextSizeRamp(labelFontSize) as any,
          'text-offset': [0, 1.2],
          'text-anchor': 'top',
          'text-optional': true,
          'text-allow-overlap': false,
          'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
        }}
        paint={{
          'text-color': '#f8fafc',
          'text-halo-color': 'rgba(0,0,0,0.75)',
          'text-halo-width': 1.2,
        }}
      />
    </>
  );
}

export function SiLocationAllocationMapLayers({
  active,
  inputFacilities,
  inputDemand,
  showInputPoints,
  facilitiesGj,
  demandGj,
  linksGj,
  serviceAreasGj = null,
  serviceAreaSymbology,
  servedDemandIds = [],
  symbology = DEFAULT_LA_ALLOCATION_SYMBOLOGY,
  selectedLinkId = null,
}: SiLocationAllocationMapLayersProps) {
  if (!active) return null;

  const sym = symbology;
  const labelFontSize = sym.labelFontSize ?? DEFAULT_LA_ALLOCATION_SYMBOLOGY.labelFontSize;
  const saSym = serviceAreaSymbology;
  const servedSet = new Set(servedDemandIds);
  const dash = laLineDashArray(sym.lineStyle);
  const sel = selectedLinkId ?? '__none__';
  const inputFacGj = buildLaInputPointsGeoJson(inputFacilities, 'la-input-facility');
  const inputDemGj = buildLaInputPointsGeoJson(inputDemand, 'la-input-demand');
  const hasResults = Boolean(linksGj?.features?.length);

  const lineGlowPaint: Record<string, unknown> = {
    'line-color': sym.glowColor,
    'line-width': [
      'case',
      ['==', ['get', 'linkId'], sel],
      laGlowLineWidth(sym, true),
      laGlowLineWidth(sym, false),
    ],
    'line-opacity': sym.lineOpacity * sym.glowIntensity * 0.55,
    'line-blur': sym.glowIntensity * 2.5,
  };
  const lineMainPaint: Record<string, unknown> = {
    'line-color': sym.lineColor,
    'line-width': [
      'case',
      ['==', ['get', 'linkId'], sel],
      laMainLineWidth(sym, true),
      laMainLineWidth(sym, false),
    ],
    'line-opacity': sym.lineOpacity,
  };
  if (dash) lineMainPaint['line-dasharray'] = dash;

  const demandColorExpr =
    servedSet.size > 0
      ? (() => {
          const match: unknown[] = ['match', ['get', 'demandId']];
          for (const id of servedSet) match.push(id, '#22c55e');
          match.push('#ef4444');
          return match;
        })()
      : '#ef4444';

  return (
    <>
      {serviceAreasGj && saSym ? (
        <Source id="si-la-service-areas" type="geojson" data={serviceAreasGj as any}>
          <Layer
            id="si-la-service-fill"
            type="fill"
            filter={['==', ['get', 'role'], 'la-service-area']}
            paint={{
              'fill-color': saSym.fillColor,
              'fill-opacity': saSym.fillOpacity,
            }}
          />
          <Layer
            id="si-la-service-line"
            type="line"
            filter={['==', ['get', 'role'], 'la-service-area']}
            paint={{
              'line-color': saSym.borderColor,
              'line-width': saSym.borderWidth,
              'line-opacity': Math.min(1, saSym.fillOpacity + 0.35),
            }}
          />
        </Source>
      ) : null}

      {showInputPoints && !hasResults && inputFacilities.length > 0 ? (
        <Source
          id="si-la-input-facilities"
          type="geojson"
          data={inputFacGj as any}
          cluster
          clusterMaxZoom={CLUSTER_MAX_ZOOM}
          clusterRadius={CLUSTER_RADIUS}
        >
          {clusterLayers('si-la-input-facilities', '#0f172a', '#ffffff', labelFontSize)}
        </Source>
      ) : null}

      {showInputPoints && !hasResults && inputDemand.length > 0 ? (
        <Source
          id="si-la-input-demand"
          type="geojson"
          data={inputDemGj as any}
          cluster
          clusterMaxZoom={CLUSTER_MAX_ZOOM}
          clusterRadius={CLUSTER_RADIUS}
        >
          {clusterLayers('si-la-input-demand', '#dc2626', '#ffffff', labelFontSize)}
        </Source>
      ) : null}

      {facilitiesGj ? (
        <Source id="si-la-facilities" type="geojson" data={facilitiesGj as any}>
          <Layer
            id="si-la-facility-existing"
            type="circle"
            filter={['==', ['get', 'facilityRole'], 'existing']}
            paint={{
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 5, 12, 9],
              'circle-color': '#0f172a',
              'circle-stroke-width': 2.5,
              'circle-stroke-color': '#ffffff',
            }}
          />
          <Layer
            id="si-la-facility-new"
            type="circle"
            filter={['==', ['get', 'facilityRole'], 'new-optimal']}
            paint={{
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 6, 12, 10],
              'circle-color': '#2563eb',
              'circle-stroke-width': 3,
              'circle-stroke-color': '#fde047',
            }}
          />
          <Layer
            id="si-la-facility-label"
            type="symbol"
            filter={[
              'any',
              ['==', ['get', 'facilityRole'], 'existing'],
              ['==', ['get', 'facilityRole'], 'new-optimal'],
            ]}
            layout={{
              'text-field': ['get', 'label'],
              'text-size': laLabelTextSizeRamp(labelFontSize) as any,
              'text-offset': [0, 1.3],
              'text-anchor': 'top',
              'text-optional': true,
              'text-allow-overlap': false,
            }}
            paint={{
              'text-color': '#ffffff',
              'text-halo-color': 'rgba(0,0,0,0.8)',
              'text-halo-width': 1.2,
            }}
          />
        </Source>
      ) : null}

      {demandGj ? (
        <Source id="si-la-demand" type="geojson" data={demandGj as any}>
          <Layer
            id="si-la-demand-point"
            type="circle"
            filter={['==', ['get', 'role'], 'la-demand']}
            paint={{
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 4, 12, 7],
              'circle-color': demandColorExpr as any,
              'circle-stroke-width': 2,
              'circle-stroke-color': '#ffffff',
            }}
          />
          <Layer
            id="si-la-demand-label"
            type="symbol"
            filter={['==', ['get', 'role'], 'la-demand']}
            layout={{
              'text-field': ['get', 'label'],
              'text-size': laLabelTextSizeRamp(labelFontSize) as any,
              'text-offset': [0, 1.2],
              'text-anchor': 'top',
              'text-optional': true,
            }}
            paint={{
              'text-color': '#fecaca',
              'text-halo-color': 'rgba(0,0,0,0.75)',
              'text-halo-width': 1,
            }}
          />
        </Source>
      ) : null}

      {linksGj ? (
        <Source id="si-la-links" type="geojson" data={linksGj as any} lineMetrics>
          <Layer
            id="si-la-allocation-link-glow"
            type="line"
            filter={['==', ['get', 'role'], 'la-allocation-link']}
            paint={lineGlowPaint as any}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          />
          <Layer
            id="si-la-allocation-link"
            type="line"
            filter={['==', ['get', 'role'], 'la-allocation-link']}
            paint={lineMainPaint as any}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          />
        </Source>
      ) : null}
    </>
  );
}
