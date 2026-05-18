import { useCallback, useEffect, useRef, useState } from 'react';
import { AoiSpectralProfileMiniChart } from './AoiSpectralProfileMiniChart';
import type { LiveAoiAnalysisStatus } from '../hooks/useLiveAoiSpectralAnalysis';
import {
  formatLivePrimaryIndex,
  type LiveAoiMapChartSnapshot,
} from '../utils/liveAoiMapChartSnapshot';
import './satelliteMapAnalysisChrome.css';

function clampPanelTranslate(el: HTMLDivElement, x: number, y: number): { x: number; y: number } {
  const margin = 10;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const prev = el.style.transform;
  el.style.transform = `translate(${x}px, ${y}px)`;
  const r = el.getBoundingClientRect();
  el.style.transform = prev;
  let nx = x;
  let ny = y;
  if (r.left < margin) nx += margin - r.left;
  if (r.top < margin) ny += margin - r.top;
  if (r.right > vw - margin) nx -= r.right - (vw - margin);
  if (r.bottom > vh - margin) ny -= r.bottom - (vh - margin);
  return { x: nx, y: ny };
}

function LiveAreaHaSqm({ ha }: { ha: number }) {
  if (!Number.isFinite(ha) || ha < 0) return <span className="si-aoi-area-ha-sqm si-aoi-area-ha-sqm--empty">—</span>;
  const m2 = ha * 10000;
  const haStr = ha >= 100 ? ha.toFixed(2) : ha >= 1 ? ha.toFixed(3) : ha.toFixed(4);
  const m2Str = m2 >= 10_000 ? Math.round(m2).toLocaleString('en-US') : (Math.round(m2 * 10) / 10).toLocaleString('en-US');
  return (
    <span className="si-aoi-area-ha-sqm" dir="ltr">
      <span className="si-aoi-area-ha-sqm__ha">
        <span className="si-aoi-area-ha-sqm__num">{haStr}</span> ha{' '}
        <span className="si-aoi-area-ha-sqm__unit">(Hectares)</span>
      </span>
      <span className="si-aoi-area-ha-sqm__m2">
        <span className="si-aoi-area-ha-sqm__num">{m2Str}</span> m²{' '}
        <span className="si-aoi-area-ha-sqm__unit">(SqM)</span>
      </span>
    </span>
  );
}

export type SatelliteAoiLiveChartsMapOverlayProps = {
  open: boolean;
  onClose: () => void;
  snapshot: LiveAoiMapChartSnapshot | null;
  indexLabel: string;
  status?: LiveAoiAnalysisStatus;
  error?: string | null;
  pixelCount?: number;
  confidencePct?: number | null;
};

