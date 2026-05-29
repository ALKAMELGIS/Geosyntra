import type { SiAoiReportModel } from './siAoiVegetationReportModel'

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

/** Split long executive text into print-friendly paragraphs (PDF / DOCX / UI). */
export function executiveSummaryParagraphs(raw: string, maxParagraphs = 4): string[] {
  const safe = normalizeExecSummaryText(raw)
  if (!safe) return []
  if (safe.length <= 300) return [safe]

  const sentences = safe
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 8)

  if (sentences.length <= 1) return [safe]

  const out: string[] = []
  let buf = ''
  const targetLen = Math.max(180, Math.ceil(safe.length / maxParagraphs))

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

/** Plain executive summary for exports (Gemini → stored → baseline lines). */
export function getSiAoiExportExecutiveSummaryText(
  report: SiAoiReportModel,
  executiveSummaryAi?: string | null,
): string {
  const di = report.dataInsights
  const raw =
    (executiveSummaryAi && executiveSummaryAi.trim()) ||
    (di.executiveSummaryAi && di.executiveSummaryAi.trim()) ||
    report.summaryLinesEn
      .map(l => l.trim())
      .filter(Boolean)
      .join('. ')
      .replace(/\.\.+/g, '.')
  const normalized = normalizeExecSummaryText(raw)
  if (normalized && !/[.!?]$/.test(normalized)) return `${normalized}.`
  return normalized
}
