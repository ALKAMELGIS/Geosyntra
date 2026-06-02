import { siAoiReportFeatureBBoxLngLat } from './siAoiReportGeo';

export type LiveAoiPopupAnchorSource = 'click' | 'centroid';

export type LiveAoiPopupAnchor = {
  lng: number;
  lat: number;
  source: LiveAoiPopupAnchorSource;
};

export type LiveAoiPopupClickRecord = {
  lng: number;
  lat: number;
  aoiKey: string;
  /** Workspace row id for MPC raster lookup (`__drawn` for lone polygon). */
  rowId?: string;
};

export type LiveAoiPopupRowRef = {
  id: string;
  name?: string;
  feature?: GeoJSON.Feature | null;
};

/** Resolve which AOI row was clicked (multi-AOI or single drawn polygon). */
export function resolveLiveAoiRowFromClick(
  click: LiveAoiPopupClickRecord | null | undefined,
  rows: readonly LiveAoiPopupRowRef[],
  fallbackRowId: string | null | undefined,
): LiveAoiPopupRowRef | null {
  if (!rows.length) return null;
  if (click?.rowId) {
    const byId = rows.find(r => r.id === click.rowId);
    if (byId) return byId;
  }
  if (click?.aoiKey) {
    const byKey = rows.find(r => {
      if (!r.feature) return false;
      try {
        return JSON.stringify(r.feature) === click.aoiKey;
      } catch {
        return r.id === click.aoiKey;
      }
    });
    if (byKey) return byKey;
  }
  if (fallbackRowId) {
    return rows.find(r => r.id === fallbackRowId) ?? rows[0] ?? null;
  }
  return rows[0] ?? null;
}

/** Bbox-center centroid — matches Satellite map AOI popup behaviour. */
export function featureCentroidLngLat(feature: GeoJSON.Feature): [number, number] | null {
  const bounds = siAoiReportFeatureBBoxLngLat(feature);
  if (!bounds) return null;
  return [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
}

/**
 * Priority: last in-AOI click for this AOI key → otherwise AOI centroid.
 */
export function resolveLiveAoiPopupAnchor(
  feature: GeoJSON.Feature | null | undefined,
  aoiKey: string | null | undefined,
  lastClick: LiveAoiPopupClickRecord | null | undefined,
): LiveAoiPopupAnchor | null {
  if (!feature?.geometry || !aoiKey) return null;
  if (lastClick && lastClick.aoiKey === aoiKey) {
    return { lng: lastClick.lng, lat: lastClick.lat, source: 'click' };
  }
  const centroid = featureCentroidLngLat(feature);
  if (!centroid) return null;
  return { lng: centroid[0], lat: centroid[1], source: 'centroid' };
}

export function clampPopupWithinRect(
  left: number,
  top: number,
  width: number,
  height: number,
  containerWidth: number,
  containerHeight: number,
  margin = 8,
): { left: number; top: number } {
  const maxLeft = Math.max(margin, containerWidth - width - margin);
  const maxTop = Math.max(margin, containerHeight - height - margin);
  return {
    left: Math.min(maxLeft, Math.max(margin, left)),
    top: Math.min(maxTop, Math.max(margin, top)),
  };
}
