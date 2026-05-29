import { useEffect, useRef, type RefObject } from 'react';
import type { Feature } from 'geojson';
import type { MapRef } from 'react-map-gl/mapbox';
import type { Map as MapboxMap } from 'mapbox-gl';
import {
  clipCanvasToRainFlowAoi,
  projectRainFlowAoiRings,
} from '../utils/siMapRainFlowAoi';
import {
  advanceSiMapRainFlowField,
  buildSiMapRainFlowField,
  refreshSiMapFloodStreamlines,
  type SiRainFlowField,
} from '../utils/siMapRainFlowField';
import {
  drawSiFloodFlowVectors,
  drawSiFloodStreamlines,
  drawSiFloodWaterSurface,
} from '../utils/siMapFloodCanvasRender';
import { siRainFlowIntensityFactor } from '../utils/siMapRainFlowTypes';
import type { SiMapWeatherSettings } from '../utils/siMapWeatherTypes';
import './SiMapRainFlowOverlay.css';

export type SiMapRainFlowOverlayProps = {
  settings: SiMapWeatherSettings;
  active: boolean;
  mapRef: RefObject<MapRef | null>;
  terrainElevated: boolean;
  aoiFeatures: ReadonlyArray<Feature>;
  onFieldChange?: (field: SiRainFlowField | null) => void;
};

function resolveMapboxMap(mapRef: RefObject<MapRef | null>): MapboxMap | null {
  const raw = mapRef.current;
  if (!raw) return null;
  const m = (raw as { getMap?: () => MapboxMap }).getMap?.() ?? (raw as unknown as MapboxMap);
  return m && typeof m.unproject === 'function' ? m : null;
}

export function SiMapRainFlowOverlay({
  settings,
  active,
  mapRef,
  terrainElevated,
  aoiFeatures,
  onFieldChange,
}: SiMapRainFlowOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fieldRef = useRef<SiRainFlowField | null>(null);
  const clipRingsRef = useRef<ReturnType<typeof projectRainFlowAoiRings>>([]);
  const rafRef = useRef(0);
  const phaseRef = useRef(0);
  const simTickRef = useRef(0);
  const streamRefreshRef = useRef(0);
  const rebuildTimerRef = useRef<number | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const aoiKey = aoiFeatures.map(f => JSON.stringify(f.geometry)).join('|');
  const floodMode = settings.rainFlowEnabled;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !active || !settings.rainFlowEnabled || !aoiFeatures.length) {
      onFieldChange?.(null);
      return;
    }

    const parent = canvas.parentElement;
    if (!parent) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const precip01 = settings.precipitation / 100;
    const intensity = siRainFlowIntensityFactor(settings.rainFlowIntensity);
    const infiltration01 = settings.floodInfiltration / 100;
    const roughness01 = settings.floodRoughness / 100;
    const initialWater01 = settings.floodInitialWater / 100;
    const cellResolution = settings.floodCellResolution;

    const resize = () => {
      const r = parent.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(r.width * dpr));
      canvas.height = Math.max(1, Math.floor(r.height * dpr));
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const rebuildField = () => {
      const map = resolveMapboxMap(mapRef);
      if (!map) {
        fieldRef.current = null;
        clipRingsRef.current = [];
        onFieldChange?.(null);
        return;
      }
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      if (w < 8 || h < 8) return;
      clipRingsRef.current = projectRainFlowAoiRings(map, aoiFeatures);
      fieldRef.current = buildSiMapRainFlowField(map, w, h, precip01, intensity, {
        aoiFeatures,
        infiltration01,
        roughness01,
        initialWater01,
        cellResolution,
        highDetail: floodMode,
        durationHours: settingsRef.current.floodDurationHours,
      });
      onFieldChange?.(fieldRef.current);
      simTickRef.current = 0;
      streamRefreshRef.current = 0;
    };

    const scheduleRebuild = () => {
      if (rebuildTimerRef.current != null) window.clearTimeout(rebuildTimerRef.current);
      rebuildTimerRef.current = window.setTimeout(() => {
        rebuildTimerRef.current = null;
        rebuildField();
      }, 140);
    };

    resize();
    scheduleRebuild();
    const ro = new ResizeObserver(() => {
      resize();
      scheduleRebuild();
    });
    ro.observe(parent);

    const map = resolveMapboxMap(mapRef);
    const onMoveEnd = () => scheduleRebuild();
    map?.on('moveend', onMoveEnd);
    map?.on('zoomend', onMoveEnd);
    map?.on('rotateend', onMoveEnd);
    map?.on('pitchend', onMoveEnd);

    const tick = () => {
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      ctx.clearRect(0, 0, w, h);

      const field = fieldRef.current;
      const rings = clipRingsRef.current;
      if (!field || !rings.length) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const playing = settings.rainFlowPlaying;
      if (playing) {
        phaseRef.current += 0.028 * (0.65 + intensity);
        simTickRef.current += 1;
        if (simTickRef.current % 3 === 0) {
          advanceSiMapRainFlowField(field, precip01, intensity, {
            infiltration01,
            roughness01,
            initialWater01,
          }, 0.5);
          streamRefreshRef.current += 1;
          if (streamRefreshRef.current % 5 === 0) {
            refreshSiMapFloodStreamlines(field, w, h, precip01, intensity);
          }
          if (simTickRef.current % 9 === 0) {
            onFieldChange?.({ ...field });
          }
        }
      } else {
        phaseRef.current *= 0.92;
      }
      const phase = phaseRef.current;

      ctx.save();
      clipCanvasToRainFlowAoi(ctx, rings);

      drawSiFloodWaterSurface(ctx, field, w, h, precip01, phase, playing);
      drawSiFloodStreamlines(ctx, field, precip01, phase, playing);
      if (settings.floodShowFlowDir) {
        drawSiFloodFlowVectors(ctx, field, phase, playing);
      }

      ctx.restore();
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      ro.disconnect();
      if (rebuildTimerRef.current != null) window.clearTimeout(rebuildTimerRef.current);
      map?.off('moveend', onMoveEnd);
      map?.off('zoomend', onMoveEnd);
      map?.off('rotateend', onMoveEnd);
      map?.off('pitchend', onMoveEnd);
      cancelAnimationFrame(rafRef.current);
      fieldRef.current = null;
      clipRingsRef.current = [];
      onFieldChange?.(null);
    };
  }, [
    active,
    settings.rainFlowEnabled,
    settings.rainFlowPlaying,
    settings.rainFlowIntensity,
    settings.precipitation,
    settings.floodInfiltration,
    settings.floodRoughness,
    settings.floodInitialWater,
    settings.floodCellResolution,
    settings.floodDurationHours,
    settings.preset,
    mapRef,
    terrainElevated,
    aoiKey,
    aoiFeatures,
    floodMode,
    onFieldChange,
  ]);

  if (!active || !settings.rainFlowEnabled || !aoiFeatures.length) return null;

  return (
    <canvas
      ref={canvasRef}
      className="si-map-rain-flow-overlay si-map-flood-simulation-overlay"
      aria-hidden
      data-si-flood-simulation=""
      data-si-flood-simulation-active={floodMode ? '1' : '0'}
      data-terrain-dem={terrainElevated ? '1' : '0'}
      data-aoi-clipped="1"
    />
  );
}
