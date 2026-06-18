import type { SiAoiReportModel } from './siAoiVegetationReportModel'
import {
  buildAgExecutiveSummaryFiveLines,
  clampLiveIndexExecutiveSummary,
  enrichExecutiveSummaryAreaHa,
} from './siAoiLiveIndexExecutiveSummary'
import { buildFallbackReportExecutiveSummary } from './siAoiReportType'

export function normalizeExecSummaryText(raw: string): string {
  let s = String(raw ?? '')
    .replace(/[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000\ufeff]/g, ' ')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
  s = s.replace(/([.!?])\s*([A-Z])/g, '$1 $2')
  return s
}

/** Split executive text into exactly five print-friendly lines (PDF / DOCX / UI). */
export function executiveSummaryParagraphs(raw: string, maxParagraphs = 5): string[] {
  const safe = clampLiveIndexExecutiveSummary(normalizeExecSummaryText(raw))
  if (!safe) return []

  const sentences = safe
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 8)

  if (sentences.length >= maxParagraphs) return sentences.slice(0, maxParagraphs)
  if (sentences.length === maxParagraphs - 1 && sentences.length > 0) return sentences
  if (sentences.length <= 1) return safe ? [safe] : []

  const out: string[] = []
  let buf = ''
  const targetLen = Math.max(140, Math.ceil(safe.length / maxParagraphs))

  for (const sent of sentences) {
    const next = buf ? `${buf} ${sent}` : sent
    if (buf && next.length > targetLen) {
      out.push(buf.trim())
      buf = sent
    } else {
      buf = next
    }
  }
  if (buf.trim()) out.push(buf.trim())
  return out.slice(0, maxParagraphs)
}

/** Resolve export text with Gemini → fallback and hectare annotations on area shares. */
export function getSiAoiExportExecutiveSummaryText(
  report: SiAoiReportModel,
  executiveSummaryAi?: string | null,
): string {
  let text = '';
  if (executiveSummaryAi?.trim()) {
    const fromGemini = clampLiveIndexExecutiveSummary(normalizeExecSummaryText(executiveSummaryAi));
    if (fromGemini) text = fromGemini;
  }

  if (!text) {
    const liveFallback = buildFallbackReportExecutiveSummary(report);
    if (liveFallback) text = liveFallback;
  }

  if (!text) {
    const di = report.dataInsights
    const raw =
      (di.executiveSummaryAi && di.executiveSummaryAi.trim()) ||
      report.summaryLinesEn
        .map(l => l.trim())
        .filter(Boolean)
        .join('. ')
        .replace(/\.\.+/g, '.')
    text = clampLiveIndexExecutiveSummary(normalizeExecSummaryText(raw))
  }

  text = enrichExecutiveSummaryAreaHa(text, report);
  if (text && !/[.!?]$/.test(text)) return `${text}.`;
  return text;
}

/** Five executive summary lines for PDF, DOCX, and Data & insights UI. */
export function getSiAoiExportExecutiveSummaryParagraphs(
  report: SiAoiReportModel,
  executiveSummaryAi?: string | null,
): string[] {
  if (report.reportType === 'AGRICULTURE' && !executiveSummaryAi?.trim()) {
    return buildAgExecutiveSummaryFiveLines(report)
  }
  const text = getSiAoiExportExecutiveSummaryText(report, executiveSummaryAi)
  const paras = executiveSummaryParagraphs(text, 5)
  if (report.reportType === 'AGRICULTURE' && paras.length < 5) {
    return buildAgExecutiveSummaryFiveLines(report)
  }
  return paras
}
