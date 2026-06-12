import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Map as MapboxMap, MapMouseEvent } from 'mapbox-gl';
import { applyAgroCloudMapboxBranding } from '../utils/agroCloudMapboxMouseBranding';
import { attachSiMapGlobeElevationZoomWheel } from '../utils/siMapGlobeZoom';
import { SI_MAP_RIGHT_DRAG_ELEVATION_COMMIT_PITCH } from '../utils/siMapRightDragElevation';
import type { SiMapTerrainSettings } from '../utils/siMapProjectionTerrain';

const SI_GLOBE_FREE_CAMERA_TERRAIN_PITCH = 25;
const SI_MAP_RIGHT_DRAG_ELEVATION_EXIT_PITCH = 8;

type SiRightDragElevationReleaseAction =
  | { type: 'noop-release' }
  | { type: 'commit3d-interactive' }
  | { type: 'exit2d-interactive' }
  | { type: 'snap2d-flat' }
  | { type: 'finalize3d-orbit' };

function resolveSiRightDragElevationReleaseAction(opts: {
  startedFrom2dDock: boolean;
  elevation3dActive: boolean;
  moved: boolean;
  pitchNow: number;
}): SiRightDragElevationReleaseAction {
  if (!opts.moved) return { type: 'noop-release' };
  if (opts.startedFrom2dDock && !opts.elevation3dActive) {
    return opts.pitchNow >= SI_MAP_RIGHT_DRAG_ELEVATION_COMMIT_PITCH
      ? { type: 'commit3d-interactive' }
      : { type: 'snap2d-flat' };
  }
  if (!opts.elevation3dActive && opts.pitchNow <= SI_MAP_RIGHT_DRAG_ELEVATION_EXIT_PITCH) {
    return { type: 'exit2d-interactive' };
  }
  if (opts.elevation3dActive) return { type: 'finalize3d-orbit' };
  return { type: 'noop-release' };
}

function siMapFinalizeRightDragTerrainExaggeration(
  _map: MapboxMap,
  _terrain: SiMapTerrainSettings,
  _pitch: number,
): void {
  /* GitHub terrain stack handles exaggeration via applySiMapTerrain */
}

function siMapView3dOrbitModeActive(
  elevationDock3d: boolean,
  pitchDeg: number,
): boolean {
  return elevationDock3d || pitchDeg >= SI_GLOBE_FREE_CAMERA_TERRAIN_PITCH;
}

function shouldBlockSiMapContextMenuToggle3D(opts: {
  elevationDock3d: boolean;
  mapDrawTool: string;
}): boolean {
  if (opts.elevationDock3d) return false;
  return opts.mapDrawTool !== 'move';
}
import { MAPBOX_NAVIGATION_PROPS, MAP_MOUSE_BEHAVIOR_SPEC } from '../utils/MapMouseBehavior';
import {
  clampSiViewStateForProjection,
  configureSiMapCameraControlsForView,
  readSiMapCamera,
  siMapApplyCameraOrbitDrag,
  siMapBeginCameraOrbitDragRight3d,
  siMapEndCameraOrbitDrag,
  siMapShouldStartCameraOrbitDragRight3d,
  type SiMapProjectionMode,
  type SiMapTerrainSettings,
} from '../utils/siMapProjectionTerrain';
import {
  commitSiMapUserCameraFromMap,
  markSiMapManualOrbitCooldown,
} from '../utils/siMapUserCameraAuthority';

export type AgroCloudMapboxDrawToolGuards = {
  mapDrawTool: string;
  polygonRingLength: number;
  hasPolylineStart: boolean;
  hasCircleRefineDraft: boolean;
  hasRectCirclePreview: boolean;
};

type MapLayerPointerEvent = {
  lngLat: { lng: number; lat: number };
  originalEvent?: MouseEvent | TouchEvent;
};

