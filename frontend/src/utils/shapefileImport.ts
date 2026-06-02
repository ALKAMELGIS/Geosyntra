import JSZip from 'jszip';
import shp from 'shpjs';
import { mergeShpLikeToFeatureCollection } from './shpGeoJsonMerge';

export const SHAPEFILE_REQUIRED_EXT = ['shp', 'dbf', 'shx'] as const;
export const SHAPEFILE_OPTIONAL_EXT = ['prj', 'cpg'] as const;

export type ShapefilePartExt = (typeof SHAPEFILE_REQUIRED_EXT)[number] | (typeof SHAPEFILE_OPTIONAL_EXT)[number];

export type ShapefilePartsMap = Partial<Record<ShapefilePartExt | 'shp' | 'dbf' | 'shx' | 'prj' | 'cpg', File>>;

export type ShapefileLayerParseResult = {
  layerName: string;
  data: { type: 'FeatureCollection'; features: unknown[] };
  hasPrj: boolean;
};

export type ShapefileValidationIssue = {
  layerBase: string;
  missing: string[];
};

function basenameNoExt(name: string): string {
  const leaf = name.replace(/\\/g, '/').split('/').pop() ?? name;
  const dot = leaf.lastIndexOf('.');
  return dot > 0 ? leaf.slice(0, dot) : leaf;
}

export function shapefilePartExt(filename: string): ShapefilePartExt | null {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext) return null;
  if (ext === 'shp' || ext === 'dbf' || ext === 'shx' || ext === 'prj' || ext === 'cpg') return ext;
  return null;
}

export function isShapefileSidecarUpload(files: File[]): boolean {
  if (files.length < 2) return false;
  return files.some(f => shapefilePartExt(f.name) === 'shp');
}

export function groupShapefileParts(files: File[]): Map<string, ShapefilePartsMap> {
  const groups = new Map<string, ShapefilePartsMap>();
  for (const file of files) {
    const part = shapefilePartExt(file.name);
    if (!part) continue;
    const base = basenameNoExt(file.name);
    const g = groups.get(base) ?? {};
    g[part] = file;
    groups.set(base, g);
  }
  return groups;
}

export function validateShapefileParts(parts: ShapefilePartsMap, layerBase: string): ShapefileValidationIssue | null {
  const missing = SHAPEFILE_REQUIRED_EXT.filter(ext => !parts[ext]);
  if (!missing.length) return null;
  return { layerBase, missing: [...missing] };
}

export function formatShapefileMissingMessage(issues: ShapefileValidationIssue[]): string {
  if (!issues.length) return '';
  const lines = issues.map(
    i => `“${i.layerBase}” is missing required file(s): ${i.missing.map(e => `.${e}`).join(', ')}`,
  );
  return `Shapefile incomplete. ${lines.join(' · ')} Required: .shp, .dbf, .shx (.prj optional).`;
}

export function describeShapefileUploadStaging(files: File[]): string {
  if (!files.length) return 'Choose a file or shapefile parts, then click Import to map.';
  if (files.length === 1) {
    const f = files[0]!;
    const mb = f.size / (1024 * 1024);
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'zip') {
      return `Ready: ${f.name} (${mb >= 0.01 ? mb.toFixed(2) : '<0.01'} MB ZIP). Will extract .shp/.dbf/.shx and create a Feature Layer.`;
    }
    return `Ready: ${f.name} (${mb >= 0.01 ? mb.toFixed(2) : '<0.01'} MB). Click “Import to map”.`;
  }

  const groups = groupShapefileParts(files);
  if (!groups.size) {
    return 'Selected files are not recognized shapefile parts (.shp, .dbf, .shx, .prj).';
  }

  const issues: ShapefileValidationIssue[] = [];
  for (const [base, parts] of groups) {
    const issue = validateShapefileParts(parts, base);
    if (issue) issues.push(issue);
  }

  if (issues.length) {
    return formatShapefileMissingMessage(issues);
  }

  const names = [...groups.keys()];
  const prj = names.some(n => Boolean(groups.get(n)?.prj));
  return `Shapefile ready (${names.join(', ')}): ${files.length} file(s)${prj ? ' · .prj detected' : ''}. Click “Import to map”.`;
}

async function readFileArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(file);
  });
}

export async function validateShapefileZipEntries(zip: JSZip): Promise<ShapefileValidationIssue[]> {
  const shpPaths = Object.keys(zip.files).filter(
    p => !zip.files[p]!.dir && p.toLowerCase().endsWith('.shp') && !p.includes('__MACOSX'),
  );
  if (!shpPaths.length) {
    throw new Error('ZIP does not contain a .shp shapefile. Add .shp, .dbf, and .shx ( .prj optional).');
  }

  const issues: ShapefileValidationIssue[] = [];
  const lowerPaths = new Set(Object.keys(zip.files).map(p => p.toLowerCase()));

  for (const shpPath of shpPaths) {
    const base = shpPath.slice(0, -4);
    const baseLower = base.toLowerCase();
    const missing: string[] = [];
    if (!lowerPaths.has(`${baseLower}.dbf`)) missing.push('dbf');
    if (!lowerPaths.has(`${baseLower}.shx`)) missing.push('shx');
    if (missing.length) issues.push({ layerBase: basenameNoExt(shpPath), missing });
  }
  return issues;
}

