import { describe, expect, it } from 'vitest';
import { isSiPersistentMapRoute, SI_PERSISTENT_MAP_ROUTE } from './siPersistentMapRoute';

describe('siPersistentMapRoute', () => {
  it('recognizes the satellite indices route', () => {
    expect(isSiPersistentMapRoute(SI_PERSISTENT_MAP_ROUTE)).toBe(true);
    expect(isSiPersistentMapRoute('/satellite/indices/')).toBe(true);
  });

  it('rejects other app routes', () => {
    expect(isSiPersistentMapRoute('/settings/gis-content')).toBe(false);
    expect(isSiPersistentMapRoute('/satellite/multidimensional')).toBe(false);
    expect(isSiPersistentMapRoute('/')).toBe(false);
  });
});