export type AgroCloudMapboxMouseHostOptions = {
  setViewState: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  getViewState: () => Record<string, unknown>;
  getMapInstance: () => MapboxMap | null | undefined;
  /** Synced with SiMapGlobe2D3DToggle `is3d` / Return to 2D · Switch to 3D */
  elevationViewActive: boolean;
  elevationViewActiveRef: React.MutableRefObject<boolean>;
  mapElevationTransitioningRef: React.MutableRefObject<boolean>;
  applyMapElevationViewRef: React.MutableRefObject<
    (
      next: boolean,
      opts?: {
        fromInteractiveTilt?: boolean;
        fromAutoZoom?: boolean;
        contextMenuToggle?: boolean;
        pivotCenter?: { lng: number; lat: number };
      },
    ) => void
  >;
  applySiElevationCrossfadeVeil: (opacity: number) => void;
  siTerrainSettingsRef: React.MutableRefObject<SiMapTerrainSettings>;
  mapProjectionModeRef: React.MutableRefObject<SiMapProjectionMode>;
  syncGlobeFreeCamera: () => void;
  syncViewStateFromMapCamera: () => void;
  syncMapNavigationFromState: () => void;
  getDrawToolGuards: () => AgroCloudMapboxDrawToolGuards;
  setCameraOrbitDraggingActive: (active: boolean) => void;
  cameraOrbitDraggingRef: React.MutableRefObject<boolean>;
  onClearIdentifyPointer?: () => void;
  onClearDrawContextMenu?: () => void;
  onOrbitDragMoved?: () => void;
  onCameraOrbitEnd?: () => void;
  getMapCursor?: () => string;
  onPointerDownAfterCamera?: (evt: MapLayerPointerEvent) => void;
  onPointerMoveAfterCamera?: (evt: MapLayerPointerEvent) => void;
  onContextMenuAfterCamera?: (evt: MapLayerPointerEvent) => void;
  /** Right-click (no drag) toggles 2D ↔ 3D at `lngLat` — pairs with SiMapGlobe2D3DToggle. */
  onContextMenuToggle3D?: (center: { lng: number; lat: number }) => void;
  isMapLoaded?: boolean;
};

export type AgroCloudMapboxMouseBehavior = ReturnType<typeof useAgroCloudMapboxMouseHost>;

/** Alias used in AgroCloud map integrations. */
export type MouseBehavior = AgroCloudMapboxMouseBehavior;

function preventMapEvent(orig: MouseEvent | TouchEvent | undefined): void {
  try {
    orig?.preventDefault?.();
    orig?.stopPropagation?.();
  } catch {
    /* ignore */
  }
}

/** Suppress the browser menu only — do not stop propagation (Mapbox dragRotate needs the event chain). */
function suppressBrowserContextMenuOnly(ev: Event): void {
  try {
    ev.preventDefault();
  } catch {
    /* ignore */
  }
}

/**
 * AgroCloud / GeoSyntra Mapbox mouse host — 2D nadir ↔ 3D globe camera behavior.
 * Pairs with SiMapGlobe2D3DToggle (Switch to 3D globe view / Return to 2D nadir view).
 */
