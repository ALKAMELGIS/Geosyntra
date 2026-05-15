import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from 'react';
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
  buildSiAoiVegetationReport,
  exportSiAoiVegetationReportPdf,
  siAoiReportFeatureBBoxLngLat,
  type SiAoiChangeDetectionSlot,
  type SiAoiClassificationPalette,
  type SiAoiLegendBandCount,
  type SiAoiPdfExportMode,
  type SiAoiReportModel,
} from '../utils/siAoiVegetationReportModel';
import { fetchSiAoiReportExecutiveSummaryFromGemini } from '../utils/siAoiReportGemini';
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

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('map snapshot image decode failed'));
    img.src = src;
  });
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
  try {
    const img = await loadImageElement(mapPngDataUrl);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return mapPngDataUrl;
    const strip = Math.round(Math.min(88, Math.max(42, w * 0.09)));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h + strip;
    const ctx = c.getContext('2d');
    if (!ctx) return mapPngDataUrl;
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, w, h + strip);
    ctx.drawImage(img, 0, 0);
    drawNorthArrowAndScaleOnMapCanvas(ctx, w, h, mapLngLatBounds);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
    ctx.fillRect(0, h, w, strip);

    type Item = { label: string; color: string };
    const items: Item[] = report.tableRows.map(r => ({
      label: r.labelEn,
      color: colorForReportTableRow(r, report.classificationPalette),
    }));
    items.push({ label: 'AOI outline', color: report.classificationPalette.aoiOutline });

    const pad = Math.round(strip * 0.22);
    const sw = Math.round(strip * 0.36);
    let fontPx = Math.round(Math.max(10, Math.min(17, strip * 0.3)));
    const gapAfterSw = 6;
    const gapBetween = 12;
    for (let attempt = 0; attempt < 10; attempt++) {
      ctx.font = `500 ${fontPx}px system-ui, "Segoe UI", sans-serif`;
      let tw = pad * 2 + items.length * sw + items.length * gapAfterSw;
      for (const it of items) tw += ctx.measureText(it.label).width + gapBetween;
      if (tw <= w || fontPx <= 9) break;
      fontPx -= 1;
    }
    ctx.textBaseline = 'middle';
    let x = pad;
    const cy = h + strip / 2;
    for (const it of items) {
      ctx.fillStyle = it.color;
      ctx.fillRect(x, cy - sw / 2, sw, sw);
      x += sw + gapAfterSw;
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(it.label, x, cy);
      x += ctx.measureText(it.label).width + gapBetween;
      if (x > w - pad) break;
    }
    return c.toDataURL('image/png');
  } catch {
    return mapPngDataUrl;
  }
}

/** Embeds the floating H/M/L + index legend (HTML in preview) into the map snapshot for PDF. */
async function compositeChangeCellLegendPng(
  mapPngDataUrl: string,
  palette: SiAoiClassificationPalette,
  indexId: StaticAoiChartLayerId,
  mapLngLatBounds: SiPdfLngLatBounds | null,
): Promise<string> {
  try {
    const img = await loadImageElement(mapPngDataUrl);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return mapPngDataUrl;
    const pad = Math.round(Math.max(6, w * 0.014));
    const cardW = Math.round(Math.min(w * 0.4, Math.max(104, w * 0.28)));
    const cardH = Math.round(Math.min(h * 0.4, Math.max(76, h * 0.26)));
    const x0 = w - cardW - pad;
    const y0 = h - cardH - pad;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return mapPngDataUrl;
    ctx.drawImage(img, 0, 0);
    drawNorthArrowAndScaleOnMapCanvas(ctx, w, h, mapLngLatBounds);
    ctx.save();
    ctx.fillStyle = 'rgba(2, 6, 23, 0.82)';
    fillRoundRect(ctx, x0, y0, cardW, cardH, 10);
    const inset = Math.round(cardW * 0.1);
    let y = y0 + inset + 2;
    const rowH = (cardH - inset * 2 - 4) / 4;
    const fontLabel = Math.max(11, Math.round(rowH * 0.62));
    const fontIdx = Math.max(10, Math.round(rowH * 0.52));
    const sw = Math.round(rowH * 0.55);
    const rows: [string, string][] = [
      ['H', palette.high],
      ['M', palette.medium],
      ['L', palette.low],
    ];
    ctx.textBaseline = 'middle';
    for (const [lab, col] of rows) {
      ctx.fillStyle = col;
      ctx.fillRect(x0 + inset, y - sw / 2, sw, sw);
      ctx.fillStyle = '#f8fafc';
      ctx.font = `600 ${fontLabel}px system-ui, "Segoe UI", sans-serif`;
      ctx.fillText(lab, x0 + inset + sw + 8, y);
      y += rowH;
    }
    ctx.fillStyle = 'rgba(248, 250, 252, 0.92)';
    ctx.font = `500 ${fontIdx}px system-ui, "Segoe UI", sans-serif`;
    ctx.fillText(String(indexId), x0 + inset, y0 + cardH - inset - 2);
    ctx.restore();
    return c.toDataURL('image/png');
  } catch {
    return mapPngDataUrl;
  }
}

