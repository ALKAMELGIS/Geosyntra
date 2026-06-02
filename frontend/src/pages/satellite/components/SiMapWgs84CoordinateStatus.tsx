import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  formatSiMapWgs84Coordinate,
  SI_MAP_COORDINATE_SYSTEM_EPSG,
  SI_MAP_COORDINATE_SYSTEM_LABEL,
  siMapDisplayProjectionLabel,
  type SiMapProjectionMode,
} from '../utils/siMapProjectionTerrain';
import './SiMapWgs84CoordinateStatus.css';

export type SiMapWgs84CoordinateStatusProps = {
  pointer: { lng: number; lat: number } | null;
  projectionMode: SiMapProjectionMode;
  /** Optional identify / tool feedback (inline status bar, no map popup). */
  identifyMessage?: string | null;
};

const HOST_ID = 'si-map-wgs84-status-host';

function resolveMapboxBottomLeftAnchor(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector('.si-map-container .mapboxgl-ctrl-bottom-left') as HTMLElement | null;
}

function findMapboxLogoAnchor(bottomLeft: HTMLElement): HTMLElement | null {
  const direct =
    bottomLeft.querySelector(':scope > .mapboxgl-ctrl-logo') ??
    bottomLeft.querySelector(':scope > a.mapboxgl-ctrl-logo');
  if (direct) return direct;
  return bottomLeft.querySelector('.mapboxgl-ctrl-logo');
}

function mountStatusHost(bottomLeft: HTMLElement, host: HTMLElement): void {
  const logo = findMapboxLogoAnchor(bottomLeft);
  if (logo?.parentElement === bottomLeft) {
    bottomLeft.insertBefore(host, logo);
    return;
  }
  if (logo?.parentElement) {
    logo.parentElement.insertBefore(host, logo);
    return;
  }
  bottomLeft.prepend(host);
}

function ensureStatusHost(bottomLeft: HTMLElement): HTMLElement | null {
  try {
    const existing = bottomLeft.querySelector(`#${HOST_ID}`) as HTMLElement | null;
    if (existing?.isConnected && bottomLeft.contains(existing)) return existing;

    document.getElementById(HOST_ID)?.remove();

    const host = document.createElement('div');
    host.id = HOST_ID;
    host.className = 'si-map-wgs84-status-host';
    mountStatusHost(bottomLeft, host);
    return host;
  } catch {
    return null;
  }
}

/** ArcGIS-style map status: WGS 84 CRS + live pointer coordinates. */
export function SiMapWgs84CoordinateStatus({
  pointer,
  projectionMode,
  identifyMessage,
}: SiMapWgs84CoordinateStatusProps) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    let cancelled = false;
    let hostEl: HTMLElement | null = null;
    let rafId = 0;

    const sync = () => {
      if (cancelled) return;
      const bottomLeft = resolveMapboxBottomLeftAnchor();
      const next = bottomLeft ? ensureStatusHost(bottomLeft) : null;
      if (next === hostEl) return;
      hostEl = next;
      setHost(next);
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

  if (!host) return null;

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
    host,
  );
}
