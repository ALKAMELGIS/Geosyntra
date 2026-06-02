import {
  buildSiAoiAgriculturalInterpretation,
  buildSiAoiInterpretationMetrics,
  enrichSiAoiAgriculturalInterpretation,
  type SiAoiAgriculturalInterpretation,
  type SiAoiInterpretationMetrics,
} from './siAoiAgriculturalInterpretation';
import { applyAreaHaToPercentages, formatSharePctWithHa } from './siAoiReportAreaFormat';
import {
  buildFallbackLiveIndexExecutiveSummary,
  buildLiveIndexExecutiveContext,
  clampLiveIndexExecutiveSummary,
  enrichExecutiveSummaryAreaHa,
} from './siAoiLiveIndexExecutiveSummary';
import type { SiAoiDataInsightsBundle, SiAoiReportModel } from './siAoiVegetationReportModel';
import type { StaticAoiChartLayerId } from './staticAoiMultiChartData';

export type SiAoiReportType =
  | 'AGRICULTURE'
  | 'INFRASTRUCTURE'
  | 'URBAN_PLANNING'
  | 'ENVIRONMENTAL'
  | 'INDUSTRIAL'
  | 'WATER_RESOURCES'
  | 'TRANSPORTATION'
  | 'LAND_USE'
  | 'DISASTER_RISK'
  | 'CUSTOM';

export const SI_AOI_REPORT_TYPES: readonly SiAoiReportType[] = [
  'AGRICULTURE',
  'INFRASTRUCTURE',
  'URBAN_PLANNING',
  'ENVIRONMENTAL',
  'INDUSTRIAL',
  'WATER_RESOURCES',
  'TRANSPORTATION',
  'LAND_USE',
  'DISASTER_RISK',
  'CUSTOM',
] as const;

export const DEFAULT_SI_AOI_REPORT_TYPE: SiAoiReportType = 'AGRICULTURE';

export function isSiAoiReportType(v: string): v is SiAoiReportType {
  return (SI_AOI_REPORT_TYPES as readonly string[]).includes(v);
}

export type SiAoiReportTypeUiOption = {
  id: SiAoiReportType;
  label: string;
  hint: string;
};

export const SI_AOI_REPORT_TYPE_OPTIONS: readonly SiAoiReportTypeUiOption[] = [
  {
    id: 'AGRICULTURE',
    label: 'Agriculture Report',
    hint: 'Crop health, NDVI/NDMI, yield potential, soil moisture, disease risk, and agronomic recommendations.',
  },
  {
    id: 'INFRASTRUCTURE',
    label: 'Infrastructure Report',
    hint: 'Roads, bridges, utilities, asset condition, service areas, maintenance priorities, and access analysis.',
  },
  {
    id: 'URBAN_PLANNING',
    label: 'Urban Planning Report',
    hint: 'Land use, urban density, growth, expansion, public services, and plan compatibility.',
  },
  {
    id: 'ENVIRONMENTAL',
    label: 'Environmental Report',
    hint: 'Vegetation cover, environmental quality, sensitive areas, LST, and degradation risk.',
  },
  {
    id: 'INDUSTRIAL',
    label: 'Industrial Report',
    hint: 'Industrial sites, supporting infrastructure, logistics access, and environmental risk around facilities.',
  },
  {
    id: 'WATER_RESOURCES',
    label: 'Water Resources Report',
    hint: 'Surface water (NDWI), moisture (NDMI), hydrology proxies, and water-related change within the AOI.',
  },
  {
    id: 'TRANSPORTATION',
    label: 'Transportation Report',
    hint: 'Corridors, connectivity, access, and land-cover context for mobility and logistics planning.',
  },
  {
    id: 'LAND_USE',
    label: 'Land Use / Land Cover Report',
    hint: 'Class distribution, cover change, dominant land covers, and transition signals in the AOI.',
  },
  {
    id: 'DISASTER_RISK',
    label: 'Disaster & Risk Assessment Report',
    hint: 'Stress hotspots, bare/exposed land, heat, moisture deficit, and rapid change flags for risk screening.',
  },
  {
    id: 'CUSTOM',
    label: 'Custom Report',
    hint: 'Gemini interprets active layers and AOI statistics without a fixed sector template.',
  },
] as const;

