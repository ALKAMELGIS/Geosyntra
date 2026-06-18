import { useId, useLayoutEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { GEOSYNTRA_BRAND_NAME, brandLogoSvgWithGradientId } from '../../../lib/brand';
import './SiMapGeoSyntraBrand.css';

const HOST_ID = 'si-map-geosyntra-brand-host';
/** Portal target for WGS 84 status (nested under the brand stack). */
export const SI_MAP_WGS84_STATUS_SLOT_ID = 'si-map-wgs84-status-slot';

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

function ensureBrandHost(bottomLeft: HTMLElement): HTMLElement | null {
  try {
    const existing = bottomLeft.querySelector(`#${HOST_ID}`) as HTMLElement | null;
    if (existing?.isConnected && bottomLeft.contains(existing)) return existing;

    document.getElementById(HOST_ID)?.remove();

    const host = document.createElement('div');
    host.id = HOST_ID;
    host.className = 'si-map-geosyntra-brand-host';
    const logo = findMapboxLogoAnchor(bottomLeft);
    if (logo?.parentElement === bottomLeft) {
      bottomLeft.insertBefore(host, logo);
    } else {
      bottomLeft.appendChild(host);
    }
    return host;
  } catch {
    return null;
  }
}

/** Compact GeoSyntra mark in the map corner (replaces Mapbox logo). */
export function SiMapGeoSyntraBrand() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const gradientId = useId().replace(/:/g, '');
  const logoSvg = useMemo(() => brandLogoSvgWithGradientId(`gs-map-brand-${gradientId}`), [gradientId]);

  useLayoutEffect(() => {
    let cancelled = false;
    let hostEl: HTMLElement | null = null;
    let rafId = 0;

    const sync = () => {
      if (cancelled) return;
      const bottomLeft = resolveMapboxBottomLeftAnchor();
      const next = bottomLeft ? ensureBrandHost(bottomLeft) : null;
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

  if (!host) return null;

  return createPortal(
    <div className="si-map-bottom-left-stack">
      <div className="si-map-geosyntra-brand" aria-label={GEOSYNTRA_BRAND_NAME}>
        <span
          className="si-map-geosyntra-brand__icon"
          aria-hidden
          dangerouslySetInnerHTML={{ __html: logoSvg }}
        />
        <span className="si-map-geosyntra-brand__name">{GEOSYNTRA_BRAND_NAME}</span>
      </div>
      <div id={SI_MAP_WGS84_STATUS_SLOT_ID} className="si-map-wgs84-status-slot" />
    </div>,
    host,
  );
}
