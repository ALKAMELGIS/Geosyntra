import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AGENT_CHAT_PANEL_TITLE } from '../../../lib/agentChatCopy';
import './satelliteGeoAiFloatingWidget.css';

const STORAGE_KEY = 'si-sat-geo-ai-widget-pos-v2';
const STORAGE_SIZE_KEY = 'si-sat-geo-ai-widget-size-v2';

type StoredPos = { x: number; y: number };
type StoredSize = { w: number; h: number };
type ResizeHandleId = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function defaultSize(): StoredSize {
  if (typeof window === 'undefined') return { w: 340, h: 440 };
  const w = Math.min(360, Math.max(300, window.innerWidth - 48));
  const h = Math.min(520, Math.max(300, Math.round(window.innerHeight * 0.46)));
  return { w, h };
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

function readStoredSize(): StoredSize | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_SIZE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as StoredSize).w === 'number' &&
      typeof (parsed as StoredSize).h === 'number'
    ) {
      return { w: (parsed as StoredSize).w, h: (parsed as StoredSize).h };
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

function writeStoredSize(size: StoredSize) {
  try {
    window.localStorage.setItem(STORAGE_SIZE_KEY, JSON.stringify(size));
  } catch {
    // ignore
  }
}

function maxPanelSize(): StoredSize {
  if (typeof window === 'undefined') return { w: 720, h: 900 };
  return {
    w: Math.max(320, window.innerWidth - 16),
    h: Math.max(360, window.innerHeight - 24),
  };
}

function minPanelSize(): StoredSize {
  return { w: 280, h: 280 };
}

export type SatelliteGeoAiFloatingWidgetProps = {
  open: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  onRequestClose: () => void;
  children: React.ReactNode;
  /** Optional controls rendered in the panel title row (e.g. model picker icons). */
  floatHeadExtra?: React.ReactNode;
  /**
   * When true, expanded panel docks to the viewport right edge as a tall “insight rail”.
   * Default compact helper mode uses a left-anchored floating panel instead.
   */
  spatialWorkspace?: boolean;
};

export function SatelliteGeoAiFloatingWidget({
  open,
  expanded,
  onToggleExpanded,
  onRequestClose,
  children,
  floatHeadExtra,
  spatialWorkspace = false,
}: SatelliteGeoAiFloatingWidgetProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    target: 'fab' | 'panel';
    moved: number;
  } | null>(null);

  const resizeRef = useRef<{
    pointerId: number;
    handle: ResizeHandleId;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    startOx: number;
    startOy: number;
  } | null>(null);

  const [offset, setOffset] = useState<StoredPos>(() => readStoredPos() ?? { x: 0, y: 0 });
  const [panelSize, setPanelSize] = useState<StoredSize>(() => {
    const s = readStoredSize();
    if (!s) return defaultSize();
    const mn = minPanelSize();
    const mx = maxPanelSize();
    return {
      w: clamp(s.w, mn.w, mx.w),
      h: clamp(s.h, mn.h, mx.h),
    };
  });
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const spatialDockSnapDoneRef = useRef(false);
  const helperDockSnapDoneRef = useRef(false);

  useEffect(() => {
    const stored = readStoredPos();
    if (stored) setOffset(stored);
  }, []);

  const clampOffsetToViewport = useCallback(
    (next: StoredPos, size: StoredSize = panelSize) => {
      const el = rootRef.current;
      if (!el) return next;
      const w = size.w;
      const h = size.h;
      const marginX = 12;
      const marginTop = 52;
      const marginBottom = Math.max(72, 96);
      const maxX = Math.max(marginX, window.innerWidth - w - marginX);
      const maxY = Math.max(marginTop, window.innerHeight - h - marginBottom);
      const minX = marginX - w + 48;
      const minY = marginTop - h + 48;
      return {
        x: clamp(next.x, minX, maxX),
        y: clamp(next.y, minY, maxY),
      };
    },
    [panelSize.w, panelSize.h],
  );

  const clampSize = useCallback((s: StoredSize): StoredSize => {
    const mn = minPanelSize();
    const mx = maxPanelSize();
    return {
      w: clamp(s.w, mn.w, mx.w),
      h: clamp(s.h, mn.h, mx.h),
    };
  }, []);

  useEffect(() => {
    if (!open) {
      spatialDockSnapDoneRef.current = false;
      helperDockSnapDoneRef.current = false;
    }
  }, [open]);

  /** First expand in a session: optional dock (spatial = right rail; helper = compact left if no saved pos). */
  useEffect(() => {
    if (!open || !expanded) return;

    if (spatialWorkspace) {
      if (!spatialDockSnapDoneRef.current) {
        spatialDockSnapDoneRef.current = true;
        const tid = window.setTimeout(() => {
          const mx = maxPanelSize();
          const targetH = Math.min(Math.max(420, Math.round(window.innerHeight * 0.88)), mx.h);
          const targetW = Math.min(Math.max(360, Math.min(440, Math.round(window.innerWidth * 0.42))), mx.w);
          const sz = clampSize({ w: targetW, h: targetH });
          const margin = 14;
          const anchorLeft = 20;
          const targetX = Math.max(anchorLeft, window.innerWidth - sz.w - margin - anchorLeft);
          const nextPos = clampOffsetToViewport({ x: targetX, y: 56 }, sz);
          setPanelSize(sz);
          setOffset(nextPos);
          writeStoredSize(sz);
          writeStoredPos(nextPos);
        }, 0);
        return () => window.clearTimeout(tid);
      }
      return undefined;
    }

    if (helperDockSnapDoneRef.current) return undefined;
    helperDockSnapDoneRef.current = true;
    if (readStoredPos() !== null) return undefined;

    const tid = window.setTimeout(() => {
      const mx = maxPanelSize();
      const targetW = Math.min(Math.max(300, Math.round(window.innerWidth * 0.34)), Math.min(380, mx.w));
      const targetH = Math.min(Math.max(320, Math.round(window.innerHeight * 0.5)), Math.min(520, mx.h));
      const sz = clampSize({ w: targetW, h: targetH });
      const nextPos = clampOffsetToViewport({ x: 0, y: 0 }, sz);
      setPanelSize(sz);
      setOffset(nextPos);
      writeStoredSize(sz);
      writeStoredPos(nextPos);
    }, 0);
    return () => window.clearTimeout(tid);
  }, [open, expanded, spatialWorkspace, clampOffsetToViewport, clampSize]);

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

  const onPointerDownPanelMove = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('button') || target?.closest('.si-geo-ai-float-resize-handle')) return;
      e.preventDefault();
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originX: offset.x,
        originY: offset.y,
        target: 'panel',
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
      const next = clampOffsetToViewport(
        {
          x: drag.originX + dx,
          y: drag.originY + dy,
        },
        panelSize,
      );
      setOffset(next);
    },
    [clampOffsetToViewport, panelSize],
  );

  const endDrag = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      const wasFab = drag.target === 'fab';
      const moved = drag.moved;
      dragRef.current = null;
      setDragging(false);
      setOffset(prev => {
        const clamped = clampOffsetToViewport(prev, panelSize);
        writeStoredPos(clamped);
        return clamped;
      });
      if (wasFab && !expanded && moved < 8) {
        onToggleExpanded();
      }
    },
    [clampOffsetToViewport, expanded, onToggleExpanded, panelSize],
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

  const applyResizeDelta = useCallback(
    (clientX: number, clientY: number) => {
      const r = resizeRef.current;
      if (!r) return;
      const dx = clientX - r.startX;
      const dy = clientY - r.startY;

      let w = r.startW;
      let h = r.startH;
      let ox = r.startOx;
      let oy = r.startOy;

      switch (r.handle) {
        case 'e':
          w = r.startW + dx;
          break;
        case 'w':
          w = r.startW - dx;
          ox = r.startOx + dx;
          break;
        case 'n':
          h = r.startH - dy;
          break;
        case 's':
          h = r.startH + dy;
          break;
        case 'ne':
          w = r.startW + dx;
          h = r.startH - dy;
          break;
        case 'nw':
          w = r.startW - dx;
          ox = r.startOx + dx;
          h = r.startH - dy;
          break;
        case 'se':
          w = r.startW + dx;
          h = r.startH + dy;
          break;
        case 'sw':
          w = r.startW - dx;
          ox = r.startOx + dx;
          h = r.startH + dy;
          break;
        default:
          break;
      }

      const nextSize = clampSize({ w, h });
      let nextOx = ox;
      const nextOy = oy;
      if (nextSize.w !== w && (r.handle === 'w' || r.handle === 'nw' || r.handle === 'sw')) {
        nextOx = r.startOx + (r.startW - nextSize.w);
      }

      const clampedPos = clampOffsetToViewport({ x: nextOx, y: nextOy }, nextSize);
      setPanelSize(nextSize);
      setOffset(clampedPos);
    },
    [clampSize, clampOffsetToViewport],
  );

  const onResizePointerMove = useCallback(
    (e: PointerEvent) => {
      const r = resizeRef.current;
      if (!r || e.pointerId !== r.pointerId) return;
      applyResizeDelta(e.clientX, e.clientY);
    },
    [applyResizeDelta],
  );

  const endResize = useCallback(
    (e: PointerEvent) => {
      const r = resizeRef.current;
      if (!r || e.pointerId !== r.pointerId) return;
      resizeRef.current = null;
      setResizing(false);
      setPanelSize(sz => {
        const c = clampSize(sz);
        writeStoredSize(c);
        setOffset(o => {
          const clamped = clampOffsetToViewport(o, c);
          writeStoredPos(clamped);
          return clamped;
        });
        return c;
      });
    },
    [clampOffsetToViewport, clampSize],
  );

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent, handle: ResizeHandleId) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      resizeRef.current = {
        pointerId: e.pointerId,
        handle,
        startX: e.clientX,
        startY: e.clientY,
        startW: panelSize.w,
        startH: panelSize.h,
        startOx: offset.x,
        startOy: offset.y,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setResizing(true);
    },
    [offset.x, offset.y, panelSize.w, panelSize.h],
  );

  useEffect(() => {
    if (!resizing) return;
    window.addEventListener('pointermove', onResizePointerMove, { passive: true });
    window.addEventListener('pointerup', endResize);
    window.addEventListener('pointercancel', endResize);
    return () => {
      window.removeEventListener('pointermove', onResizePointerMove);
      window.removeEventListener('pointerup', endResize);
      window.removeEventListener('pointercancel', endResize);
    };
  }, [endResize, onResizePointerMove, resizing]);

  useEffect(() => {
    if (!expanded) return;
    const onWin = () => {
      setPanelSize(s => clampSize(s));
      setOffset(o => clampOffsetToViewport(o));
    };
    window.addEventListener('resize', onWin, { passive: true });
    return () => window.removeEventListener('resize', onWin);
  }, [expanded, clampOffsetToViewport, clampSize]);

  const transformStyle = useMemo(
    () => ({ transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` }),
    [offset.x, offset.y],
  );

  const panelStyle = useMemo(
    () =>
      ({
        width: `${panelSize.w}px`,
        height: `${panelSize.h}px`,
        maxWidth: 'none',
        maxHeight: 'none',
      }) as React.CSSProperties,
    [panelSize.w, panelSize.h],
  );

  const resizeHandles: Array<{ id: ResizeHandleId; className: string; label: string }> = useMemo(
    () => [
      { id: 'e', className: 'si-geo-ai-float-resize-handle si-geo-ai-float-resize-handle--e', label: 'Resize width from end' },
      { id: 'w', className: 'si-geo-ai-float-resize-handle si-geo-ai-float-resize-handle--w', label: 'Resize width from start' },
      { id: 'ne', className: 'si-geo-ai-float-resize-handle si-geo-ai-float-resize-handle--ne', label: 'Resize corner' },
      { id: 'nw', className: 'si-geo-ai-float-resize-handle si-geo-ai-float-resize-handle--nw', label: 'Resize corner' },
      { id: 'se', className: 'si-geo-ai-float-resize-handle si-geo-ai-float-resize-handle--se', label: 'Resize corner' },
      { id: 'sw', className: 'si-geo-ai-float-resize-handle si-geo-ai-float-resize-handle--sw', label: 'Resize corner' },
    ],
    [],
  );

  if (!open || typeof document === 'undefined') return null;

  const shell = (
    <div
      ref={rootRef}
      className={[
        'si-geo-ai-float',
        expanded && spatialWorkspace ? 'si-geo-ai-float--spatial-workspace' : '',
        dragging ? 'si-geo-ai-float--dragging' : '',
        resizing ? 'si-geo-ai-float--resizing' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={transformStyle}
      role="region"
      aria-label={AGENT_CHAT_PANEL_TITLE}
    >
      <div className="si-geo-ai-float-inner">
        {expanded ? (
          <div
            className={[
              'si-geo-ai-float-panel',
              'si-geo-ai-float-panel--sized',
              spatialWorkspace ? 'si-geo-ai-float-panel--spatial-workspace' : '',
              dragging ? 'si-geo-ai-float-panel--dragging' : '',
              resizing ? 'si-geo-ai-float-panel--resizing' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={panelStyle}
          >
            <div className="si-geo-ai-float-head" onPointerDown={onPointerDownPanelMove}>
              <div className="si-geo-ai-float-head-main">
                <div className="si-geo-ai-float-head-text">
                  <div className="si-geo-ai-float-title">{AGENT_CHAT_PANEL_TITLE}</div>
                  {spatialWorkspace ? (
                    <div className="si-geo-ai-float-sub">Spatial workspace · map-centric canvas</div>
                  ) : null}
                </div>
                {floatHeadExtra ? (
                  <div
                    className="si-geo-ai-float-head-slot"
                    onPointerDown={e => e.stopPropagation()}
                    onClick={e => e.stopPropagation()}
                  >
                    {floatHeadExtra}
                  </div>
                ) : null}
              </div>
              <div className="si-geo-ai-float-actions">
                <button
                  type="button"
                  className="si-geo-ai-float-icon-btn"
                  title="Minimize"
                  aria-label={`Minimize ${AGENT_CHAT_PANEL_TITLE}`}
                  onClick={ev => {
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
                  aria-label={`Close ${AGENT_CHAT_PANEL_TITLE}`}
                  onClick={ev => {
                    ev.stopPropagation();
                    onRequestClose();
                  }}
                >
                  <i className="fa-solid fa-xmark" aria-hidden />
                </button>
              </div>
            </div>
            <div
              className="si-geo-ai-float-drag-rail"
              onPointerDown={onPointerDownPanelMove}
              aria-label={`Drag to move ${AGENT_CHAT_PANEL_TITLE} panel`}
            />
            <div className="si-geo-ai-float-body">{children}</div>
            <div
              className="si-geo-ai-float-edge-drag si-geo-ai-float-edge-drag--left"
              onPointerDown={onPointerDownPanelMove}
              aria-hidden
            />
            <div
              className="si-geo-ai-float-edge-drag si-geo-ai-float-edge-drag--right"
              onPointerDown={onPointerDownPanelMove}
              aria-hidden
            />
            {resizeHandles.map(h => (
              <button
                key={h.id}
                type="button"
                className={h.className}
                aria-label={h.label}
                title={h.label}
                onPointerDown={ev => onResizePointerDown(ev, h.id)}
              />
            ))}
          </div>
        ) : (
          <button
            type="button"
            className="si-geo-ai-float-fab"
            title={`${AGENT_CHAT_PANEL_TITLE} — tap to open (drag to move)`}
            aria-expanded={expanded}
            aria-label={`${AGENT_CHAT_PANEL_TITLE} assistant`}
            onPointerDown={onPointerDownFab}
          >
            <span className="si-geo-ai-float-fab-label">{AGENT_CHAT_PANEL_TITLE}</span>
            <span className="si-geo-ai-float-fab-mark" aria-hidden>
              <i className="fa-solid fa-wand-magic-sparkles si-geo-ai-float-fab-mark-front" />
            </span>
          </button>
        )}
      </div>
    </div>
  );

  return createPortal(shell, document.body);
}
