/** Narrative tone for Gemini executive text and PDF section labels. */
export type SiAoiReportStyleMode = 'SCIENTIFIC' | 'EXECUTIVE' | 'SUMMARY' | 'TECHNICAL';

export const SI_AOI_REPORT_STYLE_MODES: readonly SiAoiReportStyleMode[] = [
  'SCIENTIFIC',
  'EXECUTIVE',
  'SUMMARY',
  'TECHNICAL',
] as const;

export const DEFAULT_SI_AOI_REPORT_STYLE_MODE: SiAoiReportStyleMode = 'SCIENTIFIC';

export function isSiAoiReportStyleMode(v: string): v is SiAoiReportStyleMode {
  return (SI_AOI_REPORT_STYLE_MODES as readonly string[]).includes(v);
}

export type SiAoiReportStyleModeUiOption = {
  id: SiAoiReportStyleMode;
  label: string;
  hint: string;
};

export const SI_AOI_REPORT_STYLE_MODE_OPTIONS: readonly SiAoiReportStyleModeUiOption[] = [
  {
    id: 'SCIENTIFIC',
    label: 'Scientific',
    hint: 'Dense GIS narrative — CRS, composites, legend bands, field-validation alerts (print-ready).',
  },
  {
    id: 'EXECUTIVE',
    label: 'Executive',
    hint: 'Decision-focused: outcomes, risks, and operational takeaways in plain language.',
  },
  {
    id: 'SUMMARY',
    label: 'Summary',
    hint: 'Ultra-brief headline — AOI, index, period, and mean only (2–3 sentences).',
  },
  {
    id: 'TECHNICAL',
    label: 'Technical',
    hint: 'Processing lineage, cloud cap, temporal stack, data limitations, and QA notes.',
  },
] as const;

export type SiAoiStyleModePdfLabels = {
  reportTitle: string;
  narrativeSectionTitle: string;
  interpretationSectionTitle: string;
};

export function siAoiReportStyleModePdfLabels(mode: SiAoiReportStyleMode): SiAoiStyleModePdfLabels {
  switch (mode) {
    case 'EXECUTIVE':
      return {
        reportTitle: 'Executive brief (AOI)',
        narrativeSectionTitle: 'Executive summary',
        interpretationSectionTitle: 'Recommendations',
      };
    case 'SUMMARY':
      return {
        reportTitle: 'AOI summary report',
        narrativeSectionTitle: 'Summary',
        interpretationSectionTitle: 'Key points',
      };
    case 'TECHNICAL':
      return {
        reportTitle: 'Technical GIS report (AOI)',
        narrativeSectionTitle: 'Technical summary',
        interpretationSectionTitle: 'Methods & QA notes',
      };
    case 'SCIENTIFIC':
    default:
      return {
        reportTitle: 'Scientific GIS report (AOI)',
        narrativeSectionTitle: 'Executive summary',
        interpretationSectionTitle: 'Interpretation',
      };
  }
}

export type SiAoiStyleModeGeminiExecutiveConfig = {
  task: string;
  rules: string[];
  systemInstruction: string;
  maxChars: number;
};

export type SiAoiStyleModeGeminiInterpretationConfig = {
  task: string;
  rules: string[];
  systemInstruction: string;
  pointCount: number;
};

