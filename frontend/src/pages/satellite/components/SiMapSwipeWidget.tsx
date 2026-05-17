import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { SiMapSwipeMode, SiMapSwipeNorm } from '../utils/siMapSwipeTypes';
import { SI_MAP_SWIPE_SPYGLASS_RADIUS_PX } from '../utils/siMapSwipeTypes';
import './SiMapSwipeWidget.css';

export type SiMapSwipeWidgetProps = {
  active: boolean;
  mode: SiMapSwipeMode;
  norm: SiMapSwipeNorm;
  onNormChange: (n: SiMapSwipeNorm) => void;
  onModeChange: (m: SiMapSwipeMode) => void;
  currentLabel: string;
  compareLabel: string;
};

function normFromPointer(
  container: DOMRect,
  clientX: number,
  clientY: number,
): SiMapSwipeNorm {
  return {
    x: Math.min(1, Math.max(0, (clientX - container.left) / container.width)),
    y: Math.min(1, Math.max(0, (clientY - container.top) / container.height)),
  };
}

export function SiMapSwipeWidget({
  active,
  mode,
  norm,
  onNormChange,
  onModeChange,
  currentLabel,
  compareLabel,
}: SiMapSwipeWidgetProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<SiMapSwipeNorm | null>(null);

  const flushNorm = useCallback(() => {
    rafRef.current = null;
    if (pendingRef.current) {
      onNormChange(pendingRef.current);
      pendingRef.current = null;
    }
  }, [onNormChange]);

  const scheduleNorm = useCallback(
    (n: SiMapSwipeNorm) => {
      pendingRef.current = n;
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(flushNorm);
      }
    },
    [flushNorm],
  );

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (e.button !== 0) return;
      dragRef.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
      const box = rootRef.current?.getBoundingClientRect();
      if (box) scheduleNorm(normFromPointer(box, e.clientX, e.clientY));
    },
    [scheduleNorm],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      if (!dragRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      const box = rootRef.current?.getBoundingClientRect();
      if (!box) return;
      if (mode === 'vertical') {
        scheduleNorm({ ...norm, x: normFromPointer(box, e.clientX, e.clientY).x });
      } else if (mode === 'horizontal') {
        scheduleNorm({ ...norm, y: normFromPointer(box, e.clientX, e.clientY).y });
      } else {
        scheduleNorm(normFromPointer(box, e.clientX, e.clientY));
      }
    },
    [mode, norm, scheduleNorm],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent) => {
      if (!dragRef.current) return;
      dragRef.current = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      flushNorm();
    },
    [flushNorm],
  );

  if (!active) return null;

  const xPct = norm.x * 100;
  const yPct = norm.y * 100;

  return (
    <div ref={rootRef} className="si-map-swipe-widget" aria-label="Layer swipe compare">
      <div className="si-map-swipe-widget__labels" aria-hidden>
        <span className="si-map-swipe-widget__label si-map-swipe-widget__label--base">{currentLabel}</span>
        <span className="si-map-swipe-widget__label si-map-swipe-widget__label--compare">{compareLabel}</span>
      </div>

      <div
        className="si-map-swipe-toolbar"
        role="toolbar"
        aria-label="Swipe style"
        onPointerDown={e => e.stopPropagation()}
      >
        <button
          type="button"
          className={`si-map-swipe-toolbar__btn${mode === 'vertical' ? ' si-map-swipe-toolbar__btn--on' : ''}`}
          title="Vertical swipe bar"
          aria-label="Vertical swipe bar"
          aria-pressed={mode === 'vertical'}
          onClick={() => onModeChange('vertical')}
        >
          <i className="fa-solid fa-arrows-left-right" aria-hidden />
        </button>
        <button
          type="button"
          className={`si-map-swipe-toolbar__btn${mode === 'horizontal' ? ' si-map-swipe-toolbar__btn--on' : ''}`}
          title="Horizontal swipe bar"
          aria-label="Horizontal swipe bar"
          aria-pressed={mode === 'horizontal'}
          onClick={() => onModeChange('horizontal')}
        >
          <i className="fa-solid fa-arrows-up-down" aria-hidden />
        </button>
        <button
          type="button"
          className={`si-map-swipe-toolbar__btn${mode === 'spyglass' ? ' si-map-swipe-toolbar__btn--on' : ''}`}
          title="Spyglass lens"
          aria-label="Spyglass lens"
          aria-pressed={mode === 'spyglass'}
          onClick={() => onModeChange('spyglass')}
        >
          <i className="fa-solid fa-circle-half-stroke" aria-hidden />
        </button>
      </div>

      {mode === 'vertical' ? (
        <div
          className="si-map-swipe-divider si-map-swipe-divider--vertical"
          style={{ left: `${xPct}%` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          role="slider"
          aria-label="Vertical swipe position"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(xPct)}
        >
          <span className="si-map-swipe-divider__handle" aria-hidden>
            <i className="fa-solid fa-arrows-left-right" />
          </span>
        </div>
      ) : null}

      {mode === 'horizontal' ? (
        <div
          className="si-map-swipe-divider si-map-swipe-divider--horizontal"
          style={{ top: `${yPct}%` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          role="slider"
          aria-label="Horizontal swipe position"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(yPct)}
        >
          <span className="si-map-swipe-divider__handle" aria-hidden>
            <i className="fa-solid fa-arrows-up-down" />
          </span>
        </div>
      ) : null}

      {mode === 'spyglass' ? (
        <>
          <div
            className="si-map-swipe-spyglass"
            style={{
              left: `${xPct}%`,
              top: `${yPct}%`,
              width: SI_MAP_SWIPE_SPYGLASS_RADIUS_PX * 2,
              height: SI_MAP_SWIPE_SPYGLASS_RADIUS_PX * 2,
              marginLeft: -SI_MAP_SWIPE_SPYGLASS_RADIUS_PX,
              marginTop: -SI_MAP_SWIPE_SPYGLASS_RADIUS_PX,
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            role="presentation"
          />
          <div
            className="si-map-swipe-spyglass-drag"
            style={{ left: `${xPct}%`, top: `${yPct}%` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            aria-label="Drag spyglass"
          />
        </>
      ) : null}
    </div>
  );
}
