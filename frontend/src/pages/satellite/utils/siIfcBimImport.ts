import type { IfcAPI, FlatMesh } from 'web-ifc';
import {
  classifyIfcCategory,
  emptyCategoryCollections,
  emptyCategoryStats,
  type SiBimCategory,
} from './siIfcBimCategories';
import { classifyIfcTypeName } from './siIfcBimDiscipline';
import {
  applyMat4,
  bboxToPolygon,
  ifcAngleToDegrees,
  mergeBounds,
  modelMetersToLngLat,
  normalizeLiveIfcSchema,
  parseIfcSchemaFromHeader,
  type SiIfcGeoref,
} from './siIfcBimGeoref';
import {
  appendLocalMesh,
  createEmptyMeshAccumulator,
  finalizeMeshAccumulator,
  type SiBimMergedMesh,
} from './siIfcBimMeshMerge';
import {
  emptyDisciplineCollections,
  emptyDisciplineStats,
  type SiBimDiscipline,
  type SiBimElementIndexEntry,
  type SiBimSpatialNode,
  type SiIfcBimImportResult,
  type SiIfcSchema,
} from './siIfcBimTypes';

const YIELD_EVERY = 24;

export type SiIfcImportProgress = { pct: number; message?: string };
export type SiIfcImportOptions = {
  anchorLng: number;
  anchorLat: number;
  onProgress?: (progress: SiIfcImportProgress) => void;
  signal?: AbortSignal;
};

function yieldToBrowser(): Promise<void> {
  return new Promise(resolve => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

function readIfcProp(line: Record<string, unknown> | null | undefined, key: string): unknown {
  if (!line || typeof line !== 'object') return undefined;
  if (key in line) return line[key];
  const lower = key.toLowerCase();
  for (const [k, v] of Object.entries(line)) {
    if (k.toLowerCase() === lower) return v;
  }
  return undefined;
}

function readIfcText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object' && value !== null && 'value' in value) {
    return readIfcText((value as { value: unknown }).value);
  }
  return String(value).trim();
}

function flattenPropsForFeature(raw: Record<string, unknown>, maxKeys = 256): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const walk = (obj: unknown, prefix: string, depth: number) => {
    if (depth > 5 || Object.keys(out).length >= maxKeys) return;
    if (obj == null) return;
    if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') {
      if (prefix) out[prefix] = obj;
      return;
    }
    if (Array.isArray(obj)) {
      if (obj.length && typeof obj[0] !== 'object') out[prefix || 'value'] = obj.slice(0, 24).join(', ');
      return;
    }
    if (typeof obj === 'object') {
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        if (k === 'expressID' || k === 'type') continue;
        walk(v, prefix ? `${prefix}.${k}` : k, depth + 1);
      }
    }
  };
  walk(raw, '', 0);
  return out;
}

async function initIfcApi(): Promise<IfcAPI> {
  const wasmModule = await import('web-ifc/web-ifc.wasm?url');
  const wasmUrl = wasmModule.default as string;
  const wasmDir = wasmUrl.substring(0, wasmUrl.lastIndexOf('/') + 1);
  const { IfcAPI } = await import('web-ifc');
  const api = new IfcAPI();
  api.SetWasmPath(wasmDir);
  await api.Init(undefined, true);
  return api;
}

