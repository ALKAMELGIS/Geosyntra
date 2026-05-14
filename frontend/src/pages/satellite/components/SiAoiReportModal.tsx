import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MapGL, { Layer, NavigationControl, Source, type MapRef } from 'react-map-gl/mapbox';
import type { StyleSpecification } from 'mapbox-gl';
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
  type SiAoiPdfExportMode,
  type SiAoiReportModel,
} from '../utils/siAoiVegetationReportModel';
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

type SiAoiChangeMapCellProps = {
  slotIdx: number;
  slot: SiAoiChangeDetectionSlot;
  mapboxToken?: string;
  mapStyle: string | StyleSpecification;
  aoiOutline: GeoJSON.FeatureCollection;
  fitBounds: [[number, number], [number, number]];
  indexId: StaticAoiChartLayerId;
};

function SiAoiChangeMapCell({
  slotIdx,
  slot,
  mapboxToken,
  mapStyle,
  aoiOutline,
  fitBounds,
  indexId,
}: SiAoiChangeMapCellProps) {
  const innerRef = useRef<MapRef | null>(null);

  useEffect(() => {
    const runFit = () => {
      const map = innerRef.current?.getMap?.();
      if (!map) return;
      try {
        map.fitBounds(fitBounds, { padding: 8, duration: 0, maxZoom: 15 });
      } catch {
        /* ignore */
      }
    };
    const t = window.setTimeout(() => {
      const map = innerRef.current?.getMap?.();
      if (map?.isStyleLoaded?.()) runFit();
      else map?.once('load', runFit);
    }, 60);
    return () => window.clearTimeout(t);
  }, [fitBounds, slot.date, slotIdx]);

  const cx = (fitBounds[0][0] + fitBounds[1][0]) / 2;
  const cy = (fitBounds[0][1] + fitBounds[1][1]) / 2;
  const meanStr = indexId === 'LST' ? slot.stats.indexMean.toFixed(1) : slot.stats.indexMean.toFixed(3);

  return (
    <div className="si-aoi-report-change-cell">
      <div className="si-aoi-report-change-cell__banner">{slot.date}</div>
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
        >
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
              paint={{ 'line-color': '#38bdf8', 'line-width': 2.5, 'line-opacity': 1 }}
            />
          </Source>
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
}: SiAoiReportModalProps) {
  const [step, setStep] = useState<'configure' | 'preview'>('configure');
  const [reportView, setReportView] = useState<'analysis' | 'change'>('analysis');
  const [indexId, setIndexId] = useState<StaticAoiChartLayerId>(defaultIndexId);
  const [dateStart, setDateStart] = useState(timeSeriesStart);
  const [dateEnd, setDateEnd] = useState(timeSeriesEnd);
  const [selectedAoiId, setSelectedAoiId] = useState('');
  const [report, setReport] = useState<SiAoiReportModel | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportUi, setExportUi] = useState<{
    phase: 'idle' | 'preview' | 'busy';
    mode?: SiAoiPdfExportMode;
  }>({ phase: 'idle' });
  const mapRef = useRef<MapRef | null>(null);
  const chartHostId = 'si-aoi-report-chart-host';
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
  }, [open, timeSeriesStart, timeSeriesEnd, defaultIndexId, preferredAoiId, aoiOptions]);

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
    });
    if (!built) {
      setErr('AOI geometry must be a Polygon or MultiPolygon.');
      return;
    }
    setReport(built);
    setReportView('analysis');
    setStep('preview');
  }, [weeklyComposites, indexId, dateStart, dateEnd, selectedFeature, selectedName]);

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
    if (!open || !report || !mapRef.current || reportView !== 'analysis') return;
    const t = window.setTimeout(() => {
      const map = mapRef.current?.getMap?.();
      const f = report.aoiOutlineGeoJson.features[0];
      const b = f ? siAoiReportFeatureBBoxLngLat(f) : null;
      if (map && b) {
        map.fitBounds(
          [
            [b[0], b[1]],
            [b[2], b[3]],
          ],
          { padding: 36, duration: 500, maxZoom: 14 },
        );
      }
    }, 80);
    return () => window.clearTimeout(t);
  }, [open, report, reportView]);

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
      plugins: {
        legend: { labels: { color: '#cbd5e1' } },
        title: {
          display: true,
          text: `${report?.indexLabel ?? ''} — ${report?.dateStart ?? ''} … ${report?.dateEnd ?? ''}`,
          color: '#e2e8f0',
          font: { size: 12 },
        },
      },
      scales: {
        x: { ticks: { color: '#94a3b8', maxRotation: 45 }, grid: { color: 'rgba(148,163,184,0.12)' } },
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
    await new Promise<void>(r => requestAnimationFrame(() => r()));
    await new Promise<void>(r => setTimeout(r, 80));
    try {
      let chartImageDataUrl: string | null = null;
      const chartEl = document.querySelector(`#${chartHostId} canvas`);
      if (chartEl instanceof HTMLCanvasElement) {
        chartImageDataUrl = captureCanvasHiRes(chartEl, 2);
      }

      let aoiMapImageDataUrl: string | null = null;
      if (mode === 'AOI_ANALYSIS' && mapOk) {
        const map = mapRef.current?.getMap?.();
        if (map) {
          await new Promise<void>(resolve => {
            let settled = false;
            const finish = () => {
              if (settled) return;
              settled = true;
              resolve();
            };
            try {
              map.once('idle', finish);
            } catch {
              finish();
            }
            window.setTimeout(finish, 2200);
          });
          try {
            const canvas = map.getCanvas?.();
            if (canvas instanceof HTMLCanvasElement) {
              aoiMapImageDataUrl = captureCanvasHiRes(canvas, 2);
            }
          } catch {
            /* ignore */
          }
        }
      }

      exportSiAoiVegetationReportPdf(report, {
        mode,
        chartImageDataUrl,
        aoiMapImageDataUrl,
      });
    } catch (e) {
      console.error(e);
      setErr('PDF export failed. If the AOI map is missing, open the “AOI analysis” tab and try again.');
    } finally {
      setExportBusy(false);
      setExportUi({ phase: 'idle' });
    }
  }, [report, exportUi.mode, mapOk, chartHostId]);

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
              Choose index, date range, and AOI. The report includes an English summary, health table, timeline chart,
              the same basemap as the main map with a transparent pixel-style classification overlay, and a 3×4 change
              map grid. PDF export is English-only and adds a second page for the time-series layout.
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
                          key={`${slot.date}-${idx}`}
                          slotIdx={idx}
                          slot={slot}
                          mapboxToken={mapboxToken}
                          mapStyle={reportMapStyle}
                          aoiOutline={report.aoiOutlineGeoJson}
                          fitBounds={changeFitBounds}
                          indexId={report.indexId}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="si-aoi-report-card">
                    <h3>Executive summary</h3>
                    <ul className="si-aoi-report-summary">
                      {report.summaryLinesEn.map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  </div>

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
                        >
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
                              paint={{ 'line-color': '#38bdf8', 'line-width': 2.5, 'line-opacity': 1 }}
                            />
                          </Source>
                        </MapGL>
                      </div>
                    )}
                    <div className="si-aoi-report-map-legend">
                      <span>
                        <span className="si-aoi-report-legend-swatch" style={{ background: '#22c55e' }} />
                        High vegetation health
                      </span>
                      <span>
                        <span className="si-aoi-report-legend-swatch" style={{ background: '#eab308' }} />
                        Medium vegetation health
                      </span>
                      <span>
                        <span className="si-aoi-report-legend-swatch" style={{ background: '#ef4444' }} />
                        Low / degraded
                      </span>
                      <span>
                        <span
                          className="si-aoi-report-legend-swatch"
                          style={{ background: '#38bdf8', border: '1px solid #334155' }}
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
                    <li>Executive summary, scientific analysis, and stress notes (vector text)</li>
                    <li>Health classification table with crisp borders</li>
                    <li>Index timeline chart (high-DPI raster from the chart canvas)</li>
                    <li>
                      AOI basemap + classification snapshot when the <strong>AOI analysis</strong> tab is active
                      (switch tabs before generating if the map is hidden)
                    </li>
                  </>
                ) : (
                  <>
                    <li>Cover band with AOI, index, and period metadata</li>
                    <li>All twelve timestamps with per-date statistics (vector text)</li>
                    <li>Optimized for print — no mixed AOI / timeline map on this export</li>
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