export type SiAoiReportActiveLayerInfo = {
  id: string;
  label: string;
  kind: 'raster' | 'vector';
  visible: boolean;
  source?: string;
};

export type SiAoiReportActiveLayersContext = {
  primaryIndexId: string;
  primaryIndexLabel: string;
  layers: SiAoiReportActiveLayerInfo[];
};

export type SiAoiReportTypeGeminiConfig = {
  domainLabel: string;
  executiveTask: string;
  executiveRules: string[];
  executiveSystem: string;
  interpretationTask: string;
  interpretationRules: string[];
  interpretationSystem: string;
  focusTopics: string[];
};

const TYPE_GEMINI: Record<SiAoiReportType, SiAoiReportTypeGeminiConfig> = {
  AGRICULTURE: {
    domainLabel: 'Agriculture',
    executiveTask: 'Write an agricultural executive summary from Live Index layers inside the AOI.',
    executiveRules: [
      'Focus on NDVI, NDMI soil moisture, NDWI water signal, crop health shares, yield potential, temperature stress, and temporal trend.',
      'Include hectares beside every area percentage using aoiAreaHa.',
    ],
    executiveSystem:
      'You are a senior agricultural engineer advising farm managers from satellite live-index analytics.',
    interpretationTask:
      'Produce a Yield Insight interpretation comparing productive vs stressed hectares with agronomic recommendations.',
    interpretationRules: [
      'Cite NDVI, NDMI (soil moisture), NDWI (water), LST °C, and area shares with % (ha).',
      'Recommendations must be agronomic (irrigation, scouting, harvest timing).',
    ],
    interpretationSystem:
      'You are an agricultural engineer translating satellite indicators into yield-focused field intelligence.',
    focusTopics: ['NDVI', 'NDMI', 'crop health', 'yield', 'soil moisture', 'disease risk', 'LST stress'],
  },
  INFRASTRUCTURE: {
    domainLabel: 'Infrastructure',
    executiveTask: 'Write an infrastructure executive summary for assets and service areas in the AOI.',
    executiveRules: [
      'Interpret vector/raster layers and class shares as proxies for built environment, corridors, and open land.',
      'Highlight maintenance priority zones, access constraints, and heat or moisture stress affecting assets.',
      'Include hectares beside percentages; recommend field verification of critical assets.',
    ],
    executiveSystem: 'You advise infrastructure planners and asset managers using geospatial analytics.',
    interpretationTask: 'Interpret AOI layers for infrastructure condition, access, and maintenance priorities.',
    interpretationRules: [
      'Relate dominant classes and index means to roads, utilities, built-up vs open land when layer names support it.',
      'Recommendations: inspection routes, drainage/heat checks, corridor clearance — not crop advice.',
    ],
    interpretationSystem: 'You are a civil infrastructure analyst reading satellite-derived AOI intelligence.',
    focusTopics: ['roads', 'bridges', 'utilities', 'service areas', 'maintenance', 'access'],
  },
  URBAN_PLANNING: {
    domainLabel: 'Urban planning',
    executiveTask: 'Write an urban planning executive summary for land use and growth patterns in the AOI.',
    executiveRules: [
      'Emphasize land-use mix, density proxies, urban expansion, bare/built vs vegetated shares, and temporal change.',
      'Reference active layer names when inferring residential, commercial, or open-space context.',
      'Include hectares beside percentages; align language with master-plan screening not agronomy.',
    ],
    executiveSystem: 'You are an urban planner synthesizing satellite indicators for plan review.',
    interpretationTask: 'Interpret the AOI for urban land use, density, growth, and public-service context.',
    interpretationRules: [
      'Map class distribution to urban land-use language; cite vegChangePct for expansion or infill signals.',
      'Recommendations: zoning review, green-space buffers, density hotspots — not irrigation schedules.',
    ],
    interpretationSystem: 'You advise urban planners on satellite-derived land-use intelligence.',
    focusTopics: ['land use', 'density', 'urban growth', 'expansion', 'services', 'zoning'],
  },
  ENVIRONMENTAL: {
    domainLabel: 'Environmental',
    executiveTask: 'Write an environmental executive summary for habitat, quality, and stress in the AOI.',
    executiveRules: [
      'Focus on vegetation cover, environmental quality classes, LST, moisture, sensitive bare/stress patches.',
      'Flag degradation or recovery signals from timelineChart and vegChangePct.',
      'Include hectares beside percentages; avoid crop-yield language unless layers explicitly agricultural.',
    ],
    executiveSystem: 'You are an environmental scientist preparing AOI screening summaries.',
    interpretationTask: 'Interpret environmental condition, sensitive areas, and degradation risk in the AOI.',
    interpretationRules: [
      'Use NDVI/NDMI/NDWI/LST as environmental indicators; relate stressed hectares to exposure or dryness.',
      'Recommendations: monitoring, restoration priority areas, protective buffers.',
    ],
    interpretationSystem: 'You translate satellite metrics into environmental management insight.',
    focusTopics: ['vegetation cover', 'environmental quality', 'LST', 'sensitive areas', 'degradation'],
  },
  INDUSTRIAL: {
    domainLabel: 'Industrial',
    executiveTask: 'Write an industrial site intelligence summary for the AOI.',
    executiveRules: [
      'Focus on industrial land proxies, logistics access, surrounding vegetation/water context, and heat or moisture anomalies.',
      'Use active layer labels to infer facilities, buffers, or transport links when present.',
      'Include hectares beside percentages; highlight environmental risk near operational zones.',
    ],
    executiveSystem: 'You advise industrial planners on geospatial site intelligence.',
    interpretationTask: 'Interpret the AOI for industrial sites, logistics access, and surrounding environmental risk.',
    interpretationRules: [
      'Separate operational/built signals from vegetated buffers; cite heat and moisture stress near bare/high-LST patches.',
      'Recommendations: buffer monitoring, access upgrades, environmental compliance checks.',
    ],
    interpretationSystem: 'You are an industrial geospatial analyst.',
    focusTopics: ['industrial sites', 'logistics', 'access', 'environmental risk', 'heat'],
  },
  WATER_RESOURCES: {
    domainLabel: 'Water resources',
    executiveTask: 'Write a water-resources executive summary for the AOI.',
    executiveRules: [
      'Lead with NDWI water signal and NDMI moisture; relate class shares to wet vs dry surfaces.',
      'Use timelineChart for seasonal wetness trends; include hectares beside percentages.',
      'Avoid crop-yield framing unless layers are explicitly agricultural.',
    ],
    executiveSystem: 'You are a hydrology-oriented remote sensing analyst.',
    interpretationTask: 'Interpret surface water and soil/canopy moisture patterns from NDWI, NDMI, and class shares.',
    interpretationRules: [
      'Always cite NDWI and NDMI with numeric values when available; relate stressed/dry hectares to deficit zones.',
      'Recommendations: monitoring points, retention, irrigation source checks — sector-appropriate to water management.',
    ],
    interpretationSystem: 'You advise water resource managers using satellite moisture indices.',
    focusTopics: ['NDWI', 'NDMI', 'surface water', 'moisture', 'hydrology proxy'],
  },
  TRANSPORTATION: {
    domainLabel: 'Transportation',
    executiveTask: 'Write a transportation-oriented executive summary for corridors and access in the AOI.',
    executiveRules: [
      'Interpret linear/corridor layers and land-cover context for connectivity and access.',
      'Relate bare/built vs vegetated shares to right-of-way and encroachment screening.',
      'Include hectares beside percentages; mention heat or flood-proxy stress only when supported by indices.',
    ],
    executiveSystem: 'You advise transport planners using geospatial corridor intelligence.',
    interpretationTask: 'Interpret mobility corridors, access, and land-cover constraints in the AOI.',
    interpretationRules: [
      'Use layer names + class distribution; cite vegChangePct if corridors may be affected by land-cover change.',
      'Recommendations: corridor monitoring, clearance, connectivity gaps — not agronomic advice.',
    ],
    interpretationSystem: 'You are a transportation GIS analyst.',
    focusTopics: ['corridors', 'connectivity', 'access', 'right-of-way', 'land cover'],
  },
  LAND_USE: {
    domainLabel: 'Land use / land cover',
    executiveTask: 'Write a land-use / land-cover executive summary for class distribution and change in the AOI.',
    executiveRules: [
      'Emphasize dominant classes with % (ha), secondary classes, and period change (vegChangePct / timeline).',
      'Reference active layers and field statistics; avoid sector-specific yield language.',
      'Exactly five sentences; include hectares beside shares.',
    ],
    executiveSystem: 'You produce LULC screening summaries for GIS analysts and planners.',
    interpretationTask: 'Interpret land-cover class distribution, shares, and temporal change in the AOI.',
    interpretationRules: [
      'Insight 1: dominant + secondary class shares with ha; insight on change trend; index context as supporting evidence.',
      'Recommendations: verification plots, update cadence, priority classes to monitor.',
    ],
    interpretationSystem: 'You are a land-cover interpretation specialist.',
    focusTopics: ['land cover', 'class distribution', 'change detection', 'dominant classes'],
  },
  DISASTER_RISK: {
    domainLabel: 'Disaster & risk',
    executiveTask: 'Write a disaster and risk screening summary for the AOI.',
    executiveRules: [
      'Highlight stressed/bare hectares, heat (LST), moisture deficit (NDMI), water loss (NDWI), and abrupt change (stressFlag, vegChangePct).',
      'Use risk-screening language — not definitive disaster claims without payload support.',
      'Include hectares beside percentages; five sentences.',
    ],
    executiveSystem: 'You are a disaster risk analyst using satellite screening indicators.',
    interpretationTask: 'Interpret hazard exposure proxies: stress hotspots, heat, dryness, and rapid change.',
    interpretationRules: [
      'Quantify stressed/bare shares with ha; cite indices driving risk; temporal trend for escalation or relief.',
      'Recommendations: early warning checks, field validation, priority evacuation or mitigation zones when supported.',
    ],
    interpretationSystem: 'You advise emergency management with satellite-derived risk indicators.',
    focusTopics: ['stress', 'heat', 'drought proxy', 'bare soil', 'rapid change', 'risk hotspots'],
  },
  CUSTOM: {
    domainLabel: 'Custom',
    executiveTask: 'Write a domain-neutral executive summary driven by the active layers and AOI statistics provided.',
    executiveRules: [
      'Infer the most relevant domain from activeLayers and indexStatistics — do not assume agriculture.',
      'Summarize only payload facts; include % (ha) for area shares when citing classDistribution.',
      'Five sentences; end with one sector-appropriate recommendation inferred from layers.',
    ],
    executiveSystem: 'You are a geospatial analyst adapting narrative to the layers and AOI context supplied.',
    interpretationTask: 'Interpret the AOI using whatever layers and indices are most relevant in the payload.',
    interpretationRules: [
      'Let active layer names and index rows drive focus; avoid fixed crop templates.',
      'Five insights and three recommendations tailored to inferred domain.',
    ],
    interpretationSystem: 'You produce flexible AOI intelligence from heterogeneous layer stacks.',
    focusTopics: ['active layers', 'AOI statistics', 'index means', 'class shares'],
  },
};

