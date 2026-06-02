import type { RefObject } from 'react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import type { Map as MapboxMap } from 'mapbox-gl';
import { SiMapLayerSwipeRuntime, type SiMapLayerSwipeState } from '../utils/siMapLayerSwipeRuntime';
import {
  filterSiMapSwipeComparableKeys,
  type SiMapSwipeLayerEntry,
} from '../utils/siMapLayerSwipeCatalog';
import './SiMapLayerSwipeOverlay.css';

export type SiMapLayerSwipeOverlayProps = {
  mapRef: RefObject<{ getMap?: () => MapboxMap } | MapboxMap | null>;
  mapLoaded: boolean;
  /** When false, swipe runtime stays detached. */
  enabled?: boolean;
  catalog: SiMapSwipeLayerEntry[];
  state: SiMapLayerSwipeState;
  onPositionChange: (position: number) => void;
  onSwipeProjectionLock?: (locked: boolean) => void;
  /** Show comparison percentage while dragging the divider. */
  showPercentWhileDragging?: boolean;
};

function resolveMapFromRef(
  mapRef: RefObject<{ getMap?: () => MapboxMap } | MapboxMap | null>,
): MapboxMap | null {
  const raw = mapRef.current;
  if (!raw) return null;
  if (typeof (raw as { getMap?: () => MapboxMap }).getMap === 'function') {
    return (raw as { getMap: () => MapboxMap }).getMap() ?? null;
  }
  return raw as MapboxMap;
}

function resolveMapShell(map: MapboxMap | null): HTMLElement | null {
  if (!map) return null;
  const canvasHost = map.getCanvasContainer?.();
  if (!canvasHost) return null;
  return (canvasHost.closest('.si-map-container') as HTMLElement | null) ?? canvasHost.parentElement;
}

export function SiMapLayerSwipeOverlay({
  mapRef,
  mapLoaded,
  enabled = true,
  catalog,
  state,
  onPositionChange,
  onSwipeProjectionLock,
  showPercentWhileDragging = true,
}: SiMapLayerSwipeOverlayProps) {
  const runtimeRef = useRef<SiMapLayerSwipeRuntime | null>(null);
  const [shell, setShell] = useState<HTMLElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [livePosition, setLivePosition] = useState(state.position);
  const dragRef = useRef<{ pointerId: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingPctRef = useRef<number | null>(null);

  const swipeReady =
    mapLoaded &&
    state.active &&
    filterSiMapSwipeComparableKeys(state.leadingKeys).length > 0 &&
    filterSiMapSwipeComparableKeys(state.trailingKeys).length > 0;

  useLayoutEffect(() => {
    if (!mapLoaded) {
      setShell(null);
      return;
    }
    const map = resolveMapFromRef(mapRef);
    setShell(resolveMapShell(map));
  }, [mapLoaded, mapRef]);

  useEffect(() => {
    if (!dragging) setLivePosition(state.position);
  }, [state.position, dragging]);

  useEffect(() => {
    if (!mapLoaded || !enabled) {
      runtimeRef.current?.detach();
      return;
    }
    if (!runtimeRef.current) runtimeRef.current = new SiMapLayerSwipeRuntime();
    const runtime = runtimeRef.current;
    runtime.setInitOptions({ onSwipeProjectionLock });
    const map = resolveMapFromRef(mapRef);
    runtime.attach(map);
    return () => runtime.detach();
  }, [mapRef, mapLoaded, enabled, onSwipeProjectionLock]);

  useEffect(() => {
    runtimeRef.current?.setCatalog(catalog);
  }, [catalog]);

  useEffect(() => {
    runtimeRef.current?.setState(state);
  }, [state]);

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      runtimeRef.current?.destroy();
    },
    [],
  );

  const flushPosition = useCallback(() => {
    rafRef.current = null;
    if (pendingPctRef.current == null) return;
    onPositionChange(pendingPctRef.current);
    pendingPctRef.current = null;
  }, [onPositionChange]);

  const schedulePosition = useCallback(
    (pct: number) => {
      pendingPctRef.current = pct;
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(flushPosition);
      }
    },
    [flushPosition],
  );

  const positionToPct = useCallback(
    (clientX: number, clientY: number, rect: DOMRect): number => {
      if (state.orientation === 'vertical') {
        const x = clientX - rect.left;
        return Math.max(0, Math.min(100, (x / Math.max(1, rect.width)) * 100));
      }
      const y = clientY - rect.top;
      return Math.max(0, Math.min(100, (y / Math.max(1, rect.height)) * 100));
    },
    [state.orientation],
  );

  const applyDragPosition = useCallback(
    (pct: number) => {
      setLivePosition(pct);
      runtimeRef.current?.previewPosition(pct);
      schedulePosition(pct);
    },
    [schedulePosition],
  );

  const onDragPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!swipeReady || !shell) return;
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = { pointerId: e.pointerId };
      setDragging(true);
    },
    [shell, swipeReady],
  );

  const onDragPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId || !shell) return;
      e.preventDefault();
      const rect = shell.getBoundingClientRect();
      applyDragPosition(positionToPct(e.clientX, e.clientY, rect));
    },
    [shell, positionToPct, applyDragPosition],
  );

  const endDrag = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) {
      dragRef.current = null;
      setDragging(false);
    }
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  if (!swipeReady || !shell) return null;

  const ratio = livePosition / 100;
  const isVertical = state.orientation === 'vertical';
  const showDivider = state.dividerVisible !== false;
  const dividerStyle = isVertical ? { left: `${ratio * 100}%` } : { top: `${ratio * 100}%` };
  const handleStyle = isVertical
    ? { left: `${ratio * 100}%`, top: '50%' }
    : { left: '50%', top: `${ratio * 100}%` };

  return createPortal(
    <div
      className={
        `si-map-layer-swipe-divider si-map-layer-swipe-divider--${state.orientation}` +
        (dragging ? ' si-map-layer-swipe-divider--dragging' : '') +
        (!showDivider ? ' si-map-layer-swipe-divider--divider-hidden' : '')
      }
      role="presentation"
      data-si-map-layer-swipe=""
    >
      {showDivider ? (
        <>
          <div
            className="si-map-layer-swipe-divider__hit"
            style={dividerStyle}
            onPointerDown={onDragPointerDown}
            onPointerMove={onDragPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            aria-hidden
          />
          <div className="si-map-layer-swipe-divider__line" style={dividerStyle} aria-hidden />
          <button
            type="button"
            className="si-map-layer-swipe-divider__handle"
            style={handleStyle}
            aria-label="Drag to compare layers on the same map"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(livePosition)}
            aria-orientation={isVertical ? 'vertical' : 'horizontal'}
            role="slider"
            onPointerDown={onDragPointerDown}
            onPointerMove={onDragPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <span className="si-map-layer-swipe-divider__grip" aria-hidden>
              <i />
              <i />
              <i />
            </span>
          </button>
        </>
      ) : null}
      {showDivider && showPercentWhileDragging && dragging ? (
        <span className="si-map-layer-swipe-divider__badge" style={handleStyle}>
          {Math.round(livePosition)}%
        </span>
      ) : null}
    </div>,
    shell,
  );
}
