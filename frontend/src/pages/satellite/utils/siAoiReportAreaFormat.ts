/** AOI area helpers for report narrative (% shares → hectares, ha + m² labels). */

export function aoiAreaHaFromKm2(aoiAreaKm2: number): number {
  if (!Number.isFinite(aoiAreaKm2) || aoiAreaKm2 <= 0) return 0;
  return aoiAreaKm2 * 100;
}

export function aoiAreaSqmFromKm2(aoiAreaKm2: number): number {
  if (!Number.isFinite(aoiAreaKm2) || aoiAreaKm2 <= 0) return 0;
  return aoiAreaKm2 * 1_000_000;
}

export function formatHaValue(ha: number): string {
  if (!Number.isFinite(ha) || ha <= 0) return '0 ha';
  if (ha >= 100) return `${ha.toFixed(1)} ha`;
  if (ha >= 1) return `${ha.toFixed(2)} ha`;
  return `${ha.toFixed(3)} ha`;
}

export function formatAoiAreaHaAndSqm(aoiAreaKm2: number): string {
  const ha = aoiAreaHaFromKm2(aoiAreaKm2);
  const sqm = Math.round(aoiAreaSqmFromKm2(aoiAreaKm2));
  return `${formatHaValue(ha)} (${sqm.toLocaleString('en-US')} m²)`;
}

export function haFromSharePct(pct: number, aoiAreaKm2: number): number {
  if (!Number.isFinite(pct) || !Number.isFinite(aoiAreaKm2)) return 0;
  return (aoiAreaHaFromKm2(aoiAreaKm2) * pct) / 100;
}

/** e.g. 52.9% (43.7 ha) */
export function formatSharePctWithHa(pct: number, aoiAreaKm2: number): string {
  const ha = haFromSharePct(pct, aoiAreaKm2);
  return `${pct.toFixed(1)}% (${formatHaValue(ha)})`;
}

/** Remove repeated hectare annotations after the same percentage, e.g. "52.9% (36.28 ha) (36.28 ha)". */
export function dedupeRepeatedHaAnnotations(text: string): string {
  return text.replace(
    /(\d+(?:\.\d+)?\s*%\s*\(\s*[\d.]+\s*ha\s*\))(?:\s*\(\s*[\d.]+\s*ha\s*\))+/gi,
    '$1',
  );
}

/** Append hectares after bare percentages that are not already annotated. */
export function applyAreaHaToPercentages(text: string, aoiAreaKm2: number): string {
  if (!text.trim() || !Number.isFinite(aoiAreaKm2) || aoiAreaKm2 <= 0) return text;
  let s = dedupeRepeatedHaAnnotations(text);
  s = s.replace(/(\d+(?:\.\d+)?)\s*%(?!\s*\([^)]*\bha\b)/gi, (_m, pct: string) => {
    return formatSharePctWithHa(Number(pct), aoiAreaKm2);
  });
  return dedupeRepeatedHaAnnotations(s);
}
