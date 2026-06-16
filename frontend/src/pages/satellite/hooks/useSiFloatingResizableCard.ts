import { useCallback, useEffect, useRef, useState } from 'react';
import { clampFixedPanelPosition } from '../utils/siMapFloatingPanelLayout';

export type SiFloatingCardLayout = { left: number; top: number; w: number; h: number };

type ResizeHandleId = 'e' | 'w' | 's' | 'n' | 'se' | 'sw' | 'ne' | 'nw';

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function readStoredLayout(key: string): SiFloatingCardLayout | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<SiFloatingCardLayout> | null;
    if (
      o &&
      typeof o === 'object' &&
      typeof o.left === 'number' &&
      typeof o.top === 'number' &&
      typeof o.w === 'number' &&
      typeof o.h === 'number'
    ) {
      return { left: o.left, top: o.top, w: o.w, h: o.h };
    }
    localStorage.removeItem(key);
  } catch {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
  return null;
}

function writeStoredLayout(key: string, layout: SiFloatingCardLayout) {
  try {
    localStorage.setItem(key, JSON.stringify(layout));
  } catch {
    /* ignore */
  }
}

export type UseSiFloatingResizableCardOptions = {
  storageKey: string;
  enabled: boolean;
  defaultSize: () => { w: number; h: number };
  defaultPosition: (size: { w: number; h: number }) => { left: number; top: number };
  minSize?: { w: number; h: number };
  maxSize?: () => { w: number; h: number };
};

