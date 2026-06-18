import { Layer, Source } from 'react-map-gl/mapbox';
import type { FeatureCollection } from 'geojson';

export type SiVrpMapLayersProps = {
  active: boolean;
  geoJson: FeatureCollection | null;
};

export function SiVrpMapLayers({ active, geoJson }: SiVrpMapLayersProps) {
  if (!active || !geoJson?.features?.length) return null;

  return (
    <Source id="si-ors-vrp" type="geojson" data={geoJson as any}>
      <Layer
        id="si-ors-vrp-route-glow"
        type="line"
        filter={['==', ['get', 'role'], 'vrp-route']}
        paint={{
          'line-color': ['coalesce', ['get', 'color'], '#22c55e'],
          'line-width': 8,
          'line-opacity': 0.25,
          'line-blur': 2,
        }}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
      />
      <Layer
        id="si-ors-vrp-route"
        type="line"
        filter={['==', ['get', 'role'], 'vrp-route']}
        paint={{
          'line-color': ['coalesce', ['get', 'color'], '#22c55e'],
          'line-width': 4,
          'line-opacity': 0.92,
        }}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
      />
      <Layer
        id="si-ors-vrp-stop"
        type="circle"
        filter={['==', ['get', 'role'], 'vrp-stop']}
        paint={{
          'circle-color': ['coalesce', ['get', 'color'], '#3b82f6'],
          'circle-radius': 6,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.95,
        }}
      />
      <Layer
        id="si-ors-vrp-stop-label"
        type="symbol"
        filter={['==', ['get', 'role'], 'vrp-stop']}
        layout={{
          'text-field': ['concat', ['to-string', ['get', 'sequence']], '. ', ['get', 'label']],
          'text-size': 10,
          'text-offset': [0, 1.2],
          'text-anchor': 'top',
          'text-optional': true,
          'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
        }}
        paint={{
          'text-color': '#f8fafc',
          'text-halo-color': 'rgba(0,0,0,0.75)',
          'text-halo-width': 1.2,
        }}
      />
      <Layer
        id="si-ors-vrp-depot"
        type="circle"
        filter={['==', ['get', 'role'], 'vrp-depot']}
        paint={{
          'circle-color': '#ffffff',
          'circle-radius': 8,
          'circle-stroke-width': 3,
          'circle-stroke-color': '#22c55e',
          'circle-opacity': 1,
        }}
      />
      <Layer
        id="si-ors-vrp-depot-label"
        type="symbol"
        filter={['==', ['get', 'role'], 'vrp-depot']}
        layout={{
          'text-field': ['coalesce', ['get', 'label'], 'Depot'],
          'text-size': 11,
          'text-offset': [0, 1.4],
          'text-anchor': 'top',
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
        }}
        paint={{
          'text-color': '#ffffff',
          'text-halo-color': 'rgba(0,0,0,0.8)',
          'text-halo-width': 1.4,
        }}
      />
    </Source>
  );
}
