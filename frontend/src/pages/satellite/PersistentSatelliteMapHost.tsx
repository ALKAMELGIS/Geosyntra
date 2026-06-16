import { Suspense, useEffect, useRef, useState } from 'react';
import { GeosyntraAnimatedBrandMark } from '../../components/ui/GeosyntraAnimatedBrandMark';
import { GeosyntraLoadingSpaceBackdrop } from '../../components/ui/GeosyntraLoadingSpaceBackdrop';
import { lazyRoute } from '../../routes/lazyRoute';
import { emitSiPersistentMapActivate } from './utils/siPersistentMapSession';
import './persistentSatelliteMapHost.css';

const SatelliteIntelligence = lazyRoute(() => import('./SatelliteIntelligenceMain'));

export type PersistentSatelliteMapHostProps = {
  /** When true, the map canvas is visible in the main layout cell. */
  active: boolean;
};

/**
 * Keeps one Satellite Intelligence / Mapbox GL instance alive across app tab changes.
 * UI routes swap in <main>; the WebGL map is only hidden — never unmounted.
 */
export default function PersistentSatelliteMapHost({ active }: PersistentSatelliteMapHostProps) {
  const [everMounted, setEverMounted] = useState(false);
  const wasActiveRef = useRef(active);

  useEffect(() => {
    if (active) setEverMounted(true);
  }, [active]);

  useEffect(() => {
    if (active && !wasActiveRef.current && everMounted) {
      requestAnimationFrame(() => emitSiPersistentMapActivate());
    }
    wasActiveRef.current = active;
  }, [active, everMounted]);

  if (!everMounted) return null;

  return (
    <div
      className={
        'si-persistent-map-host' +
        (active ? ' si-persistent-map-host--active' : ' si-persistent-map-host--suspended')
      }
      aria-hidden={!active}
      data-si-persistent-map-host={active ? 'active' : 'suspended'}
    >
      <Suspense
        fallback={
          <div className="si-map-route-loading" role="status" aria-live="polite">
            <GeosyntraLoadingSpaceBackdrop />
            <div className="si-map-route-loading__center">
              <GeosyntraAnimatedBrandMark
                size={240}
                satellites={5}
                live
                relaxedMotion
                className="si-map-route-loading__brand"
              />
            </div>
            <span className="si-map-route-loading__label">Loading map…</span>
          </div>
        }
      >
        <SatelliteIntelligence />
      </Suspense>
    </div>
  );
}
