import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Map as MapboxMap } from 'mapbox-gl';
import { liveAoiStatsStatusHint, type LiveAoiStatsViewModel } from '../utils/liveAoiStatsView';
import { SiStatDashboardIcon } from './SiStatDashboardIcon';
import { SiWeatherColoredIcon, SiWeatherColoredIconFromMetric } from './SiWeatherColoredIcon';
import { clampPopupWithinRect, type LiveAoiPopupAnchor } from '../utils/liveAoiPopupAnchor';
import { coverDisplayLabelsForLayer, indexIconForLayer } from '../utils/liveAoiPopupLabels';
import { formatLegendAreaHa, formatLegendAreaM2 } from '../utils/siWmsLegendClassStyle';
import {
  fetchLiveAoiWeatherSnapshot,
  type LiveAoiWeatherSnapshot,
} from '../utils/liveAoiPopupWeather';
import type { SiIndexClassRow } from '../utils/siIndexClassAnalytics';
import type { LiveAoiConditionTone, LiveAoiIndexAnalysisSummary } from '../utils/liveAoiIndexAnalysis';
import { roundIndexDisplay } from '../utils/siAoiZonalStats';
import { readMapCanvasLayout } from '../utils/siMapFloatingPanelLayout';
import './SiLiveAoiStatsPopup.css';

const PANEL_W = 328;
const PANEL_EST_H = 480;

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

function defaultPanelPosition(): { left: number; top: number } {
  const pad = 14;
  const layout = readMapCanvasLayout();
  if (!layout) return { left: pad, top: 96 };
  const { mapR, dockW } = layout;
  const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
  const top = mapR.top + pad + 72;
  if (rtl) {
    return { left: mapR.left + pad, top };
  }
  return { left: mapR.right - dockW - pad - PANEL_W, top };
}

function formatCoord(n: number): string {
  return n.toFixed(5);
}

function formatHa(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n >= 100) return n.toFixed(1);
  if (n >= 10) return n.toFixed(2);
  return n.toFixed(3);
}

function formatM2(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString('en-US');
}

function formatTemp(c: number | null): string {
  if (c == null || !Number.isFinite(c)) return '—';
  return `${Math.round(c)}°`;
}

function formatPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n.toFixed(0)}%`;
}

function formatWind(kmh: number | null): string {
  if (kmh == null || !Number.isFinite(kmh)) return '—';
  return `${Math.round(kmh)}`;
}

export type SiLiveAoiStatsPopupProps = {
  open: boolean;
  model: LiveAoiStatsViewModel;
  anchor?: LiveAoiPopupAnchor | null;
  map?: MapboxMap | null;
  coordinates?: { lng: number; lat: number } | null;
  cloudCoverMaxPct?: number;
  openWeatherApiKey?: string;
  analysisError?: string | null;
  onClose?: () => void;
};

function StatCell({
  kind,
  label,
  value,
}: {
  kind: 'min' | 'mean' | 'max';
  label: string;
  value: string;
}) {
  return (
    <div className={`si-live-aoi-stats__cell si-live-aoi-stats__cell--${kind}`}>
      <span className="si-live-aoi-stats__cell-k">{label}</span>
      <strong className="si-live-aoi-stats__cell-v" dir="ltr">
        {value}
      </strong>
    </div>
  );
}

function AreaMetricCard({
  title,
  ha,
  m2,
  pct,
  tone,
}: {
  title: string;
  ha: number;
  m2: number;
  pct?: number | null;
  tone: 'total' | 'cult' | 'non';
}) {
  return (
    <div className={`si-live-aoi-stats__metric si-live-aoi-stats__metric--${tone}`}>
      <div className="si-live-aoi-stats__metric-head">
        <span className="si-live-aoi-stats__metric-k">{title}</span>
        {pct != null && Number.isFinite(pct) ? (
          <span className="si-live-aoi-stats__metric-pct" dir="ltr">
            {pct.toFixed(1)}%
          </span>
        ) : null}
      </div>
      <div className="si-live-aoi-stats__metric-v" dir="ltr">
        <strong>{formatHa(ha)}</strong> ha
      </div>
      <div className="si-live-aoi-stats__metric-sub" dir="ltr">
        {formatM2(m2)} m²
      </div>
    </div>
  );
}

function CoverBar({
  label,
  pct,
  areaHa,
  tone,
}: {
  label: string;
  pct: number;
  areaHa: number;
  tone: 'pos' | 'neg';
}) {
  return (
    <div className={`si-live-aoi-stats__bar si-live-aoi-stats__bar--${tone}`}>
      <div className="si-live-aoi-stats__bar-head">
        <span className="si-live-aoi-stats__bar-label">{label}</span>
        <span className="si-live-aoi-stats__bar-pct" dir="ltr">
          {pct.toFixed(1)}%
        </span>
      </div>
      <div className="si-live-aoi-stats__bar-track" aria-hidden>
        <div className="si-live-aoi-stats__bar-fill" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
      <span className="si-live-aoi-stats__bar-area" dir="ltr">
        {formatHa(areaHa)} ha
      </span>
    </div>
  );
}

function ConditionBadge({
  condition,
  tone,
}: {
  condition: string;
  tone: LiveAoiConditionTone;
}) {
  return (
    <div className={`si-live-aoi-stats__condition si-live-aoi-stats__condition--${tone}`}>
      <span className="si-live-aoi-stats__condition-dot" aria-hidden />
      <span className="si-live-aoi-stats__condition-k">Vegetation condition</span>
      <strong className="si-live-aoi-stats__condition-v">{condition}</strong>
    </div>
  );
}

function WmsRampClassLegend({ classes }: { classes: SiIndexClassRow[] }) {
  const rows = [...classes].reverse();
  return (
    <div className="si-live-aoi-stats__ndvi-legend" aria-label="Index classification legend">
      <span className="si-live-aoi-stats__section-k">Spectral classes</span>
      <ul className="si-live-aoi-stats__ndvi-legend-list">
        {rows.map(c => (
          <li key={c.classId}>
            <span
              className="si-live-aoi-stats__ndvi-swatch"
              style={{ background: c.colorHex }}
              title={c.colorHex}
              aria-hidden
            />
            <span className="si-live-aoi-stats__ndvi-band-label">{c.condition}</span>
            <span className="si-live-aoi-stats__ndvi-band-range" dir="ltr">
              {c.label}
            </span>
            <span className="si-live-aoi-stats__ndvi-band-area" dir="ltr">
              {formatLegendAreaHa(c.areaHa)} ha · {formatLegendAreaM2(c.areaM2)} m²
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function IndexAnalysisBody({
  model,
  analysis,
  loading,
  stat,
}: {
  model: LiveAoiStatsViewModel;
  analysis: LiveAoiIndexAnalysisSummary;
  loading: boolean;
  stat: (v: number | null) => string;
}) {
  return (
    <>
      <div className="si-live-aoi-stats__imagery-banner" dir="ltr">
        <i className="fa-solid fa-calendar-day" aria-hidden />
        <div>
          <span className="si-live-aoi-stats__imagery-k">Imagery date (latest composite)</span>
          <strong className="si-live-aoi-stats__imagery-v">{analysis.imageryDateIso || '—'}</strong>
        </div>
      </div>

      {!loading && analysis.averageIndex != null ? (
        <>
          <ConditionBadge condition={analysis.condition} tone={analysis.conditionTone} />

          <div className="si-live-aoi-stats__hero si-live-aoi-stats__hero--ndvi" dir="ltr">
            <span className="si-live-aoi-stats__hero-k">Average NDVI</span>
            <strong className="si-live-aoi-stats__hero-v">{stat(analysis.averageIndex)}</strong>
            <span className="si-live-aoi-stats__hero-range">
              Range {stat(model.min)} – {stat(model.max)}
            </span>
          </div>

          <div className="si-live-aoi-stats__metrics si-live-aoi-stats__metrics--ndvi" aria-label="NDVI area metrics">
            <AreaMetricCard title="Total AOI area" ha={analysis.totalAreaHa} m2={analysis.totalAreaM2} tone="total" />
            <AreaMetricCard
              title="Cultivated area (NDVI > 0.20)"
              ha={analysis.cultivatedAreaHa}
              m2={analysis.cultivatedAreaM2}
              pct={analysis.cultivatedPct}
              tone="cult"
            />
            <AreaMetricCard
              title="Non-cultivated area"
              ha={analysis.nonCultivatedAreaHa}
              m2={analysis.nonCultivatedAreaM2}
              tone="non"
            />
          </div>

          <p className="si-live-aoi-stats__interpretation">{analysis.interpretation}</p>

          {model.classAnalytics?.classes?.length ? (
            <WmsRampClassLegend classes={model.classAnalytics.classes} />
          ) : null}
        </>
      ) : null}
    </>
  );
}

function WeatherChip({
  metric,
  value,
  unit,
  label,
}: {
  metric: 'temp' | 'humidity' | 'wind' | 'cloud';
  value: string;
  unit?: string;
  label: string;
}) {
  return (
    <div className="si-live-aoi-stats__wx-chip" title={label}>
      {metric === 'cloud' ? (
        <SiWeatherColoredIcon tone="cloud" size="sm" />
      ) : (
        <SiWeatherColoredIconFromMetric metric={metric} size="sm" />
      )}
      <span className="si-live-aoi-stats__wx-val" dir="ltr">
        {value}
        {unit ? <small>{unit}</small> : null}
      </span>
      <span className="si-live-aoi-stats__wx-lbl">{label}</span>
    </div>
  );
}

export function SiLiveAoiStatsPopup({
  open,
  model,
  anchor,
  map,
  coordinates,
  cloudCoverMaxPct,
  openWeatherApiKey = '',
  analysisError = null,
  onClose,
}: SiLiveAoiStatsPopupProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragOffsetRef = useRef(dragOffset);
  dragOffsetRef.current = dragOffset;
  const [isDragging, setIsDragging] = useState(false);
  const [weather, setWeather] = useState<LiveAoiWeatherSnapshot | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const dragSession = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const winListenersRef = useRef<{ move: (e: PointerEvent) => void; up: (e: PointerEvent) => void } | null>(null);

  const lng = coordinates?.lng ?? anchor?.lng ?? null;
  const lat = coordinates?.lat ?? anchor?.lat ?? null;

  const removeWindowDragListeners = useCallback(() => {
    const h = winListenersRef.current;
    if (!h) return;
    window.removeEventListener('pointermove', h.move);
    window.removeEventListener('pointerup', h.up);
    window.removeEventListener('pointercancel', h.up);
    winListenersRef.current = null;
  }, []);

  useEffect(() => {
    if (!open || lng == null || lat == null) {
      setWeather(null);
      return;
    }
    let cancelled = false;
    setWeatherLoading(true);
    void fetchLiveAoiWeatherSnapshot(lat, lng, openWeatherApiKey).then(snap => {
      if (cancelled) return;
      setWeather(snap);
      setWeatherLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, lng, lat, openWeatherApiKey, model.aoiKey, model.analysisDateIso]);

  const placeInitial = useCallback(() => {
    const el = panelRef.current;
    if (!el) return;

    if (map && anchor) {
      try {
        const pt = map.project([anchor.lng, anchor.lat]);
        const w = el.offsetWidth || PANEL_W;
        const h = el.offsetHeight || PANEL_EST_H;
        const host =
          (el.offsetParent instanceof HTMLElement ? el.offsetParent : null) ??
          document.querySelector('.si-map-container');
        const cw = host instanceof HTMLElement ? host.clientWidth : window.innerWidth;
        const ch = host instanceof HTMLElement ? host.clientHeight : window.innerHeight;
        const rawLeft = pt.x - w / 2;
        const rawTop = pt.y - h - 14;
        const clamped = clampPopupWithinRect(rawLeft, rawTop, w, h, cw, ch);
        el.style.left = `${clamped.left}px`;
        el.style.top = `${clamped.top}px`;
        el.style.right = 'auto';
        el.style.bottom = 'auto';
        return;
      } catch {
        /* fall through */
      }
    }

    const pos = defaultPanelPosition();
    const mapEl = document.querySelector('.si-map-container');
    if (mapEl instanceof HTMLElement) {
      el.style.top = `${Math.max(12, pos.top - mapEl.getBoundingClientRect().top)}px`;
    } else {
      el.style.top = `${pos.top}px`;
    }
    el.style.left = 'auto';
    el.style.right = '14px';
    el.style.bottom = 'auto';
  }, [anchor, map]);

  useEffect(() => {
    if (!open) {
      removeWindowDragListeners();
      dragSession.current = null;
      setIsDragging(false);
      return;
    }
    setDragOffset({ x: 0, y: 0 });
    const t = window.requestAnimationFrame(placeInitial);
    return () => window.cancelAnimationFrame(t);
  }, [open, model.aoiKey, anchor?.lng, anchor?.lat, anchor?.source, placeInitial, removeWindowDragListeners]);

  useEffect(() => {
    if (!open || !map || isDragging) return;
    const onMove = () => {
      window.requestAnimationFrame(placeInitial);
    };
    map.on('move', onMove);
    map.on('zoom', onMove);
    map.on('rotate', onMove);
    map.on('pitch', onMove);
    return () => {
      map.off('move', onMove);
      map.off('zoom', onMove);
      map.off('rotate', onMove);
      map.off('pitch', onMove);
    };
  }, [open, map, isDragging, placeInitial]);

  useEffect(() => () => removeWindowDragListeners(), [removeWindowDragListeners]);

  useEffect(() => {
    if (!open || !onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleClose = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      onClose?.();
    },
    [onClose],
  );

  const onHeadPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest('button')) return;
      e.stopPropagation();
      const el = panelRef.current;
      if (!el) return;
      removeWindowDragListeners();
      dragSession.current = {
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        originX: dragOffsetRef.current.x,
        originY: dragOffsetRef.current.y,
      };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const onMove = (ev: PointerEvent) => {
        const s = dragSession.current;
        if (!s || ev.pointerId !== s.pointerId) return;
        ev.preventDefault();
        const dx = ev.clientX - s.startClientX;
        const dy = ev.clientY - s.startClientY;
        const next = clampPanelTranslate(el, s.originX + dx, s.originY + dy);
        setDragOffset(next);
      };
      const onUp = (ev: PointerEvent) => {
        const s = dragSession.current;
        if (!s || ev.pointerId !== s.pointerId) return;
        dragSession.current = null;
        removeWindowDragListeners();
        setIsDragging(false);
      };
      winListenersRef.current = { move: onMove, up: onUp };
      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      setIsDragging(true);
    },
    [removeWindowDragListeners],
  );

  const loading = model.status === 'loading' && model.mean == null && model.cover == null;
  const click = model.clickedClass;
  const cover = model.cover;
  const indexAnalysis = model.indexAnalysis;
  const coverLabels = coverDisplayLabelsForLayer(model.layerId);
  const indexIcon = indexIconForLayer(model.layerId);
  const statusHint =
    liveAoiStatsStatusHint(model.status, loading) ??
    (model.status === 'error' && analysisError?.trim() ? analysisError.trim() : null);
  const panelTitle = indexAnalysis?.indicatorLabel ?? 'AOI live analysis';
  const stat = (v: number | null) =>
    v != null && Number.isFinite(v) ? roundIndexDisplay(v, model.layerId) : '—';

  const totalPixels =
    model.totalPixelCount != null && model.totalPixelCount > 0
      ? model.totalPixelCount.toLocaleString('en-US')
      : null;
  const validPixels =
    model.validPixelCount != null && model.validPixelCount > 0
      ? model.validPixelCount.toLocaleString('en-US')
      : model.pixelCount != null && model.pixelCount > 0
        ? model.pixelCount.toLocaleString('en-US')
        : loading
          ? '…'
          : '—';

  const posPct = cover?.positivePct ?? null;
  const negPct = cover?.negativePct ?? null;
  const posHa = cover?.positiveAreaHa ?? 0;
  const negHa = cover?.negativeAreaHa ?? 0;

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          ref={panelRef}
          className={`si-live-aoi-stats${isDragging ? ' si-live-aoi-stats--dragging' : ''}`}
          role="dialog"
          aria-modal="false"
          aria-label={panelTitle}
          initial={{ opacity: 0, y: 10, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          style={{ transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` }}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
        >
          <div className="si-live-aoi-stats__head" onPointerDown={onHeadPointerDown}>
            <div className="si-live-aoi-stats__head-text">
              <span className="si-live-aoi-stats__live">
                <span className="si-live-aoi-stats__live-dot" aria-hidden />
                {indexAnalysis ? 'GeoSyntra' : 'Live AOI'}
              </span>
              <strong className="si-live-aoi-stats__aoi-name">{panelTitle}</strong>
              <span className="si-live-aoi-stats__aoi-sub">{model.aoiName}</span>
            </div>
            <span className="si-live-aoi-stats__index-badge" title={model.layerName}>
              <i className={`fa-solid ${indexIcon}`} aria-hidden />
              {model.layerId}
            </span>
            {onClose ? (
              <button
                type="button"
                className="si-live-aoi-stats__close"
                aria-label="Close live AOI popup"
                onPointerDown={e => e.stopPropagation()}
                onClick={handleClose}
              >
                <i className="fa-solid fa-xmark" aria-hidden />
              </button>
            ) : null}
          </div>

          {indexAnalysis ? (
            <IndexAnalysisBody
              model={model}
              analysis={indexAnalysis}
              loading={loading}
              stat={stat}
            />
          ) : (
            <>
              <p className="si-live-aoi-stats__live-note">
                LIVE · {model.layerName} · Imagery {model.analysisDateIso || '—'}
              </p>

              {!loading && model.mean != null ? (
                <div className="si-live-aoi-stats__hero" dir="ltr">
                  <span className="si-live-aoi-stats__hero-k">Average {model.layerId}</span>
                  <strong className="si-live-aoi-stats__hero-v">{stat(model.mean)}</strong>
                  <span className="si-live-aoi-stats__hero-range">
                    {stat(model.min)} – {stat(model.max)}
                  </span>
                </div>
              ) : null}

              <div className="si-live-aoi-stats__metrics" aria-label="AOI area breakdown">
                <AreaMetricCard title="Total area (AOI)" ha={model.areaHa} m2={model.areaM2} tone="total" />
                {cover && !loading && posPct != null && negPct != null ? (
                  <>
                    <AreaMetricCard
                      title={coverLabels.shortPositive}
                      ha={posHa}
                      m2={cover.positiveAreaM2}
                      pct={posPct}
                      tone="cult"
                    />
                    <AreaMetricCard
                      title={coverLabels.shortNegative}
                      ha={negHa}
                      m2={cover.negativeAreaM2}
                      pct={negPct}
                      tone="non"
                    />
                  </>
                ) : null}
              </div>

              {cover && !loading && posPct != null && negPct != null ? (
                <div className="si-live-aoi-stats__cover-block" aria-label="Index cover split">
                  <CoverBar label={coverLabels.shortPositive} pct={posPct} areaHa={posHa} tone="pos" />
                  <CoverBar label={coverLabels.shortNegative} pct={negPct} areaHa={negHa} tone="neg" />
                </div>
              ) : null}

              <div className="si-live-aoi-stats__grid">
                <StatCell kind="min" label="Min" value={stat(model.min)} />
                <StatCell kind="mean" label="Mean" value={stat(model.mean)} />
                <StatCell kind="max" label="Max" value={stat(model.max)} />
              </div>
            </>
          )}

          <div className="si-live-aoi-stats__meta-grid">
            <div className="si-live-aoi-stats__meta-item">
              <SiStatDashboardIcon size={14} title="Raster pixel statistics" />
              <span className="si-live-aoi-stats__meta-k">Pixels</span>
              <span className="si-live-aoi-stats__meta-v" dir="ltr">
                {totalPixels ? `${validPixels} / ${totalPixels}` : validPixels}
              </span>
            </div>
            {model.approxResolutionM != null ? (
              <div className="si-live-aoi-stats__meta-item">
                <i className="fa-solid fa-ruler-combined" aria-hidden />
                <span className="si-live-aoi-stats__meta-k">Res.</span>
                <span className="si-live-aoi-stats__meta-v" dir="ltr">
                  ~{model.approxResolutionM.toFixed(1)} m
                </span>
              </div>
            ) : null}
            <div className="si-live-aoi-stats__meta-item">
              <i className="fa-solid fa-calendar-day" aria-hidden />
              <span className="si-live-aoi-stats__meta-k">Imagery</span>
              <span className="si-live-aoi-stats__meta-v" dir="ltr">
                {model.analysisDateIso || '—'}
              </span>
            </div>
            {cloudCoverMaxPct != null ? (
              <div className="si-live-aoi-stats__meta-item">
                <i className="fa-solid fa-cloud" aria-hidden />
                <span className="si-live-aoi-stats__meta-k">Cloud max</span>
                <span className="si-live-aoi-stats__meta-v" dir="ltr">
                  {formatPct(cloudCoverMaxPct)}
                </span>
              </div>
            ) : null}
            {lng != null && lat != null ? (
              <div className="si-live-aoi-stats__meta-item si-live-aoi-stats__meta-item--coords">
                <i className="fa-solid fa-location-crosshairs" aria-hidden />
                <span className="si-live-aoi-stats__meta-k">Coords</span>
                <span className="si-live-aoi-stats__meta-v" dir="ltr">
                  {formatCoord(lat)}°N · {formatCoord(lng)}°E
                </span>
              </div>
            ) : null}
          </div>

          <div className="si-live-aoi-stats__weather si-live-aoi-stats__weather--compact" aria-label="Field weather">
            <div className="si-live-aoi-stats__weather-head">
              <SiWeatherColoredIcon icon={weather?.conditionIcon ?? 'fa-cloud-sun'} size="md" />
              <span className="si-live-aoi-stats__weather-title">
                {weatherLoading ? 'Weather…' : weather?.conditionLabel ?? 'Weather'}
              </span>
              <span className="si-live-aoi-stats__weather-src">
                {weather?.provider === 'openweather' ? 'OpenWeather' : weather ? 'Open-Meteo' : ''}
              </span>
            </div>
            <div className="si-live-aoi-stats__wx-row">
              <WeatherChip
                metric="temp"
                value={weatherLoading ? '…' : formatTemp(weather?.tempC ?? null)}
                label="Temp"
              />
              <WeatherChip
                metric="humidity"
                value={weatherLoading ? '…' : formatPct(weather?.humidityPct ?? null)}
                label="Humidity"
              />
              <WeatherChip
                metric="wind"
                value={weatherLoading ? '…' : formatWind(weather?.windKmh ?? null)}
                unit={weather?.windKmh != null ? ' km/h' : undefined}
                label={`Wind${weather?.windDirLabel && weather.windDirLabel !== '—' ? ` ${weather.windDirLabel}` : ''}`}
              />
              <WeatherChip
                metric="cloud"
                value={cloudCoverMaxPct != null ? String(cloudCoverMaxPct) : '—'}
                unit={cloudCoverMaxPct != null ? '%' : undefined}
                label="Cloud filter"
              />
            </div>
          </div>

          {click && !loading ? (
            <div className="si-live-aoi-stats__class-hit" role="status">
              <span className="si-live-aoi-stats__section-k">Click sample</span>
              <strong className="si-live-aoi-stats__class-name">{click.condition}</strong>
              <span className="si-live-aoi-stats__class-range" dir="ltr">
                {click.label} · index {stat(click.pixelValue)}
              </span>
              <span className="si-live-aoi-stats__class-area" dir="ltr">
                {click.pct.toFixed(1)}% · {formatHa(click.areaHa)} ha
              </span>
            </div>
          ) : null}

          {loading ? (
            <p className="si-live-aoi-stats__status">
              <i className="fa-solid fa-circle-notch fa-spin" aria-hidden /> Updating index…
            </p>
          ) : statusHint ? (
            <p
              className={`si-live-aoi-stats__status${
                model.status === 'error' || model.status === 'unavailable'
                  ? ' si-live-aoi-stats__status--warn'
                  : ''
              }`}
            >
              {statusHint}
            </p>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