function resolveGeoref(ifcApi: IfcAPI, modelID: number, anchorLng: number, anchorLat: number): SiIfcGeoref {
  const base: SiIfcGeoref = {
    georeferenced: false,
    originLng: anchorLng,
    originLat: anchorLat,
    eastings: 0,
    northings: 0,
    orthogonalHeight: 0,
    rotationRad: 0,
    scale: 1,
  };
  try {
    const mapConvType = ifcApi.GetTypeCodeFromName('IFCMAPCONVERSION');
    const ids = ifcApi.GetLineIDsWithType(modelID, mapConvType);
    if (ids.size() > 0) {
      const line = ifcApi.GetLine(modelID, ids.get(0)) as Record<string, unknown>;
      base.eastings = Number(readIfcProp(line, 'Eastings') ?? 0);
      base.northings = Number(readIfcProp(line, 'Northings') ?? 0);
      base.scale = Number(readIfcProp(line, 'Scale') ?? 1) || 1;
      base.rotationRad = Math.atan2(
        Number(readIfcProp(line, 'XAxisOrdinate') ?? 0),
        Number(readIfcProp(line, 'XAxisAbscissa') ?? 1),
      );
      base.orthogonalHeight = Number(readIfcProp(line, 'OrthogonalHeight') ?? 0);
      base.georeferenced = Number.isFinite(base.eastings) && Number.isFinite(base.northings);
      base.crsHint = 'EPSG (IfcMapConversion)';
    }
  } catch {
    /* optional */
  }
  try {
    const siteIds = ifcApi.GetLineIDsWithType(modelID, ifcApi.GetTypeCodeFromName('IFCSITE'));
    if (siteIds.size() > 0) {
      const site = ifcApi.GetLine(modelID, siteIds.get(0)) as Record<string, unknown>;
      const lat = ifcAngleToDegrees(readIfcProp(site, 'RefLatitude'));
      const lng = ifcAngleToDegrees(readIfcProp(site, 'RefLongitude'));
      if (lat != null && lng != null) {
        base.originLat = lat;
        base.originLng = lng;
        base.georeferenced = true;
        base.crsHint = base.crsHint ?? 'WGS84 (IfcSite)';
      }
    }
  } catch {
    /* optional */
  }
  return base;
}

function buildStoreyMap(ifcApi: IfcAPI, modelID: number): Map<number, string> {
  const map = new Map<number, string>();
  try {
    const ids = ifcApi.GetLineIDsWithType(modelID, ifcApi.GetTypeCodeFromName('IFCBUILDINGSTOREY'));
    for (let i = 0; i < ids.size(); i++) {
      const id = ids.get(i);
      const line = ifcApi.GetLine(modelID, id) as Record<string, unknown>;
      map.set(id, readIfcText(readIfcProp(line, 'Name')) || readIfcText(readIfcProp(line, 'LongName')) || `Storey ${id}`);
    }
  } catch {
    /* optional */
  }
  return map;
}

function extractLocalMeshBuffers(
  ifcApi: IfcAPI,
  modelID: number,
  mesh: FlatMesh,
  coordMatrix: number[],
): { positions: Float32Array; indices: Uint32Array } | null {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let gi = 0; gi < mesh.geometries.size(); gi++) {
    const placed = mesh.geometries.get(gi);
    const geom = ifcApi.GetGeometry(modelID, placed.geometryExpressID);
    const verts = ifcApi.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
    const idx = ifcApi.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());
    const tm = placed.flatTransformation.length === 16 ? placed.flatTransformation : coordMatrix;
    const base = positions.length / 3;
    for (let vi = 0; vi + 2 < verts.length; vi += 3) {
      const world = applyMat4(tm, verts[vi]!, verts[vi + 1]!, verts[vi + 2]!);
      const mapped = applyMat4(coordMatrix, world[0], world[1], world[2]);
      positions.push(mapped[0], mapped[1], mapped[2]);
    }
    for (let ii = 0; ii < idx.length; ii++) indices.push(idx[ii]! + base);
    geom.delete();
  }
  if (positions.length < 9 || indices.length < 3) return null;
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

function meshBoundsWgs84(localPositions: Float32Array, georef: SiIfcGeoref) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i + 2 < localPositions.length; i += 3) {
    const x = localPositions[i]!;
    const y = localPositions[i + 1]!;
    const z = localPositions[i + 2]!;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  if (!Number.isFinite(minX)) return null;
  const corners: [number, number][] = [
    modelMetersToLngLat(minX, minY, georef),
    modelMetersToLngLat(maxX, minY, georef),
    modelMetersToLngLat(maxX, maxY, georef),
    modelMetersToLngLat(minX, maxY, georef),
  ];
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of corners) {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }
  return { minLng, minLat, maxLng, maxLat, minZ, maxZ };
}