function splitShpJsResult(raw: unknown): Array<{ layerName: string; raw: unknown; hasPrj: boolean }> {
  if (!raw || typeof raw !== 'object') return [];
  const g = raw as { type?: string; fileName?: string; features?: unknown[] };
  if (g.type === 'FeatureCollection' && Array.isArray(g.features)) {
    const name = typeof g.fileName === 'string' ? basenameNoExt(g.fileName) : 'Shapefile';
    return [{ layerName: name, raw, hasPrj: false }];
  }
  if (Array.isArray(raw)) {
    return raw
      .filter(Boolean)
      .map((item, idx) => {
        const o = item as { fileName?: string; type?: string };
        const layerName =
          typeof o.fileName === 'string' ? basenameNoExt(o.fileName) : `Shapefile ${idx + 1}`;
        return { layerName, raw: item, hasPrj: false };
      });
  }
  const out: Array<{ layerName: string; raw: unknown; hasPrj: boolean }> = [];
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!val || typeof val !== 'object') continue;
    out.push({ layerName: basenameNoExt(key), raw: val, hasPrj: false });
  }
  return out;
}

export async function parseShapefileZipFile(file: File): Promise<ShapefileLayerParseResult[]> {
  const ab = await readFileArrayBuffer(file);
  const zip = await JSZip.loadAsync(ab);
  const issues = await validateShapefileZipEntries(zip);
  if (issues.length) throw new Error(formatShapefileMissingMessage(issues));

  const raw = await shp(ab);
  const layers = splitShpJsResult(raw);
  if (!layers.length) throw new Error('Shapefile ZIP parsed but contains no layers.');

  return layers.map(({ layerName, raw: layerRaw }) => {
    const data = mergeShpLikeToFeatureCollection(layerRaw);
    if (!data.features.length) throw new Error(`Shapefile layer “${layerName}” has no features.`);
    const hasPrj = Object.keys(zip.files).some(
      p => !zip.files[p]!.dir && p.toLowerCase() === `${layerName.toLowerCase()}.prj`,
    );
    return { layerName, data, hasPrj };
  });
}

export async function parseShapefilePartsFiles(files: File[]): Promise<ShapefileLayerParseResult[]> {
  const groups = groupShapefileParts(files);
  if (!groups.size) {
    throw new Error('No shapefile parts found. Select .shp, .dbf, and .shx (same base name).');
  }

  const issues: ShapefileValidationIssue[] = [];
  for (const [base, parts] of groups) {
    const issue = validateShapefileParts(parts, base);
    if (issue) issues.push(issue);
  }
  if (issues.length) throw new Error(formatShapefileMissingMessage(issues));

  const results: ShapefileLayerParseResult[] = [];
  for (const [base, parts] of groups) {
    const shpFile = parts.shp!;
    const dbfFile = parts.dbf!;
    const [shpBuf, dbfBuf, prjBuf, cpgBuf] = await Promise.all([
      readFileArrayBuffer(shpFile),
      readFileArrayBuffer(dbfFile),
      parts.prj ? readFileArrayBuffer(parts.prj) : Promise.resolve(undefined),
      parts.cpg ? readFileArrayBuffer(parts.cpg) : Promise.resolve(undefined),
    ]);

    const payload: { shp: ArrayBuffer; dbf: ArrayBuffer; prj?: ArrayBuffer; cpg?: ArrayBuffer } = {
      shp: shpBuf,
      dbf: dbfBuf,
    };
    if (prjBuf) payload.prj = prjBuf;
    if (cpgBuf) payload.cpg = cpgBuf;

    const raw = await shp(payload);
    const data = mergeShpLikeToFeatureCollection(raw);
    if (!data.features.length) throw new Error(`Shapefile “${base}” has no drawable features.`);
    results.push({ layerName: base, data, hasPrj: Boolean(parts.prj) });
  }
  return results;
}

export async function parseShapefileUpload(
  files: File[],
): Promise<{ layers: ShapefileLayerParseResult[]; sourceLabel: string }> {
  if (!files.length) throw new Error('No files selected.');
  if (files.length === 1 && files[0]!.name.toLowerCase().endsWith('.zip')) {
    const layers = await parseShapefileZipFile(files[0]!);
    return { layers, sourceLabel: files[0]!.name };
  }
  if (files.some(f => f.name.toLowerCase().endsWith('.zip')) && files.length > 1) {
    throw new Error('Upload either one .zip archive or separate shapefile files — not both.');
  }
  if (!isShapefileSidecarUpload(files)) {
    throw new Error('Multiple files must be shapefile components (.shp, .dbf, .shx) with the same base name.');
  }
  const layers = await parseShapefilePartsFiles(files);
  return { layers, sourceLabel: layers.map(l => l.layerName).join(', ') };
}
