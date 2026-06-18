import type { SiBimCategory } from './siIfcBimCategories';
import { SI_BIM_CATEGORY_LABELS } from './siIfcBimCategories';
import type { SiBimElementIndexEntry, SiIfcBimImportResult } from './siIfcBimTypes';

export type SiBimModelRecord = SiIfcBimImportResult & {
  importedAt: number;
};

const models = new Map<string, SiBimModelRecord>();

export function registerSiBimModel(result: SiIfcBimImportResult): SiBimModelRecord {
  const record: SiBimModelRecord = { ...result, importedAt: Date.now() };
  models.set(result.modelId, record);
  return record;
}

export function getSiBimModel(modelId: string): SiBimModelRecord | undefined {
  return models.get(modelId);
}

export function listSiBimModels(): SiBimModelRecord[] {
  return [...models.values()].sort((a, b) => b.importedAt - a.importedAt);
}

export function removeSiBimModel(modelId: string): void {
  const m = models.get(modelId);
  if (m?.blobUrl?.startsWith('blob:')) URL.revokeObjectURL(m.blobUrl);
  models.delete(modelId);
}

export function searchSiBimElements(
  modelId: string,
  query: string,
  opts?: { discipline?: string; category?: SiBimCategory; storey?: string; limit?: number },
): SiBimElementIndexEntry[] {
  const m = models.get(modelId);
  if (!m) return [];
  const q = query.trim().toLowerCase();
  const limit = opts?.limit ?? 80;
  let hits = m.elementIndex;
  if (opts?.discipline) hits = hits.filter(e => e.discipline === opts.discipline);
  if (opts?.category) hits = hits.filter(e => e.category === opts.category);
  if (opts?.storey) hits = hits.filter(e => (e.storey ?? '').toLowerCase().includes(opts.storey!.toLowerCase()));
  if (!q) return hits.slice(0, limit);
  return hits
    .filter(
      e =>
        e.name.toLowerCase().includes(q) ||
        e.globalId.toLowerCase().includes(q) ||
        e.ifcType.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        (e.storey ?? '').toLowerCase().includes(q),
    )
    .slice(0, limit);
}

export function listSiBimStoreys(modelId: string): string[] {
  const m = models.get(modelId);
  if (!m) return [];
  const set = new Set<string>();
  for (const e of m.elementIndex) {
    if (e.storey?.trim()) set.add(e.storey.trim());
  }
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function summarizeSiBimModelForGeoAi(modelId: string): string | null {
  const m = models.get(modelId);
  if (!m) return null;
  const lines = [
    `IFC model "${m.filename}" (${m.schema})`,
    `Georeferenced: ${m.georeferenced ? 'yes' : 'anchored to map center'}${m.crsHint ? ` (${m.crsHint})` : ''}`,
    `Elements: ${m.renderedElements.toLocaleString()} / ${m.totalElements.toLocaleString()} (full geometry, no truncation)`,
    'Category counts (ArcGIS-style feature classes):',
  ];
  for (const [c, n] of Object.entries(m.categoryStats) as [SiBimCategory, number][]) {
    if (n > 0) lines.push(`  - ${SI_BIM_CATEGORY_LABELS[c]}: ${n}`);
  }
  const spaces = (m.categoryStats.spaces ?? 0) + (m.categoryStats.rooms ?? 0);
  const structural = (m.categoryStats.structural ?? 0) + (m.categoryStats.columns ?? 0) + (m.categoryStats.beams ?? 0);
  if (spaces) lines.push(`Spaces/rooms available for area & occupancy queries (${spaces} features).`);
  if (structural) lines.push(`Structural elements indexed (${structural}) for engineering queries.`);
  if (m.spatialStructure) lines.push('Spatial hierarchy (Project → Site → Building → Storey) is indexed for floor-aware queries.');
  return lines.join('\n');
}

/** Reset store (tests). */
export function clearSiBimModelStore(): void {
  for (const id of models.keys()) removeSiBimModel(id);
}