export function useSiFloatingResizableCard({
  storageKey,
  enabled,
  defaultSize,
  defaultPosition,
  minSize = { w: 300, h: 340 },
  maxSize,
}: UseSiFloatingResizableCardOptions) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<SiFloatingCardLayout>(() => {
    const stored = readStoredLayout(storageKey);
    if (stored) return stored;
    const size = defaultSize();
    const pos = defaultPosition(size);
    return { ...pos, ...size };
  });
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);

  const dragRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const resizeRef = useRef<{
    handle: ResizeHandleId;
    x: number;
    y: number;
    layout: SiFloatingCardLayout;
  } | null>(null);

  const clampLayout = useCallback(
    (next: SiFloatingCardLayout | null | undefined): SiFloatingCardLayout => {
      const size = defaultSize();
      const fallbackPos = defaultPosition(size);
      const base: SiFloatingCardLayout =
        next &&
        typeof next.left === 'number' &&
        typeof next.top === 'number' &&
        typeof next.w === 'number' &&
        typeof next.h === 'number'
          ? next
          : { ...fallbackPos, ...size };
      const max = maxSize?.() ?? {
        w: typeof window !== 'undefined' ? window.innerWidth - 24 : 900,
        h: typeof window !== 'undefined' ? window.innerHeight - 24 : 900,
      };
      const w = clamp(base.w, minSize.w, max.w);
      const h = clamp(base.h, minSize.h, max.h);
      const pos = clampFixedPanelPosition(base.left, base.top, w, h);
      return { left: pos.left, top: pos.top, w, h };
    },
    [defaultPosition, defaultSize, maxSize, minSize.h, minSize.w],
  );

  const persistLayout = useCallback(
    (next: SiFloatingCardLayout) => {
      const c = clampLayout(next);
      setLayout(c);
      writeStoredLayout(storageKey, c);
      return c;
    },
    [clampLayout, storageKey],
  );

  const resetLayout = useCallback(() => {
    const size = defaultSize();
    const pos = defaultPosition(size);
    persistLayout({ ...pos, ...size });
  }, [defaultPosition, defaultSize, persistLayout]);

  useEffect(() => {
    if (!enabled) return;
    const stored = readStoredLayout(storageKey);
    if (stored) {
      setLayout(clampLayout(stored));
      return;
    }
    const size = defaultSize();
    const pos = defaultPosition(size);
    setLayout(clampLayout({ ...pos, ...size }));
  }, [enabled, storageKey, clampLayout, defaultPosition, defaultSize]);

  useEffect(() => {
    if (!enabled) return;
    const onWin = () => setLayout(prev => clampLayout(prev));
    window.addEventListener('resize', onWin, { passive: true });
    return () => window.removeEventListener('resize', onWin);
  }, [enabled, clampLayout]);

  const onDragPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest('button')) return;
      dragRef.current = { x: e.clientX, y: e.clientY, left: layout.left, top: layout.top };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setDragging(true);
      e.preventDefault();
    },
    [layout.left, layout.top],
  );

  const onDragPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.x;
      const dy = e.clientY - dragRef.current.y;
      setLayout(prev =>
        clampLayout({
          ...prev,
          left: dragRef.current!.left + dx,
          top: dragRef.current!.top + dy,
        }),
      );
    },
    [clampLayout],
  );

  const endDrag = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return;
      dragRef.current = null;
      setDragging(false);
      setLayout(prev => persistLayout(prev));
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [persistLayout],
  );

  const onResizePointerDown = useCallback(
    (handle: ResizeHandleId) => (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      resizeRef.current = { handle, x: e.clientX, y: e.clientY, layout: { ...layout } };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setResizing(true);
    },
    [layout],
  );

  useEffect(() => {
    if (!resizing) return;
    const onMove = (e: PointerEvent) => {
      const r = resizeRef.current;
      if (!r) return;
      const dx = e.clientX - r.x;
      const dy = e.clientY - r.y;
      let { left, top, w, h } = r.layout;
      switch (r.handle) {
        case 'e':
          w += dx;
          break;
        case 'w':
          w -= dx;
          left += dx;
          break;
        case 's':
          h += dy;
          break;
        case 'n':
          h -= dy;
          top += dy;
          break;
        case 'se':
          w += dx;
          h += dy;
          break;
        case 'sw':
          w -= dx;
          left += dx;
          h += dy;
          break;
        case 'ne':
          w += dx;
          h -= dy;
          top += dy;
          break;
        case 'nw':
          w -= dx;
          left += dx;
          h -= dy;
          top += dy;
          break;
        default:
          break;
      }
      setLayout(clampLayout({ left, top, w, h }));
    };
    const onUp = () => {
      if (!resizeRef.current) return;
      resizeRef.current = null;
      setResizing(false);
      setLayout(prev => {
        persistLayout(prev);
        return prev;
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [resizing, clampLayout, persistLayout]);

  const panelStyle: React.CSSProperties = {
    position: 'fixed',
    left: layout.left,
    top: layout.top,
    width: layout.w,
    height: layout.h,
    maxWidth: 'none',
    maxHeight: 'none',
  };

  const resizeHandles: Array<{ id: ResizeHandleId; className: string; label: string }> = [
    { id: 'e', className: 'si-qdash-resize si-qdash-resize--e', label: 'Resize width' },
    { id: 'w', className: 'si-qdash-resize si-qdash-resize--w', label: 'Resize width' },
    { id: 's', className: 'si-qdash-resize si-qdash-resize--s', label: 'Resize height' },
    { id: 'n', className: 'si-qdash-resize si-qdash-resize--n', label: 'Resize height' },
    { id: 'se', className: 'si-qdash-resize si-qdash-resize--se', label: 'Resize corner' },
    { id: 'sw', className: 'si-qdash-resize si-qdash-resize--sw', label: 'Resize corner' },
    { id: 'ne', className: 'si-qdash-resize si-qdash-resize--ne', label: 'Resize corner' },
    { id: 'nw', className: 'si-qdash-resize si-qdash-resize--nw', label: 'Resize corner' },
  ];

  return {
    panelRef,
    panelStyle,
    dragging,
    resizing,
    resetLayout,
    onDragPointerDown,
    onDragPointerMove,
    endDrag,
    onResizePointerDown,
    resizeHandles,
  };
}