export function siAoiReportStyleModeExecutiveConfig(mode: SiAoiReportStyleMode): SiAoiStyleModeGeminiExecutiveConfig {
  switch (mode) {
    case 'EXECUTIVE':
      return {
        task: 'Write an executive brief for a satellite AOI intelligence report.',
        rules: [
          'Output plain English only — no markdown, no bullets, no JSON.',
          'Maximum 4 sentences. Lead with the operational takeaway, then supporting facts.',
          'Use plain language; avoid acronyms unless defined once (e.g. NDVI).',
          'Reference only facts in the payload. Flag stress or abrupt change when stressFlag is set.',
          'End with a practical recommendation (monitor, validate in field, or no immediate action).',
        ],
        systemInstruction:
          'You are a chief geospatial officer writing for non-specialist decision makers. Be crisp and actionable.',
        maxChars: 1400,
      };
    case 'SUMMARY':
      return {
        task: 'Write a minimal AOI summary for a GIS dashboard export.',
        rules: [
          'Output plain English only — no markdown, no bullets, no JSON.',
          'Maximum 3 short sentences. First sentence: AOI + index + period. Second: period mean and dominant class share if present. Third: one-line caveat or stress flag only if applicable.',
          'Do not mention CRS, cloud screening, or composite methodology unless stressFlag requires a caution.',
          'Reference only facts in the payload.',
        ],
        systemInstruction: 'You write ultra-brief satellite AOI headlines for busy readers.',
        maxChars: 520,
      };
    case 'TECHNICAL':
      return {
        task: 'Write a technical processing summary for a remote-sensing AOI report.',
        rules: [
          'Output plain English only — no markdown, no bullets, no JSON.',
          'Maximum 7 sentences. Cover: data source/provider, index and period, cloud screening cap, temporal composite method, CRS, legend band count, period mean, and explicit data-limitation note when demoClientSide is true.',
          'Use precise RS/GIS terms (MAXCC-style cloud cap, median-of-weekly composites, classified ramp bands).',
          'Reference only facts in the payload; state uncertainty where values are client-side demo.',
          'If stressFlag is set, note it as a QA outlier flag, not a confirmed field event.',
        ],
        systemInstruction:
          'You are a remote sensing engineer documenting methodology for audit and reproducibility.',
        maxChars: 2400,
      };
    case 'SCIENTIFIC':
    default:
      return {
        task: 'Write a scientific executive narrative for a GIS / remote sensing AOI report (print-ready PDF block).',
        rules: [
          'Output plain English only — no markdown, no bullet characters, no JSON, no line breaks.',
          'One cohesive paragraph, maximum 8 sentences. Use formal scientific GIS tone.',
          'Use normal spaces between words and after punctuation — never concatenate words.',
          'Open with satellite provider and AOI name when provided; state index and analysis period.',
          'Report period mean index with approximate notation (~) when given.',
          'Include RS processing context when present: cloud screening threshold, temporal composite label, and CRS.',
          'Mention legend band count and that class shares follow the WMS classified ramp (demo apportionment if demoClientSide).',
          'Briefly interpret the temporal/vegetation signal; use stressFlag for an Alert sentence with field-validation disclaimer.',
          'Reference only facts in the payload; do not invent scene IDs or satellite products.',
        ],
        systemInstruction:
          'You are a senior remote sensing scientist preparing text for a Scientific GIS report PDF. Match peer-review report tone.',
        maxChars: 2200,
      };
  }
}

export function siAoiReportStyleModeInterpretationConfig(
  mode: SiAoiReportStyleMode,
): SiAoiStyleModeGeminiInterpretationConfig {
  switch (mode) {
    case 'EXECUTIVE':
      return {
        task: 'Write executive recommendations for an AOI satellite report.',
        rules: [
          'Output exactly 4 numbered points (1. through 4.), one sentence each, plain English only.',
          'Focus on decisions, risks, and next steps — not methodology.',
          'Use class shares, mean index, and stress flags from the payload only.',
          'No markdown, no JSON.',
        ],
        systemInstruction: 'You advise land managers and executives on satellite-derived vegetation intelligence.',
        pointCount: 4,
      };
    case 'SUMMARY':
      return {
        task: 'Write key takeaway bullets for a short AOI summary.',
        rules: [
          'Output exactly 3 numbered points (1. through 3.), one short sentence each, plain English only.',
          'Each point is a single fact or caution — no cause-effect essays.',
          'No markdown, no JSON.',
        ],
        systemInstruction: 'You distill satellite AOI reports into three headline bullets.',
        pointCount: 3,
      };
    case 'TECHNICAL':
      return {
        task: 'Write technical QA and methods notes for a GIS AOI report.',
        rules: [
          'Output exactly 5 numbered points (1. through 5.), one sentence each, plain English only.',
          'Cover processing assumptions, composite choice, cloud cap, CRS, and client-side/demo limitations where applicable.',
          'Include one point on validation workflow (field check, zonal-stats API, or temporal continuity).',
          'No markdown, no JSON.',
        ],
        systemInstruction:
          'You are a remote sensing QA lead documenting limitations and validation steps for technical readers.',
        pointCount: 5,
      };
    case 'SCIENTIFIC':
    default:
      return {
        task: 'Write Interpretation and Recommendations for a scientific GIS vegetation report.',
        rules: [
          'Output exactly 5 numbered points (1. through 5.), one sentence each, plain English only.',
          'Each point must be analytical (cause-effect, risk, management implication) — not generic descriptions.',
          'Use index type, class area shares, mean index, temporal change, and stress flags from the payload only.',
          'No markdown, no JSON, no bullet symbols other than numbers.',
        ],
        systemInstruction:
          'You are a senior agronomist and remote sensing scientist. Follow the user JSON rules exactly.',
        pointCount: 5,
      };
  }
}

/** UI label for the narrative block in preview. */
export function siAoiReportStyleModeNarrativeHeading(mode: SiAoiReportStyleMode): string {
  return siAoiReportStyleModePdfLabels(mode).narrativeSectionTitle;
}