export function siAoiReportTypeGeminiConfig(type: SiAoiReportType): SiAoiReportTypeGeminiConfig {
  return TYPE_GEMINI[type] ?? TYPE_GEMINI.CUSTOM;
}

export function siAoiReportTypeLabel(type: SiAoiReportType): string {
  return SI_AOI_REPORT_TYPE_OPTIONS.find(o => o.id === type)?.label ?? type;
}

export function siAoiReportTypeInterpretationSectionTitle(type: SiAoiReportType): string {
  switch (type) {
    case 'AGRICULTURE':
      return 'Yield insight — interpretation';
    case 'INFRASTRUCTURE':
      return 'Infrastructure insight — interpretation';
    case 'URBAN_PLANNING':
      return 'Urban planning insight — interpretation';
    case 'ENVIRONMENTAL':
      return 'Environmental insight — interpretation';
    case 'INDUSTRIAL':
      return 'Industrial insight — interpretation';
    case 'WATER_RESOURCES':
      return 'Water resources insight — interpretation';
    case 'TRANSPORTATION':
      return 'Transportation insight — interpretation';
    case 'LAND_USE':
      return 'Land use / cover insight — interpretation';
    case 'DISASTER_RISK':
      return 'Disaster & risk insight — interpretation';
    case 'CUSTOM':
    default:
      return 'Domain insight — interpretation';
  }
}