export type SiAoiChangeMapCellHandle = {
  /** WebGL-safe capture after idle + legend composited to match on-screen preview. */
  captureMapPngForExport: (scale?: number) => Promise<string | null>;
};

type SiAoiChangeMapCellProps = {
  slotIdx: number;
  slot: SiAoiChangeDetectionSlot;
  mapboxToken?: string;
  mapStyle: string | StyleSpecification;
  aoiOutline: GeoJSON.FeatureCollection;
  fitBounds: [[number, number], [number, number]];
  indexId: StaticAoiChartLayerId;
  classificationPalette: SiAoiClassificationPalette;
};

const SiAoiChangeMapCell = forwardRef<SiAoiChangeMapCellHandle, SiAoiChangeMapCellProps>(function SiAoiChangeMapCell(
  { slotIdx, slot, mapboxToken, mapStyle, aoiOutline, fitBounds, indexId, classificationPalette },
  ref,
) {
  const innerRef = useRef<MapRef | null>(null);
  const [mapLayersReady, setMapLayersReady] = useState(false);

  useImperativeHandle(
    ref,
    () => ({
      async captureMapPngForExport(scale = 2) {
        const map = innerRef.current?.getMap?.();
        if (!map || !map.isStyleLoaded?.()) return null;
        try {
          map.triggerRepaint?.();
          await new Promise<void>(resolve => {
            let done = false;
            const fin = () => {
              if (done) return;
              done = true;
              resolve();
            };
            try {
              map.once('idle', fin);
            } catch {
              fin();
            }
            window.setTimeout(fin, 4200);
          });
          await new Promise<void>(r => requestAnimationFrame(() => r()));
          const canvas = map.getCanvas?.();
          if (canvas instanceof HTMLCanvasElement && canvas.width > 2 && canvas.height > 2) {
            const raw = captureCanvasHiRes(canvas, scale);
            return await compositeChangeCellLegendPng(
              raw,
              classificationPalette,
              indexId,
              siPdfBoundsFromFitBounds(fitBounds),
            );
          }
        } catch {
          /* ignore */
        }
        return null;
      },
    }),
    [classificationPalette, indexId, fitBounds],
  );

  useEffect(() => {
    setMapLayersReady(false);
  }, [slot.date, slotIdx, mapStyle]);

  useEffect(() => {
    const runFit = () => {
      const map = innerRef.current?.getMap?.();
      if (!map || !map.isStyleLoaded?.()) return;
      try {
        map.fitBounds(fitBounds, { padding: 8, duration: 0, maxZoom: 15 });
      } catch {
        /* ignore */
      }
    };
    const t = window.setTimeout(() => {
      const map = innerRef.current?.getMap?.();
      if (!map) return;
      if (map.isStyleLoaded?.()) runFit();
      else map.once('style.load', runFit);
    }, 60);
    return () => window.clearTimeout(t);
  }, [fitBounds, slot.date, slotIdx, mapLayersReady]);

  const onInnerMapLoad = useCallback(() => {
    const map = innerRef.current?.getMap?.();
    if (!map) return;
    const arm = () => setMapLayersReady(true);
    if (map.isStyleLoaded?.()) arm();
    else map.once('style.load', arm);
  }, []);

  const cx = (fitBounds[0][0] + fitBounds[1][0]) / 2;
  const cy = (fitBounds[0][1] + fitBounds[1][1]) / 2;
  const meanStr = indexId === 'LST' ? slot.stats.indexMean.toFixed(1) : slot.stats.indexMean.toFixed(3);

  return (
    <div className="si-aoi-report-change-cell">
      <div className="si-aoi-report-change-cell__banner">{slot.date}</div>
      <div className="si-aoi-report-change-cell__legend" aria-hidden>
        <div className="si-aoi-report-change-cell__legend-row">
          <span className="si-aoi-report-change-cell__legend-swatch" style={{ background: classificationPalette.high }} />
          H
        </div>
        <div className="si-aoi-report-change-cell__legend-row">
          <span className="si-aoi-report-change-cell__legend-swatch" style={{ background: classificationPalette.medium }} />
          M
        </div>
        <div className="si-aoi-report-change-cell__legend-row">
          <span className="si-aoi-report-change-cell__legend-swatch" style={{ background: classificationPalette.low }} />
          L
        </div>
        <div className="si-aoi-report-change-cell__legend-row" style={{ marginTop: 3, opacity: 0.92 }}>
          {indexId}
        </div>
      </div>
      <div className="si-aoi-report-change-cell__map">
        <MapGL
          ref={innerRef}
          mapboxAccessToken={mapboxToken}
          mapStyle={mapStyle as string | StyleSpecification}
          initialViewState={{ longitude: cx, latitude: cy, zoom: 11, bearing: 0, pitch: 0 }}
          style={{ width: '100%', height: '100%' }}
          reuseMaps
          interactive={false}
          attributionControl={false}
          preserveDrawingBuffer
          onLoad={onInnerMapLoad}
        >
          {mapLayersReady ? (
            <>
              <Source id={`si-cd-aoi-base-${slotIdx}`} type="geojson" data={aoiOutline}>
                <Layer
                  id={`si-cd-aoi-base-fill-${slotIdx}`}
                  type="fill"
                  paint={{ 'fill-color': '#020617', 'fill-opacity': 0.08 }}
                />
              </Source>
              <Source id={`si-cd-hm-${slotIdx}`} type="geojson" data={slot.heatmapCellsGeoJson}>
                <Layer
                  id={`si-cd-hm-fill-${slotIdx}`}
                  type="fill"
                  paint={{
                    'fill-color': ['coalesce', ['get', 'fill'], '#22c55e'],
                    'fill-opacity': ['coalesce', ['get', 'opacity'], 0.44],
                  }}
                />
              </Source>
              <Source id={`si-cd-aoi-line-${slotIdx}`} type="geojson" data={aoiOutline}>
                <Layer
                  id={`si-cd-aoi-line-layer-${slotIdx}`}
                  type="line"
                  layout={{ 'line-join': 'round', 'line-cap': 'round' }}
                  paint={{
                    'line-color': classificationPalette.aoiOutline,
                    'line-width': 2.5,
                    'line-opacity': 1,
                  }}
                />
              </Source>
            </>
          ) : null}
        </MapGL>
      </div>
      <div className="si-aoi-report-change-cell__stats" dir="ltr">
        <span className="si-aoi-report-change-cell__stats-mean">μ {meanStr}</span>
        <span className="si-aoi-report-change-cell__stats-hml">
          H {slot.stats.highPct.toFixed(0)}% · M {slot.stats.medPct.toFixed(0)}% · L {slot.stats.lowPct.toFixed(0)}%
        </span>
        <span className="si-aoi-report-change-cell__stats-px">{slot.stats.pixelCount} px</span>
      </div>
      <div className="si-aoi-report-change-cell__hint">
        {slot.dataSource === 'stac-scene'
          ? 'STAC-backed scene + index heatmap (clipped to AOI).'
          : 'Basemap + per-date index heatmap (AOI-clipped). Attach STAC for true scenes.'}
      </div>
    </div>
  );
});

