import type { SiAoiPdfExportOptions, SiAoiReportModel } from './siAoiVegetationReportModel'

/** Lazy-loaded PDF export — keeps jspdf out of the main report model chunk (avoids init-order TDZ). */
export async function exportSiAoiVegetationReportPdf(
  report: SiAoiReportModel,
  options: SiAoiPdfExportOptions,
): Promise<void> {
  const mod = await import('./siAoiVegetationReportModelPdf')
  return mod.exportSiAoiVegetationReportPdfImpl(report, options)
}
