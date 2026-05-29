import type { FeatureCollection, LineString } from 'geojson';
import type { SiRainFlowField } from './siMapRainFlowField';

const D8_DX = [0, 1, 1, 1, 0, -1, -1, -1];
const D8_DY = [-1, -1, 0, 1, 1, 1, 0, -1];

function flowDirSegment(
  lng: number,
  lat: number,
  dir: number,
  meters = 0.00018,
): LineString | null {
  if (dir < 0 || dir > 7) return null;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const dLng = (D8_DX[dir]! * meters) / Math.max(0.35, cosLat);
  const dLat = D8_DY[dir]! * meters;
  return {
    type: 'LineString',
    coordinates: [
      [lng, lat],
      [lng + dLng, lat + dLat],
    ],
  };
}

export type SiFloodGeoJsonBundle = {
  depth: FeatureCollection;
  flowDir: FeatureCollection;
  accumulation: FeatureCollection;
  risk: FeatureCollection;
  velocity: FeatureCollection;
};

export function buildSiFloodGeoJsonBundle(field: SiRainFlowField | null): SiFloodGeoJsonBundle | null {
  if (!field?.cells.length) return null;

  const depthFeatures: FeatureCollection['features'] = [];
  const flowFeatures: FeatureCollection['features'] = [];
  const accFeatures: FeatureCollection['features'] = [];
  const riskFeatures: FeatureCollection['features'] = [];
  const velocityFeatures: FeatureCollection['features'] = [];

  const maxAcc = Math.max(1, ...field.cells.map(c => c.accumulation));

  for (const cell of field.cells) {
    if (cell.depth < 0.04) continue;
    depthFeatures.push({
      type: 'Feature',
      properties: { role: 'flood-depth', depth: cell.depth, pool: cell.pool },
      geometry: { type: 'Point', coordinates: [cell.lng, cell.lat] },
    });

    if (cell.flowDir >= 0 && cell.depth > 0.08) {
      const geom = flowDirSegment(cell.lng, cell.lat, cell.flowDir, 0.00014 + cell.velocity * 0.00012);
      if (geom) {
        flowFeatures.push({
          type: 'Feature',
          properties: {
            role: 'flow-direction',
            flowDir: cell.flowDir,
            depth: cell.depth,
            velocity: cell.velocity,
          },
          geometry: geom,
        });
      }
    }

    if (cell.accumulation > 1) {
      accFeatures.push({
        type: 'Feature',
        properties: {
          role: 'flow-accumulation',
          accumulation: cell.accumulation,
          accNorm: cell.accumulation / maxAcc,
        },
        geometry: { type: 'Point', coordinates: [cell.lng, cell.lat] },
      });
    }

    if (cell.risk !== 'low' || cell.depth > 0.12) {
      riskFeatures.push({
        type: 'Feature',
        properties: { role: 'flood-risk', risk: cell.risk, depth: cell.depth },
        geometry: { type: 'Point', coordinates: [cell.lng, cell.lat] },
      });
    }

    if (cell.velocity > 0.08 && cell.depth > 0.06) {
      velocityFeatures.push({
        type: 'Feature',
        properties: { role: 'flow-velocity', velocity: cell.velocity, depth: cell.depth },
        geometry: { type: 'Point', coordinates: [cell.lng, cell.lat] },
      });
    }
  }

  const empty: FeatureCollection = { type: 'FeatureCollection', features: [] };
  return {
    depth: { type: 'FeatureCollection', features: depthFeatures },
    flowDir: { type: 'FeatureCollection', features: flowFeatures },
    accumulation: { type: 'FeatureCollection', features: accFeatures },
    risk: { type: 'FeatureCollection', features: riskFeatures },
    velocity: { type: 'FeatureCollection', features: velocityFeatures },
  };
}