export function buildSiAoiReportActiveLayersContext(opts: {
  primaryIndexId: string;
  primaryIndexLabel?: string;
  wmsLayerId?: string;
  wmsLayerLabel?: string;
  wmsVisible?: boolean;
  environmentalIndexId?: string;
  environmentalIndexLabel?: string;
  indexVisible?: boolean;
  customLayers?: Array<{
    id: string;
    name: string;
    visible: boolean;
    renderMode?: string;
    geojson?: unknown;
    source?: string;
  }>;
}): SiAoiReportActiveLayersContext {
  const primaryIndexId = opts.primaryIndexId;
  const primaryIndexLabel = opts.primaryIndexLabel ?? primaryIndexId;
  const layers: SiAoiReportActiveLayerInfo[] = [];

  if (opts.wmsLayerId?.trim()) {
    layers.push({
      id: opts.wmsLayerId.trim(),
      label: opts.wmsLayerLabel?.trim() || opts.wmsLayerId.trim(),
      kind: 'raster',
      visible: opts.wmsVisible !== false,
      source: 'wms',
    });
  }

  if (opts.environmentalIndexId?.trim()) {
    layers.push({
      id: opts.environmentalIndexId.trim(),
      label: opts.environmentalIndexLabel?.trim() || opts.environmentalIndexId.trim(),
      kind: 'raster',
      visible: opts.indexVisible !== false,
      source: 'environmental-index',
    });
  }

  for (const cl of opts.customLayers ?? []) {
    if (!cl.visible) continue;
    const kind: 'raster' | 'vector' =
      cl.renderMode === 'raster' || cl.renderMode === 'bim' ? 'raster' : 'vector';
    layers.push({
      id: String(cl.id),
      label: cl.name?.trim() || String(cl.id),
      kind,
      visible: true,
      source: cl.source ?? 'custom',
    });
  }

  return { primaryIndexId, primaryIndexLabel, layers };
}

