import type { SiExploreIndexBand } from './siExploreIndexesCatalog';

export type SiExploreIndexLayerOption = { id: string; label: string };

function norm(s: string): string {
  return String(s || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_');
}

/** Resolve an Explore Indexes band card to the best available Layer Live / WMS option id. */
export function resolveExploreIndexLayerId(
  band: SiExploreIndexBand,
  options: readonly SiExploreIndexLayerOption[],
): string | null {
  if (!options.length) return null;
  const normalized = options.map(o => ({
    id: o.id,
    idN: norm(o.id),
    labelN: norm(o.label),
  }));

  for (const term of band.matchTerms) {
    const t = norm(term);
    if (!t) continue;
    const exact = normalized.find(o => o.idN === t || o.labelN === t);
    if (exact) return exact.id;
    const partial = normalized.find(o => o.idN.includes(t) || o.labelN.includes(t));
    if (partial) return partial.id;
  }

  const titleN = norm(band.title);
  const titleHit = normalized.find(o => o.labelN.includes(titleN) || o.idN.includes(titleN));
  return titleHit?.id ?? null;
}
