import {
  groupShapefileParts,
  readShapefileGeometryKind,
  shapefilePartExt,
  validateShapefileParts,
  type ShapefileGeometryKind,
  type ShapefilePartsMap,
} from './shapefileImport';

export type UploadDatasetKind = 'shapefile' | 'archive' | 'vector' | 'raster' | 'bim' | 'other';

/** User-facing staged upload item — one logical GIS dataset (shapefile parts grouped internally). */
export type UploadStagingDataset = {
  id: string;
  name: string;
  kind: UploadDatasetKind;
  formatLabel: string;
  sizeBytes: number;
  ready: boolean;
  statusHint: string;
  /** Point / Line / Polygon for shapefile datasets. */
  geometryKind?: ShapefileGeometryKind;
  /** Raw files passed to the import pipeline — never shown in the picker UI. */
  files: File[];
};

function basenameNoExt(name: string): string {
  const leaf = name.replace(/\\/g, '/').split('/').pop() ?? name;
  const dot = leaf.lastIndexOf('.');
  return dot > 0 ? leaf.slice(0, dot) : leaf;
}

function extOf(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

function kindForExtension(ext: string): UploadDatasetKind {
  if (ext === 'zip') return 'archive';
  if (ext === 'ifc') return 'bim';
  if (['tif', 'tiff', 'img', 'vrt', 'jp2', 'ecw'].includes(ext)) return 'raster';
  if (['geojson', 'json', 'kml', 'kmz', 'csv', 'gpx'].includes(ext)) return 'vector';
  return 'other';
}

function formatLabelForKind(kind: UploadDatasetKind, ext: string): string {
  switch (kind) {
    case 'shapefile':
      return 'Shapefile';
    case 'archive':
      return ext === 'zip' ? 'ZIP archive' : 'Archive';
    case 'vector':
      if (ext === 'geojson' || ext === 'json') return 'GeoJSON';
      if (ext === 'kml') return 'KML';
      if (ext === 'kmz') return 'KMZ';
      if (ext === 'csv') return 'CSV';
      if (ext === 'gpx') return 'GPX';
      return 'Vector';
    case 'raster':
      return 'GeoTIFF / raster';
    case 'bim':
      return 'IFC / BIM';
    default:
      return ext ? ext.toUpperCase() : 'File';
  }
}

function shapefileDataset(base: string, parts: ShapefilePartsMap): UploadStagingDataset {
  const files = Object.values(parts).filter((f): f is File => f instanceof File);
  const issue = validateShapefileParts(parts, base);
  const sizeBytes = files.reduce((sum, f) => sum + f.size, 0);
  return {
    id: `shapefile:${base}`,
    name: base,
    kind: 'shapefile',
    formatLabel: 'Shapefile',
    sizeBytes,
    ready: !issue,
    statusHint: issue
      ? 'Incomplete — browse the folder that contains this .shp, or upload a .zip'
      : 'Ready to import',
    files,
  };
}

/** Collapse raw file picks into one card per logical dataset (shapefile sidecars grouped by basename). */
export function buildUploadStagingDatasets(files: File[]): UploadStagingDataset[] {
  if (!files.length) return [];

  const consumed = new Set<File>();
  const datasets: UploadStagingDataset[] = [];
  const groups = groupShapefileParts(files);

  for (const [base, parts] of groups) {
    if (!parts.shp && !parts.dbf && !parts.shx) continue;
    const ds = shapefileDataset(base, parts);
    ds.files.forEach(f => consumed.add(f));
    datasets.push(ds);
  }

  for (const file of files) {
    if (consumed.has(file)) continue;
    const part = shapefilePartExt(file.name);
    if (part && part !== 'shp') continue;

    const ext = extOf(file.name);
    const kind = kindForExtension(ext);
    datasets.push({
      id: `file:${file.name}:${file.size}`,
      name: ext === 'zip' ? basenameNoExt(file.name) || file.name : basenameNoExt(file.name) || file.name,
      kind,
      formatLabel: formatLabelForKind(kind, ext),
      sizeBytes: file.size,
      ready: true,
      statusHint: 'Ready to import',
      files: [file],
    });
  }

  return datasets;
}

/** Attach geometry kind from .shp headers (for GIS layer icons). */
export async function enrichUploadStagingGeometry(
  datasets: UploadStagingDataset[],
): Promise<UploadStagingDataset[]> {
  return Promise.all(
    datasets.map(async ds => {
      if (ds.kind !== 'shapefile') return ds;
      const shp = ds.files.find(f => f.name.toLowerCase().endsWith('.shp'));
      if (!shp) return ds;
      const geometryKind = await readShapefileGeometryKind(shp);
      return { ...ds, geometryKind };
    }),
  );
}

export function flattenUploadStagingDatasets(datasets: UploadStagingDataset[]): File[] {
  const out: File[] = [];
  const seen = new Set<File>();
  for (const ds of datasets) {
    for (const f of ds.files) {
      if (!seen.has(f)) {
        seen.add(f);
        out.push(f);
      }
    }
  }
  return out;
}

export function describeUploadStagingDatasets(datasets: UploadStagingDataset[]): string {
  if (!datasets.length) return 'Choose a dataset, then click Import to map.';
  if (datasets.length === 1) {
    const ds = datasets[0]!;
    const mb = ds.sizeBytes / (1024 * 1024);
    const size = mb >= 0.01 ? `${mb.toFixed(2)} MB` : '<0.01 MB';
    return `${ds.formatLabel} “${ds.name}” (${size}) — ${ds.statusHint}`;
  }
  const ready = datasets.filter(d => d.ready).length;
  return `${datasets.length} datasets staged (${ready} ready). Click “Import to map”.`;
}

export function allUploadDatasetsReady(datasets: UploadStagingDataset[]): boolean {
  return datasets.length > 0 && datasets.every(d => d.ready);
}

/** Shapefile components visible in the PC file picker (grouped into one layer at import). */
export const GIS_UPLOAD_SHAPEFILE_EXTENSIONS = ['.shp', '.dbf', '.shx', '.prj'] as const;

/** File extensions in `<input type="file">` — includes shapefile sidecars (.shp .dbf .shx .prj). */
export const GIS_UPLOAD_PICKER_EXTENSIONS = [
  ...GIS_UPLOAD_SHAPEFILE_EXTENSIONS,
  '.zip',
  '.geojson',
  '.json',
  '.kml',
  '.kmz',
  '.csv',
  '.gpx',
  '.tif',
  '.tiff',
  '.ifc',
  '.img',
  '.vrt',
  '.jp2',
  '.ecw',
] as const;

export const GIS_UPLOAD_ACCEPT = GIS_UPLOAD_PICKER_EXTENSIONS.join(',');

type FilePickerType = {
  description: string;
  accept: Record<string, string[]>;
};

const GIS_UPLOAD_FILE_PICKER_TYPES: FilePickerType[] = [
  {
    description: 'Shapefile (.shp, .dbf, .shx, .prj)',
    accept: {
      'application/octet-stream': [...GIS_UPLOAD_SHAPEFILE_EXTENSIONS],
      'application/x-shapefile': ['.shp'],
    },
  },
  {
    description: 'Shapefile archive (.zip)',
    accept: { 'application/zip': ['.zip'] },
  },
  {
    description: 'GeoJSON',
    accept: { 'application/geo+json': ['.geojson', '.json'] },
  },
  {
    description: 'KML / KMZ',
    accept: {
      'application/vnd.google-earth.kml+xml': ['.kml'],
      'application/vnd.google-earth.kmz': ['.kmz'],
    },
  },
  {
    description: 'CSV',
    accept: { 'text/csv': ['.csv'] },
  },
  {
    description: 'GeoTIFF / raster',
    accept: { 'image/tiff': ['.tif', '.tiff', '.img', '.vrt', '.jp2', '.ecw'] },
  },
  {
    description: 'IFC / BIM',
    accept: { 'application/octet-stream': ['.ifc'] },
  },
  {
    description: 'GPX',
    accept: { 'application/gpx+xml': ['.gpx'] },
  },
];

/** Native file picker — shapefile sidecars (.shp .dbf .shx .prj) plus other GIS formats. */
export async function pickGisUploadFiles(): Promise<File[] | null> {
  if (typeof window === 'undefined' || !('showOpenFilePicker' in window)) return null;
  try {
    const handles = await (
      window as Window & {
        showOpenFilePicker: (opts: {
          multiple?: boolean;
          types?: FilePickerType[];
        }) => Promise<FileSystemFileHandle[]>;
      }
    ).showOpenFilePicker({
      multiple: true,
      types: GIS_UPLOAD_FILE_PICKER_TYPES,
    });
    return Promise.all(handles.map(h => h.getFile()));
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null;
    throw err;
  }
}

/** Folder picker — resolves shapefile sidecars internally; one folder → many datasets. */
export async function pickGisUploadFolderFiles(): Promise<File[]> {
  if (typeof window === 'undefined' || !('showDirectoryPicker' in window)) {
    throw new Error('Folder selection is not supported in this browser. Drag the folder onto the drop zone or use a .zip shapefile.');
  }
  const dir = await (
    window as Window & {
      showDirectoryPicker: (opts: { mode: 'read' }) => Promise<FileSystemDirectoryHandle>;
    }
  ).showDirectoryPicker({ mode: 'read' });
  const files: File[] = [];
  for await (const [, handle] of dir.entries()) {
    if (handle.kind === 'file') files.push(await handle.getFile());
  }
  return files;
}