export function inferDefaultSiAoiReportType(opts: {
  indexId?: StaticAoiChartLayerId | string;
  layerLabels?: string[];
  aoiName?: string;
}): SiAoiReportType {
  const blob = `${opts.indexId ?? ''} ${(opts.layerLabels ?? []).join(' ')} ${opts.aoiName ?? ''}`.toLowerCase();
  if (/road|bridge|utility|pipe|grid|infrastructure|corridor/.test(blob)) return 'INFRASTRUCTURE';
  if (/urban|city|zoning|planning|built|jeddah|dubai|district/.test(blob)) return 'URBAN_PLANNING';
  if (/industrial|factory|plant|logistics|warehouse/.test(blob)) return 'INDUSTRIAL';
  if (/water|ndwi|hydro|river|lake|wet/.test(blob)) return 'WATER_RESOURCES';
  if (/transport|rail|highway|mobility|transit/.test(blob)) return 'TRANSPORTATION';
  if (/risk|disaster|flood|fire|hazard|emergency/.test(blob)) return 'DISASTER_RISK';
  if (/land.?use|lulc|cover|landcover/.test(blob)) return 'LAND_USE';
  if (/environment|habitat|conservation|forest|ecolog/.test(blob)) return 'ENVIRONMENTAL';
  if (opts.indexId === 'NDWI') return 'WATER_RESOURCES';
  if (opts.indexId === 'NDMI') return 'AGRICULTURE';
  if (opts.indexId === 'NDVI' || opts.indexId === 'SAVI' || opts.indexId === 'EVI') return 'AGRICULTURE';
  return DEFAULT_SI_AOI_REPORT_TYPE;
}