/** Phase-1 AOI charts: live layer only — no timeline controls. */
export function SatelliteAoiLiveChartsMapOverlay({
  open,
  onClose,
  snapshot,
  indexLabel,
  status = 'idle',
  error = null,
  pixelCount = 0,
  confidencePct = null,
}: SatelliteAoiLiveChartsMapOverlayProps) {
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

  const removeWindowDragListeners = useCallback(() => {
    const h = winListenersRef.current;
    if (!h) return;
    window.removeEventListener('pointermove', h.move);
    window.removeEventListener('pointerup', h.up);
    window.removeEventListener('pointercancel', h.up);
    winListenersRef.current = null;
  }, []);

  useEffect(() => {
    if (open) setDragOffset({ x: 0, y: 0 });
    else {
      removeWindowDragListeners();
      dragSession.current = null;
      setIsDragging(false);
    }
  }, [open, removeWindowDragListeners]);

  useEffect(() => () => removeWindowDragListeners(), [removeWindowDragListeners]);

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
        setDragOffset(clampPanelTranslate(panel, nx, ny));
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

  const barRows = snapshot?.fieldBars ?? [];
  const maxBar = barRows.length ? Math.max(...barRows.map(p => Math.abs(p.value)), 1e-9) : 1;
  const healthRows = snapshot?.health?.rows ?? [];

  return (
    <div
      ref={panelRef}
      className={`si-map-analysis-charts si-map-analysis-charts--live${isDragging ? ' si-map-analysis-charts--dragging' : ''}${
        dragOffset.x !== 0 || dragOffset.y !== 0 ? ' si-map-analysis-charts--dragged' : ''
      }`}
      role="dialog"
      aria-modal="false"
      aria-label="AOI live analysis"
      style={{ transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` }}
    >
      <div className="si-map-analysis-charts-head" onPointerDown={onChartsHeadPointerDown}>
        <div className="si-map-analysis-charts-head-text">
          <div className="si-map-analysis-charts-title">AOI live analysis</div>
          <div className="si-map-analysis-charts-subtitle">
            {indexLabel} ·{' '}
            {snapshot?.dataSource === 'raster'
              ? 'AOI-clipped raster pixels (Sentinel-2 STAC)'
              : 'raster analysis'}
            {status === 'loading' ? ' · computing…' : null}
          </div>
        </div>
        <button type="button" className="si-map-analysis-charts-close" aria-label="Close" title="Close" onClick={onClose}>
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </div>

      {status === 'loading' ? (
        <p className="si-map-analysis-charts-subtitle si-map-analysis-charts-subtitle--pad">
          <i className="fa-solid fa-spinner fa-spin" aria-hidden /> Sampling Sentinel-2 pixels inside AOI…
        </p>
      ) : null}
      {status === 'error' || status === 'unavailable' ? (
        <p className="si-map-analysis-charts-subtitle si-map-analysis-charts-subtitle--pad si-live-aoi-error">
          {error || 'Analysis engine unavailable.'}
        </p>
      ) : null}
      {!snapshot && status !== 'loading' ? (
        <p className="si-map-analysis-charts-subtitle si-map-analysis-charts-subtitle--pad">
          Draw a polygon AOI on the map to analyze the live layer.
        </p>
      ) : null}
      {snapshot ? (
        <>
          {snapshot.dataSource === 'raster' && pixelCount > 0 ? (
            <p className="si-map-analysis-charts-subtitle si-map-analysis-charts-subtitle--tight">
              {pixelCount.toLocaleString()} pixels sampled
              {confidencePct != null ? ` · ${confidencePct}% valid` : null}
            </p>
          ) : null}
          <div className="si-live-aoi-metrics">
            <div className="si-live-aoi-metric-card">
              <div className="si-live-aoi-metric-k">Date</div>
              <div className="si-live-aoi-metric-v">{snapshot.analysisDateLabel}</div>
            </div>
            <div className="si-live-aoi-metric-card">
              <div className="si-live-aoi-metric-k">{snapshot.activeLayerLabel} (live)</div>
              <div className="si-live-aoi-metric-v si-live-aoi-metric-v--index">
                {formatLivePrimaryIndex(snapshot.primaryIndexValue, snapshot.activeLayerId)}
              </div>
            </div>
            <div className="si-live-aoi-metric-card">
              <div className="si-live-aoi-metric-k">AOI area</div>
              <div className="si-live-aoi-metric-v">
                {snapshot.zonal ? <LiveAreaHaSqm ha={snapshot.zonal.areaHa} /> : '—'}
              </div>
            </div>
          </div>

          {healthRows.length > 0 ? (
            <div className="si-map-analysis-chart-card si-live-aoi-health">
              <div className="si-map-analysis-chart-kicker">AOI distribution · {snapshot.activeLayerLabel}</div>
              <div className="si-live-aoi-health-rows">
                {healthRows.map(row => (
                  <div key={row.band} className="si-live-aoi-health-row">
                    <span className="si-live-aoi-health-dot" style={{ background: row.color }} />
                    <span className="si-live-aoi-health-lbl">{row.label}</span>
                    <span className="si-live-aoi-health-pct">{row.pct.toFixed(1)}%</span>
                    <span className="si-live-aoi-health-ha">{row.areaHa.toFixed(2)} ha</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="si-map-analysis-charts-grid si-map-analysis-charts-grid--below">
            {snapshot.spectralProfile ? (
              <div className="si-map-analysis-chart-card si-map-analysis-chart-card--spectral">
                <AoiSpectralProfileMiniChart profile={snapshot.spectralProfile} />
              </div>
            ) : null}
            <div className="si-map-analysis-chart-card">
              <div className="si-map-analysis-chart-kicker">AOI layers (live bar)</div>
              {snapshot.fieldBarsSubtitle ? (
                <p className="si-map-analysis-charts-subtitle si-map-analysis-charts-subtitle--tight">{snapshot.fieldBarsSubtitle}</p>
              ) : null}
              {barRows.length === 0 ? (
                <p className="si-map-analysis-charts-subtitle si-map-analysis-charts-subtitle--tight">
                  No polygon AOI — draw on the map to see live means.
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
              <div className="si-map-analysis-chart-kicker">AOI mix (live %)</div>
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
        </>
      ) : null}
    </div>
  );
}