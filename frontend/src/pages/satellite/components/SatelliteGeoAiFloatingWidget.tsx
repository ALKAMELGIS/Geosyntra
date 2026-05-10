import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './satelliteGeoAiFloatingWidget.css';

const STORAGE_KEY = 'si-sat-geo-ai-widget-pos-v1';

type StoredPos = { x: number; y: number };

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function readStoredPos(): StoredPos | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as StoredPos).x === 'number' &&
      typeof (parsed as StoredPos).y === 'number'
    ) {
      return { x: (parsed as StoredPos).x, y: (parsed as StoredPos).y };
    }
  } catch {
    // ignore
  }
  return null;
}

function writeStoredPos(pos: StoredPos) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
  } catch {
    // ignore
  }
}

export type SatelliteGeoAiFloatingWidgetProps = {
  open: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  onRequestClose: () => void;
  children: React.ReactNode;
};

export function SatelliteGeoAiFloatingWidget({
  open,
  expanded,
  onToggleExpanded,
  onRequestClose,
  children,
}: SatelliteGeoAiFloatingWidgetProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    target: 'fab' | 'header';
    moved: number;
  } | null>(null);

  const [offset, setOffset] = useState<StoredPos>(() => readStoredPos() ?? { x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const stored = readStoredPos();
    if (stored) setOffset(stored);
  }, []);

  const clampOffsetToViewport = useCallback((next: StoredPos) => {
    const el = rootRef.current;
    if (!el) return next;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    const maxX = Math.max(margin, window.innerWidth - rect.width - margin);
    const maxY = Math.max(margin, window.innerHeight - rect.height - margin);
    const minX = margin - rect.width + 56;
    const minY = margin - rect.height + 56;
    return {
      x: clamp(next.x, minX, maxX),
      y: clamp(next.y, minY, maxY),
    };
  }, []);

  const onPointerDownFab = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originX: offset.x,
        originY: offset.y,
        target: 'fab',
        moved: 0,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setDragging(true);
    },
    [offset.x, offset.y],
  );

  const onPointerDownHeader = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('button')) return;
      e.preventDefault();
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originX: offset.x,
        originY: offset.y,
        target: 'header',
        moved: 0,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setDragging(true);
    },
    [offset.x, offset.y],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
      const next = clampOffsetToViewport({
        x: drag.originX + dx,
        y: drag.originY + dy,
      });
      setOffset(next);
    },
    [clampOffsetToViewport],
  );

  const endDrag = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      const wasFab = drag.target === 'fab';
      const moved = drag.moved;
      dragRef.current = null;
      setDragging(false);
      setOffset((prev) => {
        const clamped = clampOffsetToViewport(prev);
        writeStoredPos(clamped);
        return clamped;
      });
      if (wasFab && !expanded && moved < 8) {
        onToggleExpanded();
      }
    },
    [clampOffsetToViewport, expanded, onToggleExpanded],
  );

  useEffect(() => {
    if (!dragging) return;
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
    };
  }, [dragging, endDrag, onPointerMove]);

  const transformStyle = useMemo(
    () => ({ transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` }),
    [offset.x, offset.y],
  );

  if (!open) return null;

  return (
    <div
      ref={rootRef}
      className={`si-geo-ai-float${dragging ? ' si-geo-ai-float--dragging' : ''}`}
      style={transformStyle}
      role="region"
      aria-label="Geo AI Assistant"
    >
      <div className="si-geo-ai-float-inner">
        {expanded ? (
          <div className={`si-geo-ai-float-panel${dragging ? ' si-geo-ai-float-panel--dragging' : ''}`}>
            <div className="si-geo-ai-float-head" onPointerDown={onPointerDownHeader}>
              <div className="si-geo-ai-float-head-text">
                <div className="si-geo-ai-float-title">Geo AI Assistant</div>
                <div className="si-geo-ai-float-sub">AI Agent</div>
              </div>
              <div className="si-geo-ai-float-actions">
                <button
                  type="button"
                  className="si-geo-ai-float-icon-btn"
                  title="Minimize"
                  aria-label="Minimize Geo AI"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onToggleExpanded();
                  }}
                >
                  <i className="fa-solid fa-chevron-down" aria-hidden />
                </button>
                <button
                  type="button"
                  className="si-geo-ai-float-icon-btn"
                  title="Close"
                  aria-label="Close Geo AI"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onRequestClose();
                  }}
                >
                  <i className="fa-solid fa-xmark" aria-hidden />
                </button>
              </div>
            </div>
            <div className="si-geo-ai-float-body">{children}</div>
          </div>
        ) : (
          <button
            type="button"
            className="si-geo-ai-float-fab"
            title="Geo AI Assistant — AI Agent"
            aria-expanded={expanded}
            aria-label="Geo AI Assistant"
            onPointerDown={onPointerDownFab}
          >
            <span className="si-geo-ai-float-fab-label">Geo AI Assistant, AI Agent</span>
            <span className="si-geo-ai-float-fab-mark" aria-hidden>
              <i className="fa-solid fa-comments si-geo-ai-float-fab-mark-back" />
              <i className="fa-solid fa-comments si-geo-ai-float-fab-mark-front" />
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
