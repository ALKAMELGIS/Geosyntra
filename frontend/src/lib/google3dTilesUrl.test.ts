import { describe, expect, it } from 'vitest';
import {
  GOOGLE_PHOTOREALISTIC_3D_SETUP_HINT,
  resolveGooglePhotorealistic3dTilesetConfig,
  resolveGooglePhotorealistic3dTilesetUrl,
} from './google3dTilesUrl';

describe('google3dTilesUrl', () => {
  it('points proxy mode at the backend Google 3D tiles root', () => {
    const cfg = resolveGooglePhotorealistic3dTilesetConfig();
    expect(cfg.url).toContain('/api/google-3d-tiles/root.json');
    expect(resolveGooglePhotorealistic3dTilesetUrl()).toBe(cfg.url);
  });

  it('documents setup when the API key is missing', () => {
    expect(GOOGLE_PHOTOREALISTIC_3D_SETUP_HINT).toContain('GOOGLE_MAPS_SERVER_API_KEY');
  });
});
