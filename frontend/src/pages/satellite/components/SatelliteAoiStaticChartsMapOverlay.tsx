import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AoiStaticMultiLayerLineChart,
  type AoiStaticExportLngLat,
  type AoiStaticMultiLayerLineChartDataset,
} from './AoiStaticMultiLayerLineChart';
import { StaticAoiComparisonLayerToolbar } from './StaticAoiComparisonLayerToolbar';
import {
  AoiSpectralProfileMiniChart,
  type SiAoiSpectralProfileMini,
} from './AoiSpectralProfileMiniChart';
import type { StaticAoiChartLayerId, WeeklyCompositeLite } from '../utils/staticAoiMultiChartData';
import type { SiAoiRasterPixelSample } from '../utils/siAoiZonalStats';
import type { SiGeoAiIndexAnalyticalExportContext } from '../utils/siGeoAiIndexAnalyticalExport';
import { clampMapCanvasPanelTranslate, siMapLeftPopoutFixedPosition } from '../utils/siMapFloatingPanelLayout';
import './satelliteMapAnalysisChrome.css';

function sparkPathForOverlay(values: readonly (number | null)[], w: number, h: number): string {
  const finite = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (!finite.length) return '';
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const span = max - min || 1;
  const pts = finite.map((v, i) => {
    const x = finite.length <= 1 ? w / 2 : (i / (finite.length - 1)) * w;
    const y = h - ((v - min) / span) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `M ${pts.join(' L ')}`;
}

export type SatelliteAoiStaticChartsMapOverlayProps = {
  open: boolean;
  onClose: () => void;
  indexLabel: string;
  staticComparisonLayers: StaticAoiChartLayerId[];
  onStaticComparisonLayerToggle: (id: StaticAoiChartLayerId) => void;
  staticMultiLineLabels: string[];
  staticMultiLineDatasets: AoiStaticMultiLayerLineChartDataset[];
  staticMultiLineHasLst: boolean;
  staticChartExportLngLatPerRow?: AoiStaticExportLngLat[];
  geoAiIndexAnalyticalExportContext?: SiGeoAiIndexAnalyticalExportContext | null;
  scatterAoiFeature?: GeoJSON.Feature | null;
  scatterAoiKey?: string | null;
  scatterWeekly?: WeeklyCompositeLite[];
  scatterWeekIndex?: number;
  scatterRasterSample?: SiAoiRasterPixelSample | null;
  rasterDataLoading?: boolean;
  hasRealRasterData?: boolean;
  /** Timeline weekly means shown while MPC raster sampling is pending or offline. */
  timelineUsesPreviewMeans?: boolean;
  weeklyMeans: (number | null)[];
  /** Drawn AOI + sketch fields + saved polygons — primary bar source (no pivot fallback). */
  fieldComparisonBars?: Array<{ name: string; value: number }>;
  fieldComparisonSubtitle?: string;
  /** Pixel-ordered samples when MPC grid exists; else six optical indices for the map week. */
  spectralProfile?: SiAoiSpectralProfileMini | null;
  onRequestGenerateReport?: () => void;
};

/** Floating “AOI static charts” panel on the map (layer chips, multi-line chart, spark / bar / pie). */
export function SatelliteAoiStaticChartsMapOverlay({
  open,
  onClose,
  indexLabel,
  staticComparisonLayers,
  onStaticComparisonLayerToggle,
  staticMultiLineLabels,
  staticMultiLineDatasets,
  staticMultiLineHasLst,
  staticChartExportLngLatPerRow,
  geoAiIndexAnalyticalExportContext = null,
  scatterAoiFeature = null,
  scatterAoiKey = null,
  scatterWeekly = [],
  scatterWeekIndex = 0,
  scatterRasterSample = null,
  rasterDataLoading = false,
  hasRealRasterData = true,
  timelineUsesPreviewMeans = false,
  weeklyMeans,
  fieldComparisonBars,
  fieldComparisonSubtitle = '',
  spectralProfile = null,
  onRequestGenerateReport,
}: SatelliteAoiStaticChartsMapOverlayProps) {
  const barRows = fieldComparisonBars ?? [];
  const maxBar = barRows.length ? Math.max(...barRows.map(p => Math.abs(p.value)), 1e-9) : 1;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragOffsetRef = useRef(dragOffset);
  dragOffsetRef.current = dragOffset;
  const [isDragging, setIsDragging] = useState(false);
  const dragSession = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const winListenersRef = useRef<{ move: (e: PointerEvent) => void; up: (e: PointerEvent) => void } | null>(null);

  /** Pop from the leading (left) edge of the map canvas — independent of Route Map / Legend slots. */
  const placeInitialChartsPanel = useCallback(() => {
    const el = panelRef.current;
    const mapEl = document.querySelector('.si-map-container');
    if (!el || !(mapEl instanceof HTMLElement)) return;
    const h = el.offsetHeight || Math.min(480, mapEl.clientHeight - 28);
    const fixed = siMapLeftPopoutFixedPosition('aoi-timeline', h);
    const relTop = fixed.top - mapEl.getBoundingClientRect().top;
    el.style.top = `${Math.max(14, relTop)}px`;
    el.style.left = '14px';
    el.style.right = 'auto';
    el.style.bottom = 'auto';
  }, []);

  const removeWindowDragListeners = useCallback(() => {
    const h = winListenersRef.current;
    if (!h) return;
    window.removeEventListener('pointermove', h.move);
    window.removeEventListener('pointerup', h.up);
    window.removeEventListener('pointercancel', h.up);
    winListenersRef.current = null;
  }, []);

  useEffect(() => {
    if (open) {
      setDragOffset({ x: 0, y: 0 });
    } else {
      removeWindowDragListeners();
      dragSession.current = null;
      setIsDragging(false);
    }
  }, [open, removeWindowDragListeners]);

  useLayoutEffect(() => {
    if (!open) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => placeInitialChartsPanel());
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [open, placeInitialChartsPanel]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => {
      if (isDragging) return;
      placeInitialChartsPanel();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open, isDragging, placeInitialChartsPanel]);

  useEffect(() => () => removeWindowDragListeners(), [removeWindowDragListeners]);

  const sparkD = useMemo(
    () => sparkPathForOverlay(weeklyMeans.length ? weeklyMeans : [0], 120, 40),
    [weeklyMeans],
  );

  const onChartsHeadPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const t = e.target as HTMLElement;
      if (t.closest('.si-map-analysis-charts-close')) return;
      const el = panelRef.current;
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      removeWindowDragListeners();
      const pid = e.pointerId;
      const o = dragOffsetRef.current;
      dragSession.current = {
        pointerId: pid,
        startClientX: e.clientX,
        startClientY: e.clientY,
        originX: o.x,
        originY: o.y,
      };

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pid) return;
        ev.preventDefault();
        const s = dragSession.current;
        if (!s) return;
        const panel = panelRef.current;
        if (!panel) return;
        const nx = s.originX + (ev.clientX - s.startClientX);
        const ny = s.originY + (ev.clientY - s.startClientY);
        setDragOffset(clampMapCanvasPanelTranslate(panel, nx, ny));
      };

      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pid) return;
        dragSession.current = null;
        setIsDragging(false);
        removeWindowDragListeners();
      };

      winListenersRef.current = { move: onMove, up: onUp };
      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      setIsDragging(true);
    },
    [removeWindowDragListeners],
  );

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className={`si-map-analysis-charts si-map-analysis-charts--map-canvas${isDragging ? ' si-map-analysis-charts--dragging' : ''}${
        dragOffset.x !== 0 || dragOffset.y !== 0 ? ' si-map-analysis-charts--dragged' : ''
      }`}
      role="dialog"
      aria-modal="false"
      aria-label="AOI timeline analysis"
      style={{ transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` }}
    >
      <div
        className="si-map-analysis-charts-head"
        onPointerDown={onChartsHeadPointerDown}
      >
        <div className="si-map-analysis-charts-head-text">
          <div className="si-map-analysis-charts-title">AOI timeline analysis</div>
          <div className="si-map-analysis-charts-subtitle">
            {indexLabel}
            {weeklyMeans.length ? ` · ${weeklyMeans.length} week(s)` : ''} · after Generate timeline
            {rasterDataLoading
              ? ' · sampling weekly pixels…'
              : !hasRealRasterData
                ? ' · awaiting live raster samples'
                : ' · live pixel means per index'}
          </div>
        </div>
        <button
          type="button"
          className="si-map-analysis-charts-close"
          aria-label="Close AOI charts"
          title="Close"
          onClick={onClose}
        >
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </div>

      <div className="si-map-analysis-charts-multiline">
        <StaticAoiComparisonLayerToolbar
          staticComparisonLayers={staticComparisonLayers}
          onStaticComparisonLayerToggle={onStaticComparisonLayerToggle}
        />
        <AoiStaticMultiLayerLineChart
          title="Raster mean in AOI by week"
          labels={staticMultiLineLabels}
          datasets={staticMultiLineDatasets}
          hasLst={staticMultiLineHasLst}
          exportLngLatPerRow={staticChartExportLngLatPerRow}
          onRequestGenerateReport={onRequestGenerateReport}
          geoAiIndexAnalyticalExportContext={geoAiIndexAnalyticalExportContext}
          scatterAoiFeature={scatterAoiFeature}
          scatterAoiKey={scatterAoiKey}
          scatterWeekly={scatterWeekly}
          scatterWeekIndex={scatterWeekIndex}
          scatterRasterSample={scatterRasterSample}
          rasterDataLoading={rasterDataLoading}
          hasRealRasterData={hasRealRasterData}
        />
      </div>

      <div className="si-map-analysis-charts-grid si-map-analysis-charts-grid--below">
        <div className="si-map-analysis-chart-card">
          <div className="si-map-analysis-chart-kicker">Time series (spark)</div>
          <svg className="si-map-analysis-spark" viewBox="0 0 120 40" preserveAspectRatio="none">
            <path
              className="si-map-analysis-spark-path"
              d={sparkD}
              fill="none"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
        {spectralProfile ? (
          <div className="si-map-analysis-chart-card si-map-analysis-chart-card--spectral">
            <AoiSpectralProfileMiniChart profile={spectralProfile} />
          </div>
        ) : null}
        <div className="si-map-analysis-chart-card">
          <div className="si-map-analysis-chart-kicker">AOI layers (bar)</div>
          {fieldComparisonSubtitle ? (
            <p className="si-map-analysis-charts-subtitle si-map-analysis-charts-subtitle--tight">
              {fieldComparisonSubtitle}
            </p>
          ) : null}
          {barRows.length === 0 ? (
            <p className="si-map-analysis-charts-subtitle si-map-analysis-charts-subtitle--tight">
              Draw a polygon AOI to list sketch and inner field means for the selected map week.
            </p>
          ) : (
            <div className="si-map-analysis-bars">
              {barRows.slice(0, 8).map(row => (
                <div key={row.name} className="si-map-analysis-bar-row">
                  <span className="si-map-analysis-bar-name">{row.name}</span>
                  <div className="si-map-analysis-bar-track">
                    <span
                      className="si-map-analysis-bar-fill"
                      style={{ width: `${Math.min(100, (Math.abs(row.value) / maxBar) * 100)}%` }}
                    />
                  </div>
                  <span className="si-map-analysis-bar-val">{row.value.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="si-map-analysis-chart-card si-map-analysis-chart-card--pie">
          <div className="si-map-analysis-chart-kicker">AOI mix (pie)</div>
          {barRows.length === 0 ? (
            <p className="si-map-analysis-charts-subtitle si-map-analysis-charts-subtitle--tight">
              No AOI rows yet — pie shares follow the same values as the bar list.
            </p>
          ) : null}
          <div className="si-map-analysis-pie-wrap">
            {barRows.slice(0, 6).map((row, i, arr) => {
              const sum = arr.reduce((s, x) => s + Math.abs(x.value), 0) || 1;
              const pct = (Math.abs(row.value) / sum) * 100;
              const hue = 140 + i * 28;
              return (
                <div key={row.name} className="si-map-analysis-pie-seg">
                  <span className="si-map-analysis-pie-dot" style={{ background: `hsl(${hue} 65% 46%)` }} />
                  <span className="si-map-analysis-pie-lbl">{row.name}</span>
                  <span className="si-map-analysis-pie-pct">{pct.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
