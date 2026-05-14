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
  type SiAoiPdfExportMode,
  type SiAoiReportModel,
} from '../utils/siAoiVegetationReportModel';
import { fetchSiAoiReportExecutiveSummaryFromGemini } from '../utils/siAoiReportGemini';
import { SiAoiReportDataInsightsSection } from './SiAoiReportDataInsights';
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

export type SiAoiChangeMapCellHandle = {
  captureMapPngDataUrl: (scale?: number) => string | null;
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
      captureMapPngDataUrl(scale = 2) {
        const map = innerRef.current?.getMap?.();
        if (!map || !map.isStyleLoaded?.()) return null;
        try {
          map.triggerRepaint?.();
          const canvas = map.getCanvas?.();
          if (canvas instanceof HTMLCanvasElement && canvas.width > 2 && canvas.height > 2) {
            return captureCanvasHiRes(canvas, scale);
          }
        } catch {
          /* ignore */
        }
        return null;
      },
    }),
    [],
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
  const [report, setReport] = useState<SiAoiReportModel | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportUi, setExportUi] = useState<{
    phase: 'idle' | 'preview' | 'busy';
    mode?: SiAoiPdfExportMode;
  }>({ phase: 'idle' });
  const mapRef = useRef<MapRef | null>(null);
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

  const selectedFeature = useMemo(
    () => aoiOptions.find(o => o.id === selectedAoiId)?.feature ?? null,
    [aoiOptions, selectedAoiId],
  );

  const selectedName = useMemo(
    () => aoiOptions.find(o => o.id === selectedAoiId)?.name ?? '',
    [aoiOptions, selectedAoiId],
  );

  const onGenerate = useCallback(() => {
    setErr(null);
    const aoiFeature = selectedFeature;
    if (!aoiFeature) {
      setErr('Select an AOI.');
      return;
    }
    const built = buildSiAoiVegetationReport({
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
    });
    if (!built) {
      setErr('AOI geometry must be a Polygon or MultiPolygon.');
      return;
    }
    setReport(built);
    setReportView('analysis');
    setStep('preview');
  }, [weeklyComposites, indexId, dateStart, dateEnd, selectedFeature, selectedName, cloudCoverMaxPct, temporalComposite, classificationPaletteProp]);

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
    if (map.isStyleLoaded?.()) arm();
    else map.once('style.load', arm);
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
              aoiMapImageDataUrl = captureCanvasHiRes(canvas, 2);
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
          urls.push(changeCellCaptureRefs.current[i]?.captureMapPngDataUrl(2) ?? null);
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
                  onClick={() => setStep('configure')}
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
                    <h3>Health and area classification</h3>
                    <div className="si-aoi-report-table-wrap">
                      <table className="si-aoi-report-table">
                        <thead>
                          <tr>
                            <th>Class</th>
                            <th>Area (km²)</th>
                            <th>Share %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.tableRows.map(row => (
                            <tr key={row.key}>
                              <td>{row.labelEn}</td>
                              <td>{row.areaKm2.toFixed(3)}</td>
                              <td>{row.pct.toFixed(1)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="si-aoi-report-card">
                    <h3>Timeline</h3>
                    <div className="si-aoi-report-chart-wrap" id={chartHostId}>
                      {lineData ? <Line data={lineData} options={lineOptions as any} /> : null}
                    </div>
                  </div>

                  <div className="si-aoi-report-card">
                    <h3>AOI map — basemap + classification overlay</h3>
                    {!mapOk ? (
                      <p className="si-aoi-report-analysis">A Mapbox token is required to display the map.</p>
                    ) : (
                      <div className="si-aoi-report-map-wrap">
                        <MapGL
                          key={`si-aoi-analysis-${report.dateStart}-${report.dateEnd}-${report.indexId}-${report.aoiName}`}
                          ref={mapRef}
                          mapboxAccessToken={mapboxToken}
                          mapStyle={reportMapStyle as string | StyleSpecification}
                          initialViewState={{
                            ...mapInitialView,
                            bearing: 0,
                            pitch: 0,
                          }}
                          style={{ width: '100%', height: '100%' }}
                          reuseMaps
                          onLoad={onAnalysisMapLoad}
                        >
                          {analysisMapReady ? (
                            <>
                              <NavigationControl position="top-right" showCompass={false} />
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
                                row.key === 'high'
                                  ? report.classificationPalette.high
                                  : row.key === 'medium'
                                    ? report.classificationPalette.medium
                                    : report.classificationPalette.low,
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
