import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MapGL, { Layer, NavigationControl, Source, type MapRef } from 'react-map-gl/mapbox';
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
}: SiAoiReportModalProps) {
  const [step, setStep] = useState<'configure' | 'preview'>('configure');
  const [indexId, setIndexId] = useState<StaticAoiChartLayerId>(defaultIndexId);
  const [dateStart, setDateStart] = useState(timeSeriesStart);
  const [dateEnd, setDateEnd] = useState(timeSeriesEnd);
  const [selectedAoiId, setSelectedAoiId] = useState('');
  const [report, setReport] = useState<SiAoiReportModel | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const mapRef = useRef<MapRef | null>(null);
  const chartHostId = 'si-aoi-report-chart-host';

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
      setErr('اختر منطقة AOI.');
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
      setErr('الهندسة الحالية يجب أن تكون Polygon أو MultiPolygon.');
      return;
    }
    setReport(built);
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

  useEffect(() => {
    if (!open || !report || !mapRef.current) return;
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
  }, [open, report]);

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
    }),
    [report],
  );

  const onExportPdf = useCallback(() => {
    if (!report) return;
    setExportBusy(true);
    try {
      let dataUrl: string | null = null;
      const el = document.querySelector(`#${chartHostId} canvas`);
      if (el instanceof HTMLCanvasElement) {
        dataUrl = el.toDataURL('image/png');
      }
      exportSiAoiVegetationReportPdf(report, dataUrl);
    } finally {
      setExportBusy(false);
    }
  }, [report]);

  if (!open) return null;

  const mapOk = Boolean(mapboxToken?.trim());

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
              تقرير الغطاء النباتي (AOI)
            </h2>
            <p className="si-aoi-report-modal__sub">
              اختر المؤشر والفترة والـ AOI، ثم راجع الملخص والجداول والمخطط والخريطة. التصدير PDF يتضمن المخطط عند
              توفره؛ طبقات الخريطة توضيحية داخل مربع الإحاطة حتى ربط إحصاء زوني.
            </p>
          </div>
          <button type="button" className="si-aoi-report-modal__close" aria-label="إغلاق" onClick={onClose}>
            <i className="fa-solid fa-xmark" aria-hidden />
          </button>
        </div>

        <div className="si-aoi-report-modal__body">
          {step === 'configure' ? (
            <>
              <div className="si-aoi-report-form">
                <label>
                  المؤشر (Index)
                  <select value={indexId} onChange={e => setIndexId(e.target.value as StaticAoiChartLayerId)}>
                    {STATIC_AOI_CHART_LAYER_OPTIONS.map(o => (
                      <option key={o.id} value={o.id}>
                        {o.label} — {o.subtitle}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  تاريخ البداية
                  <input type="date" value={dateStart.slice(0, 10)} onChange={e => setDateStart(e.target.value)} />
                </label>
                <label>
                  تاريخ النهاية
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
                  توليد التقرير
                </button>
                <button type="button" className="si-aoi-report-btn si-aoi-report-btn--ghost" onClick={onClose}>
                  إلغاء
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
                  العودة للإعداد
                </button>
                <button type="button" className="si-aoi-report-btn" onClick={onExportPdf} disabled={exportBusy}>
                  تصدير PDF
                </button>
                <button type="button" className="si-aoi-report-btn si-aoi-report-btn--ghost" onClick={onClose}>
                  إغلاق
                </button>
              </div>

              <div className="si-aoi-report-card">
                <h3>ملخص وتفسير</h3>
                <ul className="si-aoi-report-summary" dir="rtl">
                  {report.summaryLinesAr.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </div>

              <div className="si-aoi-report-card">
                <h3>تحليل علمي</h3>
                <p className="si-aoi-report-analysis" dir="rtl">
                  {report.analysisAr}
                </p>
                {report.stressNoteAr ? (
                  <div className="si-aoi-report-stress" dir="rtl">
                    {report.stressNoteAr}
                  </div>
                ) : null}
              </div>

              <div className="si-aoi-report-card">
                <h3>تصنيف الصحة والمساحة</h3>
                <div className="si-aoi-report-table-wrap">
                  <table className="si-aoi-report-table">
                    <thead>
                      <tr>
                        <th>الفئة</th>
                        <th>المساحة (كم²)</th>
                        <th>النسبة %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.tableRows.map(row => (
                        <tr key={row.key}>
                          <td dir="rtl">{row.labelAr}</td>
                          <td>{row.areaKm2.toFixed(3)}</td>
                          <td>{row.pct.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="si-aoi-report-card">
                <h3>المخطط الزمني</h3>
                <div className="si-aoi-report-chart-wrap" id={chartHostId}>
                  {lineData ? <Line data={lineData} options={lineOptions as any} /> : null}
                </div>
              </div>

              <div className="si-aoi-report-card">
                <h3>خريطة فئات داخل الـ AOI</h3>
                {!mapOk ? (
                  <p className="si-aoi-report-analysis">يتطلب رمز Mapbox لعرض الخريطة.</p>
                ) : (
                  <div className="si-aoi-report-map-wrap">
                    <MapGL
                      ref={mapRef}
                      mapboxAccessToken={mapboxToken}
                      mapStyle="mapbox://styles/mapbox/dark-v11"
                      initialViewState={{
                        ...mapInitialView,
                        bearing: 0,
                        pitch: 0,
                      }}
                      style={{ width: '100%', height: '100%' }}
                      reuseMaps
                    >
                      <NavigationControl position="top-right" showCompass={false} />
                      <Source id="si-report-zones" type="geojson" data={report.mapZonesGeoJson}>
                        <Layer
                          id="si-report-zones-fill"
                          type="fill"
                          paint={{
                            'fill-color': ['coalesce', ['get', 'fill'], '#15803d'],
                            'fill-opacity': 0.42,
                          }}
                        />
                      </Source>
                      <Source id="si-report-aoi" type="geojson" data={report.aoiOutlineGeoJson}>
                        <Layer
                          id="si-report-aoi-line"
                          type="line"
                          paint={{ 'line-color': '#38bdf8', 'line-width': 2 }}
                        />
                      </Source>
                    </MapGL>
                  </div>
                )}
                <div className="si-aoi-report-map-legend">
                  <span>
                    <span className="si-aoi-report-legend-swatch" style={{ background: '#15803d' }} />
                    High vegetation health
                  </span>
                  <span>
                    <span className="si-aoi-report-legend-swatch" style={{ background: '#ca8a04' }} />
                    Medium vegetation health
                  </span>
                  <span>
                    <span className="si-aoi-report-legend-swatch" style={{ background: '#991b1b' }} />
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
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
