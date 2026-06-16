import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import type { SiLayerLegendRow } from '../symbologyHelpers';
import { clampLeftDockLegendOffset } from '../utils/siMapFloatingPanelLayout';
import {
  siMapDynamicLegendStackPosition,
  siMapLayerLegendOffsetStorageKey,
} from '../utils/siMapDynamicLegendLayout';

export type SiMapVectorLayerLegendProps = {
  layerKey: string;
  layerLabel: string;
  rows: SiLayerLegendRow[];
  stackIndex?: number;
  mapShell: HTMLElement | null;
  badge?: string;
};

export function SiMapVectorLayerLegend({
  layerKey,
  layerLabel,
  rows,
  stackIndex = 0,
  mapShell,
  badge = 'VECTOR',
}: SiMapVectorLayerLegendProps) {
  const dockRef = useRef<HTMLDivElement | null>(null);
  const offsetRef = useRef({ x: 0, y: 0 });
  const [legendOffset, setLegendOffset] = useState({ x: 0, y: 0 });
  const [legendDragging, setLegendDragging] = useState(false);
  const offsetStorageKey = siMapLayerLegendOffsetStorageKey(layerKey);
  offsetRef.current = legendOffset;

  useEffect(() => {
    offsetRef.current = { x: 0, y: 0 };
    setLegendOffset({ x: 0, y: 0 });
  }, [layerKey, layerLabel]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(offsetStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { x?: number; y?: number };
      if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
        const c = clampLeftDockLegendOffset(parsed.x, parsed.y);
        offsetRef.current = c;
        setLegendOffset(c);
      }
    } catch {
      /* ignore */
    }
  }, [offsetStorageKey, layerKey]);

  useLayoutEffect(() => {
    const dock = dockRef.current;
    if (!dock) return;
    const fixed = siMapDynamicLegendStackPosition(stackIndex);
    dock.style.top = `${fixed.top}px`;
    dock.style.left = `${fixed.left}px`;
  }, [stackIndex, layerKey]);

  const onLegendHeadPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
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
        setLegendOffset(
          clampLeftDockLegendOffset(start.ox + (ev.clientX - start.cx), start.oy + (ev.clientY - start.cy)),
        );
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
          const c = clampLeftDockLegendOffset(prev.x, prev.y);
          try {
            localStorage.setItem(offsetStorageKey, JSON.stringify(c));
          } catch {
            /* ignore */
          }
          return c;
        });
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
    },
    [offsetStorageKey],
  );

  if (!mapShell || !rows.length) return null;

  return createPortal(
    <div ref={dockRef} className="si-wms-index-class-legend-dock" dir="ltr">
      <div
        className={
          `si-wms-index-class-legend si-wms-index-class-legend--unified si-wms-index-class-legend--live` +
          (legendDragging ? ' si-wms-index-class-legend--dragging' : '')
        }
        role="region"
        aria-label={`${layerLabel} legend`}
        style={{ transform: `translate(${legendOffset.x}px, ${legendOffset.y}px)` }}
        data-si-map-layer-legend=""
        data-si-map-layer-legend-key={layerKey}
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
          <span className="si-wms-index-class-legend__badge si-wms-index-class-legend__badge--live">{badge}</span>
        </div>
        <div className="si-wms-index-class-legend__body si-wms-index-class-legend__body--composite">
          <div className="si-wms-index-class-legend__rows" role="list">
            {rows.map((row, i) => (
              <div key={`${row.label}-${row.color}-${i}`} className="si-wms-index-class-legend__row" role="listitem">
                <span
                  className="si-wms-index-class-legend__swatch"
                  style={{ background: row.color }}
                  title={row.color}
                  aria-hidden
                />
                <div className="si-wms-index-class-legend__row-main">
                  <span className="si-wms-index-class-legend__class-name">{row.label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>,
    mapShell,
  );
}