function mapSpatialNode(node: {
  expressID?: number;
  type?: string;
  Name?: { value?: string };
  name?: string;
  GlobalId?: { value?: string };
  children?: unknown[];
}): SiBimSpatialNode {
  return {
    expressId: Number(node.expressID ?? 0),
    type: String(node.type ?? 'IfcProduct'),
    name: readIfcText(node.Name ?? node.name) || String(node.type ?? 'Element'),
    globalId: readIfcText(node.GlobalId) || undefined,
    children: Array.isArray(node.children)
      ? node.children.map(c => mapSpatialNode(c as Parameters<typeof mapSpatialNode>[0]))
      : [],
  };
}

export async function importIfcBimFile(file: File, opts: SiIfcImportOptions): Promise<SiIfcBimImportResult> {
  if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const headerSchema = parseIfcSchemaFromHeader(await file.slice(0, 16384).text());
  opts.onProgress?.({ pct: 2, message: 'Loading IFC parser…' });
  const ifcApi = await initIfcApi();
  const buffer = await file.arrayBuffer();

  opts.onProgress?.({ pct: 6, message: 'Opening IFC model…' });
  const modelID = ifcApi.OpenModel(new Uint8Array(buffer), {
    COORDINATE_TO_ORIGIN: true,
    MEMORY_LIMIT: 512 * 1024 * 1024,
  });
  if (modelID < 0) {
    ifcApi.Dispose();
    throw new Error('Failed to open IFC model.');
  }

  let schema: SiIfcSchema = headerSchema;
  try {
    schema = normalizeLiveIfcSchema(String(ifcApi.GetModelSchema(modelID) ?? '')) || headerSchema;
  } catch {
    /* keep header */
  }

  const georef = resolveGeoref(ifcApi, modelID, opts.anchorLng, opts.anchorLat);
  const coordMatrix = ifcApi.GetCoordinationMatrix(modelID);
  const storeyMap = buildStoreyMap(ifcApi, modelID);
  const disciplines = emptyDisciplineCollections();
  const categories = emptyCategoryCollections();
  const stats = emptyDisciplineStats();
  const categoryStats = emptyCategoryStats();
  const meshAccumulators = {} as Record<SiBimCategory, ReturnType<typeof createEmptyMeshAccumulator>>;
  for (const c of Object.keys(categoryStats) as SiBimCategory[]) meshAccumulators[c] = createEmptyMeshAccumulator();

  const elementIndex: SiBimElementIndexEntry[] = [];
  let bounds: [number, number, number, number] | null = null;
  let rendered = 0;
  let total = 0;
  let processed = 0;

  const modelId = `bim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const baseName = file.name.replace(/\.ifc$/i, '') || 'IFC Model';
  const layerGroup = `BIM · ${baseName}`;
  const blobUrl = URL.createObjectURL(file);
  const coordinateOrigin: [number, number, number] = [georef.originLng, georef.originLat, georef.orthogonalHeight];

  opts.onProgress?.({ pct: 10, message: 'Parsing full geometry…' });

  await new Promise<void>((resolve, reject) => {
    try {
      ifcApi.StreamAllMeshes(modelID, (mesh, index, meshTotal) => {
        total = meshTotal;
        processed = index + 1;
        if (opts.signal?.aborted) return;

        const expressId = mesh.expressID;
        let typeName = 'IFCPRODUCT';
        try {
          typeName = ifcApi.GetNameFromTypeCode(ifcApi.GetLineType(modelID, expressId));
        } catch {
          /* fallback */
        }

        const line = ifcApi.GetLine(modelID, expressId, true) as Record<string, unknown>;
        const name = readIfcText(readIfcProp(line, 'Name')) || readIfcText(readIfcProp(line, 'LongName'));
        const objectType = readIfcText(readIfcProp(line, 'ObjectType'));
        const globalId =
          readIfcText(ifcApi.GetGuidFromExpressId(modelID, expressId)) ||
          readIfcText(readIfcProp(line, 'GlobalId')) ||
          String(expressId);
        const discipline = classifyIfcTypeName(typeName, objectType) as SiBimDiscipline;
        const category = classifyIfcCategory(typeName, objectType);
        const layerId = `${modelId}-${category}`;

        const localMesh = extractLocalMeshBuffers(ifcApi, modelID, mesh, coordMatrix);
        mesh.delete();
        if (!localMesh) return;

        appendLocalMesh(meshAccumulators[category], localMesh.positions, localMesh.indices);
        const bb = meshBoundsWgs84(localMesh.positions, georef);
        if (!bb) return;

        bounds = mergeBounds(bounds, bb.minLng, bb.minLat, bb.maxLng, bb.maxLat);
        const heightM = Math.max(0.35, bb.maxZ - bb.minZ);
        const baseHeightM = Math.max(0, bb.minZ + georef.orthogonalHeight);

        let storey: string | undefined;
        const container = readIfcProp(line, 'ContainedInStructure');
        if (Array.isArray(container) && container.length > 0) {
          const ref = container[0] as { value?: number };
          const sid = typeof ref === 'number' ? ref : ref?.value;
          if (typeof sid === 'number') storey = storeyMap.get(sid);
        }

        const flatProps = flattenPropsForFeature(line);
        const feature: GeoJSON.Feature = {
          type: 'Feature',
          id: globalId || expressId,
          geometry: bboxToPolygon(bb.minLng, bb.minLat, bb.maxLng, bb.maxLat),
          properties: {
            expressId,
            GlobalId: globalId,
            Name: name,
            Type: typeName,
            ObjectType: objectType || undefined,
            Category: category,
            Discipline: discipline,
            Storey: storey,
            Level: storey,
            height: heightM,
            min_height: baseHeightM,
            bimModelId: modelId,
            ifcSchema: schema,
            ...flatProps,
          },
        };

        disciplines[discipline].features.push(feature);
        categories[category].features.push(feature);
        stats[discipline] += 1;
        categoryStats[category] += 1;
        elementIndex.push({
          expressId,
          globalId,
          name: name || typeName,
          ifcType: typeName,
          discipline,
          category,
          storey,
          level: storey,
          layerId,
          properties: flatProps,
        });
        rendered += 1;

        if (processed % YIELD_EVERY === 0) {
          const pct = 10 + Math.min(80, (processed / Math.max(meshTotal, 1)) * 80);
          opts.onProgress?.({ pct, message: `Geometry ${processed}/${meshTotal}…` });
        }
      });
      resolve();
    } catch (e) {
      reject(e);
    }
  });

  await yieldToBrowser();

  let spatialStructure: SiBimSpatialNode | null = null;
  try {
    opts.onProgress?.({ pct: 92, message: 'Spatial structure…' });
    const tree = await ifcApi.properties.getSpatialStructure(modelID, false);
    if (tree) spatialStructure = mapSpatialNode(tree as Parameters<typeof mapSpatialNode>[0]);
  } catch {
    spatialStructure = null;
  }

  ifcApi.CloseModel(modelID);
  ifcApi.Dispose();

  if (!bounds || rendered === 0) {
    URL.revokeObjectURL(blobUrl);
    throw new Error('No geometry found in this IFC model.');
  }

  const categoryMeshes: Partial<Record<SiBimCategory, SiBimMergedMesh>> = {};
  for (const c of Object.keys(meshAccumulators) as SiBimCategory[]) {
    const merged = finalizeMeshAccumulator(meshAccumulators[c]!);
    if (merged) categoryMeshes[c] = merged;
  }

  opts.onProgress?.({ pct: 98, message: 'Building BIM layers…' });

  return {
    modelId,
    filename: file.name,
    schema,
    georeferenced: georef.georeferenced,
    crsHint: georef.crsHint,
    coordinateOrigin,
    totalElements: total || rendered,
    renderedElements: rendered,
    truncated: false,
    bounds,
    blobUrl,
    layerGroup,
    disciplines,
    categories,
    categoryMeshes,
    elementIndex,
    stats,
    categoryStats,
    spatialStructure,
  };
}
