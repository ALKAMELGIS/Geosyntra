import { useCallback, useEffect, useRef } from 'react';
import './SiLayerSwipeChrome.css';

export type SiLayerSwipeLayerOption = { id: string; label: string };

export type SiLayerSwipeChromeProps = {
  open: boolean;
  splitPct: number;
  onSplitPct: (pct: number) => void;
  leftLayerId: string;
  rightLayerId: string;
  onLeftLayerId: (id: string) => void;
  onRightLayerId: (id: string) => void;
  layerOptions: SiLayerSwipeLayerOption[];
  onClose: () => void;
  disabled?: boolean;
  disabledHint?: string;
};

export function SiLayerSwipeChrome({
  open,
  splitPct,
  onSplitPct,
  leftLayerId,
  rightLayerId,
  onLeftLayerId,
  onRightLayerId,
  layerOptions,
  onClose,
  disabled = false,
  disabledHint,
}: SiLayerSwipeChromeProps) {
  const dragRef = useRef(false);
  const hostRef = useRef<HTMLDivElement | null>(null);

  const setFromClientX = useCallback(
    (clientX: number) => {
      const el = hostRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const w = Math.max(1, r.width);
      const x = clientX - r.left;
      const pct = Math.round(Math.min(95, Math.max(5, (x / w) * 100)) * 10) / 10;
      onSplitPct(pct);
    },
    [onSplitPct],
  );

  useEffect(() => {
    if (!open) return;
    const onMove = (e: PointerEvent) => {
      if (!dragRef.current) return;
      setFromClientX(e.clientX);
    };
    const onUp = () => {
      dragRef.current = false;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [open, setFromClientX]);

  if (!open) return null;

  const leftLabel = layerOptions.find(o => o.id === leftLayerId)?.label ?? 'Left';
  const rightLabel = layerOptions.find(o => o.id === rightLayerId)?.label ?? 'Right';

  return (
    <div className="si-layer-swipe-chrome" ref={hostRef} aria-label="Layer swipe compare">
      <div className="si-layer-swipe-chrome__hud">
        <div className="si-layer-swipe-chrome__row">
          <span className="si-layer-swipe-chrome__kicker">Swipe</span>
          <button type="button" className="si-layer-swipe-chrome__close" title="Exit swipe" aria-label="Exit swipe compare" onClick={onClose}>
            <i className="fa-solid fa-xmark" aria-hidden />
          </button>
        </div>
        {disabled ? (
          <p className="si-layer-swipe-chrome__hint">{disabledHint ?? 'Swipe is unavailable for this map mode.'}</p>
        ) : (
          <>
            <div className="si-layer-swipe-chrome__picks">
              <label className="si-layer-swipe-chrome__pick">
                <span className="si-layer-swipe-chrome__pick-label">Left</span>
                <select
                  className="si-layer-swipe-chrome__select"
                  value={leftLayerId}
                  onChange={e => onLeftLayerId(e.target.value)}
                  aria-label="Left side layer"
                >
                  {layerOptions.map(o => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="si-layer-swipe-chrome__pick">
                <span className="si-layer-swipe-chrome__pick-label">Right</span>
                <select
                  className="si-layer-swipe-chrome__select"
                  value={rightLayerId}
                  onChange={e => onRightLayerId(e.target.value)}
                  aria-label="Right side layer"
                >
                  {layerOptions.map(o => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="si-layer-swipe-chrome__legend" dir="ltr">
              <span className="si-layer-swipe-chrome__legend-side si-layer-swipe-chrome__legend-side--l">{leftLabel}</span>
              <span className="si-layer-swipe-chrome__legend-sep" aria-hidden>
                |
              </span>
              <span className="si-layer-swipe-chrome__legend-side si-layer-swipe-chrome__legend-side--r">{rightLabel}</span>
            </p>
          </>
        )}
      </div>

      {!disabled ? (
        <>
          <div
            className="si-layer-swipe-chrome__bar"
            role="slider"
            aria-valuemin={5}
            aria-valuemax={95}
            aria-valuenow={Math.round(splitPct)}
            aria-label="Swipe divider position"
            tabIndex={0}
            onKeyDown={e => {
              if (e.key === 'ArrowLeft') {
                e.preventDefault();
                onSplitPct(Math.max(5, splitPct - 2));
              } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                onSplitPct(Math.min(95, splitPct + 2));
              }
            }}
            onPointerDown={e => {
              if (e.button !== 0) return;
              dragRef.current = true;
              setFromClientX(e.clientX);
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            }}
          >
            <div className="si-layer-swipe-chrome__bar-track" />
            <div
              className="si-layer-swipe-chrome__handle"
              style={{ left: `${splitPct}%` }}
              title="Drag to compare"
            >
              <span className="si-layer-swipe-chrome__grip" aria-hidden />
            </div>
          </div>
          <div className="si-layer-swipe-chrome__line" style={{ left: `${splitPct}%` }} aria-hidden />
        </>
      ) : null}
    </div>
  );
}
