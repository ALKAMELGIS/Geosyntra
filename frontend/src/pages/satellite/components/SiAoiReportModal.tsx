import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MapGL, { Layer, NavigationControl, Source, type MapRef } from 'react-map-gl/mapbox';
import type { StyleSpecification } from 'mapbox-gl';
import { useGeminiApiKey } from '../../../hooks/useGeminiApiKey';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import {
  STATIC_AOI_CHART_LAYER_OPTIONS,
  type StaticAoiChartLayerId,
} from '../utils/staticAoiMultiChartData';
import {
  buildFallbackInterpretationPoints,
  buildSiAoiVegetationReport,
  exportSiAoiVegetationReportPdf,
  siAoiReportFeatureBBoxLngLat,
  type SiAoiChangeDetectionSlot,
  type SiAoiClassificationPalette,
  type SiAoiLegendBandCount,
  type SiAoiPdfExportMode,
  type SiAoiReportModel,
  type SiAoiReportTableRow,
} from '../utils/siAoiVegetationReportModel';
import { exportSiAoiVegetationReportDocx } from '../utils/siAoiVegetationReportDocx';
import {
  fetchSiAoiReportExecutiveSummaryFromGemini,
  fetchSiAoiReportInterpretationFromGemini,
} from '../utils/siAoiReportGemini';
import type { SiLiveMapSnapshotCapture } from '../utils/siMapViewerSnapshot';
import {
  compositeMapWithBottomLegendStrip,
  legendItemsFromTableRows,
  renderAoiHeatmapSlotPng,
} from '../utils/siAoiReportSlotMapRender';
import { SiAoiReportDataInsightsSection } from './SiAoiReportDataInsights';
import { SiAoiReportPixelScatterBlock } from './SiAoiReportPixelScatterBlock';
import './SiAoiReportModal.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  Title,
  Tooltip,
  Legend,
  Filler,
);

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

function fillRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rad: number) {
  const r = Math.min(rad, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

type SiPdfLngLatBounds = { west: number; south: number; east: number; north: number };

function siPdfBoundsFromFeatureCollection(fc: GeoJSON.FeatureCollection): SiPdfLngLatBounds | null {
  const f = fc.features?.[0];
  if (!f) return null;
  const b = siAoiReportFeatureBBoxLngLat(f);
  if (!b) return null;
  return { west: b[0], south: b[1], east: b[2], north: b[3] };
}

function siPdfBoundsFromFitBounds(fit: [[number, number], [number, number]]): SiPdfLngLatBounds {
  const lngs = [fit[0][0], fit[1][0]];
  const lats = [fit[0][1], fit[1][1]];
  return {
    west: Math.min(...lngs),
    east: Math.max(...lngs),
    south: Math.min(...lats),
    north: Math.max(...lats),
  };
}

function approxGroundSpanMeters(b: SiPdfLngLatBounds): number {
  const midLatRad = ((b.south + b.north) / 2) * (Math.PI / 180);
  const mLat = 111_320 * Math.max(1e-9, b.north - b.south);
  const mLng = 111_320 * Math.max(0.05, Math.cos(midLatRad)) * Math.max(1e-9, b.east - b.west);
  return Math.max(mLat, mLng) * 0.92;
}

function pickScaleBarLength(visibleM: number): { meters: number; label: string } {
  const raw = Math.max(visibleM / 4.5, 10);
  const exp = Math.floor(Math.log10(raw));
  const base = 10 ** exp;
  const n = raw / base;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  const meters = step * base;
  if (meters >= 1000) {
    const km = meters / 1000;
    const label = Number.isInteger(km) ? `${km} km` : `${km.toFixed(1)} km`;
    return { meters, label };
  }
  return { meters, label: `${Math.round(meters)} m` };
}

/** North arrow + approximate ground scale (from AOI / fit bounds vs map width). */
function drawNorthArrowAndScaleOnMapCanvas(
  ctx: CanvasRenderingContext2D,
  mapW: number,
  mapH: number,
  bounds: SiPdfLngLatBounds | null,
) {
  const visibleM = bounds ? approxGroundSpanMeters(bounds) : 5000;
  const { meters, label } = pickScaleBarLength(visibleM);
  const barPx = Math.min(mapW * 0.32, Math.max(64, (meters / visibleM) * mapW * 0.88));
  const pad = 11;
  const sbW = Math.min(barPx + 54, mapW - pad * 2);
  const sbH = 36;
  const yCard = mapH - pad - sbH;
  ctx.save();
  ctx.fillStyle = 'rgba(2, 6, 23, 0.58)';
  fillRoundRect(ctx, pad, yCard, sbW, sbH, 8);
  ctx.strokeStyle = 'rgba(248, 250, 252, 0.92)';
  ctx.lineWidth = 2;
  const bx0 = pad + 10;
  const yLine = yCard + 14;
  ctx.beginPath();
  ctx.moveTo(bx0, yLine);
  ctx.lineTo(bx0 + barPx, yLine);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(bx0, yLine - 4);
  ctx.lineTo(bx0, yLine + 4);
  ctx.moveTo(bx0 + barPx, yLine - 4);
  ctx.lineTo(bx0 + barPx, yLine + 4);
  ctx.stroke();
  ctx.fillStyle = '#f1f5f9';
  ctx.font = '600 11px system-ui, "Segoe UI", sans-serif';
  ctx.textBaseline = 'bottom';
  ctx.fillText(label, bx0, yLine - 6);
  ctx.font = '500 9px system-ui, "Segoe UI", sans-serif';
  ctx.fillStyle = 'rgba(226, 232, 240, 0.88)';
  ctx.fillText('Scale (approx.)', bx0, yCard + sbH - 7);

  const nx = pad + 23;
  const ny = pad + 34;
  ctx.fillStyle = 'rgba(2, 6, 23, 0.58)';
  fillRoundRect(ctx, pad, pad, 46, 54, 8);
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.moveTo(nx, ny - 18);
  ctx.lineTo(nx - 11, ny + 8);
  ctx.lineTo(nx + 11, ny + 8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.95)';
  ctx.lineWidth = 1.25;
  ctx.stroke();
  ctx.font = '700 12px system-ui, "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText('N', nx, pad + 16);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
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
          <span className="si-aoi-report-map-legend-bar__label">{row.labelEn}</span>
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
              <th>Class (index range)</th>
              <th>Area (km²)</th>
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
                <td>{row.labelEn}</td>
                <td>{row.areaKm2.toFixed(3)}</td>
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
      <div className="si-aoi-report-change-cell__stats" dir="ltr">
        <span className="si-aoi-report-change-cell__stats-mean">μ {meanStr}</span>
        <span className="si-aoi-report-change-cell__stats-hml">
          Top shares {slot.stats.highPct.toFixed(0)}% · {slot.stats.medPct.toFixed(0)}% ·{' '}
          {slot.stats.lowPct.toFixed(0)}%
        </span>
        <span className="si-aoi-report-change-cell__stats-px">{slot.stats.pixelCount} px</span>
      </div>
      {!snapshotUrl ? (
        <SiAoiMapLegendBar tableRows={tableRows} palette={classificationPalette} indexId={indexId} />
      ) : null}
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
  /** Match the main Satellite Intelligence basemap (overlays only on top in the report map). */
  reportMapStyle?: string | StyleSpecification;
  /** Sentinel / WMS MAXCC-style cap shown in the report (metadata). */
  defaultCloudCoverPct?: number;
  /** Optional class colours from WMS symbology (merged when building the report heatmaps). */
  classificationPalette?: Partial<SiAoiClassificationPalette>;
  /** Capture the live Satellite Intelligence map canvas (WMS + symbology + AOI). */
  captureLiveMapSnapshot?: SiLiveMapSnapshotCapture;
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
}: SiAoiReportModalProps) {
  const geminiApiKey = useGeminiApiKey();
  const [geminiSummary, setGeminiSummary] = useState<string | null>(null);
  const [geminiLoading, setGeminiLoading] = useState(false);
  const [geminiErr, setGeminiErr] = useState<string | null>(null);
  const [step, setStep] = useState<'configure' | 'preview'>('configure');
  const [reportView, setReportView] = useState<'analysis' | 'change'>('analysis');
  const [indexId, setIndexId] = useState<StaticAoiChartLayerId>(defaultIndexId);
  const [dateStart, setDateStart] = useState(timeSeriesStart);
  const [dateEnd, setDateEnd] = useState(timeSeriesEnd);
  const [selectedAoiId, setSelectedAoiId] = useState('');
  const [cloudCoverMaxPct, setCloudCoverMaxPct] = useState(defaultCloudCoverPct);
  const [temporalComposite, setTemporalComposite] = useState<'median' | 'max'>('median');
  const [analysisMapReady, setAnalysisMapReady] = useState(false);
  const [legendBandCount, setLegendBandCount] = useState<SiAoiLegendBandCount>(5);
  const [scatterPanelOpen, setScatterPanelOpen] = useState(false);
  const [report, setReport] = useState<SiAoiReportModel | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportUi, setExportUi] = useState<{
    phase: 'idle' | 'preview' | 'busy';
    mode?: SiAoiPdfExportMode;
    format?: 'pdf' | 'docx';
  }>({ phase: 'idle' });
  const mapRef = useRef<MapRef | null>(null);
  const lastBuildInputRef = useRef<Omit<Parameters<typeof buildSiAoiVegetationReport>[0], 'legendBandCount'> | null>(
    null,
  );
  const chartHostId = 'si-aoi-report-chart-host';
  const chartExportHostId = 'si-aoi-report-chart-host-export';
  const [changeSlotSnapshots, setChangeSlotSnapshots] = useState<(string | null)[]>([]);
  const [changeSnapshotsLoading, setChangeSnapshotsLoading] = useState(false);
  const [analysisLiveSnapshot, setAnalysisLiveSnapshot] = useState<string | null>(null);
  const [analysisSnapshotLoading, setAnalysisSnapshotLoading] = useState(false);
  const mapOk = Boolean(mapboxToken?.trim());
  const liveMapCaptureOk = Boolean(captureLiveMapSnapshot);

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
    setAnalysisMapReady(false);
    setLegendBandCount(5);
    setScatterPanelOpen(false);
    setChangeSlotSnapshots([]);
    setChangeSnapshotsLoading(false);
    setAnalysisLiveSnapshot(null);
    setAnalysisSnapshotLoading(false);
    lastBuildInputRef.current = null;
  }, [open, timeSeriesStart, timeSeriesEnd, defaultIndexId, preferredAoiId, aoiOptions, defaultCloudCoverPct]);

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
        });
        if (cancelled) return;
        setGeminiSummary(text);
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
  }, [open, report, step, geminiApiKey]);

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

  const prefetchAnalysisSnapshot = useCallback(
    async (built: SiAoiReportModel) => {
      if (!captureLiveMapSnapshot) return;
      const fitBounds = (() => {
        const f = built.aoiOutlineGeoJson.features[0];
        const b = f ? siAoiReportFeatureBBoxLngLat(f) : null;
        if (!b) return undefined;
        return [
          [b[0], b[1]],
          [b[2], b[3]],
        ] as [[number, number], [number, number]];
      })();
      const aoiFeat = built.aoiOutlineGeoJson.features[0];
      const snapDate =
        built.timeSeries[built.timeSeries.length - 1]?.date?.slice(0, 10) ?? built.dateEnd.slice(0, 10);
      setAnalysisSnapshotLoading(true);
      setAnalysisLiveSnapshot(null);
      try {
        const raw = await captureLiveMapSnapshot({
          date: snapDate,
          scale: 3,
          profile: 'balanced',
          fitBounds,
          aoiFeature: aoiFeat,
        });
        if (!raw) return;
        const withLegend = await compositeAoiAnalysisMapWithLegendPng(
          raw,
          built,
          siPdfBoundsFromFeatureCollection(built.aoiOutlineGeoJson),
        );
        setAnalysisLiveSnapshot(withLegend);
      } finally {
        setAnalysisSnapshotLoading(false);
      }
    },
    [captureLiveMapSnapshot],
  );

  const onGenerate = useCallback(() => {
    setErr(null);
    const aoiFeature = selectedFeature;
    if (!aoiFeature) {
      setErr('Select an AOI.');
      return;
    }
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
    };
    lastBuildInputRef.current = snap;
    const built = buildSiAoiVegetationReport({
      ...snap,
      legendBandCount,
    });
    if (!built) {
      setErr('AOI geometry must be a Polygon or MultiPolygon.');
      return;
    }
    setReport(built);
    setReportView('analysis');
    setStep('preview');
    void prefetchAnalysisSnapshot(built);
  }, [
    weeklyComposites,
    indexId,
    dateStart,
    dateEnd,
    selectedFeature,
    selectedName,
    cloudCoverMaxPct,
    temporalComposite,
    classificationPaletteProp,
    legendBandCount,
    prefetchAnalysisSnapshot,
  ]);

  const applyLegendBandCount = useCallback((next: SiAoiLegendBandCount) => {
    const snap = lastBuildInputRef.current;
    if (!snap) return;
    setLegendBandCount(next);
    setAnalysisMapReady(false);
    setAnalysisLiveSnapshot(null);
    const built = buildSiAoiVegetationReport({ ...snap, legendBandCount: next });
    if (built) {
      setReport(built);
      void prefetchAnalysisSnapshot(built);
    }
  }, [prefetchAnalysisSnapshot]);

  const mapInitialView = useMemo(() => {
    if (!report) return { longitude: 46.7, latitude: 24.7, zoom: 10 };
    const f = report.aoiOutlineGeoJson.features[0];
    const b = f ? siAoiReportFeatureBBoxLngLat(f) : null;
    if (!b) return { longitude: 46.7, latitude: 24.7, zoom: 10 };
    const cx = (b[0] + b[2]) / 2;
    const cy = (b[1] + b[3]) / 2;
    const span = Math.max(Math.abs(b[2] - b[0]), Math.abs(b[3] - b[1]));
    const zoom = span > 4 ? 6 : span > 1 ? 8 : span > 0.2 ? 10 : 12;
    return { longitude: cx, latitude: cy, zoom };
  }, [report]);

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

  const liveSnapshotCaptureOpts = useMemo(
    () =>
      changeFitBounds && reportAoiFeature
        ? { fitBounds: changeFitBounds, aoiFeature: reportAoiFeature }
        : undefined,
    [changeFitBounds, reportAoiFeature],
  );

  const captureAllChangeSnapshots = useCallback(async (): Promise<(string | null)[]> => {
    if (!report || !changeFitBounds || !reportAoiBounds) return [];
    const bounds = siPdfBoundsFromFitBounds(changeFitBounds);
    const urls: (string | null)[] = [];
    for (const slot of report.changeDetectionSlots) {
      let mapPng: string | null = null;
      if (captureLiveMapSnapshot) {
        mapPng = await captureLiveMapSnapshot({
          date: slot.date,
          scale: 3,
          profile: 'fast',
          ...liveSnapshotCaptureOpts,
        });
      }
      if (!mapPng && slot.heatmapCellsGeoJson.features.length) {
        mapPng = await renderAoiHeatmapSlotPng(
          slot.heatmapCellsGeoJson,
          report.aoiOutlineGeoJson,
          reportAoiBounds,
          report.classificationPalette.aoiOutline,
        );
      }
      urls.push(
        mapPng
          ? await compositeChangeCellLegendPng(
              mapPng,
              report.tableRows,
              report.classificationPalette,
              report.indexId,
              bounds,
            )
          : null,
      );
      await new Promise<void>(r => window.setTimeout(r, 60));
    }
    return urls;
  }, [
    captureLiveMapSnapshot,
    report,
    changeFitBounds,
    reportAoiBounds,
    liveSnapshotCaptureOpts,
  ]);

  useEffect(() => {
    if (!open || !report || reportView !== 'change' || !changeFitBounds) {
      return;
    }
    let cancelled = false;
    setChangeSnapshotsLoading(true);
    setChangeSlotSnapshots([]);
    void (async () => {
      try {
        const urls = await captureAllChangeSnapshots();
        if (!cancelled) setChangeSlotSnapshots(urls);
      } finally {
        if (!cancelled) setChangeSnapshotsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, report, reportView, changeFitBounds, captureAllChangeSnapshots]);

  const retryAnalysisMapSnapshot = useCallback(() => {
    if (!report) return;
    void prefetchAnalysisSnapshot(report);
  }, [report, prefetchAnalysisSnapshot]);

  useEffect(() => {
    if (!open || !report || reportView !== 'analysis' || !captureLiveMapSnapshot) return;
    if (analysisLiveSnapshot || analysisSnapshotLoading) return;
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

  useEffect(() => {
    setAnalysisMapReady(false);
  }, [report, reportView]);

  const onAnalysisMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap?.();
    if (!map) return;
    const arm = () => setAnalysisMapReady(true);
    if (map.isStyleLoaded?.()) {
      arm();
      try {
        map.once('idle', arm);
      } catch {
        /* ignore */
      }
    } else {
      map.once('style.load', () => {
        arm();
        try {
          map.once('idle', arm);
        } catch {
          /* ignore */
        }
      });
    }
  }, []);

  useEffect(() => {
    if (!open || !report || reportView !== 'analysis' || !analysisMapReady) return;
    const map = mapRef.current?.getMap?.();
    if (!map || !map.isStyleLoaded?.()) return;
    const f = report.aoiOutlineGeoJson.features[0];
    const b = f ? siAoiReportFeatureBBoxLngLat(f) : null;
    if (!b) return;
    const t = window.setTimeout(() => {
      try {
        map.fitBounds(
          [
            [b[0], b[1]],
            [b[2], b[3]],
          ],
          { padding: 36, duration: 500, maxZoom: 14 },
        );
      } catch {
        /* ignore */
      }
    }, 40);
    return () => window.clearTimeout(t);
  }, [open, report, reportView, analysisMapReady]);

  const lineData = useMemo(() => {
    if (!report) return null;
    return {
      labels: report.timeSeries.map(t => t.date),
      datasets: [
        {
          label: report.indexLabel,
          data: report.timeSeries.map(t => t.value),
          borderColor: '#34d399',
          backgroundColor: 'rgba(52, 211, 153, 0.12)',
          tension: 0.25,
          fill: true,
          pointRadius: 2,
        },
      ],
    };
  }, [report]);

  const lineOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: { top: 8, right: 10, bottom: 28, left: 10 },
      },
      plugins: {
        legend: { labels: { color: '#cbd5e1', boxWidth: 10, font: { size: 11 } } },
        title: {
          display: true,
          text: `${report?.indexLabel ?? ''} — ${report?.dateStart ?? ''} … ${report?.dateEnd ?? ''}`,
          color: '#e2e8f0',
          font: { size: 12 },
          padding: { bottom: 6 },
        },
      },
      scales: {
        x: {
          ticks: {
            color: '#94a3b8',
            maxRotation: 35,
            minRotation: 0,
            autoSkip: true,
            maxTicksLimit: 8,
            font: { size: 10 },
          },
          grid: { color: 'rgba(148,163,184,0.12)' },
        },
        y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.12)' } },
      },
      devicePixelRatio: Math.min(2.5, typeof window !== 'undefined' ? window.devicePixelRatio || 2 : 2),
    }),
    [report],
  );

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
    const sleep = (ms: number) => new Promise<void>(r => window.setTimeout(r, ms));

    await new Promise<void>(r => requestAnimationFrame(() => r()));
    await sleep(80);

    try {
      if (mapOk && mode === 'AOI_ANALYSIS' && !liveMapCaptureOk) {
        setReportView('analysis');
        await sleep(550);
        for (let i = 0; i < 50; i++) {
          await sleep(100);
          const m = mapRef.current?.getMap?.();
          if (m?.isStyleLoaded?.()) break;
        }
      } else if (mapOk && mode === 'TIME_SERIES_CHANGE_DETECTION' && !liveMapCaptureOk) {
        setReportView('change');
        await sleep(900);
        await sleep(350);
      } else if (liveMapCaptureOk) {
        if (mode === 'AOI_ANALYSIS') setReportView('analysis');
        else setReportView('change');
        await sleep(120);
      }

      await new Promise<void>(r => requestAnimationFrame(() => r()));

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
      if (mode === 'AOI_ANALYSIS') {
        if (analysisLiveSnapshot) {
          aoiMapImageDataUrl = analysisLiveSnapshot;
        } else if (liveMapCaptureOk && captureLiveMapSnapshot) {
          const snapDate =
            report.timeSeries[report.timeSeries.length - 1]?.date?.slice(0, 10) ?? report.dateEnd.slice(0, 10);
          const raw = await captureLiveMapSnapshot({
            date: snapDate,
            scale: 3,
            ...liveSnapshotCaptureOpts,
          });
          if (raw) {
            aoiMapImageDataUrl = await compositeAoiAnalysisMapWithLegendPng(
              raw,
              report,
              siPdfBoundsFromFeatureCollection(report.aoiOutlineGeoJson),
            );
          }
        } else if (mapOk) {
          const map = mapRef.current?.getMap?.();
          if (map) {
            if (!map.isStyleLoaded?.()) {
              await new Promise<void>(resolve => {
                const done = () => resolve();
                try {
                  map.once('style.load', done);
                } catch {
                  done();
                }
                window.setTimeout(done, 5000);
              });
            }
            await new Promise<void>(resolve => {
              let settled = false;
              const finish = () => {
                if (settled) return;
                settled = true;
                resolve();
              };
              try {
                map.triggerRepaint?.();
                if (map.isStyleLoaded?.()) map.once('idle', finish);
                else finish();
              } catch {
                finish();
              }
              window.setTimeout(finish, 4800);
            });
            try {
              const canvas = map.getCanvas?.();
              if (canvas instanceof HTMLCanvasElement && canvas.width > 4 && canvas.height > 4 && map.isStyleLoaded?.()) {
                const raw = captureCanvasHiRes(canvas, 2);
                const mapLngBounds = siPdfBoundsFromFeatureCollection(report.aoiOutlineGeoJson);
                aoiMapImageDataUrl = await compositeAoiAnalysisMapWithLegendPng(raw, report, mapLngBounds);
              }
            } catch {
              /* ignore */
            }
          }
        }
      }

      let changeSlotMapImageDataUrls: (string | null)[] | null = null;
      if (mode === 'TIME_SERIES_CHANGE_DETECTION') {
        if (
          changeSlotSnapshots.length === report.changeDetectionSlots.length &&
          changeSlotSnapshots.some(Boolean)
        ) {
          changeSlotMapImageDataUrls = changeSlotSnapshots;
        } else if (liveMapCaptureOk) {
          changeSlotMapImageDataUrls = await captureAllChangeSnapshots();
        }
      }

      let interpretationPoints: string[] | null = null;
      const geminiKey = geminiApiKey.trim();
      if (geminiKey && mode === 'AOI_ANALYSIS') {
        try {
          interpretationPoints = await fetchSiAoiReportInterpretationFromGemini({
            apiKey: geminiKey,
            report,
            insights: report.dataInsights,
          });
        } catch {
          interpretationPoints = null;
        }
      }
      if (!interpretationPoints?.length) {
        interpretationPoints = buildFallbackInterpretationPoints(report);
      }

      if (format === 'pdf') {
        exportSiAoiVegetationReportPdf(report, {
          mode,
          chartImageDataUrl,
          aoiMapImageDataUrl,
          changeSlotMapImageDataUrls,
          executiveSummaryAi: geminiSummary?.trim() || undefined,
          interpretationPoints,
        });
      } else {
        await exportSiAoiVegetationReportDocx(report, {
          mode,
          chartImageDataUrl,
          aoiMapImageDataUrl,
          changeSlotMapImageDataUrls,
          executiveSummaryAi: geminiSummary?.trim() || undefined,
        });
      }
    } catch (e) {
      console.error(e);
      setErr(
        'Export failed. Ensure a Mapbox token is set when using the in-modal map fallback, wait for maps to finish loading, then try again (export briefly switches to the tab needed for snapshots).',
      );
    } finally {
      setExportBusy(false);
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
    liveSnapshotCaptureOpts,
  ]);

  if (!open) return null;

  return (
    <div
      className="si-aoi-report-modal-backdrop"
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
              </div>
              {err ? <p className="si-aoi-report-err">{err}</p> : null}
              <div className="si-aoi-report-actions">
                <button type="button" className="si-aoi-report-btn" onClick={onGenerate} disabled={!aoiOptions.length}>
                  Generate report
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

              <SiAoiReportDataInsightsSection
                report={report}
                geminiSummary={geminiSummary}
                geminiLoading={geminiLoading}
                geminiError={geminiErr}
              />

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
                            snapshotLoading={changeSnapshotsLoading}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
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

                  <div className="si-aoi-report-card">
                    <h3>Timeline</h3>
                    <div className="si-aoi-report-chart-wrap" id={chartHostId}>
                      {lineData ? <Line data={lineData} options={lineOptions as any} /> : null}
                    </div>
                  </div>

                  <div className="si-aoi-report-card">
                    <h3>AOI map — live Map Viewer snapshot</h3>
                    {liveMapCaptureOk ? (
                      <div className="si-aoi-report-map-wrap">
                        {analysisSnapshotLoading && !analysisLiveSnapshot ? (
                          <div className="si-aoi-report-change-cell__map-placeholder">Capturing live map…</div>
                        ) : null}
                        {analysisLiveSnapshot ? (
                          <img
                            className="si-aoi-report-analysis-snapshot"
                            src={analysisLiveSnapshot}
                            alt={`AOI map snapshot for ${report.aoiName}`}
                            draggable={false}
                          />
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
                    ) : !mapOk ? (
                      <p className="si-aoi-report-analysis">A Mapbox token is required to display the map.</p>
                    ) : (
                      <div className="si-aoi-report-map-wrap">
                        <MapGL
                          key={`si-aoi-analysis-${report.dateStart}-${report.dateEnd}-${report.indexId}-${report.aoiName}-${report.legendBandCount}`}
                          ref={mapRef}
                          mapboxAccessToken={mapboxToken}
                          mapStyle={reportMapStyle as string | StyleSpecification}
                          initialViewState={{
                            ...mapInitialView,
                            bearing: 0,
                            pitch: 0,
                          }}
                          style={{ width: '100%', height: '100%' }}
                          reuseMaps={false}
                          interactive={false}
                          attributionControl={false}
                          preserveDrawingBuffer
                          onLoad={onAnalysisMapLoad}
                        >
                          {analysisMapReady ? (
                            <>
                              <NavigationControl position="top-right" showCompass={false} />
                              <Source id="si-report-aoi-halo" type="geojson" data={report.aoiOutlineGeoJson}>
                                <Layer
                                  id="si-report-aoi-halo-fill"
                                  type="fill"
                                  paint={{ 'fill-color': '#0f172a', 'fill-opacity': 0 }}
                                />
                              </Source>
                              <Source id="si-report-heatmap-cells" type="geojson" data={report.heatmapCellsGeoJson}>
                                <Layer
                                  id="si-report-heatmap-fill"
                                  type="fill"
                                  paint={{
                                    'fill-color': ['coalesce', ['get', 'fill'], '#22c55e'],
                                    'fill-opacity': ['coalesce', ['get', 'opacity'], 0.42],
                                  }}
                                />
                              </Source>
                              <Source id="si-report-aoi" type="geojson" data={report.aoiOutlineGeoJson}>
                                <Layer
                                  id="si-report-aoi-line"
                                  type="line"
                                  layout={{ 'line-join': 'round', 'line-cap': 'round' }}
                                  paint={{
                                    'line-color': report.classificationPalette.aoiOutline,
                                    'line-width': 2.5,
                                    'line-opacity': 1,
                                  }}
                                />
                              </Source>
                            </>
                          ) : null}
                        </MapGL>
                      </div>
                    )}
                    <div className="si-aoi-report-map-legend">
                      {report.tableRows.map(row => (
                        <span key={row.key}>
                          <span
                            className="si-aoi-report-legend-swatch"
                            style={{
                              background:
                                row.colorHex ??
                                (row.key === 'high'
                                  ? report.classificationPalette.high
                                  : row.key === 'medium'
                                    ? report.classificationPalette.medium
                                    : report.classificationPalette.low),
                            }}
                          />
                          {row.labelEn}
                        </span>
                      ))}
                      <span>
                        <span
                          className="si-aoi-report-legend-swatch"
                          style={{
                            background: report.classificationPalette.aoiOutline,
                            border: '1px solid #334155',
                          }}
                        />
                        AOI outline
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : null}
        </div>

        {report && step === 'preview' && lineData ? (
          <div className="si-aoi-report-chart-export-host" aria-hidden>
            <div id={chartExportHostId} className="si-aoi-report-chart-export-host__inner">
              <Line
                data={lineData}
                options={
                  {
                    ...(lineOptions as Record<string, unknown>),
                    animation: false,
                  } as any
                }
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
                    <li>Scientific analysis and stress notes (vector text)</li>
                    <li>Health classification table with crisp borders</li>
                    <li>Index timeline chart (raster) and AOI map snapshot when captured</li>
                    <li>
                      AOI basemap + classification snapshot; export briefly opens the <strong>AOI analysis</strong> tab so
                      the map canvas is ready
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
                Composing {exportUi.mode === 'AOI_ANALYSIS' ? 'AOI analysis' : 'time series change detection'} layout…
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
