export type PixelRect = { x: number; y: number; width: number; height: number };

export type GeoBounds = { west: number; south: number; east: number; north: number };

export type ImageSize = { width: number; height: number };

/**
 * Map flat pixel coordinates to geographic bounds (north-up, EPSG:4326).
 * Used when AI inference returns detections in image pixel space.
 */
export function pixelRectToGeoBounds(
  rect: PixelRect,
  imageSize: ImageSize,
  geoBounds: GeoBounds,
): GeoBounds {
  const iw = Math.max(1, imageSize.width);
  const ih = Math.max(1, imageSize.height);
  const x0 = Math.max(0, Math.min(iw, rect.x));
  const y0 = Math.max(0, Math.min(ih, rect.y));
  const x1 = Math.max(0, Math.min(iw, rect.x + rect.width));
  const y1 = Math.max(0, Math.min(ih, rect.y + rect.height));
  const lonSpan = geoBounds.east - geoBounds.west;
  const latSpan = geoBounds.north - geoBounds.south;
  return {
    west: geoBounds.west + (x0 / iw) * lonSpan,
    east: geoBounds.west + (x1 / iw) * lonSpan,
    north: geoBounds.north - (y0 / ih) * latSpan,
    south: geoBounds.north - (y1 / ih) * latSpan,
  };
}

export function pixelPointToLngLat(
  x: number,
  y: number,
  imageSize: ImageSize,
  geoBounds: GeoBounds,
): [number, number] {
  const b = pixelRectToGeoBounds({ x, y, width: 0, height: 0 }, imageSize, geoBounds);
  return [b.west, b.north];
}

export function geoBoundsToPolygonFeature(
  bounds: GeoBounds,
  properties: Record<string, unknown> = {},
): GeoJSON.Feature<GeoJSON.Polygon> {
  const { west, south, east, north } = bounds;
  return {
    type: 'Feature',
    properties,
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [west, south],
          [east, south],
          [east, north],
          [west, north],
          [west, south],
        ],
      ],
    },
  };
}

/** Batch-convert pixel-space detection boxes to GeoJSON features. */
export function pixelDetectionsToGeoJson(
  detections: Array<{ x: number; y: number; width: number; height: number; className?: string; score?: number }>,
  imageSize: ImageSize,
  geoBounds: GeoBounds,
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: detections.map((d, i) => {
      const bounds = pixelRectToGeoBounds(
        { x: d.x, y: d.y, width: d.width, height: d.height },
        imageSize,
        geoBounds,
      );
      return geoBoundsToPolygonFeature(bounds, {
        id: i,
        class: d.className ?? 'detection',
        confidence: d.score ?? null,
      });
    }),
  };
}
