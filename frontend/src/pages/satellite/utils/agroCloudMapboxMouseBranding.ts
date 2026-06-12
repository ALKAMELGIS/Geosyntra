const BRANDED_CLASS = 'si-map-agrocloud-mouse-branded';

/** Prepare Mapbox container for GeoSyntra / AgroCloud map chrome (logo hide, canvas focus). */
export function applyAgroCloudMapboxBranding(mapContainer: HTMLElement): void {
  try {
    mapContainer.classList.add(BRANDED_CLASS);
    const logos = mapContainer.querySelectorAll<HTMLElement>('.mapboxgl-ctrl-logo');
    logos.forEach(logo => {
      logo.style.display = 'none';
      logo.setAttribute('aria-hidden', 'true');
    });
    const canvas = mapContainer.querySelector('canvas');
    if (canvas && !canvas.hasAttribute('tabindex')) {
      canvas.setAttribute('tabindex', '-1');
    }
  } catch {
    /* ignore */
  }
}
