export type SiIfcGeoref = {
  georeferenced: boolean;
  originLng: number;
  originLat: number;
  eastings: number;
  northings: number;
  orthogonalHeight: number;
  rotationRad: number;
  scale: number;
  crsHint?: string;
};

export function parseIfcSchemaFromHeader(headerText: string): import('./siIfcBimTypes').SiIfcSchema {
  const upper = headerText.toUpperCase();
  if (upper.includes('IFC4X3_ADD2')) return 'IFC4X3_ADD2';
  if (upper.includes('IFC4X3')) return 'IFC4X3';
  if (upper.includes('IFC4X2')) return 'IFC4X2';
  if (upper.includes('IFC4X1')) return 'IFC4X1';
  if (upper.includes('IFC4')) return 'IFC4';
  if (upper.includes('IFC2X3')) return 'IFC2X3';
  if (upper.includes('IFC2X2')) return 'IFC2X2';
  if (upper.includes('IFC2X_FINAL')) return 'IFC2X_FINAL';
  if (upper.includes('IFC2X3_FINAL')) return 'IFC2X3_FINAL';
  if (upper.includes('IFC2X2_FINAL')) return 'IFC2X2_FINAL';
  return 'unknown';
}

export function normalizeLiveIfcSchema(raw: string): import('./siIfcBimTypes').SiIfcSchema {
  const u = raw.toUpperCase();
  if (u.includes('IFC4X3')) return u.includes('ADD2') ? 'IFC4X3_ADD2' : 'IFC4X3';
  if (u.includes('IFC4X2')) return 'IFC4X2';
  if (u.includes('IFC4X1')) return 'IFC4X1';
  if (u.includes('IFC4')) return 'IFC4';
  if (u.includes('IFC2X3')) return 'IFC2X3';
  if (u.includes('IFC2X2')) return 'IFC2X2';
  if (u.includes('IFC2X')) return 'IFC2X_FINAL';
  return 'unknown';
}

/** IFC compound angle [deg, min, sec, micro] → decimal degrees. */
export function ifcAngleToDegrees(parts: unknown): number | null {
  if (!Array.isArray(parts) || parts.length < 3) return null;
  const deg = Number(parts[0]);
  const min = Number(parts[1]);
  const sec = Number(parts[2]);
  const micro = parts.length > 3 ? Number(parts[3]) : 0;
  if (![deg, min, sec, micro].every(n => Number.isFinite(n))) return null;
  const sign = deg < 0 ? -1 : 1;
  return sign * (Math.abs(deg) + min / 60 + sec / 3600 + micro / 3.6e9);
}

export function enToWgs84Approx(
  east: number,
  north: number,
  refLng: number,
  refLat: number,
): [number, number] {
  const metersPerDegLat = 111_320;
  const metersPerDegLng = 111_320 * Math.cos((refLat * Math.PI) / 180);
  return [refLng + east / metersPerDegLng, refLat + north / metersPerDegLat];
}

export function modelMetersToLngLat(
  x: number,
  y: number,
  georef: SiIfcGeoref,
): [number, number] {
  if (georef.georeferenced) {
    const cos = Math.cos(georef.rotationRad);
    const sin = Math.sin(georef.rotationRad);
    const east = georef.eastings + (x * cos - y * sin) * georef.scale;
    const north = georef.northings + (x * sin + y * cos) * georef.scale;
    return enToWgs84Approx(east, north, georef.originLng, georef.originLat);
  }
  const metersPerDegLat = 111_320;
  const metersPerDegLng = 111_320 * Math.cos((georef.originLat * Math.PI) / 180);
  return [georef.originLng + x / metersPerDegLng, georef.originLat + y / metersPerDegLat];
}

export function applyMat4(m: number[], x: number, y: number, z: number): [number, number, number] {
  const ox = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!;
  const oy = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!;
  const oz = m[2]! * x + m[6]! * y + m[10]! * z + m[14]!;
  return [ox, oy, oz];
}

export function mergeBounds(
  a: [number, number, number, number] | null,
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number,
): [number, number, number, number] {
  if (!a) return [minLng, minLat, maxLng, maxLat];
  return [Math.min(a[0], minLng), Math.min(a[1], minLat), Math.max(a[2], maxLng), Math.max(a[3], maxLat)];
}

export function bboxToPolygon(
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number,
): GeoJSON.Polygon {
  return {
    type: 'Polygon',
    coordinates: [
      [
        [minLng, minLat],
        [maxLng, minLat],
        [maxLng, maxLat],
        [minLng, maxLat],
        [minLng, minLat],
      ],
    ],
  };
}
