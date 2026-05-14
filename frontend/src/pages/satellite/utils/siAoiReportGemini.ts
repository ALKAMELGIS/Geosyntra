import { geminiGenerateContent, type GeminiContent } from '../../../lib/geoExplorerGemini';
import type { SiAoiDataInsightsBundle, SiAoiReportModel } from './siAoiVegetationReportModel';

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
