/** shpjs may return a FeatureCollection, a Feature, a Geometry, or an object map of layer name → GeoJSON. */
export function mergeShpLikeToFeatureCollection(geo: unknown): { type: 'FeatureCollection'; features: any[] } {
  if (!geo || typeof geo !== 'object') return { type: 'FeatureCollection', features: [] };
  const g = geo as any;
  if (g.type === 'GeometryCollection' && Array.isArray(g.geometries)) {
    const feats = g.geometries
      .filter((geom: any) => geom && typeof geom === 'object')
      .map((geom: any) => ({ type: 'Feature', properties: {}, geometry: geom }));
    return mergeShpLikeToFeatureCollection({ type: 'FeatureCollection', features: feats });
  }
  if (g.type === 'FeatureCollection' && Array.isArray(g.features)) {
    return { type: 'FeatureCollection', features: g.features.filter(Boolean) };
  }
  if (g.type === 'Feature') {
    return { type: 'FeatureCollection', features: [g] };
  }
  if (typeof g.type === 'string' && g.type.endsWith('Polygon') && g.coordinates) {
    return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: g }] };
  }
  if (
    typeof g.type === 'string' &&
    (g.type === 'LineString' ||
      g.type === 'Point' ||
      g.type === 'MultiPolygon' ||
      g.type === 'MultiLineString' ||
      g.type === 'MultiPoint')
  ) {
    return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: g }] };
  }
  const features: any[] = [];
  for (const v of Object.values(geo as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const o = v as any;
    if (o.type === 'FeatureCollection' && Array.isArray(o.features)) {
      features.push(...o.features.filter(Boolean));
    } else if (o.type === 'Feature') {
      features.push(o);
    }
  }
  return { type: 'FeatureCollection', features };
}