export function buildReportLayersPayload(report: SiAoiReportModel) {
  const ctx = report.activeLayersContext;
  return {
    reportType: report.reportType,
    reportTypeLabel: siAoiReportTypeLabel(report.reportType),
    primaryIndex: report.indexLabel,
    primaryIndexId: report.indexId,
    activeLayers: ctx?.layers ?? [],
    activeLayerLabels: (ctx?.layers ?? []).map(l => l.label),
    visibleLayerCount: (ctx?.layers ?? []).filter(l => l.visible).length,
  };
}

function layerNames(report: SiAoiReportModel): string {
  return (report.activeLayersContext?.layers ?? []).map(l => l.label).join(', ') || report.indexLabel;
}

function genericRiskLevel(m: SiAoiInterpretationMetrics): 'Low' | 'Medium' | 'High' {
  if (m.stressedAreaPct >= 35 || m.heatRiskLabel === 'High') return 'High';
  if (m.stressedAreaPct >= 15 || m.heatRiskLabel === 'Moderate') return 'Medium';
  return 'Low';
}

function buildGenericTypedInterpretation(
  report: SiAoiReportModel,
  insights: SiAoiDataInsightsBundle,
  type: SiAoiReportType,
): SiAoiAgriculturalInterpretation {
  const m = buildSiAoiInterpretationMetrics(report, insights);
  const cfg = siAoiReportTypeGeminiConfig(type);
  const ha = (pct: number) => formatSharePctWithHa(pct, m.aoiAreaKm2);
  const ndvi = m.ndviMean != null ? m.ndviMean.toFixed(2) : 'n/a';
  const ndmi = m.ndmiMean != null ? m.ndmiMean.toFixed(2) : 'n/a';
  const ndwi = m.ndwiMean != null ? m.ndwiMean.toFixed(2) : 'n/a';
  const lst = m.lstMeanC != null ? `${m.lstMeanC.toFixed(1)}°C` : 'n/a';
  const layers = layerNames(report);

  const insightsOut = [
    `${cfg.domainLabel} screening: dominant class "${m.dominantClass}" covers ${ha(m.dominantPct)}${m.secondClass ? `; next "${m.secondClass}" ${ha(m.secondPct!)}.` : '.'}`,
    `Condition split within AOI: ${ha(m.healthyAreaPct)} favourable signal, ${ha(m.moderateAreaPct)} moderate, ${ha(m.stressedAreaPct)} stressed — derived from ${report.indexLabel} classes.`,
    `Indices in AOI — NDVI ~${ndvi}; soil moisture (NDMI ~${ndmi}, ${m.soilMoisturePct ?? 'n/a'}%); water (NDWI ~${ndwi}, ${m.waterPct ?? 'n/a'}%); LST ~${lst} (${m.heatRiskLabel} heat risk).`,
    `Active layers considered: ${layers}. Period vegetation change ~${m.vegChangePct >= 0 ? '+' : ''}${m.vegChangePct.toFixed(0)}% vs study window.`,
    `Focus for this ${cfg.domainLabel.toLowerCase()} report: ${cfg.focusTopics.slice(0, 4).join(', ')} — interpret shares and indices together, not as a fixed crop template.`,
  ];

  const riskLevel = genericRiskLevel(m);
  const recommendations = [
    `Validate ${ha(m.stressedAreaPct)} stressed area against ${cfg.domainLabel.toLowerCase()} field or asset records before major decisions.`,
    `Re-run analysis after the next clear scene; track ${report.indexLabel} and ${cfg.focusTopics[0]} indicators on priority hectares.`,
    riskLevel === 'High'
      ? `Prioritize inspection where heat (${lst}) and low moisture (NDMI ${ndmi}) coincide within the AOI.`
      : `Maintain routine monitoring on ${ha(m.healthyAreaPct)} favourable hectares and document layer stack (${layers}) used.`,
  ];

  return enrichSiAoiAgriculturalInterpretation(report, insights, {
    insights: insightsOut,
    recommendations,
    riskLevel,
    riskCause: riskLevel === 'Low' ? null : `${cfg.domainLabel} stress across ${ha(m.stressedAreaPct)} with ${m.heatRiskLabel.toLowerCase()} thermal context`,
    cropCondition: `${cfg.domainLabel} condition in AOI is driven by ${report.indexLabel} classes and live indices — not a crop-only reading unless layers indicate agriculture.`,
    yieldImpact: `${cfg.domainLabel} impact: uneven signal with ${ha(m.stressedAreaPct)} stressed vs ${ha(m.healthyAreaPct)} favourable area may require differentiated actions.`,
    latestImageryDate: report.dateEnd.slice(0, 10),
    temporalInsightForecast: `Temporal Insight & Forecast: ${report.indexLabel} trend shows ${m.vegChangePct >= 5 ? 'improvement' : m.vegChangePct <= -5 ? 'decline' : 'stability'} over ${report.dateStart}–${report.dateEnd}; ${cfg.domainLabel.toLowerCase()} monitoring should follow the same pattern unless field conditions change.`,
  });
}

