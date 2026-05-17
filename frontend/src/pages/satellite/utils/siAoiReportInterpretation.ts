import type { SiAoiReportModel } from './siAoiVegetationReportModel'

function safeText(raw: string): string {
  return String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Client-side interpretation bullets when Gemini is unavailable. */
export function buildFallbackInterpretationPoints(report: SiAoiReportModel): string[] {
  const di = report.dataInsights
  const mean =
    report.timeSeries.length > 0
      ? report.timeSeries.reduce((a, t) => a + t.value, 0) / report.timeSeries.length
      : 0
  const meanStr = report.indexId === 'LST' ? mean.toFixed(1) : mean.toFixed(3)
  const top = [...report.tableRows].sort((a, b) => b.pct - a.pct)[0]
  const lowBand = [...report.tableRows].sort((a, b) => a.pct - b.pct)[0]
  const veg = di.dashboard.vegChangePct
  return [
    `${report.indexLabel} period mean (${meanStr}) across ${report.dateStart} to ${report.dateEnd} frames the dominant signal inside "${report.aoiName}" (${report.aoiAreaKm2.toFixed(2)} km2).`,
    `The largest class share (${top?.pct.toFixed(1) ?? '0'}%, range ${safeText(top?.labelEn ?? '-')}) controls ${top?.areaKm2.toFixed(2) ?? '0'} km2 and should be treated as the primary management stratum.`,
    `Low-cover classes (e.g. ${safeText(lowBand?.labelEn ?? 'lower bins')}, ${lowBand?.pct.toFixed(1) ?? '0'}%) concentrate ${lowBand?.areaKm2.toFixed(2) ?? '0'} km2; verify with field plots if operational decisions depend on bare or stressed patches.`,
    `Multi-index context: NDVI avg ${di.dashboard.ndviAvg.toFixed(3)}, NDWI status ${di.dashboard.ndwiStatusLabel}, LST heat risk ${di.dashboard.heatRiskLabel}; vegetation trend ${veg >= 0 ? '+' : ''}${veg.toFixed(1)}% over the window.`,
    report.stressNoteEn
      ? `Stress alert: ${safeText(report.stressNoteEn)} Prioritize ground truthing and reference polygons before irrigation or input changes.`
      : `No acute stress pattern was flagged in the numeric sample; continue routine monitoring and align inputs with the dominant class trajectory.`,
  ]
}
