import type { SiAoiDataInsightsBundle, SiAoiReportModel } from './siAoiVegetationReportModel';
import {
  flattenSiAoiAgriculturalInterpretation,
  type SiAoiAgriculturalInterpretation,
} from './siAoiAgriculturalInterpretation';
import { buildFallbackReportInterpretation } from './siAoiReportType';
import { formatNumericRangeDisplay } from './siCropGrowthStage';

function safeText(raw: string): string {
  return String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Short numeric range label for tables and bullets (no GIS "Index" prefix). */
export function classDisplayName(labelEn: string): string {
  return formatNumericRangeDisplay(safeText(labelEn))
}

function indexStatusPhrase(indexId: string, mean: number): string {
  if (indexId === 'NDVI' || indexId === 'SAVI' || indexId === 'EVI') {
    if (mean >= 0.5) return 'strong vegetation'
    if (mean >= 0.25) return 'moderate vegetation'
    if (mean >= 0.1) return 'sparse vegetation'
    return 'mostly bare or built-up'
  }
  if (indexId === 'NDWI') {
    if (mean >= 0.3) return 'high water signal'
    if (mean >= 0.1) return 'mixed wet and dry'
    return 'mostly dry surface'
  }
  if (indexId === 'LST') {
    if (mean >= 33) return 'hot'
    if (mean >= 28) return 'warm'
    return 'cool'
  }
  return mean >= 0.35 ? 'high' : mean >= 0.15 ? 'moderate' : 'low'
}

/** Weekly PDF: three short interpretation bullets (plain language). */
export function buildWeeklyPdfInterpretationPoints(report: SiAoiReportModel): string[] {
  const mean =
    report.timeSeries.length > 0
      ? report.timeSeries.reduce((a, t) => a + t.value, 0) / report.timeSeries.length
      : (report.liveLayerAnalysis?.healthPrimaryMean ??
        report.timeSeries[report.timeSeries.length - 1]?.value ??
        0)
  const meanStr = report.indexId === 'LST' ? mean.toFixed(1) : mean.toFixed(2)
  const top = [...report.tableRows].sort((a, b) => b.pct - a.pct)[0]
  const second = [...report.tableRows].sort((a, b) => b.pct - a.pct)[1]
  const topName = top ? classDisplayName(top.labelEn) : '—'
  const topHa = top ? top.areaKm2 * 100 : 0
  const pts: string[] = [
    top
      ? `Main class: ${topName} — ${top.pct.toFixed(0)}% of the area (${topHa >= 10 ? topHa.toFixed(0) : topHa.toFixed(1)} ha).${second && second.pct >= 8 ? ` Next: ${classDisplayName(second.labelEn)} (${second.pct.toFixed(0)}%).` : ''}`
      : 'Class areas could not be summarized for this export.',
    `Overall ${report.indexLabel}: ${indexStatusPhrase(report.indexId, mean)} (average ~ ${meanStr}) for ${report.dateStart} to ${report.dateEnd}.`,
    report.stressNoteEn
      ? 'Note: a sharp change was flagged — worth a quick field check.'
      : 'No major sudden change flagged — suitable for routine weekly monitoring.',
  ]
  return pts.slice(0, 3)
}

/** Client-side Yield Insight when Gemini is unavailable. */
export function buildFallbackAgriculturalInterpretation(
  report: SiAoiReportModel,
  insights?: SiAoiDataInsightsBundle,
): SiAoiAgriculturalInterpretation {
  return buildFallbackReportInterpretation(report, insights);
}

/** Client-side interpretation bullets when Gemini is unavailable. */
export function buildFallbackInterpretationPoints(report: SiAoiReportModel): string[] {
  return flattenSiAoiAgriculturalInterpretation(buildFallbackAgriculturalInterpretation(report));
}
