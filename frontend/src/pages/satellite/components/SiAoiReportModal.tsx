import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGeminiApiKey } from '../../../hooks/useGeminiApiKey';
import {
  STATIC_AOI_CHART_LAYER_OPTIONS,
  staticAoiChartColorForLayer,
  type StaticAoiChartLayerId,
} from '../utils/staticAoiMultiChartData';
import { AoiStaticMultiLayerLineChart } from './AoiStaticMultiLayerLineChart';
import {
  applyLiveLayerAnalysisToReport,
  buildSiAoiVegetationReport,
  siAoiReportFeatureBBoxLngLat,
  type SiAoiChangeDetectionSlot,
  type SiAoiClassificationPalette,
  type SiAoiLegendBandCount,
  type SiAoiPdfExportMode,
  type SiAoiReportModel,
  type SiAoiReportStyleMode,
  type SiAoiReportTableRow,
  DEFAULT_SI_AOI_REPORT_STYLE_MODE,
  SI_AOI_REPORT_STYLE_MODE_OPTIONS,
} from '../utils/siAoiVegetationReportModel';
import {
  buildFallbackInterpretationPoints,
  classDisplayName,
} from '../utils/siAoiReportInterpretation';
import {
  DEFAULT_SI_AOI_REPORT_TYPE,
  inferDefaultSiAoiReportType,
  isSiAoiReportType,
  SI_AOI_REPORT_TYPE_OPTIONS,
  buildFallbackReportInterpretation,
  siAoiReportTypeInterpretationSectionTitle,
  siAoiReportTypeLabel,
  type SiAoiReportActiveLayersContext,
  type SiAoiReportType,
} from '../utils/siAoiReportType';
import {
  formatNumericRangeDisplay,
  formatReportTableAreaHa,
  spectralContextFromReport,
  stageForReportTableRow,
} from '../utils/siCropGrowthStage';
import { buildSiAoiInterpretationMetrics } from '../utils/siAoiAgriculturalInterpretation';
import type { SiAoiAgriculturalInterpretation } from '../utils/siAoiAgriculturalInterpretation';
import { exportSiAoiVegetationReportPdf } from '../utils/siAoiVegetationReportPdfExport';
import { exportSiAoiVegetationReportDocx } from '../utils/siAoiVegetationReportDocx';
import {
  fetchSiAoiAgriculturalInterpretationFromGemini,
  fetchSiAoiReportExecutiveSummaryFromGemini,
} from '../utils/siAoiReportGemini';
import { SiAoiAgriculturalInterpretationSection } from './SiAoiAgriculturalInterpretationSection';
import { SiAoiReportInfographicPanel } from './SiAoiReportInfographicPanel';
// Styles imported from SatelliteIntelligenceMain.tsx so GitHub Pages never preloads a separate SiAoiReportModal-*.css chunk.
import {
  isSnapshotCanvasLikelyHasBasemap,
  isSnapshotCanvasLikelyHasIndexOverlay,
  isSnapshotPngLikelySyntheticHeatmap,
  type SiLiveMapSnapshotCapture,
} from '../utils/siMapViewerSnapshot';
import {
  drawNorthArrowAndScaleOnMapCanvas,
  siPdfBoundsFromFeatureCollection,
  siPdfBoundsFromFitBounds,
} from '../utils/siAoiReportCartography';
import {
  compositeMapWithBottomLegendStrip,
  legendItemsFromTableRows,
} from '../utils/siAoiReportSlotMapRender';
import { SiAoiReportDataInsightsSection } from './SiAoiReportDataInsights';
import { SiAoiReportPixelScatterBlock } from './SiAoiReportPixelScatterBlock';
import { SiAoiReportLiveLayerAnalysisSection } from './SiAoiReportLiveLayerAnalysisSection';
import type { SiAoiReportLiveAnalysisSnapshot } from '../utils/siAoiReportLiveAnalysisSnapshot';

/** Upscale canvas for sharper PDF raster (viewer scales down; avoids soft chart export). */
function captureCanvasHiRes(source: HTMLCanvasElement, scale = 2): string {
  const w = source.width;
  const h = source.height;
  if (!w || !h) return source.toDataURL('image/png');
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  const ctx = c.getContext('2d');
  if (!ctx) return source.toDataURL('image/png');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.drawImage(source, 0, 0);
  return c.toDataURL('image/png');
}

function colorForReportTableRow(row: SiAoiReportModel['tableRows'][number], palette: SiAoiClassificationPalette): string {
  return (
    row.colorHex ??
    (row.key === 'high' ? palette.high : row.key === 'medium' ? palette.medium : row.key === 'low' ? palette.low : '#94a3b8')
  );
}

/** Embeds the same legend band strip as the HTML preview into one PNG for PDF export. */
async function compositeAoiAnalysisMapWithLegendPng(
  mapPngDataUrl: string,
  report: SiAoiReportModel,
  mapLngLatBounds: SiPdfLngLatBounds | null,
): Promise<string> {
  const items = legendItemsFromTableRows(report.tableRows, report.classificationPalette);
  return compositeMapWithBottomLegendStrip(mapPngDataUrl, items, (ctx, w, h) => {
    drawNorthArrowAndScaleOnMapCanvas(ctx, w, h, mapLngLatBounds);
  });
}

function aoiFitBoundsFromFeature(
  feature: GeoJSON.Feature,
): [[number, number], [number, number]] | null {
  const b = siAoiReportFeatureBBoxLngLat(feature);
  if (!b) return null;
  return [
    [b[0], b[1]],
    [b[2], b[3]],
  ];
}

/** Live Map Viewer capture — basemap + WMS index (no client-side heatmap grid). */
async function captureAoiAnalysisLiveMapPng(
  capture: SiLiveMapSnapshotCapture,
  aoiFeature: GeoJSON.Feature,
  fitBounds: [[number, number], [number, number]] | null,
  hasIndexOverlay: (png: string) => Promise<boolean>,
  opts?: { preview?: boolean },
): Promise<string | null> {
  const preview = opts?.preview !== false;
  const shared = {
    maskToAoi: false,
    aoiFeature,
    /** Hide report modal so Mapbox paints the main viewer (required for real screen capture). */
    suppressModalChrome: false,
    freezeViewport: preview,
    fitBounds: preview ? undefined : (fitBounds ?? undefined),
    previewFast: preview,
  };
  const attempts: Parameters<SiLiveMapSnapshotCapture>[0][] = preview
    ? [
        { ...shared, captureMode: 'export-fast', requireIndexLayer: true },
        { ...shared, captureMode: 'export-fast', requireIndexLayer: false },
      ]
    : [
        { ...shared, freezeViewport: false, fitBounds: fitBounds ?? undefined, previewFast: false, captureMode: 'export-quality', requireIndexLayer: true },
        { ...shared, freezeViewport: false, fitBounds: fitBounds ?? undefined, previewFast: false, captureMode: 'export-fast', requireIndexLayer: true },
      ];
  for (let i = 0; i < attempts.length; i += 1) {
    if (i > 0) {
      await new Promise<void>(r => window.setTimeout(r, preview ? 80 : 180));
    }
    const raw = await capture(attempts[i]!);
    if (!raw) continue;
    if (await isSnapshotPngLikelySyntheticHeatmap(raw)) continue;
    if (attempts[i]!.requireIndexLayer === false) {
      const basemapOk = await new Promise<boolean>(resolve => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          const ctx = c.getContext('2d');
          if (!ctx) {
            resolve(false);
            return;
          }
          ctx.drawImage(img, 0, 0);
          resolve(isSnapshotCanvasLikelyHasBasemap(c) === true);
        };
        img.onerror = () => resolve(false);
        img.src = raw;
      });
      if (basemapOk) return raw;
      continue;
    }
    if (await hasIndexOverlay(raw)) return raw;
    const basemapOk = await new Promise<boolean>(resolve => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        if (!ctx) {
          resolve(false);
          return;
        }
        ctx.drawImage(img, 0, 0);
        resolve(isSnapshotCanvasLikelyHasBasemap(c) === true);
      };
      img.onerror = () => resolve(false);
      img.src = raw;
    });
    if (basemapOk) return raw;
  }
  return null;
}

function analysisSnapshotCaptureKey(built: SiAoiReportModel): string {
  return `${built.indexId}|${built.dateStart}|${built.dateEnd}|${built.aoiName}|${built.legendBandCount}`;
}

