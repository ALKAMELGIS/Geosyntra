import { resolveAbsoluteUrl, resolveApiUrl } from './apiClient';

const GOOGLE_3D_TILES_ROOT = 'https://tile.googleapis.com/v1/3dtiles/root.json';

export type GooglePhotorealistic3dTilesetConfig = {
  url: string;
  mode: 'proxy' | 'direct';
  loadOptions: {
    fetch?: { headers?: Record<string, string> };
    '3d-tiles'?: { loadGLTF?: boolean };
    tileset?: { maximumScreenSpaceError?: number };
  };
};

function readViteGoogleMapsKey(): string {
  return String(
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY ??
      import.meta.env.VITE_GOOGLE_MAPS_SERVER_API_KEY ??
      '',
  ).trim();
}

/** Tileset URL + loader options — proxy (production) or direct key (local dev). */
export function resolveGooglePhotorealistic3dTilesetConfig(): GooglePhotorealistic3dTilesetConfig {
  const loadOptions: GooglePhotorealistic3dTilesetConfig['loadOptions'] = {
    '3d-tiles': { loadGLTF: true },
    tileset: { maximumScreenSpaceError: 4 },
  };

  const viteKey = readViteGoogleMapsKey();
  if (viteKey) {
    const url = `${GOOGLE_3D_TILES_ROOT}?key=${encodeURIComponent(viteKey)}`;
    return {
      url: resolveAbsoluteUrl(url),
      mode: 'direct',
      loadOptions: {
        ...loadOptions,
        fetch: { headers: { 'X-GOOG-API-KEY': viteKey } },
      },
    };
  }

  return {
    url: resolveAbsoluteUrl(resolveApiUrl('/api/google-3d-tiles/root.json')),
    mode: 'proxy',
    loadOptions,
  };
}

/** @deprecated Use {@link resolveGooglePhotorealistic3dTilesetConfig}. */
export function resolveGooglePhotorealistic3dTilesetUrl(): string {
  return resolveGooglePhotorealistic3dTilesetConfig().url;
}

/** Probe proxy/direct root tileset before mounting the mesh overlay. */
export async function probeGooglePhotorealistic3dTileset(): Promise<{
  ok: boolean;
  status: number;
  mode: 'proxy' | 'direct';
  message?: string;
}> {
  const cfg = resolveGooglePhotorealistic3dTilesetConfig();
  try {
    const res = await fetch(cfg.url, {
      method: 'GET',
      headers: cfg.loadOptions.fetch?.headers,
      credentials: cfg.mode === 'proxy' ? 'include' : 'omit',
    });
    if (res.ok) {
      return { ok: true, status: res.status, mode: cfg.mode };
    }
    let message = `Google Photorealistic 3D unavailable (HTTP ${res.status}).`;
    if (res.status === 503) {
      message =
        cfg.mode === 'proxy'
          ? 'Set GOOGLE_MAPS_SERVER_API_KEY on the Node API (backend/.env) or VITE_GOOGLE_MAPS_API_KEY for local dev. Enable Map Tiles API in Google Cloud.'
          : 'Check VITE_GOOGLE_MAPS_API_KEY and enable Map Tiles API in Google Cloud.';
    } else if (res.status === 403) {
      message =
        'Google API key blocked for Map Tiles API. In Google Cloud Console enable "Map Tiles API" for this key and allow tile.googleapis.com (Photorealistic 3D).';
    }
    return { ok: false, status: res.status, mode: cfg.mode, message };
  } catch {
    return {
      ok: false,
      status: 0,
      mode: cfg.mode,
      message:
        'Cannot reach Google Photorealistic 3D tiles. Start the backend (port 3001) or set VITE_GOOGLE_MAPS_API_KEY in frontend/.env.',
    };
  }
}

export const GOOGLE_PHOTOREALISTIC_3D_SETUP_HINT =
  'Photorealistic 3D needs Map Tiles API enabled in Google Cloud + GOOGLE_MAPS_SERVER_API_KEY on the backend (or VITE_GOOGLE_MAPS_API_KEY locally).';
