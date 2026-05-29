import { useEffect, useRef, type RefObject } from 'react';
import type { MapRef } from 'react-map-gl/mapbox';
import type { Map as MapboxMap } from 'mapbox-gl';
import { clipCanvasToRainFlowAoi, projectRainFlowAoiRings } from '../utils/siMapRainFlowAoi';
import {
  SI_CROP_HEALTH_CONDITION_META,
  SI_CROP_HEALTH_SEVERITY_COLORS,
  type SiCropHealthAnalysisResult,
  type SiCropHealthSettings,
} from '../utils/siCropHealthTypes';
import type { Feature } from 'geojson';
import './SiMapCropHealthOverlay.css';

export type SiMapCropHealthOverlayProps = {
  active: boolean;
  settings: SiCropHealthSettings;
  result: SiCropHealthAnalysisResult | null;
  mapRef: RefObject<MapRef | null>;
  aoiFeatures: ReadonlyArray<Feature>;
};

function resolveMap(mapRef: RefObject<MapRef | null>): MapboxMap | null {
  const raw = mapRef.current;
  if (!raw) return null;
  const m = (raw as { getMap?: () => MapboxMap }).getMap?.() ?? (raw as unknown as MapboxMap);
  return m && typeof m.project === 'function' ? m : null;
}

function cellColor(
  result: SiCropHealthAnalysisResult,
  settings: SiCropHealthSettings,
): (c: (typeof result.cells)[0]) => string {
  return c => {
    if (settings.showDiseaseRiskLayer && (c.condition === 'early_disease' || c.condition === 'disease_active')) {
      return SI_CROP_HEALTH_SEVERITY_COLORS[c.severity];
    }
    if (settings.showHealthLayer) {
      return `${SI_CROP_HEALTH_CONDITION_META[c.condition].color}99`;
    }
    return 'rgba(0,0,0,0)';
  };
}

export function SiMapCropHealthOverlay({
  active,
  settings,
  result,
  mapRef,
  aoiFeatures,
}: SiMapCropHealthOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !active || !result?.cells.length || !aoiFeatures.length) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const opacity = Math.max(0.15, Math.min(1, settings.healthOpacity));
    const colorFn = cellColor(result, settings);

    const draw = () => {
      const map = resolveMap(mapRef);
      if (!map) return;
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      if (w < 8 || h < 8) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const rings = projectRainFlowAoiRings(map, aoiFeatures);
      clipCanvasToRainFlowAoi(ctx, rings);

      const zoom = map.getZoom();
      const radius = Math.max(3, Math.min(14, 4 + (zoom - 10) * 1.2));

      ctx.globalAlpha = opacity;
      for (const cell of result.cells) {
        const p = map.project([cell.lng, cell.lat]);
        ctx.fillStyle = colorFn(cell);
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const schedule = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(draw);
    };

    schedule();
    const map = resolveMap(mapRef);
    map?.on('move', schedule);
    map?.on('zoom', schedule);
    map?.on('resize', schedule);
    const ro = new ResizeObserver(schedule);
    ro.observe(parent);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      map?.off('move', schedule);
      map?.off('zoom', schedule);
      map?.off('resize', schedule);
      ro.disconnect();
    };
  }, [active, settings, result, mapRef, aoiFeatures]);

  if (!active || !result) return null;

  return <canvas ref={canvasRef} className="si-crop-health-overlay" aria-hidden />;
}
