/** Shared AOI report types for PDF cartography — no imports from the full report model. */

export type SiAoiReportTableRow = {
  key: string;
  labelEn: string;
  pct: number;
  areaKm2: number;
  colorHex?: string;
};

export type SiAoiClassificationPalette = {
  high: string;
  medium: string;
  low: string;
  aoiOutline: string;
};

/** Fields required by `drawPdfCartographerMapLayout` (subset of `SiAoiReportModel`). */
export type SiAoiReportCartographyInput = {
  indexLabel: string;
  classificationPalette: SiAoiClassificationPalette;
  tableRows: SiAoiReportTableRow[];
};
