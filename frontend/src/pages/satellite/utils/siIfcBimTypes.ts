import type { SiBimCategory } from './siIfcBimCategories';
import type { SiBimMergedMesh } from './siIfcBimMeshMerge';

/** Supported IFC schema identifiers (FILE_SCHEMA / web-ifc). */
export type SiIfcSchema =
  | 'IFC2X2'
  | 'IFC2X3'
  | 'IFC2X2_FINAL'
  | 'IFC2X3_FINAL'
  | 'IFC2X_FINAL'
  | 'IFC4'
  | 'IFC4X1'
  | 'IFC4X2'
  | 'IFC4X3'
  | 'IFC4X3_ADD2'
  | 'unknown';

export const SI_BIM_DISCIPLINES = [
  'building',
  'architectural',
  'structural',
  'mechanical',
  'electrical',
  'plumbing',
  'floors',
  'spaces',
  'exterior',
] as const;

export type SiBimDiscipline = (typeof SI_BIM_DISCIPLINES)[number];

export const SI_BIM_DISCIPLINE_LABELS: Record<SiBimDiscipline, string> = {
  building: 'Building',
  architectural: 'Architectural',
  structural: 'Structural',
  mechanical: 'Mechanical',
  electrical: 'Electrical',
  plumbing: 'Plumbing',
  floors: 'Floors',
  spaces: 'Spaces / Rooms',
  exterior: 'Exterior Shell',
};

export const SI_BIM_DISCIPLINE_COLORS: Record<SiBimDiscipline, string> = {
  building: '#94a3b8',
  architectural: '#60a5fa',
  structural: '#f97316',
  mechanical: '#22d3ee',
  electrical: '#facc15',
  plumbing: '#34d399',
  floors: '#a78bfa',
  spaces: '#fb7185',
  exterior: '#cbd5e1',
};

export type SiBimElementIndexEntry = {
  expressId: number;
  globalId: string;
  name: string;
  ifcType: string;
  discipline: SiBimDiscipline;
  category: SiBimCategory;
  storey?: string;
  level?: string;
  layerId: string;
  properties?: Record<string, unknown>;
};

export type SiBimSpatialNode = {
  expressId: number;
  type: string;
  name: string;
  globalId?: string;
  children: SiBimSpatialNode[];
};

export type SiIfcBimImportResult = {
  modelId: string;
  filename: string;
  schema: SiIfcSchema;
  georeferenced: boolean;
  crsHint?: string;
  coordinateOrigin: [number, number, number];
  totalElements: number;
  renderedElements: number;
  truncated: boolean;
  bounds: [number, number, number, number];
  blobUrl: string;
  layerGroup: string;
  /** Legacy discipline grouping (map 2D extrusion). */
  disciplines: Record<SiBimDiscipline, GeoJSON.FeatureCollection>;
  /** ArcGIS-style category feature classes. */
  categories: Record<SiBimCategory, GeoJSON.FeatureCollection>;
  /** Full-resolution merged meshes per category (local ENU meters). */
  categoryMeshes: Partial<Record<SiBimCategory, SiBimMergedMesh>>;
  elementIndex: SiBimElementIndexEntry[];
  stats: Record<SiBimDiscipline, number>;
  categoryStats: Record<SiBimCategory, number>;
  spatialStructure?: SiBimSpatialNode | null;
};

export function emptyDisciplineCollections(): Record<SiBimDiscipline, GeoJSON.FeatureCollection> {
  const out = {} as Record<SiBimDiscipline, GeoJSON.FeatureCollection>;
  for (const d of SI_BIM_DISCIPLINES) {
    out[d] = { type: 'FeatureCollection', features: [] };
  }
  return out;
}

export function emptyDisciplineStats(): Record<SiBimDiscipline, number> {
  const out = {} as Record<SiBimDiscipline, number>;
  for (const d of SI_BIM_DISCIPLINES) out[d] = 0;
  return out;
}

export function isSiBimRenderLayer(layer: {
  renderMode?: string;
  bimModelId?: string;
  bimCategory?: string;
}): boolean {
  return layer.renderMode === 'bim' || Boolean(layer.bimModelId);
}
