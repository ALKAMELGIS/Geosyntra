import type { ShapefileGeometryKind } from './shapefileImport';

type SiShapefileGeometryIconProps = {
  kind: ShapefileGeometryKind;
  className?: string;
};

/** ArcGIS-style shapefile geometry glyph (point · polyline · polygon). */
export function SiShapefileGeometryIcon({ kind, className = '' }: SiShapefileGeometryIconProps) {
  const cls = ['si-shp-geom-icon', className].filter(Boolean).join(' ');
  return (
    <svg className={cls} viewBox="0 0 16 16" aria-hidden focusable="false">
      {kind === 'Point' || kind === 'MultiPoint' ? (
        <>
          <circle cx="5" cy="5" r="1.35" fill="currentColor" />
          <circle cx="10.5" cy="8" r="1.35" fill="currentColor" />
          <circle cx="7" cy="11.5" r="1.35" fill="currentColor" />
        </>
      ) : kind === 'Line' ? (
        <path
          d="M2.5 11.5 6 6.5 9.5 9 13.5 3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : kind === 'Polygon' ? (
        <path
          d="M3 5.5 8 2.8 13 5.2 12.2 11 7.5 13.5 3.2 10.5Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      ) : (
        <rect x="3.5" y="3.5" width="9" height="9" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.1" />
      )}
    </svg>
  );
}

export function geometryKindLabel(kind: ShapefileGeometryKind): string {
  switch (kind) {
    case 'Point':
      return 'Point';
    case 'MultiPoint':
      return 'MultiPoint';
    case 'Line':
      return 'Polyline';
    case 'Polygon':
      return 'Polygon';
    default:
      return 'Shapefile';
  }
}
