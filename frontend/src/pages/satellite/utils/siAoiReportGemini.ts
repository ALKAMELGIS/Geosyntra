import { geminiGenerateContent, type GeminiContent } from '../../../lib/geoExplorerGemini';
import type { SiAoiDataInsightsBundle, SiAoiReportModel } from './siAoiVegetationReportModel';

function parseNumberedPoints(text: string, max = 5): string[] {
  const lines = text
    .split(/\n+/)
    .map(l => l.replace(/^\s*[\d]+[.)]\s*/, '').trim())
    .filter(Boolean);
  if (lines.length >= 3) return lines.slice(0, max);
  const chunks = text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 24);
  return chunks.slice(0, max);
}

/**
 * Short executive narrative for AOI remote-sensing report (English, plain text).
 * Returns null if the key is missing or the call fails.
 */
export async function fetchSiAoiReportExecutiveSummaryFromGemini(opts: {
  apiKey: string;
  report: SiAoiReportModel;
  insights: SiAoiDataInsightsBundle;
}): Promise<string | null> {
  const key = opts.apiKey.trim();
  if (!key) return null;

  const { report, insights } = opts;
  const payload = {
    task: 'Write a concise executive summary for a GIS / remote sensing AOI report.',
    rules: [
      'Output plain English only — no markdown, no bullet characters, no JSON.',
      'Maximum 5 sentences. Be precise and non-repetitive.',
      'Reference only facts present in the payload; do not invent scene IDs or satellite products.',
      'Mention vegetation / water / temperature context only when supported by the index statistics.',
    ],
    aoi: report.aoiName,
    period: `${report.dateStart} .. ${report.dateEnd}`,
    primaryIndex: report.indexLabel,
    indexStatistics: insights.indexRows.map(r => ({
      index: r.label,
      min: r.min,
      max: r.max,
      mean: r.mean,
      std: r.std,
      status: r.status,
    })),
    dashboard: insights.dashboard,
    stressFlag: report.stressNoteEn,
  };

  const systemInstruction =
    'You are a senior remote sensing analyst preparing text for a PDF executive box. Follow the rules in the user JSON exactly.';

  const contents: GeminiContent[] = [{ role: 'user', parts: [{ text: JSON.stringify(payload) }] }];

  try {
    const text = await geminiGenerateContent({
      apiKey: key,
      systemInstruction,
      contents,
    });
    const t = text.trim().replace(/^[\s`*#-]+/gm, '').slice(0, 2200);
    return t || null;
  } catch {
    return null;
  }
}

/**
 * Five analytical interpretation bullets for the Scientific GIS report (PDF page 3).
 */
export async function fetchSiAoiReportInterpretationFromGemini(opts: {
  apiKey: string;
  report: SiAoiReportModel;
  insights: SiAoiDataInsightsBundle;
}): Promise<string[] | null> {
  const key = opts.apiKey.trim();
  if (!key) return null;

  const { report, insights } = opts;
  const payload = {
    task: 'Write Interpretation and Recommendations for a scientific GIS vegetation report.',
    rules: [
      'Output exactly 5 numbered points (1. through 5.), one sentence each, plain English only.',
      'Each point must be analytical (cause-effect, risk, management implication) — not generic descriptions.',
      'Use index type, class area shares, mean index, temporal change, and stress flags from the payload only.',
      'No markdown, no JSON, no bullet symbols other than numbers.',
    ],
    aoi: report.aoiName,
    period: `${report.dateStart} .. ${report.dateEnd}`,
    primaryIndex: report.indexLabel,
    periodMean: report.timeSeries.length
      ? report.timeSeries.reduce((a, t) => a + t.value, 0) / report.timeSeries.length
      : null,
    classDistribution: report.tableRows.map((r, i) => ({
      classNo: i + 1,
      indexRange: r.labelEn,
      areaKm2: r.areaKm2,
      sharePct: r.pct,
    })),
    indexStatistics: insights.indexRows.map(r => ({
      index: r.label,
      min: r.min,
      max: r.max,
      mean: r.mean,
      status: r.status,
    })),
    vegetationChangePct: insights.dashboard.vegChangePct,
    heatRisk: insights.dashboard.heatRiskLabel,
    stressFlag: report.stressNoteEn,
  };

  const systemInstruction =
    'You are a senior agronomist and remote sensing scientist. Follow the user JSON rules exactly.';

  const contents: GeminiContent[] = [{ role: 'user', parts: [{ text: JSON.stringify(payload) }] }];

  try {
    const text = await geminiGenerateContent({
      apiKey: key,
      systemInstruction,
      contents,
    });
    const points = parseNumberedPoints(text.trim(), 5);
    return points.length >= 3 ? points : null;
  } catch {
    return null;
  }
}
