/** Attribute popup analytics — stats, NDVI/AOI detection, export helpers. */

import { isPopupAttributeValueEmpty } from '../../../lib/siLayerPopupInspect';

export type SiAttributePopupRow = { key?: string; label: string; value: string };

const NDVI_RX = /ndvi|gndvi|evi|savi|msavi|nbr|ndwi|ndmi|ndbi/i;
const AOI_RX = /aoi|area_ha|area_m2|hectare|polygon.?area|zone.?area|parcel.?area/i;
const SPATIAL_RX = /\b(buffer|intersect|union|clip|overlay|distance|within|spatial|zonal|hotspot)\b/i;

export function filterNonemptyAttributeRows<T extends SiAttributePopupRow>(rows: T[]): T[] {
  return rows.filter(r => !isPopupAttributeValueEmpty(r.value));
}

export function parseAttributeNumericValue(raw: string): number | null {
  const s = String(raw ?? '').trim().replace(/,/g, '');
  if (!s || s === '—') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export type SiAttributeNumericStat = {
  key: string;
  label: string;
  value: number;
  display: string;
};

export type SiAttributePopupSummary = {
  totalFields: number;
  numericFields: SiAttributeNumericStat[];
  ndviFields: SiAttributePopupRow[];
  aoiFields: SiAttributePopupRow[];
  spatialFields: SiAttributePopupRow[];
  relationFields: SiAttributePopupRow[];
  mediaFields: SiAttributePopupRow[];
};

function rowKey(row: SiAttributePopupRow): string {
  return `${row.key ?? ''} ${row.label}`.trim();
}

export function classifyAttributeRowBucket(
  row: SiAttributePopupRow,
): 'ndvi' | 'aoi' | 'spatial' | 'relation' | 'media' | 'attribute' {
  const hay = rowKey(row) + ' ' + row.value;
  if (NDVI_RX.test(hay)) return 'ndvi';
  if (AOI_RX.test(hay)) return 'aoi';
  if (SPATIAL_RX.test(hay)) return 'spatial';
  if (/(RELATION|PARENT|CHILD|FK_|_FK|LOOKUP|JOIN)/i.test(hay)) return 'relation';
  if (/(PHOTO|IMAGE|THUMB|ATTACH|MEDIA|URL|HTTP|\.PNG|\.JPG|\.PDF)/i.test(hay)) return 'media';
  return 'attribute';
}

export function buildAttributePopupSummary(rows: SiAttributePopupRow[]): SiAttributePopupSummary {
  const nonempty = filterNonemptyAttributeRows(rows);
  const numericFields: SiAttributeNumericStat[] = [];

  for (const r of nonempty) {
    const n = parseAttributeNumericValue(r.value);
    if (n == null) continue;
    if (classifyAttributeRowBucket(r) !== 'attribute' && !/count|qty|amount|total|sum|mean|min|max|avg/i.test(r.label)) {
      continue;
    }
    numericFields.push({
      key: r.key ?? r.label,
      label: r.label,
      value: n,
      display: r.value,
    });
  }

  numericFields.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  return {
    totalFields: nonempty.length,
    numericFields: numericFields.slice(0, 12),
    ndviFields: nonempty.filter(r => classifyAttributeRowBucket(r) === 'ndvi'),
    aoiFields: nonempty.filter(r => classifyAttributeRowBucket(r) === 'aoi'),
    spatialFields: nonempty.filter(r => classifyAttributeRowBucket(r) === 'spatial'),
    relationFields: nonempty.filter(r => classifyAttributeRowBucket(r) === 'relation'),
    mediaFields: nonempty.filter(r => classifyAttributeRowBucket(r) === 'media'),
  };
}

export function filterAttributeRowsByQuery<T extends SiAttributePopupRow>(rows: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(r => r.label.toLowerCase().includes(q) || r.value.toLowerCase().includes(q));
}

export function formatAttributesAsPlainText(rows: SiAttributePopupRow[]): string {
  return filterNonemptyAttributeRows(rows)
    .map(r => `${r.label}: ${r.value}`)
    .join('\n');
}

export function buildAttributesCsv(rows: SiAttributePopupRow[]): string {
  const lines = ['Field,Value'];
  for (const r of filterNonemptyAttributeRows(rows)) {
    const label = `"${r.label.replace(/"/g, '""')}"`;
    const value = `"${String(r.value).replace(/"/g, '""')}"`;
    lines.push(`${label},${value}`);
  }
  return lines.join('\n');
}

export function downloadAttributeExport(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function readDocumentTextDirection(): 'rtl' | 'ltr' {
  if (typeof document === 'undefined') return 'ltr';
  return document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr';
}

/** Windowed slice for large attribute lists (fixed row height). */
export function sliceVirtualAttributeRows<T>(
  rows: T[],
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  overscan = 6,
): { offsetY: number; visible: T[]; startIndex: number; totalHeight: number } {
  if (rows.length <= 80) {
    return { offsetY: 0, visible: rows, startIndex: 0, totalHeight: rows.length * rowHeight };
  }
  const totalHeight = rows.length * rowHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visibleCount = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
  const endIndex = Math.min(rows.length, startIndex + visibleCount);
  return {
    offsetY: startIndex * rowHeight,
    visible: rows.slice(startIndex, endIndex),
    startIndex,
    totalHeight,
  };
}
