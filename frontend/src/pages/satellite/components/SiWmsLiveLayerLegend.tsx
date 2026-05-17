import { useCallback, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { WmsAoiEvalProfile } from '../../../lib/sentinelHubWmsAoiClip';
import { siStopsToVerticalCssGradient } from '../../../lib/siWmsIndexClassificationRamp';
import { mergeSymbologyUi, siWmsLiveLegendStops, type SiWmsSymbologyUiState } from '../utils/siWmsLegendMode';
import { SI_WMS_SPECTRAL_CLASS_COUNT, siWmsLegendRowsFromStops } from '../utils/siWmsSpectralClassification';
import type { SiWmsSpectralLegendContext } from './SiWmsIndexClassificationLegend';

const SI_WMS_LIVE_LEGEND_OFFSET_LS = 'si-wms-live-legend-offset-v1';

function readStoredLegendOffset(): { x: number; y: number } {
  if (typeof window === 'undefined') return { x: 0, y: 0 };
  try {
    const raw = localStorage.getItem(SI_WMS_LIVE_LEGEND_OFFSET_LS);
    if (!raw) return { x: 0, y: 0 };
    const o = JSON.parse(raw) as { x?: unknown; y?: unknown };
    const x = Number(o.x);
    const y = Number(o.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: 0, y: 0 };
    return { x, y };
  } catch {
    return { x: 0, y: 0 };
  }
}

function clampLegendOffset(x: number, y: number): { x: number; y: number } {
  if (typeof window === 'undefined') return { x, y };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const maxX = Math.min(240, vw * 0.35);
  const maxY = Math.min(200, vh * 0.35);
  return {
    x: Math.max(-maxX, Math.min(maxX, x)),
    y: Math.max(-maxY, Math.min(maxY, y)),
  };
}

export type SiWmsLiveLayerLegendProps = {
  profile: WmsAoiEvalProfile;
  layerId: string;
  layerLabel: string;
  context: SiWmsSpectralLegendContext;
  symbologyUi: SiWmsSymbologyUiState;
  symbologyPartial?: Partial<SiWmsSymbologyUiState>;
};

export function SiWmsLiveLayerLegend({
  profile,
  layerId,
  layerLabel,
  context,
  symbologyUi,
  symbologyPartial,
}: SiWmsLiveLayerLegendProps) {
  const offsetRef = useRef(readStoredLegendOffset());
  const [legendOffset, setLegendOffset] = useState(offsetRef.current);
  const [legendDragging, setLegendDragging] = useState(false);
  offsetRef.current = legendOffset;

  const onLegendHeadPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    const start = { ox: offsetRef.current.x, oy: offsetRef.current.y, cx: e.clientX, cy: e.clientY };
    setLegendDragging(true);
    const head = e.currentTarget;
    try {
      head.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    const onMove = (ev: PointerEvent) => {
      setLegendOffset(clampLegendOffset(start.ox + (ev.clientX - start.cx), start.oy + (ev.clientY - start.cy)));
    };

    const finish = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      try {
        head.releasePointerCapture(ev.pointerId);
      } catch {
        /* ignore */
      }
      setLegendDragging(false);
      setLegendOffset(prev => {
        const c = clampLegendOffset(prev.x, prev.y);
        try {
          localStorage.setItem(SI_WMS_LIVE_LEGEND_OFFSET_LS, JSON.stringify(c));
        } catch {
          /* ignore */
        }
        return c;
      });
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  }, []);

  const ui = useMemo(() => mergeSymbologyUi(symbologyUi), [symbologyUi]);
  const liveStops = useMemo(
    () => siWmsLiveLegendStops(layerId, ui, symbologyPartial),
    [layerId, ui, symbologyPartial],
  );
  const gradient = useMemo(() => (liveStops ? siStopsToVerticalCssGradient(liveStops) : ''), [liveStops]);
  const classRows = useMemo(
    () => siWmsLegendRowsFromStops(liveStops, SI_WMS_SPECTRAL_CLASS_COUNT),
    [liveStops],
  );

  const seriesLine =
    context.seriesStartIso && context.seriesEndIso
      ? `${context.seriesStartIso} → ${context.seriesEndIso}`
      : null;

  const isComposite =
    profile === 'true_color' || profile === 'false_color' || profile === 'swir' || profile === 'generic_rgb';

  return (
    <div
      className={`si-wms-index-class-legend si-wms-index-class-legend--live${legendDragging ? ' si-wms-index-class-legend--dragging' : ''}`}
      dir="ltr"
      role="region"
      aria-label="Live layer legend"
      style={{ transform: `translate(${legendOffset.x}px, ${legendOffset.y}px)` }}
    >
      <div
        className="si-wms-index-class-legend__head si-wms-index-class-legend__head--draggable"
        onPointerDown={onLegendHeadPointerDown}
        title="Drag header to move legend"
      >
        <span className="si-wms-index-class-legend__drag-icon" aria-hidden>
          <i className="fa-solid fa-grip-lines" />
        </span>
        <span className="si-wms-index-class-legend__title">{layerLabel}</span>
        <span className="si-wms-index-class-legend__badge si-wms-index-class-legend__badge--live">Live</span>
      </div>

      <div className="si-wms-index-class-legend__live" aria-live="polite">
        <div className="si-wms-index-class-legend__live-row">
          <span className="si-wms-index-class-legend__live-k">Imagery</span>
          <span className="si-wms-index-class-legend__live-v">{context.imageryDateIso}</span>
          {context.timelinePlaying ? (
            <span className="si-wms-index-class-legend__live-playing">Playing</span>
          ) : null}
        </div>
        {seriesLine ? (
          <div className="si-wms-index-class-legend__live-row">
            <span className="si-wms-index-class-legend__live-k">Series</span>
            <span className="si-wms-index-class-legend__live-v">{seriesLine}</span>
          </div>
        ) : null}
      </div>

      <p className="si-wms-index-class-legend__hint si-wms-index-class-legend__hint--live">
        {isComposite
          ? 'RGB composite — band colors as rendered on the map.'
          : `Live layer — ${SI_WMS_SPECTRAL_CLASS_COUNT}-class spectral ramp by index type; matches map tiles inside AOI.`}
      </p>

      {!isComposite && gradient && classRows.length > 0 ? (
        <div className="si-wms-index-class-legend__body">
          <div className="si-wms-index-class-legend__bar" style={{ backgroundImage: gradient }} aria-hidden />
          <div className="si-wms-index-class-legend__rows">
            {classRows.map((row, i) => (
              <div key={`${row.from}-${row.to}-${i}`} className="si-wms-index-class-legend__row">
                <span className="si-wms-index-class-legend__swatch" style={{ background: row.color }} />
                <span className="si-wms-index-class-legend__range">
                  {row.from.toFixed(3)} – {row.to.toFixed(3)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}