type SiAoiReportGenerateStep = { id: string; label: string };

function siAoiReportGenerateSteps(includeSnapshot: boolean): SiAoiReportGenerateStep[] {
  const steps: SiAoiReportGenerateStep[] = [
    { id: 'validate', label: 'Validating AOI and study period' },
    { id: 'assemble', label: 'Assembling charts and classification tables' },
  ];
  if (includeSnapshot) {
    steps.push({ id: 'snapshot', label: 'Capturing live map snapshot' });
  }
  steps.push({ id: 'preview', label: 'Opening report preview' });
  return steps;
}

/** Let the generating overlay paint before heavy synchronous work. */
function yieldToReportGenerateUi(): Promise<void> {
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

/** Embeds legend-aligned index bands below the live map snapshot for PDF / preview. */
async function compositeChangeCellLegendPng(
  mapPngDataUrl: string,
  tableRows: SiAoiReportTableRow[],
  palette: SiAoiClassificationPalette,
  indexId: StaticAoiChartLayerId,
  mapLngLatBounds: SiPdfLngLatBounds | null,
): Promise<string> {
  const items = legendItemsFromTableRows(tableRows, palette, indexId);
  return compositeMapWithBottomLegendStrip(mapPngDataUrl, items, (ctx, w, h) => {
    drawNorthArrowAndScaleOnMapCanvas(ctx, w, h, mapLngLatBounds);
  });
}

function rowSwatchColor(row: SiAoiReportTableRow, palette: SiAoiClassificationPalette): string {
  return colorForReportTableRow(row, palette);
}

function SiAoiMapLegendBar({
  tableRows,
  palette,
  indexId,
}: {
  tableRows: SiAoiReportTableRow[];
  palette: SiAoiClassificationPalette;
  indexId?: StaticAoiChartLayerId;
}) {
  return (
    <div className="si-aoi-report-map-legend-bar" aria-label="Map legend">
      {tableRows.map(row => (
        <span key={row.key} className="si-aoi-report-map-legend-bar__item">
          <span
            className="si-aoi-report-map-legend-bar__swatch"
            style={{ background: rowSwatchColor(row, palette) }}
            aria-hidden
          />
          <span className="si-aoi-report-map-legend-bar__label">{formatNumericRangeDisplay(row.labelEn)}</span>
        </span>
      ))}
      <span className="si-aoi-report-map-legend-bar__item">
        <span
          className="si-aoi-report-map-legend-bar__swatch"
          style={{ background: palette.aoiOutline }}
          aria-hidden
        />
        <span className="si-aoi-report-map-legend-bar__label">AOI outline</span>
      </span>
      {indexId ? <span className="si-aoi-report-map-legend-bar__index">{indexId}</span> : null}
    </div>
  );
}

function SiAoiReportLegendTable({
  report,
  legendBandCount,
  onLegendBandCount,
}: {
  report: SiAoiReportModel;
  legendBandCount: SiAoiLegendBandCount;
  onLegendBandCount?: (n: SiAoiLegendBandCount) => void;
}) {
  const stageCtx = useMemo(() => spectralContextFromReport(report), [report]);

  return (
    <>
      {onLegendBandCount ? (
        <div className="si-aoi-report-legend-bands" role="group" aria-label="Legend class count">
          <span className="si-aoi-report-legend-bands__label">Legend classes</span>
          <label>
            <input
              type="radio"
              name="si-aoi-legend-bands"
              checked={legendBandCount === 5}
              onChange={() => onLegendBandCount(5)}
            />
            5 classes
          </label>
          <label>
            <input
              type="radio"
              name="si-aoi-legend-bands"
              checked={legendBandCount === 10}
              onChange={() => onLegendBandCount(10)}
            />
            10 classes
          </label>
        </div>
      ) : null}
      <div className="si-aoi-report-table-wrap">
        <table className="si-aoi-report-table">
          <thead>
            <tr>
              <th aria-hidden />
              <th>Class</th>
              <th>Growth stage</th>
              <th>Area</th>
              <th>Share %</th>
            </tr>
          </thead>
          <tbody>
            {report.tableRows.map(row => (
              <tr key={row.key}>
                <td className="si-aoi-report-table__swatch-cell">
                  <span
                    className="si-aoi-report-table__swatch"
                    style={{ background: rowSwatchColor(row, report.classificationPalette) }}
                    aria-hidden
                  />
                </td>
                <td dir="ltr">{classDisplayName(row.labelEn)}</td>
                <td>{stageForReportTableRow(row, stageCtx)}</td>
                <td dir="ltr">{formatReportTableAreaHa(row.areaKm2)}</td>
                <td>{row.pct.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

type SiAoiChangeMapCellProps = {
  slot: SiAoiChangeDetectionSlot;
  indexId: StaticAoiChartLayerId;
  tableRows: SiAoiReportTableRow[];
  classificationPalette: SiAoiClassificationPalette;
  snapshotUrl?: string | null;
  snapshotLoading?: boolean;
};

function SiAoiChangeMapCell({
  slot,
  indexId,
  tableRows,
  classificationPalette,
  snapshotUrl,
  snapshotLoading,
}: SiAoiChangeMapCellProps) {
  const meanStr = indexId === 'LST' ? slot.stats.indexMean.toFixed(1) : slot.stats.indexMean.toFixed(3);

  return (
    <div className="si-aoi-report-change-cell">
      <div className="si-aoi-report-change-cell__banner">{slot.date}</div>
      <div className="si-aoi-report-change-cell__map">
        {snapshotLoading && !snapshotUrl ? (
          <div className="si-aoi-report-change-cell__map-placeholder">Capturing live map…</div>
        ) : null}
        {snapshotUrl ? (
          <img
            className="si-aoi-report-change-cell__snapshot"
            src={snapshotUrl}
            alt={`Map snapshot for ${slot.date}`}
            draggable={false}
          />
        ) : null}
        {!snapshotLoading && !snapshotUrl ? (
          <div className="si-aoi-report-change-cell__map-placeholder">Live map snapshot unavailable</div>
        ) : null}
      </div>
      <SiAoiMapLegendBar tableRows={tableRows} palette={classificationPalette} indexId={indexId} />
      <div className="si-aoi-report-change-cell__stats" dir="ltr">
        <span className="si-aoi-report-change-cell__stats-mean">μ {meanStr}</span>
        <span className="si-aoi-report-change-cell__stats-px">{slot.stats.pixelCount} px</span>
      </div>
    </div>
  );
}

export type SiAoiReportModalProps = {
  open: boolean;
  onClose: () => void;
  weeklyComposites: Array<{ startDate: string; endDate: string; mean: number }>;
  timeSeriesStart: string;
  timeSeriesEnd: string;
  defaultIndexId: StaticAoiChartLayerId;
  aoiOptions: Array<{ id: string; name: string; feature: GeoJSON.Feature }>;
  mapboxToken?: string;
  preferredAoiId?: string | null;
  /** Match the main Satellite Intelligence basemap (legacy prop — capture uses live Map Viewer). */
  reportMapStyle?: string;
  /** Sentinel / WMS MAXCC-style cap shown in the report (metadata). */
  defaultCloudCoverPct?: number;
  /** Optional class colours from WMS symbology (merged when building the report heatmaps). */
  classificationPalette?: Partial<SiAoiClassificationPalette>;
  /** Capture the live Satellite Intelligence map canvas (WMS + symbology + AOI). */
  captureLiveMapSnapshot?: SiLiveMapSnapshotCapture;
  /** Active satellite provider label for PDF / Excel / metadata. */
  satelliteProviderLabel?: string;
  /** Persisted raster analysis for report preview + PDF (central store / MPC). */
  ensureLiveLayerAnalysis?: (opts: {
    aoiId: string;
    aoiName: string;
    feature: GeoJSON.Feature;
    indexId: StaticAoiChartLayerId;
  }) => Promise<SiAoiReportLiveAnalysisSnapshot | null>;
  /** Main map has terrain/DEM — enables oblique AOI snapshot toggle. */
  terrainAvailable?: boolean;
  /** Visible WMS, index, and custom layers at report open — drives Gemini domain context. */
  activeLayersContext?: SiAoiReportActiveLayersContext;
};

export function SiAoiReportModal({
  open,
  onClose,
  weeklyComposites,
  timeSeriesStart,
  timeSeriesEnd,
  defaultIndexId,
  aoiOptions,
  mapboxToken,
  preferredAoiId,
  reportMapStyle = 'mapbox://styles/mapbox/satellite-streets-v12',
  defaultCloudCoverPct = 25,
  classificationPalette: classificationPaletteProp,
  captureLiveMapSnapshot,
  satelliteProviderLabel,
  ensureLiveLayerAnalysis,
  terrainAvailable = false,
  activeLayersContext,
}: SiAoiReportModalProps) {
  const geminiApiKey = useGeminiApiKey();
  const [geminiSummary, setGeminiSummary] = useState<string | null>(null);
  const [geminiLoading, setGeminiLoading] = useState(false);
  const [geminiErr, setGeminiErr] = useState<string | null>(null);
  const [agInterpretation, setAgInterpretation] = useState<SiAoiAgriculturalInterpretation | null>(null);
  const [agInterpretationLoading, setAgInterpretationLoading] = useState(false);
  const [agInterpretationErr, setAgInterpretationErr] = useState<string | null>(null);
  const [aoiMapView3d, setAoiMapView3d] = useState(false);
  const [step, setStep] = useState<'configure' | 'preview'>('configure');
  const [reportView, setReportView] = useState<'analysis' | 'change'>('analysis');
  const [indexId, setIndexId] = useState<StaticAoiChartLayerId>(defaultIndexId);
  const [dateStart, setDateStart] = useState(timeSeriesStart);
  const [dateEnd, setDateEnd] = useState(timeSeriesEnd);
  const [selectedAoiId, setSelectedAoiId] = useState('');
  const [cloudCoverMaxPct, setCloudCoverMaxPct] = useState(defaultCloudCoverPct);
  const [temporalComposite, setTemporalComposite] = useState<'median' | 'max'>('median');
  const [reportStyleMode, setReportStyleMode] = useState<SiAoiReportStyleMode>(DEFAULT_SI_AOI_REPORT_STYLE_MODE);
  const [reportType, setReportType] = useState<SiAoiReportType>(DEFAULT_SI_AOI_REPORT_TYPE);
  const [legendBandCount, setLegendBandCount] = useState<SiAoiLegendBandCount>(5);
  const [scatterPanelOpen, setScatterPanelOpen] = useState(false);
  const [report, setReport] = useState<SiAoiReportModel | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportProgress, setExportProgress] = useState<string | null>(null);
  const [generateBusy, setGenerateBusy] = useState(false);
  const [generateStepIndex, setGenerateStepIndex] = useState(0);
  const [generateStepDetail, setGenerateStepDetail] = useState<string | null>(null);
  const [exportUi, setExportUi] = useState<{
    phase: 'idle' | 'preview' | 'busy';
    mode?: SiAoiPdfExportMode;
    format?: 'pdf' | 'docx';
  }>({ phase: 'idle' });
  const lastBuildInputRef = useRef<Omit<Parameters<typeof buildSiAoiVegetationReport>[0], 'legendBandCount'> | null>(
    null,
  );
  const chartHostId = 'si-aoi-report-chart-host';
  const chartExportHostId = 'si-aoi-report-chart-host-export';
  const [changeSlotSnapshots, setChangeSlotSnapshots] = useState<(string | null)[]>([]);
  const [changeSnapshotsLoading, setChangeSnapshotsLoading] = useState(false);
  const changeCaptureKeyRef = useRef('');
  const changeCaptureInFlightRef = useRef(false);
  const changeSlotSnapshotsRef = useRef<(string | null)[]>([]);
  const prefetchChangeDetectionRef = useRef<((built: SiAoiReportModel) => Promise<void>) | null>(null);
  useEffect(() => {
    changeSlotSnapshotsRef.current = changeSlotSnapshots;
  }, [changeSlotSnapshots]);
  const [analysisLiveSnapshot, setAnalysisLiveSnapshot] = useState<string | null>(null);
  const [analysisSnapshotLoading, setAnalysisSnapshotLoading] = useState(false);
  const [analysisSnapshotProgress, setAnalysisSnapshotProgress] = useState<string | null>(null);
  const analysisCaptureKeyRef = useRef('');
  const analysisCaptureInFlightRef = useRef(false);
  const analysisLiveSnapshotRef = useRef<string | null>(null);
  useEffect(() => {
    analysisLiveSnapshotRef.current = analysisLiveSnapshot;
  }, [analysisLiveSnapshot]);
  const mapOk = Boolean(mapboxToken?.trim());
  const liveMapCaptureOk = Boolean(captureLiveMapSnapshot);
  const generateSteps = useMemo(
    () => siAoiReportGenerateSteps(liveMapCaptureOk),
    [liveMapCaptureOk],
  );

  useEffect(() => {
    if (!open) return;
    setStep('configure');
    setReport(null);
    setErr(null);
    setExportBusy(false);
    setDateStart(timeSeriesStart);
    setDateEnd(timeSeriesEnd);
    setIndexId(defaultIndexId);
    const ids = new Set(aoiOptions.map(o => o.id));
    const pref = preferredAoiId && ids.has(preferredAoiId) ? preferredAoiId : aoiOptions[0]?.id ?? '';
    setSelectedAoiId(pref);
    setReportView('analysis');
    setExportUi({ phase: 'idle' });
    setCloudCoverMaxPct(defaultCloudCoverPct);
    setTemporalComposite('median');
    setReportStyleMode(DEFAULT_SI_AOI_REPORT_STYLE_MODE);
    setReportType(
      inferDefaultSiAoiReportType({
        indexId: defaultIndexId,
        layerLabels: activeLayersContext?.layers.map(l => l.label),
        aoiName: aoiOptions.find(o => o.id === (preferredAoiId ?? aoiOptions[0]?.id))?.name,
      }),
    );
    setLegendBandCount(5);
    setScatterPanelOpen(false);
    setChangeSlotSnapshots([]);
    setChangeSnapshotsLoading(false);
    changeCaptureKeyRef.current = '';
    changeCaptureInFlightRef.current = false;
    setAnalysisLiveSnapshot(null);
    setAnalysisSnapshotLoading(false);
    setAnalysisSnapshotProgress(null);
    analysisCaptureKeyRef.current = '';
    analysisCaptureInFlightRef.current = false;
    analysisLiveSnapshotRef.current = null;
    lastBuildInputRef.current = null;
    setAgInterpretation(null);
    setAgInterpretationErr(null);
    setAgInterpretationLoading(false);
    setAoiMapView3d(false);
    setGenerateBusy(false);
    setGenerateStepIndex(0);
    setGenerateStepDetail(null);
  }, [open, timeSeriesStart, timeSeriesEnd, defaultIndexId, preferredAoiId, aoiOptions, defaultCloudCoverPct, activeLayersContext]);

  useEffect(() => {
    if (!generateBusy) return;
    setGenerateStepDetail(analysisSnapshotProgress);
  }, [generateBusy, analysisSnapshotProgress]);

  const agMetrics = useMemo(
    () => (report ? buildSiAoiInterpretationMetrics(report, report.dataInsights) : null),
    [report],
  );

  useEffect(() => {
    if (!open || !report || step !== 'preview') return;
    let cancelled = false;
    const key = geminiApiKey.trim();
    setAgInterpretationLoading(true);
    setAgInterpretationErr(null);
    void (async () => {
      try {
        let ag: SiAoiAgriculturalInterpretation | null = null;
        if (key) {
          ag = await fetchSiAoiAgriculturalInterpretationFromGemini({
            apiKey: key,
            report,
            insights: report.dataInsights,
          });
        }
        if (cancelled) return;
        if (!ag) ag = buildFallbackReportInterpretation(report);
        setAgInterpretation(ag);
      } catch (e) {
        if (cancelled) return;
        setAgInterpretationErr((e as Error)?.message ?? 'Interpretation unavailable.');
        setAgInterpretation(buildFallbackReportInterpretation(report));
      } finally {
        if (!cancelled) setAgInterpretationLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, report, step, geminiApiKey, report?.liveLayerAnalysis?.capturedAtIso, report?.tableRows, report?.reportType]);

  useEffect(() => {
    if (!open || !report || step !== 'preview') return;
    let cancelled = false;
    const key = geminiApiKey.trim();
    if (!key) {
      setGeminiSummary(null);
      setGeminiErr(null);
      setGeminiLoading(false);
      return;
    }
    setGeminiLoading(true);
    setGeminiErr(null);
    void (async () => {
      try {
        const text = await fetchSiAoiReportExecutiveSummaryFromGemini({
          apiKey: key,
          report,
          insights: report.dataInsights,
          styleMode: report.reportStyleMode,
        });
        if (cancelled) return;
        setGeminiSummary(text ?? null);
      } catch (e) {
        if (cancelled) return;
        setGeminiErr((e as Error)?.message ?? 'Gemini summary unavailable.');
        setGeminiSummary(null);
      } finally {
        if (!cancelled) setGeminiLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, report, step, geminiApiKey, report?.reportStyleMode, report?.reportType]);

  useEffect(() => {
    setScatterPanelOpen(false);
  }, [report]);

  const selectedFeature = useMemo(
    () => aoiOptions.find(o => o.id === selectedAoiId)?.feature ?? null,
    [aoiOptions, selectedAoiId],
  );

  const selectedName = useMemo(
    () => aoiOptions.find(o => o.id === selectedAoiId)?.name ?? '',
    [aoiOptions, selectedAoiId],
  );

  const weeklyMeansForScatter = useMemo(() => weeklyComposites.map(w => w.mean), [weeklyComposites]);

  const changeFitBounds = useMemo((): [[number, number], [number, number]] | null => {
    if (!report) return null;
    const f = report.aoiOutlineGeoJson.features[0];
    const b = f ? siAoiReportFeatureBBoxLngLat(f) : null;
    if (!b) return null;
    return [
      [b[0], b[1]],
      [b[2], b[3]],
    ];
  }, [report]);

  const reportAoiFeature = useMemo(
    () => report?.aoiOutlineGeoJson.features[0] ?? null,
    [report],
  );

  const reportAoiBounds = useMemo((): [number, number, number, number] | null => {
    if (!reportAoiFeature) return null;
    return siAoiReportFeatureBBoxLngLat(reportAoiFeature);
  }, [reportAoiFeature]);

  const liveSnapshotAoiOpts = useMemo(
    () => (reportAoiFeature ? { aoiFeature: reportAoiFeature } : undefined),
    [reportAoiFeature],
  );

  const snapshotPngHasIndexOverlay = useCallback(async (pngDataUrl: string): Promise<boolean> => {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        if (!ctx) {
          resolve(false);
          return;
        }
        ctx.drawImage(img, 0, 0);
        resolve(isSnapshotCanvasLikelyHasIndexOverlay(c) === true);
      };
      img.onerror = () => resolve(false);
      img.src = pngDataUrl;
    });
  }, []);

  const prefetchAnalysisSnapshot = useCallback(
    async (built: SiAoiReportModel, opts?: { force?: boolean }) => {
      if (!captureLiveMapSnapshot) return;
      const aoiFeat = built.aoiOutlineGeoJson.features[0];
      if (!aoiFeat) return;
      const key = analysisSnapshotCaptureKey(built);
      if (
        !opts?.force &&
        analysisCaptureKeyRef.current === key &&
        analysisLiveSnapshotRef.current
      ) {
        setAnalysisLiveSnapshot(analysisLiveSnapshotRef.current);
        return;
      }
      if (analysisCaptureInFlightRef.current && analysisCaptureKeyRef.current === key) return;

      analysisCaptureInFlightRef.current = true;
      analysisCaptureKeyRef.current = key;
      setAnalysisSnapshotLoading(true);
      setAnalysisSnapshotProgress('Capturing live map…');
      try {
        const fitBounds = aoiFitBoundsFromFeature(aoiFeat);
        const raw = await captureAoiAnalysisLiveMapPng(
          captureLiveMapSnapshot,
          aoiFeat,
          fitBounds,
          snapshotPngHasIndexOverlay,
          { preview: true },
        );
        if (!raw) return;
        setAnalysisSnapshotProgress('Adding legend & north arrow…');
        const withLegend = await compositeAoiAnalysisMapWithLegendPng(
          raw,
          built,
          siPdfBoundsFromFeatureCollection(built.aoiOutlineGeoJson),
        );
        if (await isSnapshotPngLikelySyntheticHeatmap(withLegend)) return;
        analysisLiveSnapshotRef.current = withLegend;
        setAnalysisLiveSnapshot(withLegend);
      } finally {
        analysisCaptureInFlightRef.current = false;
        setAnalysisSnapshotLoading(false);
        setAnalysisSnapshotProgress(null);
      }
    },
    [captureLiveMapSnapshot, snapshotPngHasIndexOverlay],
  );

  const onGenerate = useCallback(async () => {
    setErr(null);
    const aoiFeature = selectedFeature;
    if (!aoiFeature) {
      setErr('Select an AOI.');
      return;
    }

    const steps = siAoiReportGenerateSteps(liveMapCaptureOk);
    setGenerateBusy(true);
    setGenerateStepIndex(0);
    setGenerateStepDetail(null);

    const snap = {
      weekly: weeklyComposites,
      indexId,
      dateStart: dateStart.trim(),
      dateEnd: dateEnd.trim(),
      aoiFeature,
      aoiName: selectedName || 'AOI',
      classificationPalette: classificationPaletteProp,
      processingContext: {
        cloudCoverMaxPct: cloudCoverMaxPct,
        temporalComposite,
        crsNote: 'EPSG:4326 (WGS84)',
      },
      satelliteProviderLabel: satelliteProviderLabel?.trim() || undefined,
      reportStyleMode,
      reportType,
      activeLayersContext,
    };
    lastBuildInputRef.current = snap;

    try {
      await yieldToReportGenerateUi();

      const assembleIdx = steps.findIndex(s => s.id === 'assemble');
      setGenerateStepIndex(Math.max(0, assembleIdx));
      await yieldToReportGenerateUi();

      const built = buildSiAoiVegetationReport({
        ...snap,
        legendBandCount,
        reportStyleMode,
        reportType,
        activeLayersContext,
      });
      if (!built) {
        setErr('AOI geometry must be a Polygon or MultiPolygon.');
        return;
      }

      const snapshotIdx = steps.findIndex(s => s.id === 'snapshot');
      if (snapshotIdx >= 0) {
        setGenerateStepIndex(snapshotIdx);
        await yieldToReportGenerateUi();
        await prefetchAnalysisSnapshot(built);
      }

      const previewIdx = steps.length - 1;
      setGenerateStepIndex(previewIdx);
      await yieldToReportGenerateUi();

      setReport(built);
      setReportView('analysis');
      setStep('preview');
      void prefetchChangeDetectionRef.current?.(built);

      if (ensureLiveLayerAnalysis) {
        void ensureLiveLayerAnalysis({
          aoiId: selectedAoiId,
          aoiName: selectedName || 'AOI',
          feature: aoiFeature,
          indexId,
        })
          .then(liveLayerAnalysis => {
            if (!liveLayerAnalysis) return;
            setReport(prev => (prev ? applyLiveLayerAnalysisToReport(prev, liveLayerAnalysis) : prev));
          })
          .catch(() => {
            /* Live layer analysis is optional — hide section when unavailable. */
          });
      }
    } catch {
      setErr('Report generation failed. Try again.');
    } finally {
      setGenerateBusy(false);
      setGenerateStepIndex(0);
      setGenerateStepDetail(null);
    }
  }, [
    weeklyComposites,
    indexId,
    dateStart,
    dateEnd,
    selectedFeature,
    selectedName,
    selectedAoiId,
    cloudCoverMaxPct,
    temporalComposite,
    classificationPaletteProp,
    legendBandCount,
    satelliteProviderLabel,
    reportStyleMode,
    reportType,
    activeLayersContext,
    liveMapCaptureOk,
    prefetchAnalysisSnapshot,
    ensureLiveLayerAnalysis,
  ]);

  const applyReportStyleMode = useCallback(
    (next: SiAoiReportStyleMode) => {
      setReportStyleMode(next);
      const snap = lastBuildInputRef.current;
      if (!snap || !report) return;
      const built = buildSiAoiVegetationReport({ ...snap, legendBandCount, reportStyleMode: next });
      if (built) setReport(built);
    },
    [report, legendBandCount],
  );

  const applyLegendBandCount = useCallback((next: SiAoiLegendBandCount) => {
    const snap = lastBuildInputRef.current;
    if (!snap) return;
    setLegendBandCount(next);
    analysisCaptureKeyRef.current = '';
    const built = buildSiAoiVegetationReport({ ...snap, legendBandCount: next });
    if (built) {
      setReport(built);
      changeCaptureKeyRef.current = '';
      void prefetchAnalysisSnapshot(built, { force: true });
      void prefetchChangeDetectionRef.current?.(built);
    }
  }, [prefetchAnalysisSnapshot]);

  const changeDetectionCaptureKey = useCallback((built: SiAoiReportModel) => {
    return `${built.indexId}|${built.dateStart}|${built.dateEnd}|${built.aoiName}|${built.legendBandCount}`;
  }, []);

  const captureAllChangeSnapshots = useCallback(
    async (built: SiAoiReportModel, opts?: { incremental?: boolean }): Promise<(string | null)[]> => {
      const slots = built.changeDetectionSlots;
      if (!slots.length || !changeFitBounds || !reportAoiBounds) return [];

      const bounds = siPdfBoundsFromFitBounds(changeFitBounds);
      const n = slots.length;
      const urls: (string | null)[] = Array(n).fill(null);

      if (!captureLiveMapSnapshot) return urls;

      for (let i = 0; i < n; i += 1) {
        const slot = slots[i]!;
        let mapPng: string | null = null;
        try {
          mapPng = await captureLiveMapSnapshot({
            date: slot.date,
            captureMode: 'export-quality',
            maskToAoi: false,
            batchSlot: true,
            suppressModalChrome: false,
            requireIndexLayer: true,
            ...liveSnapshotAoiOpts,
            skipTimelineRestore: i < n - 1,
            pauseTimeline: i === 0,
            resumeTimeline: i === n - 1,
          });
        } catch {
          mapPng = null;
        }
        if (mapPng && (await isSnapshotPngLikelySyntheticHeatmap(mapPng))) {
          mapPng = null;
        }
        if (!mapPng) {
          try {
            mapPng = await captureLiveMapSnapshot({
              date: slot.date,
              captureMode: 'export-fast',
              maskToAoi: false,
              batchSlot: true,
              suppressModalChrome: false,
              requireIndexLayer: false,
              ...liveSnapshotAoiOpts,
              skipTimelineRestore: i < n - 1,
              pauseTimeline: false,
              resumeTimeline: i === n - 1,
            });
          } catch {
            mapPng = null;
          }
        }
        urls[i] =
          mapPng != null
            ? await compositeChangeCellLegendPng(
                mapPng,
                built.tableRows,
                built.classificationPalette,
                built.indexId,
                bounds,
              )
            : null;
        if (opts?.incremental) {
          setChangeSlotSnapshots(prev => {
            const next = prev.length === n ? [...prev] : Array(n).fill(null);
            next[i] = urls[i]!;
            return next;
          });
        }
      }

      return urls;
    },
    [captureLiveMapSnapshot, changeFitBounds, reportAoiBounds, liveSnapshotAoiOpts],
  );

  const prefetchChangeDetectionSnapshots = useCallback(
    async (built: SiAoiReportModel) => {
      const key = changeDetectionCaptureKey(built);
      if (changeCaptureInFlightRef.current) return;
      const cached = changeSlotSnapshotsRef.current;
      if (
        changeCaptureKeyRef.current === key &&
        cached.length === built.changeDetectionSlots.length &&
        cached.some(Boolean)
      ) {
        return;
      }

      changeCaptureInFlightRef.current = true;
      changeCaptureKeyRef.current = key;
      const n = built.changeDetectionSlots.length;
      setChangeSnapshotsLoading(true);
      setChangeSlotSnapshots(Array(n).fill(null));

      try {
        await captureAllChangeSnapshots(built, { incremental: true });
      } finally {
        changeCaptureInFlightRef.current = false;
        setChangeSnapshotsLoading(false);
      }
    },
    [changeDetectionCaptureKey, captureAllChangeSnapshots],
  );

  prefetchChangeDetectionRef.current = prefetchChangeDetectionSnapshots;

  useEffect(() => {
    if (!open || !report || reportView !== 'change') return;
    const key = changeDetectionCaptureKey(report);
    const cached = changeSlotSnapshotsRef.current;
    if (
      changeCaptureKeyRef.current === key &&
      cached.length === report.changeDetectionSlots.length &&
      cached.some(Boolean)
    ) {
      return;
    }
    if (changeCaptureInFlightRef.current) return;
    void prefetchChangeDetectionSnapshots(report);
  }, [open, report, reportView, changeDetectionCaptureKey, prefetchChangeDetectionSnapshots]);

  const retryAnalysisMapSnapshot = useCallback(() => {
    if (!report) return;
    void prefetchAnalysisSnapshot(report, { force: true });
  }, [report, prefetchAnalysisSnapshot]);

  useEffect(() => {
    analysisCaptureKeyRef.current = '';
    analysisLiveSnapshotRef.current = null;
    setAnalysisLiveSnapshot(null);
  }, [report?.indexId, report?.dateStart, report?.dateEnd, report?.legendBandCount, report?.aoiName]);

  useEffect(() => {
    if (!open || !report || reportView !== 'analysis' || !captureLiveMapSnapshot) return;
    if (analysisSnapshotLoading || analysisLiveSnapshot) return;
    retryAnalysisMapSnapshot();
  }, [
    open,
    report,
    reportView,
    captureLiveMapSnapshot,
    legendBandCount,
    analysisLiveSnapshot,
    analysisSnapshotLoading,
    retryAnalysisMapSnapshot,
  ]);

  const reportTimelineChart = useMemo(() => {
    if (!report?.timeSeries.length) return null;
    const layerId = report.indexId;
    const color = staticAoiChartColorForLayer(layerId);
    return {
      title: `${report.indexLabel} — ${report.dateStart} … ${report.dateEnd}`,
      labels: report.timeSeries.map(t => t.date),
      datasets: [
        {
          id: layerId,
          label: report.indexLabel,
          data: report.timeSeries.map(t => t.value),
          borderColor: color,
          backgroundColor: `${color}22`,
          yAxisID: layerId === 'LST' ? 'yLST' : 'yIndex',
        },
      ],
      hasLst: layerId === 'LST',
    };
  }, [report]);

  const openExportPreview = useCallback(() => {
    if (!report) return;
    setErr(null);
    const mode: SiAoiPdfExportMode =
      reportView === 'analysis' ? 'AOI_ANALYSIS' : 'TIME_SERIES_CHANGE_DETECTION';
    setExportUi({ phase: 'preview', mode, format: 'pdf' });
  }, [report, reportView]);

  const cancelExportPreview = useCallback(() => {
    setExportUi({ phase: 'idle' });
  }, []);

  const confirmExportPdf = useCallback(async () => {
    if (!report || !exportUi.mode) return;
    const mode = exportUi.mode;
    const format = exportUi.format ?? 'pdf';
    setExportUi({ phase: 'busy', mode, format });
    setExportBusy(true);
    setExportProgress('Preparing layout…');

    let reportForExport = report;

    try {
      if (
        mode === 'AOI_ANALYSIS' &&
        ensureLiveLayerAnalysis &&
        selectedFeature &&
        !report.liveLayerAnalysis
      ) {
        setExportProgress('Fetching live index stats…');
        const live = await Promise.race([
          ensureLiveLayerAnalysis({
            aoiId: selectedAoiId,
            aoiName: selectedName || report.aoiName,
            feature: selectedFeature,
            indexId: report.indexId,
          }),
          new Promise<null>(resolve => window.setTimeout(() => resolve(null), 900)),
        ]);
        if (live) {
          reportForExport = { ...report, liveLayerAnalysis: live };
          setReport(reportForExport);
        }
      }

      await new Promise<void>(r => requestAnimationFrame(() => r()));

      setExportProgress('Capturing charts…');
      let chartImageDataUrl: string | null = null;
      const chartExportEl = document.querySelector(`#${chartExportHostId} canvas`);
      const chartMainEl = document.querySelector(`#${chartHostId} canvas`);
      const chartEl =
        chartExportEl instanceof HTMLCanvasElement
          ? chartExportEl
          : chartMainEl instanceof HTMLCanvasElement
            ? chartMainEl
            : null;
      if (chartEl) {
        chartImageDataUrl = captureCanvasHiRes(chartEl, 2);
      }

      let aoiMapImageDataUrl: string | null = null;
      let aoiMapCartographyEmbedded = false;
      const mapLngBounds = siPdfBoundsFromFeatureCollection(report.aoiOutlineGeoJson);
      if (mode === 'AOI_ANALYSIS') {
        setExportProgress('Embedding AOI map snapshot…');
        const snapKey = analysisSnapshotCaptureKey(report);
        if (
          analysisCaptureKeyRef.current === snapKey &&
          analysisLiveSnapshotRef.current
        ) {
          aoiMapImageDataUrl = analysisLiveSnapshotRef.current;
          aoiMapCartographyEmbedded = true;
        } else if (analysisLiveSnapshot) {
          aoiMapImageDataUrl = analysisLiveSnapshot;
          aoiMapCartographyEmbedded = true;
        } else if (liveMapCaptureOk && captureLiveMapSnapshot && reportAoiFeature) {
          const rawPdf = await captureAoiAnalysisLiveMapPng(
            captureLiveMapSnapshot,
            reportAoiFeature,
            changeFitBounds,
            snapshotPngHasIndexOverlay,
            { preview: true },
          );
          if (rawPdf) {
            aoiMapImageDataUrl = await compositeAoiAnalysisMapWithLegendPng(
              rawPdf,
              report,
              mapLngBounds,
            );
            aoiMapCartographyEmbedded = true;
          }
        }
      }

      let changeSlotMapImageDataUrls: (string | null)[] | null = null;
      if (mode === 'TIME_SERIES_CHANGE_DETECTION') {
        const cached = changeSlotSnapshotsRef.current;
        const slotsReady =
          cached.length === report.changeDetectionSlots.length &&
          cached.filter(Boolean).length >= Math.min(6, report.changeDetectionSlots.length);
        if (slotsReady) {
          changeSlotMapImageDataUrls = cached;
        } else if (liveMapCaptureOk) {
          changeSlotMapImageDataUrls = await captureAllChangeSnapshots(report);
        } else {
          changeSlotMapImageDataUrls = cached.length ? cached : null;
        }
      }

      const agriculturalInterpretation =
        agInterpretation ?? buildFallbackReportInterpretation(reportForExport);
      const interpretationPoints = buildFallbackInterpretationPoints(reportForExport);

      setExportProgress(format === 'pdf' ? 'Writing PDF…' : 'Writing Word document…');
      if (format === 'pdf') {
        await exportSiAoiVegetationReportPdf(reportForExport, {
          mode,
          chartImageDataUrl,
          aoiMapImageDataUrl,
          aoiMapLngLatBounds: mapLngBounds,
          aoiMapCartographyEmbedded,
          changeSlotMapImageDataUrls,
          executiveSummaryAi: geminiSummary?.trim() || undefined,
          interpretationPoints,
          agriculturalInterpretation,
          reportStyleMode: reportForExport.reportStyleMode,
        });
      } else {
        await exportSiAoiVegetationReportDocx(reportForExport, {
          mode,
          chartImageDataUrl,
          aoiMapImageDataUrl,
          changeSlotMapImageDataUrls,
          executiveSummaryAi: geminiSummary?.trim() || undefined,
          reportStyleMode: reportForExport.reportStyleMode,
        });
      }
    } catch (e) {
      console.error(e);
      setErr(
        'Export failed. Ensure a Mapbox token is set when using the in-modal map fallback, wait for maps to finish loading, then try again (export briefly switches to the tab needed for snapshots).',
      );
    } finally {
      setExportBusy(false);
      setExportProgress(null);
      setExportUi({ phase: 'idle' });
    }
  }, [
    report,
    exportUi.mode,
    exportUi.format,
    mapOk,
    liveMapCaptureOk,
    chartHostId,
    chartExportHostId,
    geminiSummary,
    geminiApiKey,
    analysisLiveSnapshot,
    changeSlotSnapshots,
    captureLiveMapSnapshot,
    captureAllChangeSnapshots,
    snapshotPngHasIndexOverlay,
    changeFitBounds,
    reportAoiFeature,
    liveSnapshotAoiOpts,
    ensureLiveLayerAnalysis,
    selectedFeature,
    selectedAoiId,
    selectedName,
  ]);

  if (!open) return null;

  return (
    <div
      className="si-aoi-report-modal-backdrop si-aoi-report-modal-backdrop--open"
      role="presentation"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="si-aoi-report-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="si-aoi-report-modal-title"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="si-aoi-report-modal__head">
          <div>
            <h2 id="si-aoi-report-modal-title" className="si-aoi-report-modal__title">
              Vegetation cover report (AOI)
            </h2>
            <p className="si-aoi-report-modal__sub">
              Configure spectral index, acquisition window, cloud cap, temporal composite, and AOI. The preview bundles
              an English narrative, health table, timeline, AOI basemap with transparent class-style overlay, and a 3×4
              change-detection grid. PDF export is English-only; switch to <strong>AOI analysis</strong> before export to
              include the main map snapshot. Maps wait for the basemap style to finish loading to avoid Mapbox errors.
            </p>
          </div>
          <button type="button" className="si-aoi-report-modal__close" aria-label="Close" onClick={onClose}>
            <i className="fa-solid fa-xmark" aria-hidden />
          </button>
        </div>

        <div className="si-aoi-report-modal__body">
          {step === 'configure' ? (
            <>
              <div className="si-aoi-report-form">
                <label>
                  Index
                  <select value={indexId} onChange={e => setIndexId(e.target.value as StaticAoiChartLayerId)}>
                    {STATIC_AOI_CHART_LAYER_OPTIONS.map(o => (
                      <option key={o.id} value={o.id}>
                        {o.label} — {o.subtitle}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Start date
                  <input type="date" value={dateStart.slice(0, 10)} onChange={e => setDateStart(e.target.value)} />
                </label>
                <label>
                  End date
                  <input type="date" value={dateEnd.slice(0, 10)} onChange={e => setDateEnd(e.target.value)} />
                </label>
                <label>
                  AOI
                  <select value={selectedAoiId} onChange={e => setSelectedAoiId(e.target.value)}>
                    {aoiOptions.map(o => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </label>
                {satelliteProviderLabel?.trim() ? (
                  <label>
                    Satellite provider
                    <input type="text" value={satelliteProviderLabel.trim()} readOnly aria-readonly />
                    <span className="si-aoi-report-field-hint">Included in PDF, Excel, and map snapshot metadata.</span>
                  </label>
                ) : null}
                <label>
                  Max cloud (%)
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={cloudCoverMaxPct}
                    onChange={e => setCloudCoverMaxPct(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                  />
                  <span className="si-aoi-report-field-hint">Metadata / RS context (aligns with WMS MAXCC ordering).</span>
                </label>
                <label>
                  Temporal composite
                  <select value={temporalComposite} onChange={e => setTemporalComposite(e.target.value as 'median' | 'max')}>
                    <option value="median">Weekly median (stable signal)</option>
                    <option value="max">Weekly maximum (stress / peak emphasis)</option>
                  </select>
                  <span className="si-aoi-report-field-hint">Narrative label for the report; timeline uses your field timeline until zonal stats API is wired.</span>
                </label>
                <label>
                  Report type
                  <select
                    value={reportType}
                    onChange={e => {
                      const next = e.target.value;
                      if (isSiAoiReportType(next)) setReportType(next);
                    }}
                  >
                    {SI_AOI_REPORT_TYPE_OPTIONS.map(o => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <span className="si-aoi-report-field-hint">
                    {SI_AOI_REPORT_TYPE_OPTIONS.find(o => o.id === reportType)?.hint}
                  </span>
                </label>
                <label>
                  Style mode (Gemini + PDF)
                  <select
                    value={reportStyleMode}
                    onChange={e => setReportStyleMode(e.target.value as SiAoiReportStyleMode)}
                  >
                    {SI_AOI_REPORT_STYLE_MODE_OPTIONS.map(o => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <span className="si-aoi-report-field-hint">
                    {SI_AOI_REPORT_STYLE_MODE_OPTIONS.find(o => o.id === reportStyleMode)?.hint}
                  </span>
                </label>
              </div>
              {err ? <p className="si-aoi-report-err">{err}</p> : null}
              <div className="si-aoi-report-actions">
                <button
                  type="button"
                  className="si-aoi-report-btn"
                  onClick={onGenerate}
                  disabled={!aoiOptions.length || generateBusy}
                >
                  {generateBusy ? (
                    <>
                      <span className="si-aoi-report-map-skeleton__spinner" aria-hidden /> Generating…
                    </>
                  ) : (
                    'Generate report'
                  )}
                </button>
                <button type="button" className="si-aoi-report-btn si-aoi-report-btn--ghost" onClick={onClose}>
                  Cancel
                </button>
              </div>
            </>
          ) : report ? (
            <div className="si-aoi-report-preview">
              <div className="si-aoi-report-actions">
                <button
                  type="button"
                  className="si-aoi-report-btn si-aoi-report-btn--ghost"
                  onClick={() => {
                    setStep('configure');
                    setLegendBandCount(5);
                  }}
                >
                  Back to setup
                </button>
                <button
                  type="button"
                  className="si-aoi-report-btn"
                  onClick={openExportPreview}
                  disabled={!report || exportUi.phase === 'busy'}
                >
                  Export PDF
                </button>
                <button type="button" className="si-aoi-report-btn si-aoi-report-btn--ghost" onClick={onClose}>
                  Close
                </button>
              </div>

              <label className="si-aoi-report-style-preview">
                Style mode
                <select
                  value={report.reportStyleMode}
                  onChange={e => applyReportStyleMode(e.target.value as SiAoiReportStyleMode)}
                  disabled={geminiLoading}
                >
                  {SI_AOI_REPORT_STYLE_MODE_OPTIONS.map(o => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

              <section className="si-aoi-report-sheet si-aoi-report-sheet--page1" aria-label="Report page 1">
                <p className="si-aoi-report-sheet__kicker">Page 1</p>
                <SiAoiReportDataInsightsSection
                  report={report}
                  geminiSummary={geminiSummary}
                  geminiLoading={geminiLoading}
                  geminiError={geminiErr}
                />
                <SiAoiReportInfographicPanel report={report} />
              </section>

              <div className="si-aoi-report-view-tabs" role="tablist" aria-label="Report sections">
                <button
                  type="button"
                  role="tab"
                  aria-selected={reportView === 'analysis'}
                  className={`si-aoi-report-view-tab${reportView === 'analysis' ? ' si-aoi-report-view-tab--active' : ''}`}
                  onClick={() => setReportView('analysis')}
                >
                  AOI analysis
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={reportView === 'change'}
                  className={`si-aoi-report-view-tab${reportView === 'change' ? ' si-aoi-report-view-tab--active' : ''}`}
                  onClick={() => setReportView('change')}
                >
                  Time series change detection
                </button>
              </div>

              {reportView === 'change' ? (
                <>
                  <div className="si-aoi-report-card">
                    <h3>Legend-aligned index classification</h3>
                    <p className="si-aoi-report-analysis si-aoi-report-analysis--compact">
                      Same {report.legendBandCount}-band table and colours as the main map symbology legend.
                    </p>
                    <SiAoiReportLegendTable report={report} legendBandCount={legendBandCount} />
                  </div>
                  <div className="si-aoi-report-card">
                    <h3>Time series change detection map</h3>
                    <p className="si-aoi-report-analysis">
                      Twelve tiles (3×4): each date captures the live Map Viewer (WMS symbology clipped to the AOI
                      boundary) with the classification legend printed below the map.
                    </p>
                    {changeSnapshotsLoading ? (
                      <p className="si-aoi-report-change-progress" role="status">
                        Loading live map tiles… preview stays open; tiles fill in as each date is captured.
                      </p>
                    ) : null}
                    {!liveMapCaptureOk ? (
                      <p className="si-aoi-report-analysis">
                        Live map capture is unavailable — open the report from Satellite Intelligence with the map loaded.
                      </p>
                    ) : (
                      <div className="si-aoi-report-change-grid">
                        {report.changeDetectionSlots.map((slot, idx) => (
                          <SiAoiChangeMapCell
                            key={`${slot.date}-${idx}`}
                            slot={slot}
                            indexId={report.indexId}
                            tableRows={report.tableRows}
                            classificationPalette={report.classificationPalette}
                            snapshotUrl={changeSlotSnapshots[idx] ?? null}
                            snapshotLoading={changeSnapshotsLoading && !changeSlotSnapshots[idx]}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {report.liveLayerAnalysis ? (
                    <SiAoiReportLiveLayerAnalysisSection snapshot={report.liveLayerAnalysis} />
                  ) : null}

                  <SiAoiAgriculturalInterpretationSection
                    interpretation={agInterpretation}
                    metrics={agMetrics}
                    loading={agInterpretationLoading}
                    error={agInterpretationErr}
                    geminiActive={Boolean(geminiApiKey.trim())}
                    sectionTitle={siAoiReportTypeInterpretationSectionTitle(report.reportType)}
                    sectionSubtitle={`${siAoiReportTypeLabel(report.reportType)} — interprets active layers and AOI statistics for domain-specific decisions`}
                  />

                  <div className="si-aoi-report-card">
                    <h3>Scientific analysis</h3>
                    <p className="si-aoi-report-analysis">{report.analysisEn}</p>
                    {report.stressNoteEn ? <div className="si-aoi-report-stress">{report.stressNoteEn}</div> : null}
                  </div>

                  <div className="si-aoi-report-card">
                    <h3>Legend-aligned area classification</h3>
                    <p className="si-aoi-report-analysis si-aoi-report-analysis--compact">
                      Shares follow the WMS index ramp band widths (thinned to {report.legendBandCount} classes). Switch
                      bands to match the 5- or 10-step legend used in the main map.
                    </p>
                    <SiAoiReportLegendTable
                      report={report}
                      legendBandCount={legendBandCount}
                      onLegendBandCount={applyLegendBandCount}
                    />
                  </div>

                  <div className="si-aoi-report-card si-aoi-report-card--scatter">
                    <div className="si-aoi-report-scatter-head">
                      <button
                        type="button"
                        className={`si-aoi-report-scatter-icon-btn${scatterPanelOpen ? ' si-aoi-report-scatter-icon-btn--on' : ''}`}
                        aria-expanded={scatterPanelOpen}
                        aria-controls="si-aoi-report-scatter-panel"
                        id="si-aoi-report-scatter-toggle"
                        title="Scatter: AOI grid cells — report index (X) vs another index (Y) with OLS line and R²"
                        onClick={() => setScatterPanelOpen(v => !v)}
                      >
                        <i className="fa-solid fa-chart-scatter" aria-hidden />
                      </button>
                      <h3>Pixel scatter</h3>
                    </div>
                    {!scatterPanelOpen ? (
                      <p className="si-aoi-report-analysis si-aoi-report-analysis--compact si-aoi-report-scatter-teaser">
                        Tap the scatter icon to plot sampled AOI cells: <strong>{report.indexLabel}</strong> on the
                        horizontal axis versus a second index on the vertical axis, with a linear fit and{' '}
                        <strong>R²</strong> (demo client-side values).
                      </p>
                    ) : (
                      <div id="si-aoi-report-scatter-panel" className="si-aoi-report-scatter-panel">
                        <SiAoiReportPixelScatterBlock report={report} weeklyMeans={weeklyMeansForScatter} />
                      </div>
                    )}
                  </div>

                  <section className="si-aoi-report-sheet si-aoi-report-sheet--page2" aria-label="Report page 2">
                    <p className="si-aoi-report-sheet__kicker">Page 2</p>
                  <div className="si-aoi-report-card">
                    <div className="si-aoi-report-map-head">
                      <h3>AOI map — live Map Viewer snapshot</h3>
                      {terrainAvailable ? (
                        <button
                          type="button"
                          className={`si-aoi-report-btn si-aoi-report-btn--ghost si-aoi-report-map-3d${aoiMapView3d ? ' si-aoi-report-map-3d--on' : ''}`}
                          onClick={() => {
                            setAoiMapView3d(v => !v);
                            if (report) void prefetchAnalysisSnapshot(report);
                          }}
                          title="Toggle oblique 3D view when elevation is available"
                        >
                          <i className={`fa-solid ${aoiMapView3d ? 'fa-map' : 'fa-cube'}`} aria-hidden />{' '}
                          {aoiMapView3d ? '2D' : '3D'}
                        </button>
                      ) : null}
                    </div>
                    <p className="si-aoi-report-analysis si-aoi-report-analysis--compact">
                      Cartographer layout: live basemap + index layer (Sentinel Hub WMS), vector north arrow, scale bar,
                      and classification legend aligned to the AOI extent.
                    </p>
                    {liveMapCaptureOk ? (
                      <div className="si-aoi-report-map-wrap">
                        {analysisSnapshotLoading && !analysisLiveSnapshot ? (
                          <div className="si-aoi-report-map-skeleton" aria-busy="true" aria-live="polite">
                            <div className="si-aoi-report-map-skeleton__shimmer" />
                            <div className="si-aoi-report-map-skeleton__label">
                              <span className="si-aoi-report-map-skeleton__spinner" aria-hidden />
                              {analysisSnapshotProgress ?? 'Capturing live map…'}
                            </div>
                          </div>
                        ) : null}
                        {analysisLiveSnapshot ? (
                          <img
                            className="si-aoi-report-analysis-snapshot"
                            src={analysisLiveSnapshot}
                            alt={`AOI map snapshot for ${report.aoiName}`}
                            draggable={false}
                          />
                        ) : null}
                        {analysisSnapshotLoading && analysisLiveSnapshot ? (
                          <div className="si-aoi-report-map-refresh-badge" aria-live="polite">
                            <span className="si-aoi-report-map-skeleton__spinner" aria-hidden />
                            Updating…
                          </div>
                        ) : null}
                        {!analysisSnapshotLoading && !analysisLiveSnapshot ? (
                          <div className="si-aoi-report-change-cell__map-placeholder">
                            Live map snapshot unavailable. Keep NDVI/WMS visible on the main map, then retry.
                            <button
                              type="button"
                              className="si-aoi-report-btn si-aoi-report-btn--ghost si-aoi-report-map-retry"
                              onClick={retryAnalysisMapSnapshot}
                            >
                              Retry capture
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <p className="si-aoi-report-analysis">
                        Live map capture requires the main Map Viewer. Close and reopen the report from the satellite
                        map.
                      </p>
                    )}
                    <SiAoiMapLegendBar
                      tableRows={report.tableRows}
                      palette={report.classificationPalette}
                      indexId={report.indexId}
                    />
                  </div>
                  </section>
                </>
              )}
            </div>
          ) : null}
        </div>

        {report && step === 'preview' && reportTimelineChart ? (
          <div className="si-aoi-report-chart-export-host" aria-hidden>
            <div id={chartExportHostId} className="si-aoi-report-chart-export-host__inner">
              <AoiStaticMultiLayerLineChart
                presentation="report"
                disableAnimation
                title={reportTimelineChart.title}
                labels={reportTimelineChart.labels}
                datasets={reportTimelineChart.datasets}
                hasLst={reportTimelineChart.hasLst}
              />
            </div>
          </div>
        ) : null}
        {exportUi.phase === 'preview' && exportUi.mode ? (
          <div
            className="si-aoi-report-export-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="si-aoi-export-preview-title"
            onMouseDown={e => {
              if (e.target === e.currentTarget) cancelExportPreview();
            }}
          >
            <div className="si-aoi-report-export-card">
              <h3 id="si-aoi-export-preview-title" className="si-aoi-report-export-card__title">
                Export preview
              </h3>
              <p className="si-aoi-report-export-card__mode">
                {exportUi.mode === 'AOI_ANALYSIS' ? (
                  <>
                    <strong>AOI analysis</strong> — enterprise report (PDF or Word)
                  </>
                ) : (
                  <>
                    <strong>Time series change detection</strong> — 3×4 grid + appendix (PDF or Word)
                  </>
                )}
              </p>
              <div className="si-aoi-report-export-format" role="group" aria-label="Export file format">
                <span className="si-aoi-report-export-format__label">Format</span>
                <label className="si-aoi-report-export-format__opt">
                  <input
                    type="radio"
                    name="si-aoi-export-format"
                    checked={(exportUi.format ?? 'pdf') === 'pdf'}
                    onChange={() => setExportUi(e => ({ ...e, format: 'pdf' }))}
                  />
                  PDF
                </label>
                <label className="si-aoi-report-export-format__opt">
                  <input
                    type="radio"
                    name="si-aoi-export-format"
                    checked={exportUi.format === 'docx'}
                    onChange={() => setExportUi(e => ({ ...e, format: 'docx' }))}
                  />
                  Word (.docx)
                </label>
              </div>
              <ul className="si-aoi-report-export-card__list">
                {exportUi.mode === 'AOI_ANALYSIS' ? (
                  <>
                    <li>
                      Data &amp; insights: index statistics, KPIs, vector pie and bar charts, and optional
                      Gemini executive text when a key is configured
                    </li>
                    <li>
                      <strong>Page 1</strong> — executive summary, class comparison bars, AOI health doughnut, and{' '}
                      NDVI timeline at the bottom of the page
                    </li>
                    <li>
                      <strong>Page 2</strong> — AOI map snapshot, classification legend, interpretation table, and
                      domain recommendations (exactly two PDF pages)
                    </li>
                    <li>
                      Export briefly opens the <strong>AOI analysis</strong> tab so the live map canvas is ready for page
                      2
                    </li>
                  </>
                ) : (
                  <>
                    <li>Cover band with AOI, index, and period metadata</li>
                    <li>
                      3×4 grid with per-date map thumbnails (when Mapbox is available), class shares, and index range per
                      tile
                    </li>
                    <li>Timeline chart plus classification legend (symbology-aligned)</li>
                    <li>Data &amp; insights appendix (index table, KPIs, class mix, Gemini text when available)</li>
                    <li>Word: structured headings, tables, and embedded PNG images (Microsoft Word / LibreOffice)</li>
                    <li>Export briefly opens the <strong>Time series change detection</strong> tab to capture grid maps</li>
                  </>
                )}
              </ul>
              <div className="si-aoi-report-export-card__actions">
                <button type="button" className="si-aoi-report-btn si-aoi-report-btn--ghost" onClick={cancelExportPreview}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="si-aoi-report-btn"
                  onClick={() => void confirmExportPdf()}
                >
                  {(exportUi.format ?? 'pdf') === 'docx' ? 'Generate Word' : 'Generate PDF'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {exportUi.phase === 'busy' ? (
          <div className="si-aoi-report-export-overlay si-aoi-report-export-overlay--busy" aria-live="polite">
            <div className="si-aoi-report-export-busy">
              <div className="si-aoi-report-export-busy__spinner" aria-hidden />
              <p className="si-aoi-report-export-busy__title">
                Preparing {(exportUi.format ?? 'pdf') === 'docx' ? 'Word document' : 'PDF'}
              </p>
              <p className="si-aoi-report-export-busy__sub">
                {exportProgress ??
                  (exportUi.mode === 'AOI_ANALYSIS'
                    ? 'Composing AOI layout…'
                    : 'Composing time series change detection layout…')}
              </p>
              <div className="si-aoi-report-export-busy__progress" aria-hidden>
                <div className="si-aoi-report-export-busy__progress-bar" />
              </div>
            </div>
          </div>
        ) : null}

        {generateBusy ? (
          <div className="si-aoi-report-generating-overlay" aria-live="polite" role="status">
            <div className="si-aoi-report-generating-card">
              <div className="si-aoi-report-export-busy__spinner" aria-hidden />
              <p className="si-aoi-report-export-busy__title">Building report preview</p>
              <p className="si-aoi-report-export-busy__sub">Follow the steps below — the map may refresh briefly.</p>
              <ol className="si-aoi-report-generating-steps">
                {generateSteps.map((s, i) => {
                  const done = i < generateStepIndex;
                  const active = i === generateStepIndex;
                  const label = active && generateStepDetail ? generateStepDetail : s.label;
                  return (
                    <li
                      key={s.id}
                      className={
                        'si-aoi-report-generating-steps__item' +
                        (done ? ' is-done' : '') +
                        (active ? ' is-active' : '') +
                        (!done && !active ? ' is-pending' : '')
                      }
                    >
                      <i
                        className={
                          done
                            ? 'fa-solid fa-circle-check'
                            : active
                              ? 'fa-solid fa-circle-notch fa-spin'
                              : 'fa-regular fa-circle'
                        }
                        aria-hidden
                      />
                      <span>{label}</span>
                    </li>
                  );
                })}
              </ol>
              <div className="si-aoi-report-export-busy__progress" aria-hidden>
                <div className="si-aoi-report-export-busy__progress-bar" />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