export function useAgroCloudMapboxMouseHost(options: AgroCloudMapboxMouseHostOptions) {
  const {
    setViewState,
    getMapInstance,
    elevationViewActive,
    elevationViewActiveRef,
    mapElevationTransitioningRef,
    applyMapElevationViewRef,
    applySiElevationCrossfadeVeil,
    siTerrainSettingsRef,
    mapProjectionModeRef,
    syncGlobeFreeCamera,
    syncViewStateFromMapCamera,
    syncMapNavigationFromState,
    getDrawToolGuards,
    setCameraOrbitDraggingActive,
    onClearIdentifyPointer,
    onClearDrawContextMenu,
    onOrbitDragMoved,
    onCameraOrbitEnd,
    getMapCursor,
    onPointerDownAfterCamera,
    onPointerMoveAfterCamera,
    onContextMenuAfterCamera,
    onContextMenuToggle3D,
    isMapLoaded = false,
  } = options;

  const siCameraOrbitDragRef = useRef<{
    startX: number;
    startY: number;
    bearing0: number;
    pitch0: number;
    moved: boolean;
  } | null>(null);
  const siRightDragTilt2dRef = useRef(false);
  const siCameraOrbitSkyRafRef = useRef<number | null>(null);
  const siRightDragPointerIdRef = useRef<number | null>(null);
  const siRightDragCaptureElRef = useRef<HTMLElement | null>(null);
  const siRightDragMovedRef = useRef(false);
  /** 3D right-drag orbit (bearing + pitch + viewing angle). */
  const siRightOrbit3dRef = useRef(false);

  const isCameraOrbitActive = useCallback(() => siCameraOrbitDragRef.current !== null, []);

  const resolveView3dOrbit = useCallback(
    (pitchDeg?: number) => {
      let pitch = pitchDeg ?? 0;
      if (pitchDeg == null) {
        try {
          pitch = getMapInstance()?.getPitch() ?? 0;
        } catch {
          pitch = 0;
        }
      }
      return siMapView3dOrbitModeActive(elevationViewActiveRef.current, pitch, {
        globeProjection: mapProjectionModeRef.current === 'globe',
      });
    },
    [getMapInstance],
  );

  const releaseRightDragPointerCapture = useCallback(() => {
    const el = siRightDragCaptureElRef.current;
    const pid = siRightDragPointerIdRef.current;
    siRightDragCaptureElRef.current = null;
    siRightDragPointerIdRef.current = null;
    if (el == null || pid == null) return;
    try {
      if (el.hasPointerCapture?.(pid)) {
        el.releasePointerCapture(pid);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const beginRight3dOrbitDrag = useCallback(
    (map: MapboxMap, orig: MouseEvent) => {
      onClearIdentifyPointer?.();
      setCameraOrbitDraggingActive(true);
      siRightOrbit3dRef.current = true;
      siRightDragTilt2dRef.current = !elevationViewActiveRef.current;
      siCameraOrbitDragRef.current = siMapBeginCameraOrbitDragRight3d(
        map,
        orig.clientX,
        orig.clientY,
      );
      try {
        const canvas = map.getCanvas?.() as HTMLElement | undefined;
        if (canvas && orig.pointerId != null) {
          canvas.setPointerCapture(orig.pointerId);
          siRightDragCaptureElRef.current = canvas;
          siRightDragPointerIdRef.current = orig.pointerId;
        }
      } catch {
        /* ignore */
      }
    },
    [elevationViewActiveRef, onClearIdentifyPointer, setCameraOrbitDraggingActive],
  );

  const tryStartCameraPointerDown = useCallback(
    (orig: MouseEvent | undefined, map: MapboxMap): boolean => {
      if (!orig || !('button' in orig)) return false;
      const guards = getDrawToolGuards();
      let pitch = 0;
      try {
        pitch = map.getPitch();
      } catch {
        /* ignore */
      }
      const globeProjection = mapProjectionModeRef.current === 'globe';
      const view3d = siMapView3dOrbitModeActive(elevationViewActiveRef.current, pitch, {
        globeProjection,
      });

      if (
        orig.button === 2 &&
        siMapShouldStartCameraOrbitDragRight3d({
          button: orig.button,
          shiftKey: orig.shiftKey,
          view3dActive: view3d,
          globeProjection,
          ...guards,
        })
      ) {
        beginRight3dOrbitDrag(map, orig);
        preventMapEvent(orig);
        return true;
      }

      return false;
    },
    [beginRight3dOrbitDrag, elevationViewActiveRef, getDrawToolGuards, mapProjectionModeRef],
  );

  const applySiCameraOrbitFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const session = siCameraOrbitDragRef.current;
      if (!session) return;
      const map = getMapInstance();
      if (!map) return;

      siMapApplyCameraOrbitDrag(map, session, clientX, clientY);
      commitSiMapUserCameraFromMap(map, 'orbit-drag');
      syncViewStateFromMapCamera();
    },
    [getMapInstance, syncViewStateFromMapCamera],
  );

  const endCameraOrbitDrag = useCallback(
    (od: NonNullable<typeof siCameraOrbitDragRef.current>) => {
      const mapOrbit = getMapInstance();
      const startedFrom2dDock = siRightDragTilt2dRef.current;
      const pitchNow = mapOrbit?.getPitch?.() ?? 0;
      const elev3dActive = elevationViewActiveRef.current;
      const view3dOrbit = resolveView3dOrbit(pitchNow);
      siCameraOrbitDragRef.current = null;
      siRightDragTilt2dRef.current = false;
      siRightOrbit3dRef.current = false;
      releaseRightDragPointerCapture();
      setCameraOrbitDraggingActive(false);
      if (siCameraOrbitSkyRafRef.current != null) {
        cancelAnimationFrame(siCameraOrbitSkyRafRef.current);
        siCameraOrbitSkyRafRef.current = null;
      }

      const action = resolveSiRightDragElevationReleaseAction({
        startedFrom2dDock,
        elevation3dActive: elev3dActive,
        moved: od.moved,
        pitchNow,
      });

      switch (action.type) {
        case 'commit3d-interactive':
          siMapEndCameraOrbitDrag(mapOrbit, { view3dOrbit: true });
          if (od.moved) {
            markSiMapManualOrbitCooldown();
            commitSiMapUserCameraFromMap(mapOrbit, 'orbit-drag');
          }
          applyMapElevationViewRef.current(true, { fromInteractiveTilt: true });
          break;
        case 'exit2d-interactive':
          siMapEndCameraOrbitDrag(mapOrbit, { view3dOrbit: false });
          if (od.moved) {
            markSiMapManualOrbitCooldown();
            commitSiMapUserCameraFromMap(mapOrbit, 'orbit-drag');
          }
          applyMapElevationViewRef.current(false, { fromInteractiveTilt: true });
          break;
        case 'snap2d-flat':
          applySiElevationCrossfadeVeil(0);
          mapElevationTransitioningRef.current = false;
          if (od.moved && mapOrbit) {
            markSiMapManualOrbitCooldown();
            try {
              const cam = readSiMapCamera(mapOrbit);
              mapOrbit.jumpTo({
                center: [cam.longitude, cam.latitude],
                zoom: cam.zoom,
                bearing: cam.bearing,
                pitch: 0,
                offset: [0, 0],
                duration: 0,
              });
            } catch {
              /* ignore */
            }
            commitSiMapUserCameraFromMap(mapOrbit, 'orbit-drag');
          }
          siMapEndCameraOrbitDrag(mapOrbit, { view3dOrbit: false });
          break;
        case 'finalize3d-orbit':
          siMapFinalizeRightDragTerrainExaggeration(
            mapOrbit!,
            siTerrainSettingsRef.current,
            pitchNow,
          );
          applySiElevationCrossfadeVeil(0);
          mapElevationTransitioningRef.current = false;
          if (od.moved) {
            markSiMapManualOrbitCooldown();
            commitSiMapUserCameraFromMap(mapOrbit, 'orbit-drag');
          }
          siMapEndCameraOrbitDrag(mapOrbit, { view3dOrbit });
          syncGlobeFreeCamera();
          break;
        case 'noop-release':
          applySiElevationCrossfadeVeil(0);
          mapElevationTransitioningRef.current = false;
          if (od.moved) {
            markSiMapManualOrbitCooldown();
            commitSiMapUserCameraFromMap(mapOrbit, 'orbit-drag');
          }
          siMapEndCameraOrbitDrag(mapOrbit, { view3dOrbit });
          break;
        default:
          break;
      }

      siRightDragMovedRef.current = od.moved;

      syncViewStateFromMapCamera();
      syncMapNavigationFromState();
      onCameraOrbitEnd?.();
      if (od.moved) onOrbitDragMoved?.();
    },
    [
      applyMapElevationViewRef,
      applySiElevationCrossfadeVeil,
      elevationViewActiveRef,
      getMapInstance,
      mapElevationTransitioningRef,
      mapProjectionModeRef,
      onCameraOrbitEnd,
      onOrbitDragMoved,
      releaseRightDragPointerCapture,
      setCameraOrbitDraggingActive,
      setViewState,
      resolveView3dOrbit,
      syncMapNavigationFromState,
      syncGlobeFreeCamera,
      syncViewStateFromMapCamera,
    ],
  );

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (!siCameraOrbitDragRef.current) return;
      if (siRightDragPointerIdRef.current != null && e.pointerId !== siRightDragPointerIdRef.current) {
        return;
      }
      e.preventDefault();
      applySiCameraOrbitFromClient(e.clientX, e.clientY);
    };
    window.addEventListener('pointermove', onPointerMove, { capture: true });
    return () => {
      window.removeEventListener('pointermove', onPointerMove, { capture: true });
    };
  }, [applySiCameraOrbitFromClient]);

  useEffect(() => {
    const endActiveDrag = () => {
      const od = siCameraOrbitDragRef.current;
      if (!od) return;
      endCameraOrbitDrag(od);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!siCameraOrbitDragRef.current) return;
      if (siRightDragPointerIdRef.current != null && e.pointerId !== siRightDragPointerIdRef.current) {
        return;
      }
      if (siRightOrbit3dRef.current && e.button !== 2) return;
      endActiveDrag();
    };
    window.addEventListener('pointerup', onPointerUp, { capture: true });
    window.addEventListener('pointercancel', onPointerUp, { capture: true });
    return () => {
      window.removeEventListener('pointerup', onPointerUp, { capture: true });
      window.removeEventListener('pointercancel', onPointerUp, { capture: true });
    };
  }, [endCameraOrbitDrag]);

  useEffect(() => {
    if (!isMapLoaded) return;
    const mapInstance = getMapInstance();
    if (!mapInstance) return;

    let detachCanvasListeners: (() => void) | null = null;
    let detachWheel: (() => void) | null = null;

    const bindCanvasSurface = () => {
      detachCanvasListeners?.();
      detachCanvasListeners = null;
      detachWheel?.();
      detachWheel = null;

      const container = mapInstance.getContainer?.() ?? null;
      let canvas: HTMLCanvasElement | null = null;
      try {
        canvas = mapInstance.getCanvas?.() ?? null;
      } catch {
        canvas = null;
      }
      const surface = container ?? canvas;
      if (!surface) return;

      if (canvas) {
        detachWheel = attachSiMapGlobeElevationZoomWheel(mapInstance, canvas, () =>
          elevationViewActiveRef.current,
        );
      }

      /** Hide browser menu — Mapbox dragRotate owns right-drag rotate. */
      const onSurfaceContextMenu = (e: Event) => {
        const guards = getDrawToolGuards();
        if (guards.mapDrawTool === 'polygon') return;
        const me = e as MouseEvent;
        if (me.shiftKey) return;
        suppressBrowserContextMenuOnly(e);
      };

      surface.addEventListener('contextmenu', onSurfaceContextMenu, { capture: true });
      detachCanvasListeners = () => {
        surface.removeEventListener('contextmenu', onSurfaceContextMenu, { capture: true });
      };
    };

    bindCanvasSurface();
    const onMapLoad = () => bindCanvasSurface();
    const onStyleData = () => bindCanvasSurface();
    try {
      mapInstance.on('load', onMapLoad);
      mapInstance.on('styledata', onStyleData);
    } catch {
      /* ignore */
    }

    return () => {
      try {
        mapInstance.off('load', onMapLoad);
        mapInstance.off('styledata', onStyleData);
      } catch {
        /* ignore */
      }
      releaseRightDragPointerCapture();
      detachCanvasListeners?.();
      detachWheel?.();
    };
  }, [getDrawToolGuards, getMapInstance, isMapLoaded, releaseRightDragPointerCapture]);

  useEffect(() => {
    if (!isMapLoaded) return;
    const mapInstance = getMapInstance();
    if (!mapInstance) return;
    configureSiMapCameraControlsForView(mapInstance, elevationViewActive);
  }, [elevationViewActive, getMapInstance, isMapLoaded]);

  useEffect(() => {
    if (!isMapLoaded) return;
    const mapInstance = getMapInstance();
    if (!mapInstance) return;
    const syncRotateMode = () => {
      let pitch = 0;
      try {
        pitch = mapInstance.getPitch();
      } catch {
        /* ignore */
      }
      configureSiMapCameraControlsForView(mapInstance, true);
    };
    syncRotateMode();
    mapInstance.on('moveend', syncRotateMode);
    return () => {
      try {
        mapInstance.off('moveend', syncRotateMode);
      } catch {
        /* ignore */
      }
    };
  }, [elevationViewActive, getMapInstance, isMapLoaded, mapProjectionModeRef]);

  const onMouseDown = useCallback(
    (evt: MapLayerPointerEvent) => {
      const orig = evt.originalEvent as MouseEvent | undefined;
      const map = getMapInstance();
      if (map && tryStartCameraPointerDown(orig, map)) return;
      onPointerDownAfterCamera?.(evt);
    },
    [getMapInstance, onPointerDownAfterCamera, tryStartCameraPointerDown],
  );

  const onMouseMove = useCallback(
    (evt: MapLayerPointerEvent) => {
      if (siCameraOrbitDragRef.current) return;
      onPointerMoveAfterCamera?.(evt);
    },
    [onPointerMoveAfterCamera],
  );

  const cancelPendingRightDragForContextMenu = useCallback(() => {
    const od = siCameraOrbitDragRef.current;
    if (!od || od.moved) return false;
    const map = getMapInstance();
    siCameraOrbitDragRef.current = null;
    siRightDragTilt2dRef.current = false;
    siRightDragMovedRef.current = false;
    releaseRightDragPointerCapture();
    setCameraOrbitDraggingActive(false);
    mapElevationTransitioningRef.current = false;
    applySiElevationCrossfadeVeil(0);
    siMapEndCameraOrbitDrag(map, {
      view3dOrbit: resolveView3dOrbit(),
    });
    return true;
  }, [
    applySiElevationCrossfadeVeil,
    elevationViewActiveRef,
    getMapInstance,
    mapElevationTransitioningRef,
    releaseRightDragPointerCapture,
    resolveView3dOrbit,
    setCameraOrbitDraggingActive,
  ]);

  const tryContextMenuToggle3D = useCallback(
    (lngLat: { lng: number; lat: number }, orig?: MouseEvent) => {
      if (!onContextMenuToggle3D) return false;
      if (orig?.shiftKey) return false;
      const orbitDrag = siCameraOrbitDragRef.current;
      if (
        shouldBlockSiMapContextMenuToggle3D({
          orbitDragActive: orbitDrag != null,
          orbitDragMoved: orbitDrag?.moved === true || siRightDragMovedRef.current,
        })
      ) {
        siRightDragMovedRef.current = false;
        return false;
      }
      if (orbitDrag) {
        cancelPendingRightDragForContextMenu();
      }
      const guards = getDrawToolGuards();
      if (
        guards.mapDrawTool === 'polygon' ||
        guards.mapDrawTool === 'lasso' ||
        guards.mapDrawTool === 'freehand' ||
        guards.mapDrawTool === 'text'
      ) {
        return false;
      }
      if (guards.mapDrawTool === 'polyline' && guards.hasPolylineStart) return false;
      if (guards.mapDrawTool === 'rectangle' && guards.hasRectCirclePreview) return false;
      if (
        guards.mapDrawTool === 'circle' &&
        (guards.hasCircleRefineDraft || guards.hasRectCirclePreview)
      ) {
        return false;
      }
      onContextMenuToggle3D(lngLat);
      onClearDrawContextMenu?.();
      return true;
    },
    [
      cancelPendingRightDragForContextMenu,
      getDrawToolGuards,
      onClearDrawContextMenu,
      onContextMenuToggle3D,
    ],
  );

  useEffect(() => {
    if (!isMapLoaded || !onContextMenuToggle3D) return;
    const mapInstance = getMapInstance();
    if (!mapInstance) return;

    const onMapContextMenu = (e: MapMouseEvent) => {
      e.preventDefault();
      tryContextMenuToggle3D({ lng: e.lngLat.lng, lat: e.lngLat.lat }, e.originalEvent);
    };

    mapInstance.on('contextmenu', onMapContextMenu);
    return () => {
      try {
        mapInstance.off('contextmenu', onMapContextMenu);
      } catch {
        /* ignore */
      }
    };
  }, [getMapInstance, isMapLoaded, onContextMenuToggle3D, tryContextMenuToggle3D]);

  const onContextMenu = useCallback(
    (evt: MapLayerPointerEvent) => {
      const orig = evt?.originalEvent as MouseEvent | undefined;
      orig?.preventDefault?.();
      if (tryContextMenuToggle3D(evt.lngLat, orig)) return;
      const mapForCtx = getMapInstance();
      const pitched3d =
        elevationViewActiveRef.current ||
        (mapForCtx?.getPitch?.() ?? 0) >= SI_GLOBE_FREE_CAMERA_TERRAIN_PITCH;
      const guards = getDrawToolGuards();
      if (guards.mapDrawTool === 'polygon' || orig?.shiftKey) {
        onContextMenuAfterCamera?.(evt);
        return;
      }
      if (pitched3d && !onContextMenuToggle3D) {
        onClearDrawContextMenu?.();
        return;
      }
      onContextMenuAfterCamera?.(evt);
    },
    [
      elevationViewActiveRef,
      getDrawToolGuards,
      getMapInstance,
      onClearDrawContextMenu,
      onContextMenuAfterCamera,
      onContextMenuToggle3D,
      tryContextMenuToggle3D,
    ],
  );

  const mapProps = useMemo(() => ({ ...MAPBOX_NAVIGATION_PROPS }), []);

  const mapPointerHandlers = useMemo(
    () => ({
      onMouseDown,
      onMouseMove,
      onTouchStart: onMouseDown,
      onTouchMove: onMouseMove,
      onContextMenu,
    }),
    [onContextMenu, onMouseDown, onMouseMove],
  );

  const mapCursor = useMemo(
    () => getMapCursor?.() ?? MAP_MOUSE_BEHAVIOR_SPEC.pan.cursor,
    [getMapCursor],
  );

  const applyBranding = useCallback((mapContainer: HTMLElement) => {
    applyAgroCloudMapboxBranding(mapContainer);
  }, []);

  return {
    mapProps,
    mapPointerHandlers,
    mapCursor,
    applyBranding,
    isCameraOrbitActive,
  };
}
