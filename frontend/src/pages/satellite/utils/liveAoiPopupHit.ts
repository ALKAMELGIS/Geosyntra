import { pointInPolygonGeometry } from '../drawingUtils';
import type { LiveAoiPopupRowRef } from './liveAoiPopupAnchor';

export type LiveAoiFieldRowRef = {
  id: string;
  name: string;
  geometry: GeoJSON.Geometry;
};

export type LiveAoiPopupHit = {
  feature: GeoJSON.Feature;
  aoiKey: string;
  rowId?: string;
  label: string;
};

function geometryContainsPoint(lng: number, lat: number, geometry: GeoJSON.Geometry | null | undefined): boolean {
  if (!geometry || typeof geometry !== 'object') return false;
  if (geometry.type === 'Polygon') {
    return pointInPolygonGeometry(lng, lat, geometry as { type: string; coordinates: number[][][] });
  }
  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.some(poly =>
      pointInPolygonGeometry(lng, lat, { type: 'Polygon', coordinates: poly as number[][][] }),
    );
  }
  return false;
}

function featureFromGeometry(geometry: GeoJSON.Geometry): GeoJSON.Feature {
  return { type: 'Feature', properties: {}, geometry };
}

function aoiKeyForFeature(feature: GeoJSON.Feature, fallbackId: string): string {
  try {
    return JSON.stringify(feature);
  } catch {
    return fallbackId;
  }
}

/**
 * Resolve which AOI polygon contains the map click (workspace rows, drawn AOI, or field AOIs).
 */
export function hitTestLiveAoiAtClick(
  lng: number,
  lat: number,
  opts: {
    multiRows: readonly LiveAoiPopupRowRef[];
    drawnFeature: GeoJSON.Feature | null | undefined;
    fieldRows: readonly LiveAoiFieldRowRef[];
    selectedFieldId?: string | null;
  },
): LiveAoiPopupHit | null {
  for (const row of opts.multiRows) {
    const g = row.feature?.geometry;
    if (g && geometryContainsPoint(lng, lat, g) && row.feature) {
      return {
        feature: row.feature,
        aoiKey: aoiKeyForFeature(row.feature, row.id),
        rowId: row.id,
        label: row.name ?? 'AOI',
      };
    }
  }

  const drawn = opts.drawnFeature;
  const drawnGeom = drawn?.geometry;
  if (drawn && drawnGeom && geometryContainsPoint(lng, lat, drawnGeom)) {
    return {
      feature: drawn,
      aoiKey: aoiKeyForFeature(drawn, '__drawn'),
      rowId: '__drawn',
      label: String((drawn.properties as { label?: string })?.label ?? 'Drawn AOI'),
    };
  }

  const orderedFields: LiveAoiFieldRowRef[] = [];
  if (opts.selectedFieldId) {
    const sel = opts.fieldRows.find(f => f.id === opts.selectedFieldId);
    if (sel) orderedFields.push(sel);
  }
  for (const f of opts.fieldRows) {
    if (!orderedFields.some(x => x.id === f.id)) orderedFields.push(f);
  }

  for (const f of orderedFields) {
    if (geometryContainsPoint(lng, lat, f.geometry)) {
      const feature = featureFromGeometry(f.geometry);
      return {
        feature,
        aoiKey: aoiKeyForFeature(feature, f.id),
        rowId: f.id,
        label: f.name,
      };
    }
  }

  return null;
}
