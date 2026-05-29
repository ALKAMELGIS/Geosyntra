/**
 * Microsoft Planetary Computer helpers — calls analysis_engine `/mpc/*` routes.
 * Run backend: `cd analysis_engine && uvicorn app.main:app --reload --port 8000`
 * Set `VITE_ANALYSIS_ENGINE_URL` (e.g. http://127.0.0.1:8000) for dev.
 */

/** Env override, else same-origin proxy (`/api/analysis-engine` → Node or Vite dev proxy). */
export function getAnalysisEngineBaseUrl(): string {
  const raw = (import.meta.env.VITE_ANALYSIS_ENGINE_URL as string | undefined)?.trim();
  if (raw) return raw.replace(/\/$/, '');
  if (typeof window !== 'undefined') return '/api/analysis-engine';
  return '';
}

export async function probeAnalysisEngineBaseUrl(): Promise<string> {
  const candidates = [
    getAnalysisEngineBaseUrl(),
    'http://127.0.0.1:8000',
    'http://localhost:8000',
  ].filter((v, i, a) => v && a.indexOf(v) === i);

  for (const base of candidates) {
    try {
      const ctrl = new AbortController();
      const timer = window.setTimeout(() => ctrl.abort(), 2200);
      const res = await fetch(`${base}/mpc/templates`, { signal: ctrl.signal });
      window.clearTimeout(timer);
      if (res.ok) return base.replace(/\/$/, '');
    } catch {
      /* try next */
    }
  }
  return '';
}

export type MpcTemplateId =
  | 'ndvi_s2'
  | 'false_color_s2'
  | 'ndmi_s2'
  | 'ndvi_landsat'
  | 'false_color_landsat';

export async function mpcFetchTemplates(baseUrl: string) {
  const r = await fetch(`${baseUrl}/mpc/templates`);
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{
    catalog_url: string;
    stac_api: string;
    templates: Array<{ id: string; label: string; collections?: string[] }>;
    arcgis?: { documentation_urls?: string[] };
  }>;
}

export async function mpcProcess(
  baseUrl: string,
  body: {
    aoi: GeoJSON.Feature;
    collections: string[];
    datetime: string;
    template_id: MpcTemplateId;
    max_items?: number;
    max_cloud_cover?: number;
    catalog_url?: string;
    acs_zip_path?: string;
    clip_to_aoi?: boolean;
    tile_size?: number;
    resolution?: number;
  },
) {
  const r = await fetch(`${baseUrl}/mpc/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(text || `HTTP ${r.status}`);
  try {
    return JSON.parse(text) as MpcProcessResult;
  } catch {
    throw new Error(text);
  }
}

export type MpcZonalSampleLayer = {
  statistics: {
    min: number;
    max: number;
    mean: number;
    median?: number;
    std: number;
    histogram?: Array<{ binStart: number; binEnd: number; count: number }>;
  };
  values: number[];
};

export type MpcZonalSampleResult = {
  ok: boolean;
  datetime: string;
  item_count: number;
  pixel_count: number;
  area_ha: number;
  grid: Array<{ lng: number; lat: number }>;
  layers: Record<string, MpcZonalSampleLayer>;
  processing?: {
    clip_to_aoi?: boolean;
    resolution_m?: number;
    mode?: string;
  };
};

export function parseMpcApiError(text: string, status: number): string {
  const raw = text.trim();
  if (!raw) return `Analysis engine HTTP ${status}`;
  try {
    const j = JSON.parse(raw) as { detail?: unknown; message?: string };
    if (typeof j.detail === 'string') return j.detail;
    if (Array.isArray(j.detail)) {
      return j.detail.map(d => (typeof d === 'string' ? d : JSON.stringify(d))).join('; ');
    }
    if (j.detail && typeof j.detail === 'object') return JSON.stringify(j.detail);
    if (typeof j.message === 'string') return j.message;
  } catch {
    /* plain text */
  }
  if (raw.length > 280) return `${raw.slice(0, 280)}…`;
  return raw;
}

export async function mpcZonalSample(
  baseUrl: string,
  body: {
    aoi: GeoJSON.Feature;
    datetime: string;
    layer_ids?: string[];
    collections?: string[];
    max_items?: number;
    max_cloud_cover?: number;
    catalog_url?: string;
    clip_to_aoi?: boolean;
    tile_size?: number;
    resolution?: number;
    max_pixels?: number;
  },
): Promise<MpcZonalSampleResult> {
  const r = await fetch(`${baseUrl}/mpc/zonal-sample`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) {
    const msg = parseMpcApiError(text, r.status);
    const lower = text.toLowerCase();
    if (
      r.status === 502 ||
      (r.status === 500 &&
        (!text.trim() ||
          lower.includes('econnrefused') ||
          lower.includes('proxy error') ||
          lower.includes('socket hang up')))
    ) {
      throw new Error(
        'Analysis engine is not reachable. Start: cd analysis_engine && uvicorn app.main:app --reload --port 8000',
      );
    }
    throw new Error(msg);
  }
  try {
    return JSON.parse(text) as MpcZonalSampleResult;
  } catch {
    throw new Error(parseMpcApiError(text, r.status));
  }
}

export type MpcProcessResult = {
  ok: boolean;
  template_id: string;
  collections: string[];
  datetime: string;
  item_count: number;
  scene_datetimes?: string[];
  statistics?: { min: number; max: number; mean: number; std: number };
  rescale?: number[];
  label?: string;
  cog_id?: string;
  cog_download_path?: string;
  arcgis?: { note?: string; links?: string[] };
  detail?: string;
  processing?: {
    clip_to_aoi?: boolean;
    tile_size?: number;
    resolution?: number;
    mode?: string;
  };
};
