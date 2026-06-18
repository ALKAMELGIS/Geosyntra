import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  formatSiMapWgs84Coordinate,
  SI_MAP_COORDINATE_SYSTEM_EPSG,
  SI_MAP_COORDINATE_SYSTEM_LABEL,
  siMapDisplayProjectionLabel,
  type SiMapProjectionMode,
} from '../utils/siMapProjectionTerrain';
import { SI_MAP_WGS84_STATUS_SLOT_ID } from './SiMapGeoSyntraBrand';
import './SiMapWgs84CoordinateStatus.css';

export type SiMapWgs84CoordinateStatusProps = {
  pointer: { lng: number; lat: number } | null;
  projectionMode: SiMapProjectionMode;
  /** Optional identify / tool feedback (inline status bar, no map popup). */
  identifyMessage?: string | null;
};

function resolveStatusSlot(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.getElementById(SI_MAP_WGS84_STATUS_SLOT_ID);
}

/** ArcGIS-style map status: WGS 84 CRS + live pointer coordinates (below GeoSyntra). */
export function SiMapWgs84CoordinateStatus({
  pointer,
  projectionMode,
  identifyMessage,
}: SiMapWgs84CoordinateStatusProps) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    let cancelled = false;
    let slotEl: HTMLElement | null = null;
    let rafId = 0;

    const sync = () => {
      if (cancelled) return;
      const next = resolveStatusSlot();
      if (next === slotEl) return;
      slotEl = next;
      setSlot(next);
    };

    const scheduleSync = () => {
      if (rafId || cancelled) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        sync();
      });
    };

    sync();
    const shell = document.querySelector('.si-map-container');
    const observer = shell ? new MutationObserver(scheduleSync) : null;
    observer?.observe(shell!, { childList: true, subtree: true });
    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      observer?.disconnect();
    };
  }, []);

  const coords = pointer ? formatSiMapWgs84Coordinate(pointer.lng, pointer.lat) : '—';
  const displayProjection = siMapDisplayProjectionLabel(projectionMode);

  if (!slot) return null;

  const identify = identifyMessage?.trim() ?? '';

  return createPortal(
    <div
      className="si-map-wgs84-status"
      role="status"
      aria-label={`Map coordinates in ${SI_MAP_COORDINATE_SYSTEM_LABEL}`}
    >
      <p className="si-map-wgs84-status__row si-map-wgs84-status__row--meta">
        <span className="si-map-wgs84-status__crs" title={`${SI_MAP_COORDINATE_SYSTEM_LABEL} · ${SI_MAP_COORDINATE_SYSTEM_EPSG}`}>
          {SI_MAP_COORDINATE_SYSTEM_LABEL}
          <span className="si-map-wgs84-status__epsg">{SI_MAP_COORDINATE_SYSTEM_EPSG}</span>
        </span>
        <span className="si-map-wgs84-status__sep" aria-hidden>
          ·
        </span>
        <span className="si-map-wgs84-status__proj" title="Map display projection">
          {displayProjection}
        </span>
        <span className="si-map-wgs84-status__sep" aria-hidden>
          ·
        </span>
        <span className="si-map-wgs84-status__coords" title="Pointer longitude / latitude">
          {coords}
        </span>
      </p>
      {identify ? (
        <p className="si-map-wgs84-status__row si-map-wgs84-status__row--identify">
          <span className="si-map-wgs84-status__identify" title={identify}>
            {identify}
          </span>
        </p>
      ) : null}
    </div>,
    slot,
  );
}