SiAoiChangeMapCell.displayName = 'SiAoiChangeMapCell';

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
  }>({ phase: 'idle' });
  const mapRef = useRef<MapRef | null>(null);
  const lastBuildInputRef = useRef<Omit<Parameters<typeof buildSiAoiVegetationReport>[0], 'legendBandCount'> | null>(
    null,
  );
  const chartHostId = 'si-aoi-report-chart-host';
  const chartExportHostId = 'si-aoi-report-chart-host-export';
  const changeCellCaptureRefs = useRef<(SiAoiChangeMapCellHandle | null)[]>([]);
  const mapOk = Boolean(mapboxToken?.trim());

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
  ]);

  const applyLegendBandCount = useCallback((next: SiAoiLegendBandCount) => {
    const snap = lastBuildInputRef.current;
    if (!snap) return;
    setLegendBandCount(next);
    setAnalysisMapReady(false);
    const built = buildSiAoiVegetationReport({ ...snap, legendBandCount: next });
    if (built) setReport(built);
  }, []);

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
    setExportUi({ phase: 'preview', mode });
  }, [report, reportView]);

  const cancelExportPreview = useCallback(() => {
    setExportUi({ phase: 'idle' });
  }, []);

  const confirmExportPdf = useCallback(async () => {
    if (!report || !exportUi.mode) return;
    const mode = exportUi.mode;
    setExportUi({ phase: 'busy', mode });
    setExportBusy(true);
    const sleep = (ms: number) => new Promise<void>(r => window.setTimeout(r, ms));

    await new Promise<void>(r => requestAnimationFrame(() => r()));
    await sleep(80);

    try {
      if (mapOk) {
        if (mode === 'AOI_ANALYSIS') {
          setReportView('analysis');
          await sleep(550);
          for (let i = 0; i < 50; i++) {
            await sleep(100);
            const m = mapRef.current?.getMap?.();
            if (m?.isStyleLoaded?.()) break;
          }
        } else {
          setReportView('change');
          await sleep(900);
          for (let i = 0; i < 55; i++) {
            await sleep(140);
            const n = report.changeDetectionSlots.length;
            const filled = changeCellCaptureRefs.current.slice(0, n).filter(Boolean).length;
            if (filled >= Math.min(12, n) && i > 12) break;
          }
          await sleep(350);
        }
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
      if (mapOk && mode === 'AOI_ANALYSIS') {
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

      let changeSlotMapImageDataUrls: (string | null)[] | null = null;
      if (mapOk && mode === 'TIME_SERIES_CHANGE_DETECTION') {
        const urls: (string | null)[] = [];
        for (let i = 0; i < report.changeDetectionSlots.length; i++) {
          await sleep(35);
          urls.push((await changeCellCaptureRefs.current[i]?.captureMapPngForExport(2)) ?? null);
        }
        changeSlotMapImageDataUrls = urls;
      }

      exportSiAoiVegetationReportPdf(report, {
        mode,
        chartImageDataUrl,
        aoiMapImageDataUrl,
        changeSlotMapImageDataUrls,
        executiveSummaryAi: geminiSummary?.trim() || undefined,
      });
    } catch (e) {
      console.error(e);
      setErr(
        'PDF export failed. Ensure a Mapbox token is set, wait for maps to finish loading, then try again (export briefly switches to the tab needed for snapshots).',
      );
    } finally {
      setExportBusy(false);
      setExportUi({ phase: 'idle' });
    }
  }, [report, exportUi.mode, mapOk, chartHostId, chartExportHostId, geminiSummary]);

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
                <div className="si-aoi-report-card">
                  <h3>Time series change detection map</h3>
                  <p className="si-aoi-report-analysis">
                    Twelve tiles (3×4): each week gets its own AOI-clipped pixel classification heatmap and
                    statistics, driven by the selected index timeline. Basemap matches the main Satellite view;
                    connect STAC to swap the basemap layer for true acquisition-date imagery per cell.
                  </p>
                  {!mapOk || !changeFitBounds ? (
                    <p className="si-aoi-report-analysis">A Mapbox token is required to render the map grid.</p>
                  ) : (
                    <div className="si-aoi-report-change-grid">
                      {report.changeDetectionSlots.map((slot, idx) => (
                        <SiAoiChangeMapCell
                          ref={el => {
                            changeCellCaptureRefs.current[idx] = el;
                          }}
                          key={`${slot.date}-${idx}`}
                          slotIdx={idx}
                          slot={slot}
                          mapboxToken={mapboxToken}
                          mapStyle={reportMapStyle}
                          aoiOutline={report.aoiOutlineGeoJson}
                          fitBounds={changeFitBounds}
                          indexId={report.indexId}
                          classificationPalette={report.classificationPalette}
                        />
                      ))}
                    </div>
                  )}
                </div>
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
                    <div className="si-aoi-report-legend-bands" role="group" aria-label="Legend class count">
                      <span className="si-aoi-report-legend-bands__label">Legend classes</span>
                      <label>
                        <input
                          type="radio"
                          name="si-aoi-legend-bands"
                          checked={legendBandCount === 5}
                          onChange={() => applyLegendBandCount(5)}
                        />
                        5 classes
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="si-aoi-legend-bands"
                          checked={legendBandCount === 10}
                          onChange={() => applyLegendBandCount(10)}
                        />
                        10 classes
                      </label>
                    </div>
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
                                  style={{
                                    background:
                                      row.colorHex ??
                                      (row.key === 'high'
                                        ? report.classificationPalette.high
                                        : row.key === 'medium'
                                          ? report.classificationPalette.medium
                                          : report.classificationPalette.low),
                                  }}
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
                    <h3>AOI map — basemap + classification + AOI + legend</h3>
                    {!mapOk ? (
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
                                  paint={{ 'fill-color': '#0f172a', 'fill-opacity': 0.06 }}
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
                    <strong>AOI analysis</strong> — single-map enterprise PDF
                  </>
                ) : (
                  <>
                    <strong>Time series change detection</strong> — full 3×4 grid PDF
                  </>
                )}
              </p>
              <ul className="si-aoi-report-export-card__list">
                {exportUi.mode === 'AOI_ANALYSIS' ? (
                  <>
                    <li>
                      Data &amp; insights: index statistics, KPIs, vector pie and bar charts, NDVI sparkline, and optional
                      Gemini executive text when a key is configured
                    </li>
                    <li>Scientific analysis and stress notes (vector text)</li>
                    <li>Health classification table with crisp borders</li>
                    <li>Vector index timeline titled with the selected layer (for example, NDVI timeline)</li>
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
                    <li>Vector timeline page plus classification legend aligned with Symbology colours</li>
                    <li>Data &amp; insights appendix (index table, KPIs, pie, bars, sparkline, Gemini text when available)</li>
                    <li>Export briefly opens the <strong>Time series change detection</strong> tab to capture grid maps</li>
                  </>
                )}
              </ul>
              <div className="si-aoi-report-export-card__actions">
                <button type="button" className="si-aoi-report-btn si-aoi-report-btn--ghost" onClick={cancelExportPreview}>
                  Cancel
                </button>
                <button type="button" className="si-aoi-report-btn" onClick={() => void confirmExportPdf()}>
                  Generate PDF
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {exportUi.phase === 'busy' ? (
          <div className="si-aoi-report-export-overlay si-aoi-report-export-overlay--busy" aria-live="polite">
            <div className="si-aoi-report-export-busy">
              <div className="si-aoi-report-export-busy__spinner" aria-hidden />
              <p className="si-aoi-report-export-busy__title">Preparing PDF</p>
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
