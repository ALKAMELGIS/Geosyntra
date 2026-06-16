/** Fired when the persistent map host becomes visible again after a route tab switch. */
export const SI_PERSISTENT_MAP_ACTIVATE_EVENT = 'si-persistent-map-activate';

export function subscribeSiPersistentMapActivate(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(SI_PERSISTENT_MAP_ACTIVATE_EVENT, handler);
  return () => window.removeEventListener(SI_PERSISTENT_MAP_ACTIVATE_EVENT, handler);
}

export function emitSiPersistentMapActivate(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(SI_PERSISTENT_MAP_ACTIVATE_EVENT));
}