export function buildFallbackReportInterpretation(
  report: SiAoiReportModel,
  insights?: SiAoiDataInsightsBundle,
): SiAoiAgriculturalInterpretation {
  const bundle = insights ?? report.dataInsights;
  if (report.reportType === 'AGRICULTURE') {
    return buildSiAoiAgriculturalInterpretation(report, bundle);
  }
  return buildGenericTypedInterpretation(report, bundle, report.reportType);
}

export function buildFallbackReportExecutiveSummary(report: SiAoiReportModel): string {
  if (report.reportType === 'AGRICULTURE') {
    return buildFallbackLiveIndexExecutiveSummary(report);
  }
  const m = buildSiAoiInterpretationMetrics(report, report.dataInsights);
  const cfg = siAoiReportTypeGeminiConfig(report.reportType);
  const ha = (pct: number) => formatSharePctWithHa(pct, m.aoiAreaKm2);
  const ctx = buildLiveIndexExecutiveContext(report);
  const sentences = [
    `${cfg.domainLabel} report for ${report.aoiName} (${report.dateStart} – ${report.dateEnd}): primary index ${report.indexLabel} with layers ${layerNames(report)}.`,
    `Area distribution: ${ha(ctx.healthyPct)} favourable, ${ha(ctx.moderatePct)} moderate, ${ha(ctx.weakOrBarePct)} weak or exposed.`,
    m.ndmiMean != null || m.ndwiMean != null
      ? `Moisture context — NDMI ~${m.ndmiMean?.toFixed(2) ?? 'n/a'} (${m.soilMoisturePct ?? 'n/a'}% soil proxy); NDWI ~${m.ndwiMean?.toFixed(2) ?? 'n/a'} (${m.waterPct ?? 'n/a'}% water proxy).`
      : `Index means within AOI should be read against ${cfg.focusTopics.slice(0, 3).join(', ')}.`,
    m.heatRiskLabel !== 'Low' || m.stressedAreaPct >= 12
      ? `Stress screening: ${ha(m.stressedAreaPct)} stressed; LST ~${m.lstMeanC?.toFixed(1) ?? 'n/a'}°C (${m.heatRiskLabel} heat risk).`
      : `No dominant stress signal — suitable for baseline ${cfg.domainLabel.toLowerCase()} monitoring.`,
    `Recommendation: prioritize field or desk review on ${ha(m.stressedAreaPct)} stressed hectares and align next steps with ${cfg.domainLabel.toLowerCase()} objectives.`,
  ];
  return enrichExecutiveSummaryAreaHa(clampLiveIndexExecutiveSummary(sentences.join(' ')), report);
}
