import React, { useState, useMemo, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import MapGL, { Source, Layer, NavigationControl, Marker } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import './SatelliteIntelligence.css';
import { parseFile } from '../../utils/FileLoader';
import type { DrawStyleConfig, VertexRef } from './drawingUtils';
import {
  bboxToPolygonFeature,
  circleFromEdgeFeature,
  clientPointToLngLat,
  cloneDeep,
  collectVertexRefs,
  downloadTextFile,
  featureToKml,
  featureToWkt,
  findNearestVertex,
  haversineDistanceMeters,
  loadDrawWorkspace,
  lngLatPixelDistance,
  minPixelDistToPolyline,
  pointInPolygonGeometry,
  saveDrawWorkspace,
  setVertexCoord,
  snapLngLatToNearestVertex,
  translateFeatureCoordinates,
  vertexHitThresholdPx,
} from './drawingUtils';
import { useMapboxAccessToken } from '../../hooks/useMapboxAccessToken';
import { useGeminiApiKey } from '../../hooks/useGeminiApiKey';
import { useClaudeApiKey } from '../../hooks/useClaudeApiKey';
import { useDeepseekApiKey } from '../../hooks/useDeepseekApiKey';
import { getArcgisPortalToken } from '../../lib/arcgisPortalToken';
import { getMapboxAccessToken } from '../../lib/mapboxAccessToken';
import { subscribeSentinelHubAccessToken } from '../../lib/sentinelHubAccessToken';
import {
  getSentinelHubWmsBaseUrl,
  getSentinelHubWmsInstanceId,
  subscribeSentinelHubWmsInstance,
} from '../../lib/sentinelHubWmsInstance';
import {
  lastMapQueryCoordsFromMessages,
  messageDisplayText,
  messagesToGeminiContents,
  stripGeoExplorerBubbleDisplayText,
  type GeoExplorerMessage,
  type GeoExplorerPart,
} from '../../lib/geoExplorerGemini';
import {
  buildGeoAiDataContext,
  claudeGeoAiComplete,
  DEVELOP_DATA_CONTEXT_LS_KEY,
  GEO_AI_CHAT_SYSTEM_BASE,
  type GeoAiChatTurn,
} from '../../lib/geoAiChatClaude';
import { loadGisMapSavedLayers } from '../../lib/gisMapLayerStore';
import { satelliteCustomLayersToGeoAiLayers } from '../../lib/geoAiMapLayerSources';
import { geoExplorerTargetZoomForPinSource, runGeoExplorerGeminiTurn } from '../../lib/runGeoExplorerGeminiTurn';
import {
  buildGeoAiLayerPopupAttributeRows,
  pickGeoAiHumanPlaceFields,
  type GeoAiMapLayer,
} from '../../lib/geoExplorerLayerContext';
import { resolveGeoAiPinFromUserTextAndReply } from '../../lib/geoAiResolveMapCoords';
import { useOpenWeatherMapApiKey } from '../../hooks/useOpenWeatherMapApiKey';
import { agroChatWithDeepSeek } from '../../lib/agroAiChat';
import {
  buildBasemapCatalog,
  catalogEntryById,
  DEFAULT_BASEMAP_ID,
  DEFAULT_BASEMAP_ID_NO_MAPBOX,
  getBasemapThumbnail,
  mapboxGlStyleForEntry,
  resolveBasemapId,
} from './basemapCatalog';
import {
  arcgisDrawingInfoToFillPaint,
  arcgisDrawingInfoToLinePaint,
  fetchArcgisLayerDrawingInfo,
  sanitizeArcgisDrawingInfoForClient,
} from '../../lib/arcgisDrawingInfoMapbox';

const EMPTY_MAP_STYLE: any = {
  version: 8,
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: {
        'background-color': '#020617'
      }
    }
  ]
};
const PC_STAC_SEARCH_URL = 'https://planetarycomputer.microsoft.com/api/stac/v1/search';
const STAC_CONNECTION_STORAGE_KEY = 'si-stac-connection-v1';
const SATELLITE_CUSTOM_LAYERS_STORAGE_KEY = 'si-satellite-custom-layers-v1';

type GeoAiInspectCardState = {
  title: string;
  rows: { label: string; value: string }[];
  lng: number;
  lat: number;
  areaName?: string;
  country?: string;
};

async function reverseLngLatForGeoAiDetails(
  lng: number,
  lat: number,
  mapboxToken: string | undefined,
): Promise<{ area?: string; country?: string }> {
  const token = typeof mapboxToken === 'string' ? mapboxToken.trim() : '';
  if (token) {
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${encodeURIComponent(token)}&limit=1`;
      const res = await fetch(url);
      if (res.ok) {
        const j = (await res.json()) as {
          features?: Array<{
            text?: string;
            context?: Array<{ id?: string; text?: string }>;
          }>;
        };
        const f = j?.features?.[0];
        if (f) {
          const ctx = Array.isArray(f.context) ? f.context : [];
          const countryEnt = ctx.find(c => String(c?.id || '').startsWith('country'));
          const country = countryEnt?.text ? String(countryEnt.text).trim() : '';
          const placeFromCtx = ctx.find(c => /(place|locality|district|neighborhood)/.test(String(c?.id || '')));
          const area =
            (typeof f.text === 'string' && f.text.trim() ? f.text.trim() : '') ||
            (placeFromCtx?.text ? String(placeFromCtx.text).trim() : '') ||
            '';
          return { area: area || undefined, country: country || undefined };
        }
      }
    } catch {
      /* fall through to OSM */
    }
  }
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}&zoom=12&addressdetails=1`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'AgriCloud/1.0 (Geo AI reverse)' } },
    );
    if (!res.ok) return {};
    const j = (await res.json()) as {
      name?: string;
      address?: Record<string, string>;
    };
    const a = j?.address || {};
    const area =
      a.village ||
      a.town ||
      a.city ||
      a.county ||
      a.state ||
      a.hamlet ||
      (typeof j?.name === 'string' ? j.name : '') ||
      '';
    const country = a.country || '';
    return {
      area: typeof area === 'string' && area.trim() ? area.trim() : undefined,
      country: typeof country === 'string' && country.trim() ? country.trim() : undefined,
    };
  } catch {
    return {};
  }
}

const STAC_HELP_LINKS = {
  catalog: 'https://planetarycomputer.microsoft.com/catalog',
  docs: 'https://planetarycomputer.microsoft.com/docs/concepts/stac/',
  esriMpc: 'https://github.com/Esri/arcgis-for-mpc',
  spec: 'https://stacspec.org/',
} as const;

const DATABASE_PLATFORM_OPTIONS = [
  'SQL Server',
  'BigQuery',
  'Dameng',
  'DB2',
  'Elasticsearch',
  'OpenSearch',
  'Oracle',
  'PostgreSQL',
  'Redshift',
  'SAP HANA',
  'Snowflake',
  'Teradata',
] as const;

type StacPresetId = 'planetary-computer' | 'custom';
type StacAuthMode = 'none' | 'bearer';

interface StacKvRow {
  id: string;
  name: string;
  value: string;
}

interface StacConnectionConfig {
  connectionName: string;
  presetId: StacPresetId;
  /** Catalog API root or full /search URL (used when presetId is custom). */
  customCatalogBaseUrl: string;
  authMode: StacAuthMode;
  bearerToken: string;
  customHeaders: StacKvRow[];
  customParams: StacKvRow[];
  /** Notes or paths for cloud / ACS-style context (browser cannot apply .acs like ArcGIS Pro). */
  cloudStorageEntries: string[];
}

function newStacKvRow(): StacKvRow {
  return { id: `kv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: '', value: '' };
}

function defaultStacConnection(): StacConnectionConfig {
  return {
    connectionName: 'Planetary Computer',
    presetId: 'planetary-computer',
    customCatalogBaseUrl: '',
    authMode: 'none',
    bearerToken: '',
    customHeaders: [],
    customParams: [],
    cloudStorageEntries: [],
  };
}

function normalizeStacConnection(raw: unknown): StacConnectionConfig {
  const base = defaultStacConnection();
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Record<string, unknown>;
  const asRows = (v: unknown): StacKvRow[] => {
    if (!Array.isArray(v)) return [];
    return v.map((r, i) => {
      const x = r as Record<string, unknown>;
      return {
        id: typeof x?.id === 'string' ? x.id : `kv-${i}-${Math.random().toString(36).slice(2)}`,
        name: String(x?.name ?? ''),
        value: String(x?.value ?? ''),
      };
    });
  };
  const preset = o.presetId === 'custom' ? 'custom' : 'planetary-computer';
  return {
    connectionName: String(o.connectionName ?? base.connectionName).trim() || base.connectionName,
    presetId: preset,
    customCatalogBaseUrl: String(o.customCatalogBaseUrl ?? ''),
    authMode: o.authMode === 'bearer' ? 'bearer' : 'none',
    bearerToken: '',
    customHeaders: asRows(o.customHeaders),
    customParams: asRows(o.customParams),
    cloudStorageEntries: Array.isArray(o.cloudStorageEntries)
      ? o.cloudStorageEntries.map((s: unknown) => String(s))
      : [],
  };
}

function loadStacConnection(): StacConnectionConfig {
  try {
    const raw = localStorage.getItem(STAC_CONNECTION_STORAGE_KEY);
    if (!raw) return defaultStacConnection();
    return normalizeStacConnection(JSON.parse(raw));
  } catch {
    return defaultStacConnection();
  }
}

/** Persists config without bearer token (session-only secret). */
function persistStacConnectionToStorage(c: StacConnectionConfig) {
  const { bearerToken: _t, ...rest } = c;
  localStorage.setItem(STAC_CONNECTION_STORAGE_KEY, JSON.stringify(rest));
}

function cloneStacModalDraft(c: StacConnectionConfig): StacConnectionConfig {
  return {
    ...c,
    bearerToken: c.bearerToken,
    customHeaders: c.customHeaders.map(r => ({ ...r })),
    customParams: c.customParams.map(r => ({ ...r })),
    cloudStorageEntries: [...c.cloudStorageEntries],
  };
}

function getResolvedStacSearchUrl(config: StacConnectionConfig): string {
  if (config.presetId === 'planetary-computer') return PC_STAC_SEARCH_URL;
  let base = config.customCatalogBaseUrl.trim().replace(/\/$/, '');
  if (!base) return PC_STAC_SEARCH_URL;
  if (/\/search$/i.test(base)) return base;
  return `${base}/search`;
}

/** True when resolved URL is the standard Planetary Computer STAC search endpoint (query string ignored). */
function isDefaultPlanetaryComputerStacSearchUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const path = (u.pathname.replace(/\/+$/, '') || '/').toLowerCase();
    return u.hostname.toLowerCase() === 'planetarycomputer.microsoft.com' && path === '/api/stac/v1/search';
  } catch {
    return false;
  }
}

function appendStacQueryParams(url: string, rows: StacKvRow[]): string {
  const params = new URLSearchParams();
  for (const row of rows) {
    const n = row.name.trim();
    if (n) params.append(n, row.value);
  }
  const qs = params.toString();
  if (!qs) return url;
  return url + (url.includes('?') ? '&' : '?') + qs;
}

function buildStacRequestHeaders(config: StacConnectionConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/geo+json, application/json',
  };
  if (config.authMode === 'bearer' && config.bearerToken.trim()) {
    headers.Authorization = `Bearer ${config.bearerToken.trim()}`;
  }
  for (const row of config.customHeaders) {
    const n = row.name.trim();
    if (n) headers[n] = row.value;
  }
  return headers;
}

function buildStacGetHeaders(config: StacConnectionConfig): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (config.authMode === 'bearer' && config.bearerToken.trim()) {
    headers.Authorization = `Bearer ${config.bearerToken.trim()}`;
  }
  for (const row of config.customHeaders) {
    const n = row.name.trim();
    if (n) headers[n] = row.value;
  }
  return headers;
}

function getStacCollectionsListUrl(config: StacConnectionConfig): string {
  const searchUrl = getResolvedStacSearchUrl(config).split('?')[0];
  if (/\/search$/i.test(searchUrl)) return searchUrl.replace(/\/search$/i, '/collections');
  return `${searchUrl.replace(/\/$/, '')}/collections`;
}

interface StacCollectionSummary {
  id: string;
  title: string;
  description: string;
}

async function fetchAllStacCollections(config: StacConnectionConfig): Promise<StacCollectionSummary[]> {
  const listRoot = getStacCollectionsListUrl(config);
  const headers = buildStacGetHeaders(config);
  const out: StacCollectionSummary[] = [];
  let url: string | null = listRoot;
  const originBase = new URL(listRoot);
  for (let i = 0; i < 60 && url; i++) {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`STAC collections failed (${res.status})`);
    const data = await res.json();
    const cols = Array.isArray(data?.collections) ? data.collections : [];
    for (const c of cols) {
      const id = String(c?.id ?? '');
      if (!id) continue;
      out.push({
        id,
        title: String(c?.title ?? id),
        description: typeof c?.description === 'string' ? c.description : '',
      });
    }
    const next = data?.links?.find((l: { rel?: string; href?: string }) => l.rel === 'next' && l.href);
    const href = next?.href ? String(next.href) : '';
    if (!href) {
      url = null;
    } else if (href.startsWith('http')) {
      url = href;
    } else if (href.startsWith('/')) {
      url = `${originBase.origin}${href}`;
    } else {
      url = new URL(href, listRoot).toString();
    }
  }
  return out;
}

function stacItemFootprintGeometry(item: any): any | null {
  const g = item?.geometry;
  if (g && typeof g === 'object' && g.type) return g;
  const bbox = item?.bbox;
  if (Array.isArray(bbox) && bbox.length >= 4) {
    const [w, s, e, n] = bbox as number[];
    if (Number.isFinite(w) && Number.isFinite(s) && Number.isFinite(e) && Number.isFinite(n)) {
      return {
        type: 'Polygon' as const,
        coordinates: [
          [
            [w, s],
            [e, s],
            [e, n],
            [w, n],
            [w, s],
          ],
        ],
      };
    }
  }
  return null;
}

function bboxToRgCoordinates(bbox: [number, number, number, number]): [[number, number], [number, number], [number, number], [number, number]] {
  const [w, s, e, n] = bbox;
  return [
    [w, n],
    [e, n],
    [e, s],
    [w, s],
  ];
}

function stacItemStableKey(item: any): string {
  return `${String(item?.id ?? '')}::${String(item?.collection ?? '')}`;
}

function getStacItemCollection(item: any): string {
  const c = item?.collection;
  if (typeof c === 'string' && c.trim()) return c.trim();
  const pc = item?.properties?.collection;
  if (typeof pc === 'string' && pc.trim()) return pc.trim();
  return '';
}

function getStacItemIdForThumb(item: any): string {
  if (item?.id !== undefined && item?.id !== null) {
    const s = String(item.id).trim();
    if (s) return s;
  }
  const p = item?.properties?.id;
  if (p !== undefined && p !== null) {
    const s = String(p).trim();
    if (s) return s;
  }
  return '';
}

function resolveStacAssetHref(item: any, href: string): string {
  const t = href.trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  const self = getStacItemSelfHref(item);
  if (!self) return t;
  try {
    return new URL(t, self).toString();
  } catch {
    return t;
  }
}

function buildPcPreviewPngUrl(
  collection: string,
  itemId: string,
  assets: string,
  assetBidx: string,
  width?: number,
  height?: number,
): string {
  const u = new URL('https://planetarycomputer.microsoft.com/api/data/v1/item/preview.png');
  u.searchParams.set('collection', collection);
  u.searchParams.set('item', itemId);
  u.searchParams.set('assets', assets);
  u.searchParams.set('asset_bidx', assetBidx);
  u.searchParams.set('nodata', '0');
  u.searchParams.set('format', 'png');
  if (width && height) {
    u.searchParams.set('width', String(Math.min(4096, Math.max(64, Math.floor(width)))));
    u.searchParams.set('height', String(Math.min(4096, Math.max(64, Math.floor(height)))));
  }
  return u.toString();
}

function stacCatalogLooksLikePlanetaryComputer(config: StacConnectionConfig): boolean {
  if (config.presetId === 'planetary-computer') return true;
  try {
    return /planetarycomputer\.microsoft\.com/i.test(getResolvedStacSearchUrl(config));
  } catch {
    return false;
  }
}

type StacThumbUrlOptions = { forMapOverlay?: boolean };

function getStacItemThumbCandidateUrls(item: any, connection?: StacConnectionConfig, options?: StacThumbUrlOptions): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (raw: string) => {
    const t = raw.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };

  const mapOv = Boolean(options?.forMapOverlay);
  const usePcPreview = !connection || stacCatalogLooksLikePlanetaryComputer(connection);
  const coll = getStacItemCollection(item);
  const id = getStacItemIdForThumb(item);

  /**
   * For Mapbox `image` sources the bitmap is stretched to the scene bbox. If we try small STAC
   * `thumbnail` URLs first, fetchStacMapOverlayBlobUrl used to accept 256px images and the map looked blocky.
   * Planetary Computer `item/preview.png` supports up to 4096px — try those first for map overlays.
   */
  if (mapOv && usePcPreview && coll && id) {
    for (const sz of [4096, 3072, 2560, 2048, 1536, 1280, 1024]) {
      add(buildPcPreviewPngUrl(coll, id, 'visual', 'visual|1,2,3', sz, sz));
      add(buildPcPreviewPngUrl(coll, id, 'B04,B03,B02', 'B04|1,B03|1,B02|1', sz, sz));
    }
  }

  const a = item?.assets as Record<string, { href?: string } | undefined> | undefined;
  const pick = (k: string) => {
    const h = a?.[k]?.href;
    return typeof h === 'string' && h.trim() ? resolveStacAssetHref(item, h) : '';
  };

  const tci = pick('TCI');
  if (tci && !/\.(tif|tiff|jp2|nc|vrt)(\?|$)/i.test(tci)) add(tci);
  const visual = pick('visual');
  if (visual && !/\.(tif|tiff|jp2|nc|vrt)(\?|$)/i.test(visual)) add(visual);
  const previewKeys = mapOv
    ? (['rendered_preview', 'render', 'preview'] as const)
    : (['rendered_preview', 'render', 'preview', 'thumbnail', 'thumb'] as const);
  for (const key of previewKeys) {
    const u = pick(key);
    if (u) add(u);
  }

  if (usePcPreview && coll && id && !mapOv) {
    add(buildPcPreviewPngUrl(coll, id, 'visual', 'visual|1,2,3', 512, 512));
    add(buildPcPreviewPngUrl(coll, id, 'B04,B03,B02', 'B04|1,B03|1,B02|1', 512, 512));
  }
  return out;
}

function getStacItemThumbHref(item: any, connection?: StacConnectionConfig): string {
  const urls = getStacItemThumbCandidateUrls(item, connection);
  return urls[0] ?? '';
}

const PC_SAS_SIGN_ENDPOINT = 'https://planetarycomputer.microsoft.com/api/sas/v1/sign';

/** Plain object avoids any clash with JS `Map` / map library default exports in some bundler setups. */
const stacSignedHrefCache: Record<string, string> = Object.create(null);

function needsAzureBlobSasSigning(href: string): boolean {
  if (!href || !/^https?:\/\//i.test(href)) return false;
  if (/[?&]sig=/.test(href)) return false;
  return /(?:blob|dfs)\.core\.windows\.net|blob\.storage\.microsoft/i.test(href);
}

async function signStacAssetHrefForDisplay(href: string): Promise<string> {
  const trimmed = href.trim();
  if (!trimmed) return trimmed;
  const cached = stacSignedHrefCache[trimmed];
  if (cached !== undefined) return cached;
  if (!needsAzureBlobSasSigning(trimmed)) {
    stacSignedHrefCache[trimmed] = trimmed;
    return trimmed;
  }
  try {
    const res = await fetch(`${PC_SAS_SIGN_ENDPOINT}?href=${encodeURIComponent(trimmed)}`);
    if (!res.ok) {
      stacSignedHrefCache[trimmed] = trimmed;
      return trimmed;
    }
    const data = (await res.json()) as { href?: string };
    const signed = typeof data.href === 'string' ? data.href.trim() : '';
    const out = signed || trimmed;
    stacSignedHrefCache[trimmed] = out;
    return out;
  } catch {
    stacSignedHrefCache[trimmed] = trimmed;
    return trimmed;
  }
}

function revokeStacMapOverlayBlob(url: string | undefined) {
  if (url && url.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Download preview bytes with CORS, then return a blob: URL for Mapbox `image` sources.
 * Mapbox sometimes fails to paint remote HTTPS URLs (CORS / redirect); same-origin blobs are reliable.
 */
async function fetchStacMapOverlayBlobUrl(candidateUrls: string[]): Promise<string | null> {
  const isLargeEnoughImage = async (blob: Blob, minDim: number): Promise<boolean> => {
    try {
      const bitmap = await createImageBitmap(blob);
      const ok = bitmap.width >= minDim && bitmap.height >= minDim;
      bitmap.close();
      return ok;
    } catch {
      return true;
    }
  };

  const tryPass = async (minDim: number): Promise<string | null> => {
    for (const raw of candidateUrls) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      let fetchUrl = trimmed;
      if (needsAzureBlobSasSigning(trimmed)) {
        fetchUrl = await signStacAssetHrefForDisplay(trimmed);
        if (!fetchUrl.trim()) continue;
      }
      try {
        const res = await fetch(fetchUrl, { mode: 'cors', credentials: 'omit' });
        if (!res.ok) continue;
        const blob = await res.blob();
        if (blob.size < 32) continue;
        const okType =
          !blob.type ||
          blob.type.startsWith('image/') ||
          blob.type === 'application/octet-stream';
        if (!okType) continue;
        if (!(await isLargeEnoughImage(blob, minDim))) continue;
        return URL.createObjectURL(blob);
      } catch {
        continue;
      }
    }
    return null;
  };

  /** Prefer sharp previews for georeferenced image overlays; avoid stretching tiny thumbnails. */
  return (await tryPass(1536)) ?? (await tryPass(1024)) ?? (await tryPass(768)) ?? (await tryPass(512)) ?? null;
}

function StacExploreThumb({ hrefList, reactKey }: { hrefList: string[]; reactKey: string }) {
  const listSig = hrefList.map(h => String(h).trim()).filter(Boolean).join('\u001e');

  const cleanList = useMemo(() => {
    const parts = listSig.split('\u001e').filter(Boolean);
    const seen = new Set<string>();
    const o: string[] = [];
    for (const t of parts) {
      if (seen.has(t)) continue;
      seen.add(t);
      o.push(t);
    }
    return o;
  }, [listSig]);

  const [attempt, setAttempt] = useState(0);
  const [src, setSrc] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);
  const blobUrlRef = useRef<string | null>(null);

  const revokeBlob = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    revokeBlob();
    setAttempt(0);
    setBroken(false);
    setSrc(null);
  }, [reactKey, listSig, revokeBlob]);

  const href = cleanList[attempt] ?? '';

  useEffect(() => {
    revokeBlob();
    if (!href) {
      setSrc(null);
      return;
    }
    let cancelled = false;
    const run = async () => {
      if (needsAzureBlobSasSigning(href)) {
        setSrc(null);
        const signed = await signStacAssetHrefForDisplay(href);
        if (!cancelled) setSrc(signed?.trim() ? signed : null);
        return;
      }
      if (/planetarycomputer\.microsoft\.com\/api\/data\//i.test(href)) {
        try {
          const res = await fetch(href, { mode: 'cors' });
          if (!cancelled && res.ok) {
            const blob = await res.blob();
            if (!cancelled && blob.size > 32) {
              const okType =
                !blob.type ||
                blob.type.startsWith('image/') ||
                blob.type === 'application/octet-stream';
              if (okType) {
                const u = URL.createObjectURL(blob);
                blobUrlRef.current = u;
                setSrc(u);
                return;
              }
            }
          }
        } catch {
          /* fall through: try <img src={href}> */
        }
      }
      if (!cancelled) setSrc(href);
    };
    void run();
    return () => {
      cancelled = true;
      revokeBlob();
    };
  }, [href, revokeBlob]);

  const onImgError = useCallback(() => {
    revokeBlob();
    setSrc(null);
    setAttempt(current => {
      const next = current + 1;
      if (next < cleanList.length) return next;
      setBroken(true);
      return current;
    });
  }, [cleanList.length, revokeBlob]);

  if (!cleanList.length || broken) {
    return <div className="si-explore-result-thumb-ph">—</div>;
  }
  if (src == null) {
    return <div className="si-explore-result-thumb-ph si-explore-result-thumb-loading" />;
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      className="si-explore-result-thumb-img"
      onError={onImgError}
    />
  );
}

function getStacItemSelfHref(item: any): string {
  const links = item?.links;
  if (!Array.isArray(links)) return '';
  const hit = links.find((l: any) => l.rel === 'self' || l.rel === 'item');
  return hit?.href ? String(hit.href) : '';
}

function getStacItemSensorLabel(item: any): string {
  const p = item?.properties || {};
  if (p.platform) return String(p.platform);
  if (p.constellation) return String(p.constellation);
  if (Array.isArray(p.instruments) && p.instruments.length) return String(p.instruments[0]);
  return String(item?.collection ?? '—');
}

const EXPLORE_RESULTS_PAGE_SIZE = 25;

/** Default search footprint (Dubai) when no field layer, pivot, or drawn AOI. */
const DUBAI_STAC_INTERSECTS = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [55.1, 25.0],
      [55.3, 25.0],
      [55.3, 25.2],
      [55.1, 25.2],
      [55.1, 25.0],
    ],
  ],
};
const EARTH_CIRCUMFERENCE_METERS = 40075016.68557849;
const ERROR_FILTER_PATTERNS = [
  'net::ERR_ABORTED',
  'services.sentinel-hub.com/ogc/wms',
  'sh.dataspace.copernicus.eu/ogc/wms',
  'api.mapbox.com/v4/mapbox.satellite'
];

interface WmsLayerInfo {
  name: string;
  title: string;
}

interface CustomLayer {
  id: string;
  name: string;
  geojson: any;
  visible: boolean;
  color?: string;
  source?: 'arcgis' | 'upload' | 'api' | 'stac';
  sourceUrl?: string;
  authToken?: string;
  /** Sanitized ArcGIS `drawingInfo` for Mapbox paint (unique value, class breaks, simple). */
  arcgisDrawingInfo?: Record<string, unknown> | null;
  /** When true, map uses `arcgisDrawingInfo` instead of a single layer color. */
  useArcGisSymbology?: boolean;
}

function parseStoredCustomLayers(raw: string | null): CustomLayer[] {
  if (!raw || typeof raw !== 'string') return [];
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data
      .filter(
        (x: unknown) =>
          x &&
          typeof x === 'object' &&
          typeof (x as CustomLayer).id === 'string' &&
          typeof (x as CustomLayer).name === 'string' &&
          (x as CustomLayer).geojson &&
          typeof (x as CustomLayer).geojson === 'object' &&
          typeof (x as CustomLayer).visible === 'boolean',
      )
      .map((x: any) => ({
        id: String(x.id),
        name: String(x.name),
        geojson: x.geojson,
        visible: Boolean(x.visible),
        color: typeof x.color === 'string' ? x.color : undefined,
        source: x.source === 'arcgis' || x.source === 'upload' || x.source === 'api' || x.source === 'stac' ? x.source : undefined,
        sourceUrl: typeof x.sourceUrl === 'string' ? x.sourceUrl : undefined,
        authToken: typeof x.authToken === 'string' ? x.authToken : undefined,
        arcgisDrawingInfo:
          x.arcgisDrawingInfo && typeof x.arcgisDrawingInfo === 'object' ? (x.arcgisDrawingInfo as Record<string, unknown>) : undefined,
        useArcGisSymbology: typeof x.useArcGisSymbology === 'boolean' ? x.useArcGisSymbology : undefined,
      }));
  } catch {
    return [];
  }
}

const SI_MAPBOX_POLY_FILTER: any = ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]];
const SI_MAPBOX_LINE_ONLY_FILTER: any = ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]];
const SI_MAPBOX_LINE_POLY_FILTER: any = [
  'in',
  ['geometry-type'],
  ['literal', ['Polygon', 'MultiPolygon', 'LineString', 'MultiLineString']],
];
const SI_MAPBOX_POINT_FILTER: any = ['in', ['geometry-type'], ['literal', ['Point', 'MultiPoint']]];

function siLayerMapboxStylePack(layer: CustomLayer): {
  fillFilter: any;
  lineFilter: any;
  pointFilter: any;
  fillPaint: Record<string, unknown>;
  linePaint: Record<string, unknown>;
  circlePaint: Record<string, unknown>;
} {
  const c = layer.color || '#22c55e';
  const useAg = layer.source === 'arcgis' && layer.useArcGisSymbology && layer.arcgisDrawingInfo;
  if (useAg) {
    const di = layer.arcgisDrawingInfo as any;
    const fill = arcgisDrawingInfoToFillPaint(di);
    const line = arcgisDrawingInfoToLinePaint(di, c);
    if (fill) {
      const outlineDriven = Object.prototype.hasOwnProperty.call(fill, 'fill-outline-color');
      return {
        fillFilter: SI_MAPBOX_POLY_FILTER,
        lineFilter: outlineDriven ? SI_MAPBOX_LINE_ONLY_FILTER : SI_MAPBOX_LINE_POLY_FILTER,
        pointFilter: SI_MAPBOX_POINT_FILTER,
        fillPaint: fill as Record<string, unknown>,
        linePaint: (line ?? { 'line-color': c, 'line-width': 1.5, 'line-opacity': 0.95 }) as Record<string, unknown>,
        circlePaint: {
          'circle-radius': 4,
          'circle-color': c,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#052e16',
        },
      };
    }
  }
  return {
    fillFilter: SI_MAPBOX_POLY_FILTER,
    lineFilter: SI_MAPBOX_LINE_POLY_FILTER,
    pointFilter: SI_MAPBOX_POINT_FILTER,
    fillPaint: { 'fill-color': c, 'fill-opacity': 0.35 },
    linePaint: { 'line-color': c, 'line-width': 1.5 },
    circlePaint: {
      'circle-radius': 4,
      'circle-color': c,
      'circle-stroke-width': 1,
      'circle-stroke-color': '#052e16',
    },
  };
}

function persistCustomLayersToStorage(layers: CustomLayer[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SATELLITE_CUSTOM_LAYERS_STORAGE_KEY, JSON.stringify(layers));
  } catch (e) {
    console.warn('Satellite Intelligence: could not persist custom layers', e);
  }
}

type LayerStyleMode = 'single' | 'classified';
type LayerClassMethod = 'natural-breaks' | 'equal-interval';

interface LayerSymbologyDraft {
  useArcGisOnline: boolean;
  style: LayerStyleMode;
  classes: number;
  colorRamp: 'viridis' | 'green' | 'warm';
  method: LayerClassMethod;
  color: string;
}

type AddLayerTab = 'arcgis' | 'upload' | 'database';

type EnvironmentalIndexId = 'NDWI' | 'NDMI' | 'EVI' | 'SAVI' | 'NDSI' | 'LST';

/** ArcGIS-style tool ids: order matches vertical toolbar (draw → sep → selection). */
type MapDrawTool =
  | 'select'
  | 'point'
  | 'polyline'
  | 'polygon'
  | 'rectangle'
  | 'circle'
  | 'freehand'
  | 'text'
  | 'box_select'
  | 'lasso';

interface DrawnAoiStats {
  mean: number;
  min: number;
  max: number;
  std: number;
  weeklyBandMin: number;
  weeklyBandMax: number;
}

function clampUnit(t: number) {
  return Math.max(0, Math.min(1, t));
}

function lerpHex(a: string, b: string, t: number): string {
  const parse = (x: string) => {
    const h = x.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)] as const;
  };
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${[r, g, bl].map(c => c.toString(16).padStart(2, '0')).join('')}`;
}

function indexValueToColor(value: number, range: [number, number], palette: string[]): string {
  if (!palette.length) return '#22c55e';
  const span = range[1] - range[0] || 1;
  const t = clampUnit((value - range[0]) / span);
  const max = palette.length - 1;
  const pos = t * max;
  const i = Math.min(max - 1, Math.floor(pos));
  const f = pos - i;
  return lerpHex(palette[i], palette[i + 1], f);
}

function environmentalIndicatorSummary(indexId: EnvironmentalIndexId, mean: number): string {
  if (indexId === 'LST') {
    if (mean < 22) return 'Cooler surface temperatures across the sampled period.';
    if (mean < 32) return 'Moderate land-surface temperatures — typical mixed land.';
    return 'Warm thermal signal — possible bare soil, urban, or water stress.';
  }
  if (mean < 0.2) {
    return 'Low vegetation response — bare soil, built-up areas, or water (typical in arid regions).';
  }
  if (mean < 0.4) {
    return 'Sparse or stressed vegetation — shrubs, sparse crops, or mixed desert patches.';
  }
  if (mean < 0.6) {
    return 'Moderate healthy vegetation — grassland or active agricultural canopy.';
  }
  return 'Strong vegetation signal — dense canopy or well-irrigated crops.';
}

function createPointFeature(lng: number, lat: number) {
  return {
    type: 'Feature',
    properties: { label: 'Drawn point' },
    geometry: { type: 'Point', coordinates: [lng, lat] },
  };
}

/** Pixel tolerance to snap to first vertex and close polygon. */
const POLYGON_CLOSE_SNAP_PX = 20;
/** Snap placed vertices to existing ones while sketching (digitizing). */
const POLYGON_VERTEX_SNAP_PX = 20;

const DEFAULT_DRAW_STYLE: DrawStyleConfig = {
  strokeColor: '#4ade80',
  fillColor: '#22c55e',
  strokeWidth: 3,
  fillOpacity: 0.28,
  pointRadius: 11,
};

interface PivotFeature {
  id: string;
  name: string;
  color: string;
  feature: any;
  centroid: [number, number];
}

interface WeeklyComposite {
  weekIndex: number;
  startDate: string;
  endDate: string;
  label: string;
  mean: number;
  min: number;
  max: number;
  itemCount: number;
  enabled: boolean;
}

const ENVIRONMENTAL_INDICES: Record<EnvironmentalIndexId, {
  label: string;
  collection: string;
  formula: string;
  range: [number, number];
  palette: string[];
  description: string;
}> = {
  NDWI: {
    label: 'NDWI',
    collection: 'sentinel-2-l2a',
    formula: '(B03 - B08) / (B03 + B08)',
    range: [-1, 1],
    palette: ['#7c2d12', '#fde68a', '#38bdf8', '#1d4ed8'],
    description: 'Open water and moisture response.',
  },
  NDMI: {
    label: 'NDMI',
    collection: 'sentinel-2-l2a',
    formula: '(B08 - B11) / (B08 + B11)',
    range: [-1, 1],
    palette: ['#92400e', '#fef3c7', '#22d3ee', '#0f766e'],
    description: 'Canopy moisture from NIR and SWIR.',
  },
  EVI: {
    label: 'EVI',
    collection: 'sentinel-2-l2a',
    formula: '2.5 * (B08 - B04) / (B08 + 6*B04 - 7.5*B02 + 1)',
    range: [-1, 1],
    palette: ['#7f1d1d', '#fde68a', '#22c55e', '#14532d'],
    description: 'Enhanced vegetation index for high biomass areas.',
  },
  SAVI: {
    label: 'SAVI',
    collection: 'sentinel-2-l2a',
    formula: '1.5 * (B08 - B04) / (B08 + B04 + 0.5)',
    range: [-1, 1],
    palette: ['#7c2d12', '#facc15', '#4ade80', '#166534'],
    description: 'Soil-adjusted vegetation index.',
  },
  NDSI: {
    label: 'NDSI',
    collection: 'sentinel-2-l2a',
    formula: '(B03 - B11) / (B03 + B11)',
    range: [-1, 1],
    palette: ['#334155', '#e0f2fe', '#ffffff', '#bae6fd'],
    description: 'Snow or bright surface response.',
  },
  LST: {
    label: 'LST',
    collection: 'landsat-c2-l2',
    formula: 'Land Surface Temperature from Collection 2 Level 2 thermal bands',
    range: [15, 45],
    palette: ['#1d4ed8', '#22c55e', '#fde047', '#ef4444'],
    description: 'Land Surface Temperature in Celsius from Landsat Collection 2 Level 2.',
  },
};

const PIVOT_COLORS = ['#22c55e', '#3b82f6', '#f97316', '#a855f7', '#06b6d4', '#eab308'];
const COLOR_RAMPS: Record<LayerSymbologyDraft['colorRamp'], string[]> = {
  viridis: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'],
  green: ['#14532d', '#166534', '#16a34a', '#4ade80', '#bbf7d0'],
  warm: ['#7f1d1d', '#b45309', '#f59e0b', '#fde047', '#fef9c3'],
};

type ExploreDateSourceMode = 'manual' | 'environmental_parameter' | 'sentinel2_views';

export default function SatelliteIntelligence() {
  const mapboxToken = useMapboxAccessToken();
  const geminiApiKey = useGeminiApiKey();
  const claudeApiKey = useClaudeApiKey();
  const deepseekApiKey = useDeepseekApiKey();
  const openWeatherApiKey = useOpenWeatherMapApiKey();
  const basemapCatalog = useMemo(() => buildBasemapCatalog(mapboxToken || ''), [mapboxToken]);
  const [viewState, setViewState] = useState({
    longitude: 20,
    latitude: 10,
    zoom: 1.4,
    pitch: 0,
    bearing: 0
  });

  const [sentinelWmsRev, setSentinelWmsRev] = useState(0);
  const wmsBaseUrl = useMemo(() => getSentinelHubWmsBaseUrl(), [sentinelWmsRev]);

  useEffect(() => {
    const bump = () => setSentinelWmsRev(r => r + 1);
    const unsubWms = subscribeSentinelHubWmsInstance(bump);
    const unsubAccess = subscribeSentinelHubAccessToken(bump);
    return () => {
      unsubWms();
      unsubAccess();
    };
  }, []);

  const [wmsLayer, setWmsLayer] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [customLayers, setCustomLayers] = useState<CustomLayer[]>(() => {
    if (typeof window === 'undefined') return [];
    return parseStoredCustomLayers(window.localStorage.getItem(SATELLITE_CUSTOM_LAYERS_STORAGE_KEY));
  });

  useEffect(() => {
    persistCustomLayersToStorage(customLayers);
  }, [customLayers]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [timeSeriesStart, setTimeSeriesStart] = useState('2023-11-18');
  const [timeSeriesEnd, setTimeSeriesEnd] = useState('2024-02-18');
  const [showFieldBoundaries, setShowFieldBoundaries] = useState(true);
  const [showProductivityZones, setShowProductivityZones] = useState(false);
  const [fieldAnalysisStatus, setFieldAnalysisStatus] = useState('');
  const [wmsLayers, setWmsLayers] = useState<WmsLayerInfo[]>([]);
  const [isLoadingLayers, setIsLoadingLayers] = useState(false);
  const [isLayerDropdownOpen, setIsLayerDropdownOpen] = useState(false);
  const [basemapId, setBasemapId] = useState(() =>
    getMapboxAccessToken() ? DEFAULT_BASEMAP_ID : DEFAULT_BASEMAP_ID_NO_MAPBOX,
  );
  const [isBasemapOpen, setIsBasemapOpen] = useState(false);

  useEffect(() => {
    if (mapboxToken) return;
    setBasemapId(prev => {
      const cat = buildBasemapCatalog('');
      const r = resolveBasemapId(prev);
      if (catalogEntryById(cat, r)) return r;
      return DEFAULT_BASEMAP_ID_NO_MAPBOX;
    });
  }, [mapboxToken]);

  useEffect(() => {
    setBasemapId(prev => {
      if (catalogEntryById(basemapCatalog, prev)) return prev;
      const r = resolveBasemapId(prev);
      if (catalogEntryById(basemapCatalog, r)) return r;
      return mapboxToken ? DEFAULT_BASEMAP_ID : DEFAULT_BASEMAP_ID_NO_MAPBOX;
    });
  }, [basemapCatalog, mapboxToken]);
  const [is3DView, setIs3DView] = useState(true);
  const [cloudCoverage, setCloudCoverage] = useState(20);
  const [isTimelinePlaying, setIsTimelinePlaying] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<EnvironmentalIndexId>('NDWI');
  const [selectedPivotId, setSelectedPivotId] = useState('all');
  const [weeklyComposites, setWeeklyComposites] = useState<WeeklyComposite[]>([]);
  const [stacItems, setStacItems] = useState<any[]>([]);
  const [stacStatus, setStacStatus] = useState('Ready to search Planetary Computer STAC.');
  const [isLoadingStac, setIsLoadingStac] = useState(false);
  const [stacConnection, setStacConnection] = useState<StacConnectionConfig>(() => loadStacConnection());
  const [isStacModalOpen, setIsStacModalOpen] = useState(false);
  const [stacModalDraft, setStacModalDraft] = useState<StacConnectionConfig>(() => cloneStacModalDraft(loadStacConnection()));
  const [isAcsPickerOpen, setIsAcsPickerOpen] = useState(false);
  const [acsPickerStaging, setAcsPickerStaging] = useState<string[]>([]);
  const [acsPickerManualPath, setAcsPickerManualPath] = useState('');
  const [acsPickerFilter, setAcsPickerFilter] = useState('');
  const [exploreTab, setExploreTab] = useState<'parameters' | 'results' | 'source'>('parameters');
  const [exploreCatalogLoadKey, setExploreCatalogLoadKey] = useState(0);
  const [stacCatalogCollections, setStacCatalogCollections] = useState<StacCollectionSummary[]>([]);
  const [isLoadingStacCollections, setIsLoadingStacCollections] = useState(false);
  const [stacCollectionsLoadError, setStacCollectionsLoadError] = useState('');
  const [exploreCollectionSearch, setExploreCollectionSearch] = useState('');
  const [exploreDescriptionKeyword, setExploreDescriptionKeyword] = useState('');
  const [exploreSelectedCollectionIds, setExploreSelectedCollectionIds] = useState<string[]>([]);
  const [exploreDateStart, setExploreDateStart] = useState('');
  const [exploreDateEnd, setExploreDateEnd] = useState('');
  const [exploreDateSourceMode, setExploreDateSourceMode] = useState<ExploreDateSourceMode>('environmental_parameter');
  const [exploreExtentMode, setExploreExtentMode] = useState<'map' | 'drawn' | 'layer' | 'default' | 'manual'>('default');
  const [exploreManualBbox, setExploreManualBbox] = useState({ north: '', south: '', east: '', west: '' });
  const [exploreIdsText, setExploreIdsText] = useState('');
  const [exploreUseCloudFilter, setExploreUseCloudFilter] = useState(true);
  const [exploreCloudCoverMax, setExploreCloudCoverMax] = useState(20);
  const [exploreLimit, setExploreLimit] = useState(80);
  const [exploreResultsPage, setExploreResultsPage] = useState(0);
  const [exploreResultsSortDesc, setExploreResultsSortDesc] = useState(true);
  const [exploreSelectedResultKeys, setExploreSelectedResultKeys] = useState<string[]>([]);
  const [stacAddToMenuKey, setStacAddToMenuKey] = useState<string | null>(null);
  const [stacMosaicStaging, setStacMosaicStaging] = useState<any[]>([]);
  const [showStacFootprintsOnMap, setShowStacFootprintsOnMap] = useState(false);
  const [isWmsOverlayVisible, setIsWmsOverlayVisible] = useState(true);
  const [stacMapThumb, setStacMapThumb] = useState<null | { url: string; coordinates: [[number, number], [number, number], [number, number], [number, number]] }>(
    null,
  );
  const [isStacThumbVisible, setIsStacThumbVisible] = useState(true);
  const [stacMapThumbLabel, setStacMapThumbLabel] = useState('');
  const [isAddLayerModalOpen, setIsAddLayerModalOpen] = useState(false);
  const [addLayerTab, setAddLayerTab] = useState<AddLayerTab>('arcgis');
  const [addLayerUrl, setAddLayerUrl] = useState('');
  const [addLayerToken, setAddLayerToken] = useState(() => (typeof window !== 'undefined' ? getArcgisPortalToken() : ''));
  const [addLayerName, setAddLayerName] = useState('');
  const [addLayerStatus, setAddLayerStatus] = useState('');
  const [isConnectingLayer, setIsConnectingLayer] = useState(false);
  const [discoveredArcgisLayers, setDiscoveredArcgisLayers] = useState<Array<{ id: number; name: string; url: string; kind: 'layer' | 'table'; geometryType?: string }>>([]);
  const [selectedDiscoveredArcgisUrl, setSelectedDiscoveredArcgisUrl] = useState('');
  const [isAddingDiscoveredArcgisLayer, setIsAddingDiscoveredArcgisLayer] = useState(false);
  const [activeLayerActionDialog, setActiveLayerActionDialog] = useState<null | { mode: 'table' | 'symbology' | 'legend'; layerId: string }>(null);
  const [syncingLayerId, setSyncingLayerId] = useState<string | null>(null);
  const [tableSearchText, setTableSearchText] = useState('');
  const [tableFilterField, setTableFilterField] = useState('');
  const [tableFilterValue, setTableFilterValue] = useState('');
  const [tableShowSelectedOnly, setTableShowSelectedOnly] = useState(false);
  const [tableSelectedRowIds, setTableSelectedRowIds] = useState<string[]>([]);
  const [symbologyDraft, setSymbologyDraft] = useState<LayerSymbologyDraft>({
    useArcGisOnline: false,
    style: 'single',
    classes: 5,
    colorRamp: 'viridis',
    method: 'natural-breaks',
    color: '#22c55e',
  });
  const [dbPlatform, setDbPlatform] = useState<(typeof DATABASE_PLATFORM_OPTIONS)[number]>('SQL Server');
  const [dbInstance, setDbInstance] = useState('');
  const [dbAuthType, setDbAuthType] = useState<'database' | 'operating-system'>('database');
  const [dbUsername, setDbUsername] = useState('');
  const [dbPassword, setDbPassword] = useState('');
  const [dbSaveCredentials, setDbSaveCredentials] = useState(true);
  const [dbName, setDbName] = useState('');
  const [dbConnectionFileName, setDbConnectionFileName] = useState('');
  const clearStacMapThumb = useCallback(() => {
    setStacMapThumb(prev => {
      revokeStacMapOverlayBlob(prev?.url);
      return null;
    });
    setIsStacThumbVisible(true);
    setStacMapThumbLabel('');
  }, []);
  const [openExploreAccordions, setOpenExploreAccordions] = useState<Record<string, boolean>>({
    description: false,
    datetime: false,
    extent: false,
    ids: false,
    attributes: false,
    limit: false,
  });
  const [mapDrawTool, setMapDrawTool] = useState<MapDrawTool>('select');
  const [drawStyle, setDrawStyle] = useState<DrawStyleConfig>(() => ({ ...DEFAULT_DRAW_STYLE }));
  const [pointerLngLat, setPointerLngLat] = useState<[number, number] | null>(null);
  const [rectCirclePreview, setRectCirclePreview] = useState<
    null | { kind: 'rectangle' | 'circle' | 'box_select'; a: [number, number]; b: [number, number] }
  >(null);
  const [geomUndoStack, setGeomUndoStack] = useState<(any | null)[]>([]);
  const [geomRedoStack, setGeomRedoStack] = useState<(any | null)[]>([]);
  const [polylineStart, setPolylineStart] = useState<[number, number] | null>(null);
  const [polygonRing, setPolygonRing] = useState<[number, number][]>([]);
  const [drawnGeometry, setDrawnGeometry] = useState<any | null>(null);
  const [drawnStats, setDrawnStats] = useState<DrawnAoiStats | null>(null);
  const [expandedEnvSection, setExpandedEnvSection] = useState<
    'source' | 'layers' | 'explore-stac' | 'remote-sensing' | 'table-geo-ai'
  >('source');
  const [geoExplorerMessages, setGeoExplorerMessages] = useState<GeoExplorerMessage[]>([]);
  const [geoExplorerDraft, setGeoExplorerDraft] = useState('');
  const [geoExplorerPendingImage, setGeoExplorerPendingImage] = useState<{
    mime: string;
    base64: string;
  } | null>(null);
  const [geoExplorerBusy, setGeoExplorerBusy] = useState(false);
  const [geoExplorerChatError, setGeoExplorerChatError] = useState('');
  const [geoAiPinLngLat, setGeoAiPinLngLat] = useState<[number, number] | null>(null);
  const [geoAiInspectCard, setGeoAiInspectCard] = useState<null | GeoAiInspectCardState>(null);
  const geoAiReverseGeocodeKeyRef = useRef<string>('');
  const geoExplorerFileInputRef = useRef<HTMLInputElement | null>(null);
  const geoExplorerInFlightRef = useRef(false);
  const [geoAiModelTab, setGeoAiModelTab] = useState<'gemini' | 'claude' | 'deepseek'>('gemini');
  const [geoAiChatMessages, setGeoAiChatMessages] = useState<Array<{ id: string; role: 'user' | 'assistant'; text: string }>>(
    [],
  );
  const [geoAiDraft, setGeoAiDraft] = useState('');
  const [geoAiBusy, setGeoAiBusy] = useState(false);
  const [geoAiChatError, setGeoAiChatError] = useState('');
  const geoAiInFlightRef = useRef(false);
  const [geoDeepseekChatMessages, setGeoDeepseekChatMessages] = useState<
    Array<{ id: string; role: 'user' | 'assistant'; text: string }>
  >([]);
  const [geoDeepseekDraft, setGeoDeepseekDraft] = useState('');
  const [geoDeepseekBusy, setGeoDeepseekBusy] = useState(false);
  const [geoDeepseekChatError, setGeoDeepseekChatError] = useState('');
  const geoDeepseekInFlightRef = useRef(false);
  const [polygonClosingSnap, setPolygonClosingSnap] = useState(false);
  const [drawAssistHint, setDrawAssistHint] = useState('');
  const [circleRadiusM, setCircleRadiusM] = useState<number | null>(null);
  const acsFileInputRef = useRef<HTMLInputElement | null>(null);
  const exploreCatalogSigRef = useRef('');
  const searchRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any | null>(null);
  const drawnGeometryRef = useRef<any | null>(null);
  const dragRectCircleRef = useRef<null | { kind: 'rectangle' | 'circle' | 'box_select'; start: [number, number] }>(null);
  const preEditGeomRef = useRef<any | null>(null);
  const polylineStartRef = useRef<[number, number] | null>(null);
  polylineStartRef.current = polylineStart;
  const mapDrawToolRef = useRef<MapDrawTool>('select');
  mapDrawToolRef.current = mapDrawTool;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const skipNextMapClickRef = useRef(false);
  const editDragRef = useRef<null | { mode: 'vertex'; ref: VertexRef } | { mode: 'pan'; last: [number, number] }>(null);
  const consoleErrorRef = useRef<typeof console.error | null>(null);
  const stacFocusHydratedRef = useRef(false);

  const applySelectedDate = (date: Date) => {
    const iso = date.toISOString().split('T')[0];
    setSelectedDate(date);
    setTimeSeriesStart(prev => (prev && iso < prev ? iso : prev || iso));
    setTimeSeriesEnd(prev => (prev && iso > prev ? iso : prev || iso));
  };

  const getGeoJsonBounds = (geojson: any): [number, number, number, number] | null => {
    const points: [number, number][] = [];

    const walkCoords = (coords: any) => {
      if (!coords) return;
      if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
        points.push([coords[0], coords[1]]);
        return;
      }
      if (Array.isArray(coords)) {
        coords.forEach(walkCoords);
      }
    };

    if (geojson.type === 'FeatureCollection') {
      geojson.features?.forEach((f: any) => walkCoords(f.geometry?.coordinates));
    } else if (geojson.type === 'Feature') {
      walkCoords(geojson.geometry?.coordinates);
    } else if (geojson.type === 'GeometryCollection') {
      geojson.geometries?.forEach((g: any) => walkCoords(g.coordinates));
    } else if (geojson.coordinates) {
      walkCoords(geojson.coordinates);
    }

    if (points.length === 0) return null;

    let [minX, minY] = points[0];
    let [maxX, maxY] = points[0];
    for (let i = 1; i < points.length; i++) {
      const [x, y] = points[i];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    return [minX, minY, maxX, maxY];
  };

  const getMetersPerPixel = (latitude: number, zoom: number, tileSize = 512) => {
    const latRad = (latitude * Math.PI) / 180;
    return (EARTH_CIRCUMFERENCE_METERS * Math.cos(latRad)) / (tileSize * Math.pow(2, zoom));
  };

  const getGeoJsonCentroid = (geojson: any): [number, number] => {
    const bounds = getGeoJsonBounds(geojson);
    if (!bounds) return [viewState.longitude, viewState.latitude];
    return [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
  };

  const normalizePivotId = (value: unknown, index: number) => {
    const raw = String(value ?? '').trim();
    const match = raw.match(/\d+/);
    const number = match ? Number(match[0]) : index + 1;
    return `P-${String(number).padStart(2, '0')}`;
  };

  const handleLayerFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const parsed = await parseFile(file);
      if (parsed.type === 'geojson') {
        const id = `custom-${Date.now()}-${file.name}`;
        setCustomLayers(prev => [
          ...prev,
          {
            id,
            name: addLayerName.trim() || file.name,
            geojson: parsed.data,
            visible: true,
            source: 'upload',
          }
        ]);
        setAddLayerStatus(`Imported layer: ${addLayerName.trim() || file.name}`);
        setAddLayerName('');
        setIsAddLayerModalOpen(false);

        const bounds = getGeoJsonBounds(parsed.data);
        if (bounds) {
          const [minX, minY, maxX, maxY] = bounds;
          const mapInstance = mapRef.current?.getMap ? mapRef.current.getMap() : mapRef.current;
          if (mapInstance && typeof mapInstance.fitBounds === 'function') {
            mapInstance.fitBounds(
              [
                [minX, minY],
                [maxX, maxY]
              ],
              { padding: 80, duration: 800 }
            );
          } else {
            const centerLng = (minX + maxX) / 2;
            const centerLat = (minY + maxY) / 2;
            setViewState(prev => ({
              ...prev,
              longitude: centerLng,
              latitude: centerLat,
              zoom: Math.max(prev.zoom, 13)
            }));
          }
        }
      } else {
        console.warn('Uploaded file does not contain spatial data');
        setAddLayerStatus('Selected file has no spatial features.');
      }
    } catch (error) {
      console.error('Failed to add layer', error);
      setAddLayerStatus('Failed to import file layer.');
    } finally {
      event.target.value = '';
    }
  };

  const toggle3DView = () => {
    const mapInstance = mapRef.current?.getMap ? mapRef.current.getMap() : mapRef.current;
    const nextIs3D = !is3DView;
    setIs3DView(nextIs3D);

    const pitch = nextIs3D ? Math.max(viewState.pitch || 0, 55) : 0;
    const bearing = viewState.bearing || 0;
    const projection = nextIs3D ? { name: 'globe' as const } : { name: 'mercator' as const };

    if (mapInstance && typeof mapInstance.setProjection === 'function') {
      try {
        mapInstance.setProjection(projection);
      } catch {
      }
    }

    if (mapInstance && typeof mapInstance.easeTo === 'function') {
      mapInstance.easeTo({
        pitch,
        bearing,
        duration: 800
      });
    }

    setViewState(prev => ({
      ...prev,
      pitch,
      bearing
    }));
  };

  const handleSelectWmsLayer = (layerName: string) => {
    setWmsLayer(current => (current === layerName ? '' : layerName));
    setIsLayerDropdownOpen(false);
  };

  const handleUploadCustomLayerClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const openAddLayerModal = () => {
    setAddLayerStatus('');
    setDiscoveredArcgisLayers([]);
    setSelectedDiscoveredArcgisUrl('');
    setIsAddLayerModalOpen(true);
  };

  const closeAddLayerModal = () => {
    setIsAddLayerModalOpen(false);
    setAddLayerStatus('');
    setDiscoveredArcgisLayers([]);
    setSelectedDiscoveredArcgisUrl('');
  };

  const deriveArcgisLayerName = (serviceUrl: string, fallback = 'ArcGIS Layer') => {
    const clean = serviceUrl.replace(/\/+$/, '');
    const parts = clean.split('/');
    const last = parts[parts.length - 1] || '';
    const prev = parts[parts.length - 2] || '';
    if (/^\d+$/.test(last) && prev) return `${prev} ${last}`;
    return last || fallback;
  };

  const appendTokenIfAny = (url: string, token: string) => {
    if (!token.trim()) return url;
    const u = new URL(url);
    u.searchParams.set('token', token.trim());
    return u.toString();
  };

  const importArcgisFeatureLayer = async () => {
    const raw = addLayerUrl.trim();
    if (!raw) {
      setAddLayerStatus('Enter ArcGIS Feature Service URL.');
      return;
    }
    let baseUrl = raw;
    if (!/^https?:\/\//i.test(baseUrl)) baseUrl = `https://${baseUrl}`;
    setIsConnectingLayer(true);
    setAddLayerStatus('Connecting to ArcGIS service...');
    try {
      const clean = baseUrl.replace(/[?].*$/, '').replace(/\/+$/, '');
      const serviceBase = /\/FeatureServer\/\d+$/i.test(clean)
        ? clean.replace(/\/\d+$/i, '')
        : /\/FeatureServer$/i.test(clean)
          ? clean
          : `${clean}/FeatureServer`;

      const discoverUrl = appendTokenIfAny(`${serviceBase}?f=pjson`, addLayerToken);
      const discoverRes = await fetch(discoverUrl);
      if (!discoverRes.ok) throw new Error(`discover failed (${discoverRes.status})`);
      const discover = await discoverRes.json();
      const discovered = [
        ...(Array.isArray(discover?.layers) ? discover.layers.map((l: any) => ({ ...l, kind: 'layer' as const })) : []),
        ...(Array.isArray(discover?.tables) ? discover.tables.map((t: any) => ({ ...t, kind: 'table' as const })) : []),
      ]
        .filter((l: any) => typeof l?.id === 'number' && typeof l?.name === 'string')
        .map((l: any) => ({
          id: l.id as number,
          name: l.name as string,
          kind: l.kind as 'layer' | 'table',
          url: `${serviceBase}/${l.id}`,
          geometryType: typeof l?.geometryType === 'string' ? (l.geometryType as string) : undefined,
        }));

      if (!discovered.length) {
        throw new Error('No layers/tables found in this service URL.');
      }

      setDiscoveredArcgisLayers(discovered);
      setSelectedDiscoveredArcgisUrl(discovered[0].url);
      if (!addLayerName.trim()) {
        setAddLayerName(discovered[0].name);
      }
      setAddLayerStatus(`Found ${discovered.length} layer/table(s). Select one and click Add.`);
    } catch (error) {
      setAddLayerStatus(error instanceof Error ? error.message : 'Failed to connect ArcGIS layer.');
    } finally {
      setIsConnectingLayer(false);
    }
  };

  const addSelectedDiscoveredArcgisLayer = async () => {
    if (!selectedDiscoveredArcgisUrl) {
      setAddLayerStatus('Select a discovered layer first.');
      return;
    }
    setIsAddingDiscoveredArcgisLayer(true);
    setAddLayerStatus('Adding selected layer...');
    try {
      const qUrl = `${selectedDiscoveredArcgisUrl}/query?where=1%3D1&outFields=*&returnGeometry=true&f=geojson`;
      const finalUrl = appendTokenIfAny(qUrl, addLayerToken);
      const tokenTrim = addLayerToken.trim() || undefined;
      const [res, drawingInfoRaw] = await Promise.all([
        fetch(finalUrl),
        fetchArcgisLayerDrawingInfo(selectedDiscoveredArcgisUrl, tokenTrim),
      ]);
      if (!res.ok) throw new Error(`query failed (${res.status})`);
      const data = await res.json();
      if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
        throw new Error('Service did not return GeoJSON features.');
      }
      const arcgisDrawingInfo = drawingInfoRaw ? sanitizeArcgisDrawingInfoForClient(drawingInfoRaw) : null;
      const selectedLayer = discoveredArcgisLayers.find(l => l.url === selectedDiscoveredArcgisUrl);
      const layerTitle = addLayerName.trim() || selectedLayer?.name || deriveArcgisLayerName(selectedDiscoveredArcgisUrl);
      const id = `arcgis-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setCustomLayers(prev => [
        ...prev,
        {
          id,
          name: layerTitle,
          geojson: data,
          visible: true,
          source: 'arcgis',
          sourceUrl: selectedDiscoveredArcgisUrl,
          authToken: tokenTrim,
          color: '#22c55e',
          arcgisDrawingInfo,
          useArcGisSymbology: false,
        },
      ]);
      const bounds = getGeoJsonBounds(data);
      if (bounds) {
        const mapInstance = mapRef.current?.getMap ? mapRef.current.getMap() : mapRef.current;
        mapInstance?.fitBounds?.(
          [
            [bounds[0], bounds[1]],
            [bounds[2], bounds[3]],
          ],
          { padding: 80, duration: 800 },
        );
      }
      setAddLayerStatus(`Added ArcGIS layer: ${layerTitle}`);
      setIsAddLayerModalOpen(false);
      setAddLayerUrl('');
      setAddLayerToken('');
      setAddLayerName('');
      setDiscoveredArcgisLayers([]);
      setSelectedDiscoveredArcgisUrl('');
    } catch (error) {
      setAddLayerStatus(error instanceof Error ? error.message : 'Failed to add selected ArcGIS layer.');
    } finally {
      setIsAddingDiscoveredArcgisLayer(false);
    }
  };

  const handleDatabaseConnection = () => {
    if (!dbInstance.trim()) {
      setAddLayerStatus('Enter database instance/host first.');
      return;
    }
    if (dbAuthType === 'database' && !dbUsername.trim()) {
      setAddLayerStatus('Enter database username for database authentication.');
      return;
    }
    setAddLayerStatus(
      `Database connection profile saved: ${dbPlatform} @ ${dbInstance}${dbName ? ` / ${dbName}` : ''}.`,
    );
  };

  const toggleCustomLayerVisibility = (id: string, visible: boolean) => {
    setCustomLayers(prev =>
      prev.map(layer =>
        layer.id === id ? { ...layer, visible } : layer
      )
    );
  };

  const refreshArcgisLayer = async (layer: CustomLayer) => {
    if (layer.source !== 'arcgis' || !layer.sourceUrl) {
      setStacStatus(`Sync is only available for ArcGIS layers. "${layer.name}" is not ArcGIS.`);
      return;
    }
    setSyncingLayerId(layer.id);
    setStacStatus(`Syncing "${layer.name}"...`);
    try {
      const qUrl = `${layer.sourceUrl}/query?where=1%3D1&outFields=*&returnGeometry=true&f=geojson`;
      const res = await fetch(appendTokenIfAny(qUrl, layer.authToken || ''));
      if (!res.ok) throw new Error(`query failed (${res.status})`);
      const data = await res.json();
      if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
        throw new Error('Service did not return GeoJSON features.');
      }
      const drawingInfoRaw = await fetchArcgisLayerDrawingInfo(layer.sourceUrl, layer.authToken);
      const arcgisDrawingInfo = drawingInfoRaw ? sanitizeArcgisDrawingInfoForClient(drawingInfoRaw) : null;
      setCustomLayers(prev =>
        prev.map(item =>
          item.id === layer.id
            ? {
                ...item,
                geojson: data,
                arcgisDrawingInfo: arcgisDrawingInfo ?? item.arcgisDrawingInfo ?? null,
              }
            : item,
        ),
      );
      setStacStatus(`Layer synced: "${layer.name}".`);
    } catch (error) {
      setStacStatus(error instanceof Error ? error.message : `Failed to sync "${layer.name}".`);
    } finally {
      setSyncingLayerId(null);
    }
  };

  const activeDialogLayer = useMemo(
    () => (activeLayerActionDialog ? customLayers.find(layer => layer.id === activeLayerActionDialog.layerId) ?? null : null),
    [activeLayerActionDialog, customLayers],
  );

  const activeLayerColumns = useMemo(() => {
    if (!activeDialogLayer) return [] as string[];
    const features = Array.isArray(activeDialogLayer.geojson?.features) ? activeDialogLayer.geojson.features : [];
    const names = new Set<string>();
    features.slice(0, 50).forEach((feature: any) => {
      Object.keys(feature?.properties || {}).forEach(key => names.add(key));
    });
    return Array.from(names);
  }, [activeDialogLayer]);

  const activeLayerRows = useMemo(() => {
    if (!activeDialogLayer) return [] as Array<Record<string, any>>;
    const features = Array.isArray(activeDialogLayer.geojson?.features) ? activeDialogLayer.geojson.features : [];
    return features.slice(0, 1000).map((feature: any) => feature?.properties || {});
  }, [activeDialogLayer]);

  const tableRowsFiltered = useMemo(() => {
    let rows = activeLayerRows.map((row, idx) => ({ row, rowId: `r-${idx}` }));
    const q = tableSearchText.trim().toLowerCase();
    if (q) {
      rows = rows.filter(({ row }) =>
        activeLayerColumns.some(col => String(row[col] ?? '').toLowerCase().includes(q)),
      );
    }
    if (tableFilterField && tableFilterValue.trim()) {
      const v = tableFilterValue.trim().toLowerCase();
      rows = rows.filter(({ row }) => String(row[tableFilterField] ?? '').toLowerCase().includes(v));
    }
    if (tableShowSelectedOnly) {
      rows = rows.filter(({ rowId }) => tableSelectedRowIds.includes(rowId));
    }
    return rows;
  }, [activeLayerRows, activeLayerColumns, tableSearchText, tableFilterField, tableFilterValue, tableShowSelectedOnly, tableSelectedRowIds]);

  useEffect(() => {
    if (!activeLayerActionDialog || activeLayerActionDialog.mode !== 'table') return;
    setTableSearchText('');
    setTableFilterField('');
    setTableFilterValue('');
    setTableShowSelectedOnly(false);
    setTableSelectedRowIds([]);
  }, [activeLayerActionDialog]);

  useEffect(() => {
    if (!activeLayerActionDialog || activeLayerActionDialog.mode !== 'symbology' || !activeDialogLayer) return;
    setSymbologyDraft({
      useArcGisOnline: Boolean(activeDialogLayer.useArcGisSymbology),
      style: 'single',
      classes: 5,
      colorRamp: 'viridis',
      method: 'natural-breaks',
      color: activeDialogLayer.color || '#22c55e',
    });
  }, [activeLayerActionDialog, activeDialogLayer]);

  const applySymbologyDraft = async () => {
    if (!activeDialogLayer) return;
    try {
      if (symbologyDraft.useArcGisOnline) {
        if (activeDialogLayer.source !== 'arcgis' || !activeDialogLayer.sourceUrl?.trim()) {
          setStacStatus('ArcGIS Online symbology is only available for ArcGIS feature layers.');
          return;
        }
        let di = activeDialogLayer.arcgisDrawingInfo;
        if (!di) {
          const raw = await fetchArcgisLayerDrawingInfo(activeDialogLayer.sourceUrl, activeDialogLayer.authToken);
          di = (raw && sanitizeArcgisDrawingInfoForClient(raw)) || null;
        }
        if (!di || !arcgisDrawingInfoToFillPaint(di)) {
          setStacStatus('Could not load a supported ArcGIS renderer (drawingInfo) for this layer.');
          return;
        }
        setCustomLayers(prev =>
          prev.map(l =>
            l.id === activeDialogLayer.id ? { ...l, arcgisDrawingInfo: di!, useArcGisSymbology: true } : l,
          ),
        );
        setActiveLayerActionDialog(null);
        setStacStatus(`ArcGIS symbology applied for "${activeDialogLayer.name}".`);
        return;
      }
    const ramp = COLOR_RAMPS[symbologyDraft.colorRamp];
      const nextColor =
        symbologyDraft.style === 'single'
        ? symbologyDraft.color
        : ramp[Math.max(0, Math.min(ramp.length - 1, symbologyDraft.classes - 1))];
      setCustomLayers(prev =>
        prev.map(l => (l.id === activeDialogLayer.id ? { ...l, useArcGisSymbology: false, color: nextColor } : l)),
      );
    setActiveLayerActionDialog(null);
    setStacStatus(`Style saved for "${activeDialogLayer.name}".`);
    } catch (e) {
      setStacStatus(e instanceof Error ? e.message : 'Failed to save style.');
    }
  };

  const exportTableAsCsv = () => {
    if (!activeLayerColumns.length) return;
    const header = activeLayerColumns.join(',');
    const rows = tableRowsFiltered.map(({ row }) =>
      activeLayerColumns
        .map(col => `"${String(row[col] ?? '').replace(/"/g, '""')}"`)
        .join(','),
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeDialogLayer?.name || 'layer'}-table.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLayerActionClick = async (
    event: React.MouseEvent<HTMLButtonElement>,
    action: 'sync' | 'table' | 'symbology' | 'legend' | 'remove',
    layerId: string,
  ) => {
    event.stopPropagation();
    const layer = customLayers.find(item => item.id === layerId);
    if (!layer) return;
    if (action === 'remove') {
      const ok = window.confirm(`Remove layer "${layer.name}" from the map? It will stay removed after you refresh the page.`);
      if (!ok) return;
      setCustomLayers(prev => prev.filter(item => item.id !== layerId));
      setActiveLayerActionDialog(prev => (prev?.layerId === layerId ? null : prev));
      setStacStatus(`Removed layer "${layer.name}".`);
      return;
    }
    if (action === 'sync') {
      await refreshArcgisLayer(layer);
      return;
    }
    if (action === 'table') {
      setActiveLayerActionDialog({ mode: 'table', layerId });
      return;
    }
    if (action === 'symbology') {
      setActiveLayerActionDialog({ mode: 'symbology', layerId });
      return;
    }
    setActiveLayerActionDialog({ mode: 'legend', layerId });
  };

  const performSearch = async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setIsSearching(true);
    try {
      const response = mapboxToken
        ? await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${mapboxToken}&limit=5`
          )
        : await fetch(
            `https://nominatim.openstreetmap.org/search?format=geojson&limit=5&q=${encodeURIComponent(q)}`,
            { headers: { 'Accept-Language': 'en' } }
          );
      if (response.ok) {
        const data = await response.json();
        const features = Array.isArray(data?.features)
          ? data.features
          : Array.isArray(data)
              ? data
              : [];
        setSearchResults(features);
        setShowSearchResults(true);
      }
    } catch (error) {
      console.error('Search failed', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectSearchResult = (feature: any) => {
    const center = feature?.center || feature?.geometry?.coordinates;
    if (!Array.isArray(center) || center.length < 2) return;
    const [lng, lat] = center;
    setViewState(prev => ({
      ...prev,
      longitude: lng,
      latitude: lat,
      zoom: 11,
      pitch: 45,
      bearing: 0
    }));
    setSearchQuery(feature.text || feature?.properties?.name || feature?.properties?.display_name || '');
    setShowSearchResults(false);
  };

  const pivots = useMemo<PivotFeature[]>(() => {
    /** Pivot polygons must not float as a “phantom” layer when the user turned the vector layer off. */
    const uploaded = customLayers.find(
      layer =>
        layer.visible !== false &&
        Array.isArray(layer.geojson?.features) &&
        layer.geojson.features.length > 0,
    );
    const features = uploaded?.geojson?.features;
    const sourceFeatures = Array.isArray(features) ? features : [];

    return sourceFeatures.map((feature: any, index: number) => {
      const id = normalizePivotId(feature?.properties?.pivot_id ?? feature?.properties?.id ?? feature?.properties?.Name, index);
      return {
        id,
        name: feature?.properties?.name || feature?.properties?.Name || id,
        color: PIVOT_COLORS[index % PIVOT_COLORS.length],
        feature: { ...feature, properties: { ...(feature?.properties || {}), pivot_id: id } },
        centroid: getGeoJsonCentroid(feature),
      };
    });
  }, [customLayers]);

  const pivotChartRows = useMemo(() => {
    const latestMean = weeklyComposites.length ? weeklyComposites[Math.min(weeklyComposites.length - 1, 2)].mean : 0;
    return pivots.map((pivot, index) => ({
      ...pivot,
      value: Number((latestMean + (index - pivots.length / 2) * (selectedIndex === 'LST' ? 0.8 : 0.035)).toFixed(3)),
    }));
  }, [pivots, selectedIndex, weeklyComposites]);

  const pivotGeoJson = useMemo(() => ({
    type: 'FeatureCollection',
    features: pivots.map((pivot, i) => ({
      ...pivot.feature,
      properties: {
        ...(pivot.feature.properties || {}),
        pivot_id: pivot.id,
        name: pivot.name,
        color: pivot.color,
        analysisMean: pivotChartRows[i]?.value ?? 0,
      },
    })),
  }), [pivots, pivotChartRows]);

  const selectedPivot = useMemo(
    () => pivots.find(pivot => pivot.id === selectedPivotId) || null,
    [pivots, selectedPivotId],
  );

  const dates = useMemo(() => {
    const arr = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      arr.push({
        day: d.getDate(),
        month: d.toLocaleString('default', { month: 'short' }),
        full: d
      });
    }
    return arr;
  }, []);

  const weeklyWindows = useMemo(() => {
    const windows: Array<{ weekIndex: number; startDate: string; endDate: string; label: string }> = [];
    const start = new Date(timeSeriesStart);
    const end = new Date(timeSeriesEnd);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) return windows;
    const cursor = new Date(start);
    let weekIndex = 1;
    while (cursor <= end && weekIndex <= 54) {
      const weekStart = new Date(cursor);
      const weekEnd = new Date(cursor);
      weekEnd.setDate(weekEnd.getDate() + 6);
      if (weekEnd > end) weekEnd.setTime(end.getTime());
      windows.push({
        weekIndex,
        startDate: weekStart.toISOString().split('T')[0],
        endDate: weekEnd.toISOString().split('T')[0],
        label: `W${String(weekIndex).padStart(2, '0')} ${weekStart.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`,
      });
      cursor.setDate(cursor.getDate() + 7);
      weekIndex += 1;
    }
    return windows;
  }, [timeSeriesStart, timeSeriesEnd]);

  const exploreEffectiveDatetime = useMemo(() => {
    if (exploreDateSourceMode === 'manual') {
      return { start: exploreDateStart.trim(), end: exploreDateEnd.trim() };
    }
    return { start: timeSeriesStart.trim(), end: timeSeriesEnd.trim() };
  }, [exploreDateSourceMode, exploreDateStart, exploreDateEnd, timeSeriesStart, timeSeriesEnd]);

  const synthesizeWeeklyComposites = (itemCount: number) => {
    const range = ENVIRONMENTAL_INDICES[selectedIndex].range;
    const span = range[1] - range[0];
    return weeklyWindows.map((week, idx) => {
      const seasonal = Math.sin((idx / Math.max(1, weeklyWindows.length - 1)) * Math.PI);
      const base = selectedIndex === 'LST'
        ? 24 + seasonal * 12
        : range[0] + span * (0.42 + seasonal * 0.28);
      const mean = Number(base.toFixed(3));
      return {
        ...week,
        mean,
        min: Number(Math.max(range[0], mean - span * 0.08).toFixed(3)),
        max: Number(Math.min(range[1], mean + span * 0.1).toFixed(3)),
        itemCount,
        enabled: false,
      };
    });
  };

  const generateFieldAnalysisTimeline = () => {
    if (weeklyWindows.length < 1) {
      setFieldAnalysisStatus('Choose a valid start and end date for the time series.');
      return;
    }
    const synthetic = synthesizeWeeklyComposites(Math.max(1, stacItems.length || weeklyWindows.length));
    setWeeklyComposites(synthetic);
    setFieldAnalysisStatus(`Timeline ready: ${synthetic.length} week(s) for ${ENVIRONMENTAL_INDICES[selectedIndex].label}.`);
  };

  const openExploreStacFromSource = () => {
    setExpandedEnvSection('explore-stac');
    setExploreTab('parameters');
    setExploreCollectionSearch('');
    setExploreDescriptionKeyword('');
    setExploreDateSourceMode('environmental_parameter');
    setExploreDateStart(timeSeriesStart);
    setExploreDateEnd(timeSeriesEnd);
    setExploreExtentMode(drawnGeometry ? 'drawn' : pivots.length > 0 ? 'layer' : 'default');
    setExploreManualBbox({ north: '', south: '', east: '', west: '' });
    setExploreIdsText('');
    setExploreLimit(80);
    setExploreResultsPage(0);
    setExploreSelectedResultKeys([]);
    setExploreUseCloudFilter(true);
    setExploreCloudCoverMax(cloudCoverage);
    clearStacMapThumb();
  };

  const refreshExploreStacCatalog = () => {
    exploreCatalogSigRef.current = '';
    setStacCatalogCollections([]);
    setExploreCatalogLoadKey(k => k + 1);
  };

  const runExploreStacViewResults = async () => {
    if (!exploreSelectedCollectionIds.length) {
      setStacStatus('اختر مجموعة واحدة على الأقل في Explore STAC.');
      return;
    }
    const dStart = exploreEffectiveDatetime.start;
    const dEnd = exploreEffectiveDatetime.end;
    if (!dStart || !dEnd) {
      setStacStatus(
        exploreDateSourceMode === 'manual'
          ? 'حدّد تاريخ البداية وتاريخ النهاية في Date and Time.'
          : 'حدّد نطاق الزمن في لوحة المؤشر البيئي (Environmental Index) أولاً.',
      );
      return;
    }
    const drawnGeom = drawnGeometry?.geometry;
    const pivotGeom = selectedPivot?.feature?.geometry;
    const fcBounds = getGeoJsonBounds(pivotGeoJson);

    const body: Record<string, unknown> = {
      collections: exploreSelectedCollectionIds,
      datetime: `${dStart}/${dEnd}`,
      limit: Math.min(1000, Math.max(1, exploreLimit)),
      /** Helps catalog return newest scenes first (supported by Planetary Computer STAC). */
      sortby: [{ field: 'datetime', direction: 'desc' }],
    };

    const idList = exploreIdsText
      .split(/[\s,;]+/)
      .map(s => s.trim())
      .filter(Boolean);
    if (idList.length) body.ids = idList;

    if (exploreExtentMode === 'map') {
      const map = mapRef.current?.getMap?.() ?? mapRef.current;
      try {
        const b = map?.getBounds?.();
        if (b) body.bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
      } catch {
        /* ignore */
      }
      if (!body.bbox) body.intersects = DUBAI_STAC_INTERSECTS;
    } else if (exploreExtentMode === 'drawn' && drawnGeom) {
      body.intersects = drawnGeom;
    } else if (exploreExtentMode === 'layer') {
      if (pivotGeom) body.intersects = pivotGeom;
      else if (fcBounds) body.bbox = fcBounds;
      else body.intersects = DUBAI_STAC_INTERSECTS;
    } else if (exploreExtentMode === 'manual') {
      const n = parseFloat(exploreManualBbox.north);
      const s = parseFloat(exploreManualBbox.south);
      const e = parseFloat(exploreManualBbox.east);
      const w = parseFloat(exploreManualBbox.west);
      if ([n, s, e, w].every(Number.isFinite)) {
        body.bbox = [w, s, e, n];
      } else {
        body.intersects = DUBAI_STAC_INTERSECTS;
      }
    } else {
      body.intersects = DUBAI_STAC_INTERSECTS;
    }

    const needsCloud =
      exploreUseCloudFilter &&
      exploreSelectedCollectionIds.some(id => /sentinel-2|sentinel2|l2a/i.test(id));
    if (needsCloud) {
      body.query = { 'eo:cloud_cover': { lt: exploreCloudCoverMax } };
    }

    const searchUrl = appendStacQueryParams(
      getResolvedStacSearchUrl(stacConnection),
      stacConnection.customParams,
    );

    setIsLoadingStac(true);
    setStacStatus(`جارٍ البحث في ${exploreSelectedCollectionIds.length} مجموعة…`);
    try {
      const response = await fetch(searchUrl, {
        method: 'POST',
        headers: buildStacRequestHeaders(stacConnection),
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`STAC search failed (${response.status})`);
      const data = await response.json();
      const features = Array.isArray(data?.features) ? data.features : [];
      setStacItems(features);
      setWeeklyComposites(synthesizeWeeklyComposites(features.length));
      clearStacMapThumb();
      setExploreResultsPage(0);
      setExploreSelectedResultKeys([]);
      setExploreTab('results');
      const aoiHint =
        exploreExtentMode === 'map'
          ? 'خريطة حالية'
          : exploreExtentMode === 'drawn' && drawnGeom
            ? 'رسم المستخدم'
            : exploreExtentMode === 'layer'
              ? pivotGeom
                ? 'محور'
                : fcBounds
                  ? 'طبقة مرفوعة'
                  : 'افتراضي'
              : exploreExtentMode === 'manual'
                ? 'إحداثيات يدوية'
              : 'افتراضي';
      setStacStatus(`تم تحميل ${features.length} عنصر STAC (نطاق: ${aoiHint}). الاتصال: ${stacConnection.connectionName}.`);
    } catch (error) {
      setStacItems([]);
      setWeeklyComposites(synthesizeWeeklyComposites(0));
      setStacStatus(error instanceof Error ? error.message : 'STAC search failed.');
    } finally {
      setIsLoadingStac(false);
    }
  };

  const zoomMapToStacFootprints = () => {
    const b = getGeoJsonBounds(stacFootprintsGeoJson);
    if (!b) return;
    const map = mapRef.current?.getMap?.() ?? mapRef.current;
    map?.fitBounds?.(
      [
        [b[0], b[1]],
        [b[2], b[3]],
      ],
      { padding: 56, duration: 900 },
    );
  };

  const toggleExploreCollection = (id: string) => {
    setExploreSelectedCollectionIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );
  };

  const selectAllFilteredExploreCollections = () => {
    setExploreSelectedCollectionIds(exploreFilteredCollections.map(c => c.id));
  };

  const clearExploreCollectionSelection = () => {
    setExploreSelectedCollectionIds([]);
  };

  const toggleExploreAccordionKey = (key: string) => {
    setOpenExploreAccordions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleExploreResultKey = (key: string) => {
    setExploreSelectedResultKeys(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]));
  };

  const selectAllExplorePageKeys = (keys: string[]) => {
    setExploreSelectedResultKeys(prev => {
      const s = new Set(prev);
      keys.forEach(k => s.add(k));
      return [...s];
    });
  };

  const deselectAllExplorePageKeys = (keys: string[]) => {
    setExploreSelectedResultKeys(prev => prev.filter(k => !keys.includes(k)));
  };

  const flyToStacItemExtent = (item: any) => {
    const geom = stacItemFootprintGeometry(item);
    if (!geom) {
      setStacStatus('لا توجد هندسة footprint لهذا العنصر.');
      return;
    }
    const b = getGeoJsonBounds({ type: 'Feature', geometry: geom, properties: {} });
    if (!b) {
      setStacStatus('لا يمكن حساب الحدود لهذا العنصر.');
      return;
    }
    const map = mapRef.current?.getMap?.() ?? mapRef.current;
    map?.fitBounds?.(
      [
        [b[0], b[1]],
        [b[2], b[3]],
      ],
      { padding: 48, duration: 700 },
    );
  };

  const openExploreStacItemDetails = (item: any) => {
    const href = getStacItemSelfHref(item);
    if (!href) {
      setStacStatus('لا يوجد رابط metadata لهذا العنصر.');
      return;
    }
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  const showStacItemThumbOnMap = async (item: any) => {
    const candidates = getStacItemThumbCandidateUrls(item, stacConnection, { forMapOverlay: true });
    let bbox = Array.isArray(item?.bbox) && item.bbox.length >= 4 ? (item.bbox as number[]) : null;
    if (!bbox && item?.geometry) {
      const gbounds = getGeoJsonBounds({ type: 'Feature', geometry: item.geometry, properties: {} });
      if (gbounds) bbox = [...gbounds];
    }
    if (!candidates.length || !bbox || bbox.length < 4) {
      setStacStatus('لا توجد صورة مصغّرة أو حدود bbox لهذا العنصر.');
      return;
    }
    const [w, s, e, n] = bbox;
    if (![w, s, e, n].every(Number.isFinite)) {
      setStacStatus('بيانات bbox غير صالحة لهذا العنصر.');
      return;
    }
    setStacStatus('جارٍ تحميل المعاينة على الخريطة…');
    const blobUrl = await fetchStacMapOverlayBlobUrl(candidates);
    if (!blobUrl) {
      setStacStatus('تعذر تحميل صورة المعاينة على الخريطة (تحقق من الاتصال أو جرّب عنصراً آخر).');
      return;
    }
    setStacMapThumb(prev => {
      revokeStacMapOverlayBlob(prev?.url);
      return { url: blobUrl, coordinates: bboxToRgCoordinates([w, s, e, n]) };
    });
    setIsStacThumbVisible(true);
    const collection = getStacItemCollection(item);
    const itemId = String(item?.id ?? '').trim();
    setStacMapThumbLabel(
      collection && itemId
        ? `STAC imagery: ${collection} / ${itemId}`
        : itemId
          ? `STAC imagery: ${itemId}`
          : 'STAC imagery preview',
    );
    setStacStatus(`معاينة على الخريطة: ${String(item.id ?? '')}`);
  };

  const closeStacAddMenu = () => setStacAddToMenuKey(null);

  const addStacToCurrentMap = async (item: any) => {
    closeStacAddMenu();
    setShowStacFootprintsOnMap(true);
    flyToStacItemExtent(item);
    await showStacItemThumbOnMap(item);
    setStacStatus(`Add to current map: ${String(item.id ?? '')}`);
  };

  const addStacToNewMap = (item: any) => {
    closeStacAddMenu();
    try {
      sessionStorage.setItem('agri-stac-focus', JSON.stringify({ t: Date.now(), item }));
    } catch {
      /* ignore */
    }
    window.open(`${window.location.origin}${window.location.pathname}#/satellite/indices`, '_blank', 'noopener,noreferrer');
    setStacStatus('Opened new map tab (scene will zoom when the map loads).');
  };

  const addStacToGlobalScene = async (item: any) => {
    closeStacAddMenu();
    setShowStacFootprintsOnMap(true);
    setIs3DView(true);
    window.setTimeout(() => {
      const map = mapRef.current?.getMap?.() ?? mapRef.current;
      try {
        map?.setProjection?.({ name: 'globe' });
      } catch {
        /* ignore */
      }
      flyToStacItemExtent(item);
      window.setTimeout(() => {
        try {
          map?.easeTo?.({ pitch: 58, duration: 650 });
        } catch {
          /* ignore */
        }
      }, 800);
    }, 150);
    await showStacItemThumbOnMap(item);
    setStacStatus('Add to new global scene (globe).');
  };

  const addStacToLocalScene = async (item: any) => {
    closeStacAddMenu();
    setShowStacFootprintsOnMap(true);
    setIs3DView(false);
    window.setTimeout(() => {
      const map = mapRef.current?.getMap?.() ?? mapRef.current;
      try {
        map?.setProjection?.({ name: 'mercator' });
      } catch {
        /* ignore */
      }
      const geom = stacItemFootprintGeometry(item);
      const b = geom ? getGeoJsonBounds({ type: 'Feature', geometry: geom, properties: {} }) : null;
      if (map && b) {
        map.fitBounds(
          [
            [b[0], b[1]],
            [b[2], b[3]],
          ],
          { padding: 72, duration: 900, pitch: 50, bearing: 0 },
        );
      }
    }, 150);
    await showStacItemThumbOnMap(item);
    setStacStatus('Add to new local scene (tilted mercator).');
  };

  const addStacToMosaicStaging = (item: any) => {
    closeStacAddMenu();
    const k = stacItemStableKey(item);
    setStacMosaicStaging(prev => {
      if (prev.some(x => stacItemStableKey(x) === k)) {
        setStacStatus('Already in mosaic dataset list.');
        return prev;
      }
      const next = [...prev, item];
      setStacStatus(`Mosaic dataset (staging): ${next.length} scene(s). Export or use ArcGIS Pro for production mosaic.`);
      return next;
    });
  };

  useEffect(() => {
    if (stacAddToMenuKey == null) return;
    const onDocDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t?.closest?.('.si-explore-add-wrap')) setStacAddToMenuKey(null);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [stacAddToMenuKey]);

  useEffect(() => {
    if (!isMapLoaded || stacFocusHydratedRef.current) return;
    try {
      const raw = sessionStorage.getItem('agri-stac-focus');
      if (!raw) return;
      stacFocusHydratedRef.current = true;
      const parsed = JSON.parse(raw) as { item?: any };
      sessionStorage.removeItem('agri-stac-focus');
      if (!parsed?.item) return;
      window.setTimeout(() => flyToStacItemExtent(parsed.item), 450);
      void showStacItemThumbOnMap(parsed.item);
      setExpandedEnvSection('explore-stac');
      setExploreTab('results');
      setStacStatus(`Scene from new map tab: ${String(parsed.item.id ?? '')}`);
    } catch {
      /* ignore */
    }
  }, [isMapLoaded]);

  const stacActiveSearchUrl = useMemo(
    () => appendStacQueryParams(getResolvedStacSearchUrl(stacConnection), stacConnection.customParams),
    [stacConnection],
  );

  const exploreFilteredCollections = useMemo(() => {
    const q = exploreCollectionSearch.trim().toLowerCase();
    const desc = exploreDescriptionKeyword.trim().toLowerCase();
    return stacCatalogCollections.filter(c => {
      if (q && !c.id.toLowerCase().includes(q) && !c.title.toLowerCase().includes(q)) return false;
      if (
        desc &&
        !c.id.toLowerCase().includes(desc) &&
        !c.title.toLowerCase().includes(desc) &&
        !c.description.toLowerCase().includes(desc)
      ) {
        return false;
      }
      return true;
    });
  }, [stacCatalogCollections, exploreCollectionSearch, exploreDescriptionKeyword]);

  const exploreSortedStacItems = useMemo(() => {
    const arr = [...stacItems];
    arr.sort((a: any, b: any) => {
      const da = String(a?.properties?.datetime ?? '');
      const db = String(b?.properties?.datetime ?? '');
      const cmp = da.localeCompare(db);
      return exploreResultsSortDesc ? -cmp : cmp;
    });
    return arr;
  }, [stacItems, exploreResultsSortDesc]);

  const exploreResultsPageCount = Math.max(1, Math.ceil(exploreSortedStacItems.length / EXPLORE_RESULTS_PAGE_SIZE));

  const explorePaginatedStacItems = useMemo(() => {
    const start = exploreResultsPage * EXPLORE_RESULTS_PAGE_SIZE;
    return exploreSortedStacItems.slice(start, start + EXPLORE_RESULTS_PAGE_SIZE);
  }, [exploreSortedStacItems, exploreResultsPage]);

  const explorePageSelectionStats = useMemo(() => {
    const keys = explorePaginatedStacItems.map((item: any) => stacItemStableKey(item));
    const allSelected = keys.length > 0 && keys.every(k => exploreSelectedResultKeys.includes(k));
    const someSelected = keys.some(k => exploreSelectedResultKeys.includes(k));
    const selectedOnPage = keys.filter(k => exploreSelectedResultKeys.includes(k)).length;
    return { keys, allSelected, someSelected, selectedOnPage };
  }, [explorePaginatedStacItems, exploreSelectedResultKeys]);

  useEffect(() => {
    const maxPage = Math.max(0, exploreResultsPageCount - 1);
    if (exploreResultsPage > maxPage) setExploreResultsPage(maxPage);
  }, [exploreResultsPageCount, exploreResultsPage]);

  const stacFootprintsGeoJson = useMemo(() => {
    const features = stacItems
      .map((item: any) => {
        const geometry = stacItemFootprintGeometry(item);
        if (!geometry) return null;
        return {
          type: 'Feature' as const,
          properties: {
            id: String(item.id ?? ''),
            collection: String(item.collection ?? ''),
            datetime: String(item.properties?.datetime ?? ''),
          },
          geometry,
        };
      })
      .filter((f): f is NonNullable<typeof f> => f != null);
    return { type: 'FeatureCollection' as const, features };
  }, [stacItems]);

  useEffect(() => {
    if (expandedEnvSection !== 'explore-stac') return;
    const sig = stacActiveSearchUrl;
    if (exploreCatalogSigRef.current === sig) return;

    let cancelled = false;
    setIsLoadingStacCollections(true);
    setStacCollectionsLoadError('');
    setStacCatalogCollections([]);

    fetchAllStacCollections(stacConnection)
      .then(cols => {
        if (cancelled) return;
        exploreCatalogSigRef.current = sig;
        setStacCatalogCollections(cols);
      })
      .catch(err => {
        if (cancelled) return;
        exploreCatalogSigRef.current = '';
        setStacCollectionsLoadError(err instanceof Error ? err.message : 'Failed to load collections');
        setStacCatalogCollections([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingStacCollections(false);
      });

    return () => {
      cancelled = true;
    };
  }, [expandedEnvSection, stacActiveSearchUrl, stacConnection, exploreCatalogLoadKey]);

  useEffect(() => {
    if (expandedEnvSection !== 'explore-stac') return;
    if (exploreDateSourceMode !== 'manual') return;
    if (!exploreDateStart || !exploreDateEnd) {
      setExploreDateStart(timeSeriesStart);
      setExploreDateEnd(timeSeriesEnd);
    }
  }, [expandedEnvSection, exploreDateSourceMode, exploreDateStart, exploreDateEnd, timeSeriesStart, timeSeriesEnd]);

  const stacModalOkDisabled =
    !stacModalDraft.connectionName.trim() ||
    (stacModalDraft.presetId === 'custom' && !stacModalDraft.customCatalogBaseUrl.trim());

  const openStacConnectionModal = () => {
    setStacModalDraft(cloneStacModalDraft(stacConnection));
    setIsAcsPickerOpen(false);
    setIsStacModalOpen(true);
  };

  const closeStacModal = () => {
    setIsAcsPickerOpen(false);
    setIsStacModalOpen(false);
  };

  const applyStacConnectionModal = () => {
    if (stacModalOkDisabled) return;
    const next = { ...stacModalDraft, connectionName: stacModalDraft.connectionName.trim() };
    persistStacConnectionToStorage(next);
    setStacConnection(next);
    exploreCatalogSigRef.current = '';
    setStacCatalogCollections([]);
    setIsAcsPickerOpen(false);
    setIsStacModalOpen(false);
  };

  const showStacSearchUrlInChrome = !isDefaultPlanetaryComputerStacSearchUrl(stacActiveSearchUrl);

  const exploreStacSourcePanelContent = (
    <>
      <p className="si-env-toolbar-hint si-env-toolbar-hint--muted">
        Open Explore STAC to search scenes, or use the data API. Toggle map overlays in <strong>Layers</strong>.
      </p>
      <div className="si-env-actions">
        <button type="button" className="si-explore-stac-open-btn" onClick={openExploreStacFromSource}>
          <i className="fa-solid fa-magnifying-glass-chart" />
          <span>Explore STAC</span>
        </button>
      </div>
      <div className="si-stac-source-card">
        <p className="si-stac-source-lead">
          <strong>STAC</strong> (SpatioTemporal Asset Catalog) is an open standard for cataloging imagery and raster data.
          STAC connections let you query collections over HTTP, similar to catalog workflows in ArcGIS Pro.
        </p>
        <div className="si-stac-active-banner">
          <span className="si-stac-active-label">Active connection</span>
          <strong>{stacConnection.connectionName}</strong>
          <span className="si-stac-active-meta">
            {stacConnection.presetId === 'planetary-computer'
              ? 'Microsoft Planetary Computer'
              : (stacConnection.customCatalogBaseUrl.trim() || 'Custom catalog')}
          </span>
          {showStacSearchUrlInChrome ? (
            <a
              className="si-stac-active-meta si-stac-url-truncate"
              href={stacActiveSearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={stacActiveSearchUrl}
            >
              {stacActiveSearchUrl}
            </a>
          ) : null}
        </div>
        <div className="si-stac-source-actions">
          <button type="button" className="si-stac-create-connection-btn" onClick={openStacConnectionModal}>
            <i className="fa-solid fa-plug" aria-hidden />
            <span>Create STAC connection</span>
          </button>
        </div>
        <div className="si-stac-help-row">
          <a href={STAC_HELP_LINKS.spec} target="_blank" rel="noopener noreferrer">
            STAC specification
          </a>
          <a href={STAC_HELP_LINKS.docs} target="_blank" rel="noopener noreferrer">
            PC STAC docs
          </a>
          <a href={STAC_HELP_LINKS.catalog} target="_blank" rel="noopener noreferrer">
            Browse catalog
          </a>
          <a href={STAC_HELP_LINKS.esriMpc} target="_blank" rel="noopener noreferrer">
            ArcGIS for MPC
          </a>
        </div>
        <p className="si-stac-acs-note">
          Cloud Storage Connection (.acs) files from ArcGIS Pro are not applied in the browser; use the connection dialog
          (token or headers) when your catalog requires authentication.
        </p>
      </div>
      <div className="si-env-message">{stacStatus}</div>
    </>
  );

  const openAcsPicker = () => {
    setAcsPickerStaging([]);
    setAcsPickerManualPath('');
    setAcsPickerFilter('');
    setIsAcsPickerOpen(true);
  };

  const cancelAcsPicker = () => {
    setAcsPickerStaging([]);
    setAcsPickerManualPath('');
    setAcsPickerFilter('');
    setIsAcsPickerOpen(false);
  };

  const onAcsFilesPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fl = e.target.files;
    if (!fl?.length) return;
    const names = Array.from(fl).map(f => f.name);
    setAcsPickerStaging(prev => {
      const s = new Set(prev);
      names.forEach(n => s.add(n));
      return [...s];
    });
    e.target.value = '';
  };

  const confirmAcsPicker = () => {
    const manualLines = acsPickerManualPath
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean);
    const merged = [...acsPickerStaging, ...manualLines];
    setStacModalDraft(d => {
      const seen = new Set(d.cloudStorageEntries);
      const add = merged.filter(x => x && !seen.has(x) && (seen.add(x), true));
      return { ...d, cloudStorageEntries: [...d.cloudStorageEntries, ...add] };
    });
    cancelAcsPicker();
  };

  useEffect(() => {
    if (!isStacModalOpen) setIsAcsPickerOpen(false);
  }, [isStacModalOpen]);

  useEffect(() => {
    if (!isStacModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (isAcsPickerOpen) {
        cancelAcsPicker();
      } else {
        closeStacModal();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isStacModalOpen, isAcsPickerOpen]);

  const aoiVizColor = useMemo(() => {
    if (!drawnStats) return '#facc15';
    const cfg = ENVIRONMENTAL_INDICES[selectedIndex];
    return indexValueToColor(drawnStats.mean, cfg.range, cfg.palette);
  }, [drawnStats, selectedIndex]);

  const seriesTrendLabel = useMemo(() => {
    if (weeklyComposites.length < 2) return null;
    const m = weeklyComposites.map(w => w.mean);
    const delta = m[m.length - 1] - m[0];
    const eps = selectedIndex === 'LST' ? 0.5 : 0.02;
    if (Math.abs(delta) < eps) return { tone: 'stable' as const, text: 'Nearly stable across weeks in this preview.' };
    if (delta > 0) return { tone: 'up' as const, text: `Rising signal (≈ ${delta.toFixed(3)} last − first week).` };
    return { tone: 'down' as const, text: `Falling signal (≈ ${Math.abs(delta).toFixed(3)} last − first week).` };
  }, [weeklyComposites, selectedIndex]);

  const pivotFillLayoutAndPaint = useMemo(() => {
    const cfg = ENVIRONMENTAL_INDICES[selectedIndex];
    const range = cfg.range;
    const mid = (range[0] + range[1]) / 2;
    const pal = cfg.palette;
    const interpolateFill: any = [
      'interpolate',
      ['linear'],
      ['get', 'analysisMean'],
      range[0],
      pal[0] ?? '#22c55e',
      mid,
      pal[Math.min(1, pal.length - 1)] ?? pal[0],
      range[1],
      pal[pal.length - 1] ?? '#14532d',
    ];
    const visible = showFieldBoundaries || showProductivityZones;
    return {
      fillLayout: { visibility: visible ? 'visible' : 'none' } as const,
      fillPaint: {
        'fill-color': showProductivityZones ? interpolateFill : (['coalesce', ['get', 'color'], '#22c55e'] as any),
        'fill-opacity': showProductivityZones ? 0.48 : showFieldBoundaries ? 0.18 : 0,
      },
      outlineLayout: { visibility: showFieldBoundaries ? 'visible' : 'none' } as const,
    };
  }, [selectedIndex, showFieldBoundaries, showProductivityZones]);

  const recomputeDrawnAoiStats = (geometry: any | null) => {
    if (!geometry) {
      setDrawnStats(null);
      return;
    }
    const values = weeklyComposites.length ? weeklyComposites : synthesizeWeeklyComposites(stacItems.length);
    if (!values.length) {
      setDrawnStats(null);
      return;
    }
    const means = values.map(item => item.mean);
    const mean = means.reduce((sum, value) => sum + value, 0) / means.length;
    const variance = means.reduce((sum, v) => sum + (v - mean) ** 2, 0) / Math.max(1, means.length);
    const weeklyBandMin = Math.min(...values.map(v => v.min));
    const weeklyBandMax = Math.max(...values.map(v => v.max));
    setDrawnStats({
      mean: Number(mean.toFixed(3)),
      min: Number(Math.min(...means).toFixed(3)),
      max: Number(Math.max(...means).toFixed(3)),
      std: Number(Math.sqrt(variance).toFixed(3)),
      weeklyBandMin,
      weeklyBandMax,
    });
  };

  const updateDrawGeometryLive = (geometry: any) => {
    drawnGeometryRef.current = geometry;
    setDrawnGeometry(geometry);
  };

  const updateDrawnStats = (geometry: any | null) => {
    drawnGeometryRef.current = geometry;
    setDrawnGeometry(geometry);
    recomputeDrawnAoiStats(geometry);
  };

  useEffect(() => {
    drawnGeometryRef.current = drawnGeometry;
  }, [drawnGeometry]);

  const getMapInstance = () => mapRef.current?.getMap?.() ?? mapRef.current;

  const geoAiPinGeoJson = useMemo(() => {
    if (!geoAiPinLngLat) return null;
    return {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          properties: {},
          geometry: { type: 'Point' as const, coordinates: geoAiPinLngLat },
        },
      ],
    };
  }, [geoAiPinLngLat]);

  const clearGeoExplorerChat = useCallback(() => {
    geoExplorerInFlightRef.current = false;
    setGeoExplorerBusy(false);
    setGeoExplorerMessages([]);
    setGeoExplorerDraft('');
    setGeoExplorerPendingImage(null);
    setGeoExplorerChatError('');
    setGeoAiPinLngLat(null);
    setGeoAiInspectCard(null);
  }, []);

  const clearGeoAiChat = useCallback(() => {
    geoAiInFlightRef.current = false;
    setGeoAiBusy(false);
    setGeoAiChatMessages([]);
    setGeoAiDraft('');
    setGeoAiChatError('');
    setGeoAiInspectCard(null);
  }, []);

  const clearGeoDeepseekChat = useCallback(() => {
    geoDeepseekInFlightRef.current = false;
    setGeoDeepseekBusy(false);
    setGeoDeepseekChatMessages([]);
    setGeoDeepseekDraft('');
    setGeoDeepseekChatError('');
    setGeoAiInspectCard(null);
  }, []);

  const clearCurrentGeoAiPanel = useCallback(() => {
    if (geoAiModelTab === 'gemini') clearGeoExplorerChat();
    else if (geoAiModelTab === 'claude') clearGeoAiChat();
    else clearGeoDeepseekChat();
  }, [geoAiModelTab, clearGeoExplorerChat, clearGeoAiChat, clearGeoDeepseekChat]);

  const applySatelliteGeoAiMapUi = useCallback(
    async (userText: string, reply: string) => {
      const primary = satelliteCustomLayersToGeoAiLayers(customLayers);
      const saved = await loadGisMapSavedLayers();
      const combined = [
        ...primary,
        ...saved.map(l => ({
          name: l.name,
          visible: l.visible,
          source: l.source,
          data: l.data,
          arcgisLayerDefinition: (l as { arcgisLayerDefinition?: GeoAiMapLayer['arcgisLayerDefinition'] })
            .arcgisLayerDefinition,
        })),
      ];
      const pin = resolveGeoAiPinFromUserTextAndReply(userText, reply, combined);
      if (!pin) {
        setGeoAiInspectCard(null);
        return;
      }
      setGeoAiPinLngLat(pin.coords);
      setViewState(prev => ({
        ...prev,
        longitude: pin.coords[0],
        latitude: pin.coords[1],
        zoom: Math.max(
          geoExplorerTargetZoomForPinSource(pin.pinSource),
          typeof prev.zoom === 'number' ? prev.zoom : 2,
        ),
        pitch: is3DView ? Math.max(typeof prev.pitch === 'number' ? prev.pitch : 0, 42) : prev.pitch ?? 0,
        bearing: typeof prev.bearing === 'number' ? prev.bearing : 0,
      }));
      if (pin.layerHit) {
        setGeoAiInspectCard({
          title: pin.layerHit.layerName,
          rows: buildGeoAiLayerPopupAttributeRows(pin.layerHit),
          lng: pin.coords[0],
          lat: pin.coords[1],
          ...pickGeoAiHumanPlaceFields(pin.layerHit.properties),
        });
      } else {
        setGeoAiInspectCard({
          title: 'Location',
          rows: [
            { label: 'Longitude', value: pin.coords[0].toFixed(6) },
            { label: 'Latitude', value: pin.coords[1].toFixed(6) },
          ],
          lng: pin.coords[0],
          lat: pin.coords[1],
        });
      }
    },
    [customLayers, is3DView],
  );

  useEffect(() => {
    if (!geoAiInspectCard) {
      geoAiReverseGeocodeKeyRef.current = '';
      return;
    }
    const coordKey = `${geoAiInspectCard.lng},${geoAiInspectCard.lat}`;
    const tokenSig = mapboxToken?.trim() ? 'mb' : 'osm';
    const dedupeKey = `${coordKey}|${tokenSig}`;
    if (geoAiReverseGeocodeKeyRef.current === dedupeKey) return;

    const hasStrongCountry =
      Boolean(geoAiInspectCard.country?.trim()) && !/^\d+$/.test(String(geoAiInspectCard.country).trim());
    const hasArea = Boolean(geoAiInspectCard.areaName?.trim());
    if (hasStrongCountry && hasArea) {
      geoAiReverseGeocodeKeyRef.current = dedupeKey;
      return;
    }

    geoAiReverseGeocodeKeyRef.current = dedupeKey;
    let cancelled = false;
    void (async () => {
      const rev = await reverseLngLatForGeoAiDetails(geoAiInspectCard.lng, geoAiInspectCard.lat, mapboxToken);
      if (cancelled) return;
      setGeoAiInspectCard(prev => {
        if (!prev || `${prev.lng},${prev.lat}` !== coordKey) return prev;
        const nextArea = prev.areaName?.trim() || rev.area;
        const nextCountry =
          prev.country && !/^\d+$/.test(String(prev.country).trim())
            ? prev.country
            : rev.country || prev.country;
        if (nextArea === prev.areaName && nextCountry === prev.country) return prev;
        return { ...prev, areaName: nextArea, country: nextCountry };
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [geoAiInspectCard, mapboxToken]);

  const sendGeoExplorerChat = useCallback(() => {
    const trimmed = geoExplorerDraft.trim();
    if (geoExplorerInFlightRef.current) return;
    if (!trimmed && !geoExplorerPendingImage) return;
    const apiKey = geminiApiKey.trim();
    if (!apiKey) {
      setGeoExplorerChatError(
        'Add a Gemini API key: System Settings → API Tokens → Gemini API (saved in this browser), or set VITE_GEMINI_API_KEY at build time. Never commit keys to Git.'
      );
      return;
    }

    const userParts: GeoExplorerPart[] = [];
    if (trimmed) userParts.push({ type: 'text', text: trimmed });
    if (geoExplorerPendingImage) {
      userParts.push({
        type: 'image',
        mime: geoExplorerPendingImage.mime,
        base64: geoExplorerPendingImage.base64,
      });
    }
    if (userParts.length === 0) return;

    const userId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `geo-${Date.now()}`;
    const userMsg: GeoExplorerMessage = { id: userId, role: 'user', parts: userParts };
    const userTextForMapFallback = trimmed;

    setGeoExplorerDraft('');
    setGeoExplorerPendingImage(null);
    setGeoExplorerChatError('');
    geoExplorerInFlightRef.current = true;
    setGeoExplorerBusy(true);

    setGeoExplorerMessages(prev => {
      const historyWithUser = [...prev, userMsg];
      queueMicrotask(async () => {
        try {
          let developAppend = '';
          try {
            const raw =
              typeof localStorage !== 'undefined' ? localStorage.getItem(DEVELOP_DATA_CONTEXT_LS_KEY) : null;
            if (raw?.trim()) {
              developAppend = `### Develop Dashboard — Data pane snapshot (JSON)\n${raw.slice(0, 14000)}`;
            }
          } catch {
            /* ignore */
          }
          const result = await runGeoExplorerGeminiTurn({
            apiKey,
            historyWithUser,
            userTextForMapFallback,
            primaryVectorLayers: satelliteCustomLayersToGeoAiLayers(customLayers),
              mapboxAccessToken: mapboxToken || undefined,
            openWeatherApiKey,
            pinLngLat: geoAiPinLngLat,
            lastMapQueryCoords: lastMapQueryCoordsFromMessages(prev),
            inspectAnchorLngLat:
              geoAiInspectCard != null ? ([geoAiInspectCard.lng, geoAiInspectCard.lat] as [number, number]) : null,
            mapPopup: null,
            addedLayersHeading: '### Satellite — Added layers (this map — si-env / vector layers)',
            attachGisSavedLayers: true,
            extraSystemAppend: developAppend || undefined,
          });
          setGeoExplorerMessages(h => [...h, result.modelMsg]);
          const me = result.mapEffect;
          if (me) {
            setGeoAiPinLngLat(me.coords);
            setViewState(vs => ({
              ...vs,
              longitude: me.coords[0],
              latitude: me.coords[1],
              zoom: Math.max(
                geoExplorerTargetZoomForPinSource(me.pinSource),
                typeof vs.zoom === 'number' ? vs.zoom : 2,
              ),
              pitch: is3DView ? Math.max(typeof vs.pitch === 'number' ? vs.pitch : 0, 42) : vs.pitch ?? 0,
              bearing: typeof vs.bearing === 'number' ? vs.bearing : 0,
            }));
            if (me.layerHit) {
              setGeoAiInspectCard({
                title: me.layerHit.layerName,
                rows: buildGeoAiLayerPopupAttributeRows(me.layerHit),
                lng: me.coords[0],
                lat: me.coords[1],
                ...pickGeoAiHumanPlaceFields(me.layerHit.properties),
              });
            } else {
              setGeoAiInspectCard({
                title: 'Location',
                rows: [
                  { label: 'Longitude', value: me.coords[0].toFixed(6) },
                  { label: 'Latitude', value: me.coords[1].toFixed(6) },
                ],
                lng: me.coords[0],
                lat: me.coords[1],
              });
            }
          } else {
            setGeoAiInspectCard(null);
          }
        } catch (e) {
          setGeoExplorerChatError(e instanceof Error ? e.message : String(e));
        } finally {
          geoExplorerInFlightRef.current = false;
          setGeoExplorerBusy(false);
        }
      });
      return historyWithUser;
    });
  }, [
    geminiApiKey,
    geoExplorerDraft,
    geoExplorerPendingImage,
    mapboxToken,
    is3DView,
    customLayers,
    openWeatherApiKey,
    geoAiPinLngLat,
    geoAiInspectCard,
  ]);

  const sendGeoAiChat = useCallback(() => {
    const trimmed = geoAiDraft.trim();
    if (geoAiInFlightRef.current || !trimmed) return;
    const apiKey = claudeApiKey.trim();
    if (!apiKey) {
      setGeoAiChatError(
        'Add a Claude API key: System Settings → API Tokens → Claude API (Anthropic), or set VITE_CLAUDE_API_KEY at build time. Never commit keys to Git.',
      );
      return;
    }

    const userId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `gaic-${Date.now()}`;

    setGeoAiDraft('');
    setGeoAiChatError('');
    geoAiInFlightRef.current = true;
    setGeoAiBusy(true);

    setGeoAiChatMessages(prev => {
      const historyWithUser = [...prev, { id: userId, role: 'user' as const, text: trimmed }];
      queueMicrotask(async () => {
        try {
          const dataCtx = await buildGeoAiDataContext(undefined, {
            satelliteLayers: satelliteCustomLayersToGeoAiLayers(customLayers),
          });
          const system = `${GEO_AI_CHAT_SYSTEM_BASE}\n\n---\nDATA CONTEXT (authoritative for this session turn):\n${dataCtx}`;
          const prior = historyWithUser.slice(0, -1);
          const turns: GeoAiChatTurn[] = prior.map(m => ({ role: m.role, text: m.text }));
          const reply = await claudeGeoAiComplete({
            apiKey,
            system,
            turns,
            userMessage: trimmed,
          });
          const aid =
            typeof crypto !== 'undefined' && 'randomUUID' in crypto
              ? crypto.randomUUID()
              : `gaic-m-${Date.now()}`;
          setGeoAiChatMessages(h => [...h, { id: aid, role: 'assistant', text: reply }]);
          await applySatelliteGeoAiMapUi(trimmed, reply);
        } catch (e) {
          setGeoAiChatError(e instanceof Error ? e.message : String(e));
        } finally {
          geoAiInFlightRef.current = false;
          setGeoAiBusy(false);
        }
      });
      return historyWithUser;
    });
  }, [claudeApiKey, geoAiDraft, applySatelliteGeoAiMapUi, customLayers]);

  const sendGeoDeepseekChat = useCallback(() => {
    const trimmed = geoDeepseekDraft.trim();
    if (geoDeepseekInFlightRef.current || !trimmed) return;
    const apiKey = deepseekApiKey.trim();
    if (!apiKey) {
      setGeoDeepseekChatError(
        'Add a DeepSeek API key: System Settings → API Tokens → DeepSeek, or set VITE_DEEPSEEK_API_KEY at build time. Never commit keys to Git.',
      );
      return;
    }

    const userId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `gds-${Date.now()}`;

    setGeoDeepseekDraft('');
    setGeoDeepseekChatError('');
    geoDeepseekInFlightRef.current = true;
    setGeoDeepseekBusy(true);

    setGeoDeepseekChatMessages(prev => {
      const historyWithUser = [...prev, { id: userId, role: 'user' as const, text: trimmed }];
      queueMicrotask(async () => {
        try {
          const dataCtx = await buildGeoAiDataContext(undefined, {
            satelliteLayers: satelliteCustomLayersToGeoAiLayers(customLayers),
          });
          const system = `${GEO_AI_CHAT_SYSTEM_BASE}\n\n---\nDATA CONTEXT (authoritative for this session turn):\n${dataCtx}`;
          const prior = historyWithUser.slice(0, -1);
          const turns: GeoAiChatTurn[] = prior.map(m => ({ role: m.role, text: m.text }));
          const reply = await agroChatWithDeepSeek({
            apiKey,
            system,
            turns,
            userMessage: trimmed,
          });
          const aid =
            typeof crypto !== 'undefined' && 'randomUUID' in crypto
              ? crypto.randomUUID()
              : `gds-m-${Date.now()}`;
          setGeoDeepseekChatMessages(h => [...h, { id: aid, role: 'assistant', text: reply }]);
          await applySatelliteGeoAiMapUi(trimmed, reply);
        } catch (e) {
          setGeoDeepseekChatError(e instanceof Error ? e.message : String(e));
        } finally {
          geoDeepseekInFlightRef.current = false;
          setGeoDeepseekBusy(false);
        }
      });
      return historyWithUser;
    });
  }, [deepseekApiKey, geoDeepseekDraft, applySatelliteGeoAiMapUi, customLayers]);

  const onGeoExplorerAttachChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setGeoExplorerChatError('Please attach an image file (PNG, JPEG, WebP, …).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const i = dataUrl.indexOf(',');
      const base64 = i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
      setGeoExplorerPendingImage({ mime: file.type || 'image/jpeg', base64 });
      setGeoExplorerChatError('');
    };
    reader.onerror = () => setGeoExplorerChatError('Could not read the image file.');
    reader.readAsDataURL(file);
  }, []);

  const setMapDragPanEnabled = (enabled: boolean) => {
    const map = getMapInstance();
    try {
      if (enabled) map?.dragPan?.enable();
      else map?.dragPan?.disable();
    } catch {
      /* ignore */
    }
  };

  const commitUserGeometry = (next: any | null) => {
    const cur = drawnGeometryRef.current;
    setGeomUndoStack(u => [...u, cur ? cloneDeep(cur) : null]);
    setGeomRedoStack([]);
    if (next) updateDrawnStats(next);
    else {
      setDrawnGeometry(null);
      setDrawnStats(null);
    }
  };

  const undoGeometry = () => {
    setGeomUndoStack(prev => {
      if (!prev.length) return prev;
      const before = prev[prev.length - 1];
      const cur = drawnGeometryRef.current;
      setGeomRedoStack(r => [...r, cur ? cloneDeep(cur) : null]);
      if (before) updateDrawnStats(before);
      else {
        setDrawnGeometry(null);
        setDrawnStats(null);
      }
      return prev.slice(0, -1);
    });
  };

  const redoGeometry = () => {
    setGeomRedoStack(prev => {
      if (!prev.length) return prev;
      const next = prev[prev.length - 1];
      const cur = drawnGeometryRef.current;
      setGeomUndoStack(u => [...u, cur ? cloneDeep(cur) : null]);
      if (next) updateDrawnStats(next);
      else {
        setDrawnGeometry(null);
        setDrawnStats(null);
      }
      return prev.slice(0, -1);
    });
  };

  const finalizeRectOrCircleDrag = (clientX: number, clientY: number) => {
    const map = getMapInstance();
    const spec = dragRectCircleRef.current;
    dragRectCircleRef.current = null;
    setRectCirclePreview(null);
    setMapDragPanEnabled(true);
    if (!map || !spec) return;
    const end = clientPointToLngLat(map, clientX, clientY);
    if (!end) return;
    const [lng1, lat1] = spec.start;
    const [lng2, lat2] = end;
    if (Math.hypot(lng2 - lng1, lat2 - lat1) < 1e-7) return;
    setCircleRadiusM(null);
    let feature: any;
    if (spec.kind === 'circle') {
      feature = circleFromEdgeFeature(lng1, lat1, lng2, lat2, 128);
    } else {
      feature = bboxToPolygonFeature(lng1, lat1, lng2, lat2, spec.kind === 'box_select' ? 'Box AOI' : 'Drawn rectangle');
    }
    commitUserGeometry(feature);
    setMapDrawTool('select');
    skipNextMapClickRef.current = true;
  };

  const endEditDragIfNeeded = () => {
    if (!editDragRef.current) return;
    editDragRef.current = null;
    setMapDragPanEnabled(true);
    const before = preEditGeomRef.current;
    preEditGeomRef.current = null;
    const after = drawnGeometryRef.current;
    if (before !== null && JSON.stringify(before) !== JSON.stringify(after)) {
      setGeomUndoStack(u => [...u, before]);
      setGeomRedoStack([]);
    }
    recomputeDrawnAoiStats(after);
  };

  const commitUserGeometryRef = useRef(commitUserGeometry);
  commitUserGeometryRef.current = commitUserGeometry;

  const polygonRingRef = useRef(polygonRing);
  polygonRingRef.current = polygonRing;

  useEffect(() => {
    if (mapDrawTool !== 'polygon') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      const ring = polygonRingRef.current;
      if (ring.length < 3) return;
      e.preventDefault();
      const closed = [...ring, ring[0]];
      const feature = {
        type: 'Feature',
        properties: { label: 'Drawn polygon' },
        geometry: { type: 'Polygon', coordinates: [closed] },
      };
      commitUserGeometryRef.current(feature);
      setPolygonRing([]);
      setPolygonClosingSnap(false);
      setDrawAssistHint('');
      setMapDrawTool('select');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mapDrawTool]);

  const applyMapDrawTool = (tool: MapDrawTool) => {
    dragRectCircleRef.current = null;
    setRectCirclePreview(null);
    setPointerLngLat(null);
    setPolylineStart(null);
    setPolygonRing([]);
    setPolygonClosingSnap(false);
    setDrawAssistHint('');
    setCircleRadiusM(null);
    setMapDrawTool(tool);
  };

  /** Undo last vertex / click while drawing (polygon, polyline start, or in-progress box/circle drag). */
  const removeLastDrawPoint = () => {
    if (dragRectCircleRef.current) {
      dragRectCircleRef.current = null;
      setRectCirclePreview(null);
      setCircleRadiusM(null);
      setMapDragPanEnabled(true);
      return;
    }
    if (mapDrawTool === 'polygon' && polygonRing.length > 0) {
      setPolygonRing(prev => prev.slice(0, -1));
      return;
    }
    if (mapDrawTool === 'polyline' && polylineStart) {
      setPolylineStart(null);
      setPointerLngLat(null);
    }
  };

  /** Abort current sketch (draft only); keeps committed AOI on the map. */
  const cancelCurrentDrawing = useCallback(() => {
    dragRectCircleRef.current = null;
    setRectCirclePreview(null);
    setPolylineStart(null);
    setPolygonRing([]);
    setPointerLngLat(null);
    setMapDragPanEnabled(true);
    editDragRef.current = null;
    preEditGeomRef.current = null;
    setPolygonClosingSnap(false);
    setDrawAssistHint('');
    setCircleRadiusM(null);
    setMapDrawTool('select');
  }, []);

  const clearAllAoiDrawing = () => {
    setGeomUndoStack([]);
    setGeomRedoStack([]);
    setDrawnGeometry(null);
    setDrawnStats(null);
    setPolylineStart(null);
    setPolygonRing([]);
    setRectCirclePreview(null);
    dragRectCircleRef.current = null;
    editDragRef.current = null;
    preEditGeomRef.current = null;
    setPolygonClosingSnap(false);
    setDrawAssistHint('');
    setCircleRadiusM(null);
    setMapDrawTool('select');
    setMapDragPanEnabled(true);
  };

  const handleMapPointerDown = (evt: any) => {
    const orig = evt.originalEvent as MouseEvent | undefined;
    if (orig && orig.button !== 0) return;
    const lng = evt.lngLat.lng;
    const lat = evt.lngLat.lat;
    const map = getMapInstance();
    if (!map) return;

    if (mapDrawTool === 'rectangle' || mapDrawTool === 'circle' || mapDrawTool === 'box_select') {
      dragRectCircleRef.current = { kind: mapDrawTool, start: [lng, lat] };
      setRectCirclePreview({ kind: mapDrawTool, a: [lng, lat], b: [lng, lat] });
      setMapDragPanEnabled(false);
      return;
    }

    if (mapDrawTool === 'select' && drawnGeometryRef.current) {
      const geom = drawnGeometryRef.current.geometry;
      const hitPx = vertexHitThresholdPx(map);
      const hit = findNearestVertex(map, geom, lng, lat, hitPx);
      if (hit) {
        preEditGeomRef.current = drawnGeometryRef.current ? cloneDeep(drawnGeometryRef.current) : null;
        editDragRef.current = { mode: 'vertex', ref: hit.ref };
        setMapDragPanEnabled(false);
        return;
      }
      if (geom?.type === 'Polygon' && pointInPolygonGeometry(lng, lat, geom)) {
        preEditGeomRef.current = drawnGeometryRef.current ? cloneDeep(drawnGeometryRef.current) : null;
        editDragRef.current = { mode: 'pan', last: [lng, lat] };
        setMapDragPanEnabled(false);
        return;
      }
      if (geom?.type === 'LineString') {
        const coords = geom.coordinates as [number, number][];
        if (coords.length >= 2 && minPixelDistToPolyline(map, lng, lat, coords) < hitPx * 0.85) {
          preEditGeomRef.current = drawnGeometryRef.current ? cloneDeep(drawnGeometryRef.current) : null;
          editDragRef.current = { mode: 'pan', last: [lng, lat] };
          setMapDragPanEnabled(false);
          return;
        }
      }
      if (geom?.type === 'Point') {
        const d = lngLatPixelDistance(map, [lng, lat], geom.coordinates as [number, number]);
        if (d < hitPx) {
          preEditGeomRef.current = drawnGeometryRef.current ? cloneDeep(drawnGeometryRef.current) : null;
          editDragRef.current = { mode: 'pan', last: [lng, lat] };
          setMapDragPanEnabled(false);
        }
      }
    }
  };

  const handleMapPointerMove = (evt: any) => {
    const lng = evt.lngLat.lng;
    const lat = evt.lngLat.lat;
    const map = getMapInstance();
    const dragSpec = dragRectCircleRef.current;
    if (dragSpec) {
      setRectCirclePreview({ kind: dragSpec.kind, a: dragSpec.start, b: [lng, lat] });
      if (dragSpec.kind === 'circle') {
        const [lng0, lat0] = dragSpec.start;
        setCircleRadiusM(haversineDistanceMeters(lng0, lat0, lng, lat));
      } else {
        setCircleRadiusM(null);
      }
      setDrawAssistHint('');
      setPolygonClosingSnap(false);
      return;
    }

    const ed = editDragRef.current;
    const base = drawnGeometryRef.current;
    if (ed && base) {
      if (ed.mode === 'vertex') {
        const next = setVertexCoord(base, ed.ref, lng, lat);
        updateDrawGeometryLive(next);
      } else {
        const [plng, plat] = ed.last;
        const dLng = lng - plng;
        const dLat = lat - plat;
        editDragRef.current = { mode: 'pan', last: [lng, lat] };
        const moved = translateFeatureCoordinates(base, dLng, dLat);
        updateDrawGeometryLive(moved);
      }
      return;
    }

    if (mapDrawTool === 'polyline' && polylineStart) {
      setPointerLngLat([lng, lat]);
      setPolygonClosingSnap(false);
      setDrawAssistHint('');
    } else if (mapDrawTool === 'polygon' && polygonRing.length) {
      setPointerLngLat([lng, lat]);
      if (map && polygonRing.length >= 3) {
        const d = lngLatPixelDistance(map, [lng, lat], polygonRing[0]);
        const snap = d <= POLYGON_CLOSE_SNAP_PX;
        setPolygonClosingSnap(snap);
        setDrawAssistHint(snap ? 'Click first vertex to close polygon' : '');
      } else {
        setPolygonClosingSnap(false);
        setDrawAssistHint(polygonRing.length ? 'Place vertices; Enter or right-click to finish' : '');
      }
    } else if (mapDrawTool === 'rectangle' || mapDrawTool === 'circle' || mapDrawTool === 'box_select') {
      setPointerLngLat([lng, lat]);
      setPolygonClosingSnap(false);
      setDrawAssistHint('');
    } else {
      setPointerLngLat(null);
      setPolygonClosingSnap(false);
      setDrawAssistHint('');
    }
    setCircleRadiusM(null);
  };

  const finalizeRectDragFromPointer = (clientX: number, clientY: number) => {
    if (!dragRectCircleRef.current) return;
    finalizeRectOrCircleDrag(clientX, clientY);
  };

  const interactionEndRef = useRef({
    finalizeRect: (_cx: number, _cy: number) => {},
    endEdit: () => {},
  });
  interactionEndRef.current.finalizeRect = finalizeRectDragFromPointer;
  interactionEndRef.current.endEdit = endEditDragIfNeeded;

  useEffect(() => {
    const onUp = (e: PointerEvent) => {
      if (dragRectCircleRef.current) {
        interactionEndRef.current.finalizeRect(e.clientX, e.clientY);
      }
      if (editDragRef.current) {
        interactionEndRef.current.endEdit();
      }
    };
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current?.getMap?.() ?? mapRef.current;
    if (!map || !isMapLoaded) return;
    const sketch =
      mapDrawTool === 'polygon' ||
      mapDrawTool === 'rectangle' ||
      mapDrawTool === 'circle' ||
      mapDrawTool === 'box_select';
    try {
      if (sketch) map.doubleClickZoom.disable();
      else map.doubleClickZoom.enable();
    } catch {
      /* ignore */
    }
    return () => {
      try {
        map.doubleClickZoom.enable();
      } catch {
        /* ignore */
      }
    };
  }, [mapDrawTool, isMapLoaded]);

  const undoRedoRef = useRef({ undo: undoGeometry, redo: redoGeometry });
  undoRedoRef.current = { undo: undoGeometry, redo: redoGeometry };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z' && !e.shiftKey) {
        if (dragRectCircleRef.current) {
          e.preventDefault();
          dragRectCircleRef.current = null;
          setRectCirclePreview(null);
          setCircleRadiusM(null);
          setMapDragPanEnabled(true);
          return;
        }
        if (mapDrawToolRef.current === 'polygon' && polygonRingRef.current.length > 0) {
          e.preventDefault();
          setPolygonRing(prev => prev.slice(0, -1));
          return;
        }
        if (mapDrawToolRef.current === 'polyline' && polylineStartRef.current) {
          e.preventDefault();
          setPolylineStart(null);
          setPointerLngLat(null);
          return;
        }
        e.preventDefault();
        undoRedoRef.current.undo();
        return;
      }
      if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) {
        e.preventDefault();
        undoRedoRef.current.redo();
        return;
      }
      if (e.key === 'Escape') {
        cancelCurrentDrawing();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cancelCurrentDrawing]);

  const handleMapClickDraw = (lng: number, lat: number) => {
    if (skipNextMapClickRef.current) {
      skipNextMapClickRef.current = false;
      return;
    }
    if (mapDrawTool === 'select') return;
    if (mapDrawTool === 'freehand' || mapDrawTool === 'text' || mapDrawTool === 'lasso') return;
    if (mapDrawTool === 'rectangle' || mapDrawTool === 'circle' || mapDrawTool === 'box_select') return;

    if (mapDrawTool === 'polygon') {
      const map = getMapInstance();
      let lngLat: [number, number] = [lng, lat];
      if (map && polygonRing.length >= 3) {
        const d = lngLatPixelDistance(map, [lng, lat], polygonRing[0]);
        if (d <= POLYGON_CLOSE_SNAP_PX) {
          const closed = [...polygonRing, polygonRing[0]];
          commitUserGeometry({
            type: 'Feature',
            properties: { label: 'Drawn polygon' },
            geometry: { type: 'Polygon', coordinates: [closed] },
          });
          setPolygonRing([]);
          setPolygonClosingSnap(false);
          setDrawAssistHint('');
          setMapDrawTool('select');
          return;
        }
      }
      if (map && polygonRing.length >= 1) {
        const { lng: sx, lat: sy, snapped } = snapLngLatToNearestVertex(
          map,
          lng,
          lat,
          polygonRing,
          POLYGON_VERTEX_SNAP_PX,
        );
        if (snapped) lngLat = [sx, sy];
      }
      setPolygonRing(prev => {
        const last = prev[prev.length - 1];
        if (last && Math.hypot(last[0] - lngLat[0], last[1] - lngLat[1]) < 1e-12) return prev;
        return [...prev, lngLat];
      });
      return;
    }

    if (mapDrawTool === 'polyline') {
      if (!polylineStart) {
        setPolylineStart([lng, lat]);
        return;
      }
      const feature = {
        type: 'Feature',
        properties: { label: 'Drawn polyline' },
        geometry: { type: 'LineString', coordinates: [polylineStart, [lng, lat]] },
      };
      commitUserGeometry(feature);
      setPolylineStart(null);
      setPointerLngLat(null);
      setMapDrawTool('select');
      return;
    }

    if (mapDrawTool === 'point') {
      commitUserGeometry(createPointFeature(lng, lat));
      setMapDrawTool('select');
    }
  };

  const handleMapContextMenu = (evt: any) => {
    if (mapDrawToolRef.current !== 'polygon') return;
    const ring = polygonRingRef.current;
    if (ring.length < 3) return;
    try {
      evt?.originalEvent?.preventDefault?.();
    } catch {
      /* ignore */
    }
    const closed = [...ring, ring[0]];
    commitUserGeometry({
      type: 'Feature',
      properties: { label: 'Drawn polygon' },
      geometry: { type: 'Polygon', coordinates: [closed] },
    });
    setPolygonRing([]);
    setPolygonClosingSnap(false);
    setDrawAssistHint('');
    setMapDrawTool('select');
  };

  const draftDrawGeoJson = useMemo(() => {
    const features: any[] = [];
    if (rectCirclePreview) {
      const [lng0, lat0] = rectCirclePreview.a;
      const [lng1, lat1] = rectCirclePreview.b;
      if (rectCirclePreview.kind === 'circle') {
        features.push(circleFromEdgeFeature(lng0, lat0, lng1, lat1, 72, 'Preview'));
      } else {
        features.push(bboxToPolygonFeature(lng0, lat0, lng1, lat1, 'Preview'));
      }
    }
    if (mapDrawTool === 'polygon') {
      const ring = polygonRing;
      for (const p of ring) {
        features.push({
          type: 'Feature',
          properties: { draftRole: 'polyVertex' },
          geometry: { type: 'Point', coordinates: p },
        });
      }
      if (pointerLngLat && ring.length >= 3 && polygonClosingSnap) {
        features.push({
          type: 'Feature',
          properties: { draftRole: 'closeHint' },
          geometry: { type: 'LineString', coordinates: [ring[0], pointerLngLat] },
        });
      }
      if (pointerLngLat && ring.length) {
        const draftLine = [...ring, pointerLngLat];
        if (draftLine.length > 1) {
          features.push({
            type: 'Feature',
            properties: { draftRole: 'rubber' },
            geometry: { type: 'LineString', coordinates: draftLine },
          });
        }
      } else if (ring.length > 1) {
        features.push({
          type: 'Feature',
          properties: { draftRole: 'rubber' },
          geometry: { type: 'LineString', coordinates: ring },
        });
      }
    }
    if (mapDrawTool === 'polyline' && polylineStart) {
      features.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: polylineStart } });
      if (pointerLngLat) {
        features.push({
          type: 'Feature',
          properties: { draftRole: 'rubber' },
          geometry: { type: 'LineString', coordinates: [polylineStart, pointerLngLat] },
        });
      }
    }
    if (!features.length) return null;
    return { type: 'FeatureCollection', features };
  }, [mapDrawTool, polygonRing, polylineStart, pointerLngLat, rectCirclePreview, polygonClosingSnap]);

  const editHandlesGeoJson = useMemo(() => {
    if (mapDrawTool !== 'select' || !drawnGeometry) return null;
    const verts = collectVertexRefs(drawnGeometry.geometry);
    if (!verts.length) return null;
    return {
      type: 'FeatureCollection',
      features: verts.map((v, i) => ({
        type: 'Feature',
        properties: { vi: i },
        geometry: { type: 'Point', coordinates: v.coord },
      })),
    };
  }, [mapDrawTool, drawnGeometry]);

  const persistDrawWorkspace = () => {
    saveDrawWorkspace({ feature: drawnGeometry, style: drawStyle });
  };

  const restoreDrawWorkspace = () => {
    const w = loadDrawWorkspace();
    if (!w?.feature) return;
    if (w.style) setDrawStyle({ ...DEFAULT_DRAW_STYLE, ...w.style });
    setGeomUndoStack([]);
    setGeomRedoStack([]);
    updateDrawnStats(w.feature);
  };

  const exportDrawn = (kind: 'geojson' | 'wkt' | 'kml') => {
    if (!drawnGeometry) return;
    if (kind === 'geojson') {
      downloadTextFile('aoi-sketch.geojson', JSON.stringify(drawnGeometry, null, 2), 'application/geo+json');
    } else if (kind === 'wkt') {
      downloadTextFile('aoi-sketch.wkt', featureToWkt(drawnGeometry), 'text/plain');
    } else {
      downloadTextFile('aoi-sketch.kml', featureToKml(drawnGeometry), 'application/vnd.google-earth.kml+xml');
    }
  };

  useEffect(() => {
    if (!isTimelinePlaying || dates.length === 0) return;

    let index = dates.findIndex(d => d.full.toDateString() === selectedDate.toDateString());
    if (index === -1) index = 0;

    const interval = setInterval(() => {
      index = (index + 1) % dates.length;
      applySelectedDate(dates[index].full);
    }, 1200);

    return () => clearInterval(interval);
  }, [isTimelinePlaying, dates, selectedDate]);

  useEffect(() => {
    const iso = selectedDate.toISOString().split('T')[0];
    if (timeSeriesStart && iso < timeSeriesStart) {
      setSelectedDate(new Date(timeSeriesStart));
      return;
    }
    if (timeSeriesEnd && iso > timeSeriesEnd) {
      setSelectedDate(new Date(timeSeriesEnd));
    }
  }, [timeSeriesStart, timeSeriesEnd]);

  useEffect(() => {
    const loadLayers = async () => {
      setIsLoadingLayers(true);
      try {
        const response = await fetch(`${wmsBaseUrl}?SERVICE=WMS&REQUEST=GetCapabilities`);
        if (response.ok) {
          const text = await response.text();
          const parser = new DOMParser();
          const xml = parser.parseFromString(text, 'application/xml');
          const nodes = Array.from(xml.getElementsByTagName('Layer'));
          const parsed: WmsLayerInfo[] = [];
          nodes.forEach(node => {
            const nameNode = node.getElementsByTagName('Name')[0];
            if (!nameNode) return;
            const titleNode = node.getElementsByTagName('Title')[0];
            const name = nameNode.textContent || '';
            let title = (titleNode?.textContent || name).trim();
            if (name === 'NDWI' && /Moisture Index \(NDWI\)/i.test(title)) title = 'NDWI';
            if (name && !parsed.some(l => l.name === name)) {
              parsed.push({ name, title });
            }
          });
          if (parsed.length > 0) {
            setWmsLayers(parsed);
            return;
          }
        }
        setWmsLayers([]);
      } catch (error) {
        console.error('Failed to load WMS layers', error);
        setWmsLayers([]);
      } finally {
        setIsLoadingLayers(false);
      }
    };
    loadLayers();
  }, [wmsBaseUrl]);

  /** Keep WMS layer name aligned with layers returned for the configured Sentinel Hub instance. */
  useEffect(() => {
    if (!wmsLayers.length) return;
    setWmsLayer(prev => (prev && wmsLayers.some(l => l.name === prev) ? prev : wmsLayers[0]!.name));
  }, [wmsLayers]);

  /** When the chosen WMS layer matches a built-in environmental index id, keep charts/AOI logic in sync. */
  useEffect(() => {
    const w = wmsLayer.trim();
    const ids = Object.keys(ENVIRONMENTAL_INDICES) as EnvironmentalIndexId[];
    if (ids.includes(w as EnvironmentalIndexId)) setSelectedIndex(w as EnvironmentalIndexId);
  }, [wmsLayer]);

  const activeWmsLayer = useMemo(() => {
    const t = wmsLayer.trim();
    if (t && wmsLayers.some(l => l.name === t)) return t;
    const first = wmsLayers.find(l => l.name.trim().length > 0)?.name.trim() ?? '';
    if (first) return first;
    if (selectedIndex === 'LST') return '';
    return selectedIndex;
  }, [wmsLayer, wmsLayers, selectedIndex]);

  const wmsLayerSelectValue = useMemo(() => {
    const t = wmsLayer.trim();
    if (t && wmsLayers.some(l => l.name === t)) return t;
    return wmsLayers[0]?.name ?? '';
  }, [wmsLayer, wmsLayers]);

  const wmsDate = selectedDate.toISOString().split('T')[0];
  const sentinelVisible = isWmsOverlayVisible && !!activeWmsLayer;
  const activeBasemapId = useMemo(() => resolveBasemapId(basemapId), [basemapId]);
  const currentBasemapEntry = useMemo(() => {
    return (
      catalogEntryById(basemapCatalog, activeBasemapId) ??
      catalogEntryById(
        basemapCatalog,
        mapboxToken ? DEFAULT_BASEMAP_ID : DEFAULT_BASEMAP_ID_NO_MAPBOX,
      )!
    );
  }, [basemapCatalog, activeBasemapId, mapboxToken]);
  const mapStyle = currentBasemapEntry
    ? mapboxGlStyleForEntry(currentBasemapEntry, mapboxToken || '')
    : EMPTY_MAP_STYLE;

  /** Avoid Mapbox "Style is not done loading" by not mounting GeoJSON/Layer children until style is ready; reset after basemap/token change. */
  const basemapStyleGateRef = useRef(false);
  useLayoutEffect(() => {
    if (!basemapStyleGateRef.current) {
      basemapStyleGateRef.current = true;
      return;
    }
    setIsMapLoaded(false);
  }, [activeBasemapId, mapboxToken]);

  const toggleWmsOverlayVisibility = () => setIsWmsOverlayVisible(v => !v);
  const toggleStacThumbVisibility = () => setIsStacThumbVisible(v => !v);
  const currentBasemapLabel = currentBasemapEntry?.label || basemapId || 'Default basemap';
  const addedLayerEntries = useMemo(
    () => [
      {
        id: 'basemap',
        label: currentBasemapLabel,
        meta: 'Base map',
        visible: true,
        toggleable: false,
        actionable: false,
        onToggle: () => {},
      },
      // WMS overlay entry intentionally hidden from Added layers list.
      ...(stacMapThumb
        ? [
            {
              id: 'stac-thumb',
              label: stacMapThumbLabel || 'STAC imagery preview',
              meta: 'STAC raster',
              visible: isStacThumbVisible,
              toggleable: true,
              actionable: false,
              onToggle: toggleStacThumbVisibility,
            },
          ]
        : []),
      ...customLayers.map(layer => {
        const featureCount = Array.isArray(layer.geojson?.features) ? layer.geojson.features.length : 0;
        const lower = layer.name.toLowerCase();
        const sourceType =
          lower.includes('arcgis') ? 'ArcGIS' :
          lower.includes('kml') || lower.includes('kmz') ? 'KML/KMZ' :
          lower.includes('shp') || lower.includes('shape') ? 'SHP' :
          'Vector layer';
        return {
          id: `custom-${layer.id}`,
          label: layer.name,
          meta: `${sourceType}${featureCount ? ` - ${featureCount} feature${featureCount === 1 ? '' : 's'}` : ''}`,
          visible: layer.visible,
          toggleable: true,
          actionable: true,
          sourceLayerId: layer.id,
          onToggle: () => toggleCustomLayerVisibility(layer.id, !layer.visible),
        };
      }),
    ],
    [
      activeWmsLayer,
      currentBasemapLabel,
      customLayers,
      isStacThumbVisible,
      sentinelVisible,
      stacMapThumb,
      stacMapThumbLabel,
    ],
  );
  const exploreSelectedCollectionsLabel = useMemo(() => {
    if (!exploreSelectedCollectionIds.length) return 'From selected collections';
    const preview = exploreSelectedCollectionIds.slice(0, 2).join(', ');
    const tail = exploreSelectedCollectionIds.length > 2 ? ` +${exploreSelectedCollectionIds.length - 2}` : '';
    return `From selected collections (${preview}${tail})`;
  }, [exploreSelectedCollectionIds]);

  useEffect(() => {
    const original = console.error;
    consoleErrorRef.current = original;
    console.error = (...args: any[]) => {
      const text = args.map(arg => (typeof arg === 'string' ? arg : '')).join(' ');
      if (ERROR_FILTER_PATTERNS.some(pattern => text.includes(pattern))) {
        return;
      }
      original(...args);
    };
    return () => {
      if (consoleErrorRef.current) {
        console.error = consoleErrorRef.current;
      }
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current?.getMap ? mapRef.current.getMap() : mapRef.current;
    if (!map || !map.on) return;

    const handleMapError = (e: any) => {
      const message = e?.error?.message || '';
      const url = e?.error?.url || '';
      const status = e?.error?.status;

      if (
        message.includes('ERR_ABORTED') ||
        status === 0 ||
        url.includes('api.mapbox.com/v4/mapbox.satellite') ||
        url.includes('services.sentinel-hub.com/ogc/wms')
      ) {
        if (typeof e.preventDefault === 'function') {
          e.preventDefault();
        }
        return;
      }
    };

    map.on('error', handleMapError);
    return () => {
      map.off('error', handleMapError);
    };
  }, []);

  const wmsTileUrl = useMemo(() => {
    const safeLayer = encodeURIComponent(activeWmsLayer);
    const start = timeSeriesStart || wmsDate;
    const end = timeSeriesEnd || wmsDate;
    return `${wmsBaseUrl}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0` +
      `&LAYERS=${safeLayer}` +
      `&BBOX={bbox-epsg-3857}&CRS=EPSG:3857` +
      `&FORMAT=image/png&TRANSPARENT=true&WIDTH=512&HEIGHT=512` +
      `&TIME=${start}/${end}&MAXCC=${cloudCoverage}&SHOWLOGO=false&WARNINGS=true`;
  }, [activeWmsLayer, timeSeriesStart, timeSeriesEnd, wmsDate, cloudCoverage, wmsBaseUrl]);

  return (
    <div className="si-page">
      <div className="si-main-content">
        <div
          className={`si-map-container${
            ['point', 'polyline', 'polygon', 'rectangle', 'circle', 'box_select'].includes(mapDrawTool)
              ? ' si-map-container--drawing'
              : ''
          }`}
        >
          {(circleRadiusM !== null && rectCirclePreview?.kind === 'circle') || drawAssistHint ? (
            <div className="si-draw-live-hud" aria-live="polite">
              {circleRadiusM !== null && rectCirclePreview?.kind === 'circle' ? (
                <span className="si-draw-live-hud-radius">
                  Radius:{' '}
                  {circleRadiusM < 1000
                    ? `${Math.round(circleRadiusM)} m`
                    : `${(circleRadiusM / 1000).toFixed(2)} km`}
                </span>
              ) : null}
              {drawAssistHint ? <span className="si-draw-live-hud-hint">{drawAssistHint}</span> : null}
            </div>
          ) : null}
          <MapGL
            ref={mapRef}
            {...viewState}
            onMove={evt => setViewState(evt.viewState)}
            onMouseDown={handleMapPointerDown}
            onMouseMove={handleMapPointerMove}
            onClick={evt => handleMapClickDraw(evt.lngLat.lng, evt.lngLat.lat)}
            onContextMenu={handleMapContextMenu}
            style={{
              width: '100%',
              height: '100%',
              cursor: ['point', 'polyline', 'polygon', 'rectangle', 'circle', 'box_select'].includes(mapDrawTool)
                ? 'crosshair'
                : mapDrawTool === 'select' && drawnGeometry
                  ? 'pointer'
                  : 'grab',
            }}
            mapStyle={mapStyle}
            mapboxAccessToken={mapboxToken || undefined}
            projection={is3DView ? { name: 'globe' } : { name: 'mercator' }}
            renderWorldCopies={!is3DView}
            dragRotate={is3DView}
            pitchWithRotate={is3DView}
            fog={is3DView ? { 'range': [0.5, 10], 'color': '#020617', 'horizon-blend': 0.1 } : undefined}
            onError={(e: any) => {
              const message = e?.error?.message || '';
              const url = e?.error?.url || '';
              const status = e?.error?.status;

              if (
                message.includes('ERR_ABORTED') ||
                status === 0 ||
                url.includes('api.mapbox.com/v4/mapbox.satellite') ||
                url.includes('services.sentinel-hub.com/ogc/wms')
              ) {
                return;
              }
              console.warn('Map Error:', e);
            }}
            onLoad={() => setIsMapLoaded(true)}
          >
            {isMapLoaded ? (
              <>
                {customLayers.map(layer => {
                  if (!layer.visible) return null;
                  const st = siLayerMapboxStylePack(layer);
                  return (
                    <Source
                      key={`${layer.id}-${layer.useArcGisSymbology ? 'ag' : 'c'}`}
                      id={layer.id}
                      type="geojson"
                      data={layer.geojson}
                    >
                      <Layer id={`${layer.id}-fill`} type="fill" filter={st.fillFilter} paint={st.fillPaint as any} />
                      <Layer id={`${layer.id}-line`} type="line" filter={st.lineFilter} paint={st.linePaint as any} />
                      <Layer id={`${layer.id}-circle`} type="circle" filter={st.pointFilter} paint={st.circlePaint as any} />
                    </Source>
                  );
                })}

                {pivots.length > 0 && (
                  <Source id="agri-pivots-source" type="geojson" data={pivotGeoJson as any}>
                    <Layer
                      id="agri-pivots-fill"
                      type="fill"
                      layout={pivotFillLayoutAndPaint.fillLayout}
                      paint={pivotFillLayoutAndPaint.fillPaint}
                    />
                    <Layer
                      id="agri-pivots-outline"
                      type="line"
                      layout={pivotFillLayoutAndPaint.outlineLayout}
                      paint={{
                        'line-color': ['coalesce', ['get', 'color'], '#22c55e'] as any,
                        'line-width': 2,
                        'line-opacity': 0.9,
                      }}
                    />
                  </Source>
                )}

                {geoAiPinGeoJson ? (
                  <Source id="si-geo-ai-pin" type="geojson" data={geoAiPinGeoJson as any}>
                    <Layer
                      id="si-geo-ai-pin-glow"
                      type="circle"
                      paint={{
                        'circle-radius': 18,
                        'circle-color': '#a78bfa',
                        'circle-opacity': 0.35,
                        'circle-blur': 0.6,
                      }}
                    />
                    <Layer
                      id="si-geo-ai-pin-core"
                      type="circle"
                      paint={{
                        'circle-radius': 7,
                        'circle-color': '#c4b5fd',
                        'circle-stroke-width': 2,
                        'circle-stroke-color': '#faf5ff',
                      }}
                    />
                  </Source>
                ) : null}

                {draftDrawGeoJson ? (
                  <Source id="si-draw-draft" type="geojson" data={draftDrawGeoJson as any}>
                    <Layer
                      id="si-draw-draft-fill"
                      type="fill"
                      filter={['==', ['geometry-type'], 'Polygon']}
                      paint={{
                        'fill-color': drawStyle.fillColor,
                        'fill-opacity': Math.min(0.45, drawStyle.fillOpacity + 0.12),
                      }}
                    />
                    <Layer
                      id="si-draw-draft-line"
                      type="line"
                      filter={[
                        'all',
                        ['==', ['geometry-type'], 'LineString'],
                        ['!=', ['get', 'draftRole'], 'closeHint'],
                      ]}
                      paint={{
                        'line-color': drawStyle.strokeColor,
                        'line-width': drawStyle.strokeWidth,
                        'line-dasharray': [2, 2],
                        'line-opacity': 0.9,
                      }}
                    />
                    <Layer
                      id="si-draw-draft-close-hint"
                      type="line"
                      filter={['==', ['get', 'draftRole'], 'closeHint']}
                      paint={{
                        'line-color': '#4ade80',
                        'line-width': Math.max(2, drawStyle.strokeWidth),
                        'line-dasharray': [1, 2],
                        'line-opacity': 0.95,
                      }}
                    />
                    <Layer
                      id="si-draw-draft-vertex"
                      type="circle"
                      filter={['==', ['get', 'draftRole'], 'polyVertex']}
                      paint={{
                        'circle-radius': 7,
                        'circle-color': '#bbf7d0',
                        'circle-stroke-width': 2,
                        'circle-stroke-color': '#14532d',
                      }}
                    />
                    <Layer
                      id="si-draw-draft-pt"
                      type="circle"
                      filter={[
                        'all',
                        ['==', ['geometry-type'], 'Point'],
                        ['!=', ['get', 'draftRole'], 'polyVertex'],
                      ]}
                      paint={{
                        'circle-radius': 6,
                        'circle-color': drawStyle.strokeColor,
                        'circle-stroke-width': 2,
                        'circle-stroke-color': '#0f172a',
                      }}
                    />
                  </Source>
                ) : null}

                {drawnGeometry && (
                  <Source id="drawn-index-geometry-source" type="geojson" data={drawnGeometry as any}>
                    <Layer
                      id="drawn-index-geometry-fill"
                      type="fill"
                      filter={['==', ['geometry-type'], 'Polygon']}
                      paint={{
                        'fill-color': drawStyle.fillColor,
                        'fill-opacity': drawStyle.fillOpacity,
                      }}
                    />
                    <Layer
                      id="drawn-index-geometry-line"
                      type="line"
                      filter={['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]]}
                      paint={{
                        'line-color': drawStyle.strokeColor,
                        'line-width': [
                          'case',
                          ['==', ['geometry-type'], 'LineString'],
                          Math.max(2, drawStyle.strokeWidth + 1),
                          drawStyle.strokeWidth,
                        ],
                      }}
                    />
                    <Layer
                      id="drawn-index-geometry-point"
                      type="circle"
                      filter={['==', ['geometry-type'], 'Point']}
                      paint={{
                        'circle-radius': drawStyle.pointRadius,
                        'circle-color': drawStyle.fillColor,
                        'circle-opacity': Math.min(1, drawStyle.fillOpacity + 0.55),
                        'circle-stroke-color': drawStyle.strokeColor,
                        'circle-stroke-width': Math.max(1, drawStyle.strokeWidth / 2),
                      }}
                    />
                  </Source>
                )}

                {editHandlesGeoJson ? (
                  <Source id="si-edit-handles" type="geojson" data={editHandlesGeoJson as any}>
                    <Layer
                      id="si-edit-handles-circles"
                      type="circle"
                      paint={{
                        'circle-radius': 9,
                        'circle-color': drawStyle.strokeColor,
                        'circle-stroke-width': 2,
                        'circle-stroke-color': '#0f172a',
                        'circle-opacity': 0.95,
                      }}
                    />
                  </Source>
                ) : null}
              </>
            ) : null}

            {isMapLoaded && showStacFootprintsOnMap && stacFootprintsGeoJson.features.length > 0 && (
              <Source id="si-stac-footprints" type="geojson" data={stacFootprintsGeoJson as any}>
                <Layer
                  id="si-stac-footprints-fill"
                  type="fill"
                  filter={['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]]}
                  paint={{
                    'fill-color': '#38bdf8',
                    'fill-opacity': 0.14,
                  }}
                />
                <Layer
                  id="si-stac-footprints-line"
                  type="line"
                  paint={{
                    'line-color': '#0ea5e9',
                    'line-width': 1.25,
                    'line-dasharray': [2, 1],
                  }}
                />
              </Source>
            )}

            {isMapLoaded && sentinelVisible && (
              <Source
                key={`sentinel-${activeWmsLayer}-${wmsDate}`}
                id="sentinel-source"
                type="raster"
                tiles={[wmsTileUrl]}
                tileSize={512}
              >
                <Layer
                  id="sentinel-layer"
                  type="raster"
                  paint={{
                    'raster-opacity': 0.85,
                    'raster-fade-duration': 0
                  }}
                />
              </Source>
            )}

            {isMapLoaded && stacMapThumb && isStacThumbVisible && (
              <Source
                key={stacMapThumb.url}
                id="si-stac-thumb-raster"
                type="image"
                url={stacMapThumb.url}
                coordinates={stacMapThumb.coordinates}
              >
                <Layer
                  id="si-stac-thumb-layer"
                  type="raster"
                  paint={{
                    'raster-opacity': 0.92,
                    'raster-fade-duration': 0,
                  }}
                />
              </Source>
            )}

            {isMapLoaded && geoAiInspectCard ? (
              <Marker
                className="si-geo-ai-inspect-marker"
                longitude={geoAiInspectCard.lng}
                latitude={geoAiInspectCard.lat}
                anchor="bottom"
                offset={[0, 6]}
              >
                <div
                  className="si-geo-ai-inspect-card si-geo-ai-inspect-card--map-anchor"
                  role="dialog"
                  aria-label="Geo AI location details"
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => e.stopPropagation()}
                >
                  <div className="si-geo-ai-inspect-card__head">
                    <strong className="si-geo-ai-inspect-card__title">{geoAiInspectCard.title}</strong>
                    <button
                      type="button"
                      className="si-geo-ai-inspect-card__close"
                      onClick={() => setGeoAiInspectCard(null)}
                      aria-label="Close details"
                    >
                      ×
                    </button>
                  </div>
                  <div className="si-geo-ai-inspect-card__meta">
                    <div className="si-geo-ai-inspect-card__meta-row">
                      <span className="si-geo-ai-inspect-card__meta-k">Coordinates</span>
                      <span className="si-geo-ai-inspect-card__meta-v" dir="ltr">
                        {geoAiInspectCard.lng.toFixed(5)}°, {geoAiInspectCard.lat.toFixed(5)}°
                      </span>
                    </div>
                    <div className="si-geo-ai-inspect-card__meta-row">
                      <span className="si-geo-ai-inspect-card__meta-k">Area</span>
                      <span className="si-geo-ai-inspect-card__meta-v">
                        {geoAiInspectCard.areaName?.trim() || '—'}
                      </span>
                    </div>
                    <div className="si-geo-ai-inspect-card__meta-row">
                      <span className="si-geo-ai-inspect-card__meta-k">Country</span>
                      <span className="si-geo-ai-inspect-card__meta-v">
                        {geoAiInspectCard.country &&
                        !/^\d+$/.test(String(geoAiInspectCard.country).trim())
                          ? geoAiInspectCard.country
                          : '—'}
                      </span>
                    </div>
                  </div>
                  {geoAiInspectCard.rows.length ? (
                    <div className="si-geo-ai-inspect-card__table-wrap">
                      <table className="si-geo-ai-inspect-card__table">
                        <tbody>
                          {geoAiInspectCard.rows.map(row => (
                            <tr key={row.label}>
                              <th scope="row">{row.label}</th>
                              <td>{row.value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              </Marker>
            ) : null}

            {isMapLoaded ? <NavigationControl position="bottom-right" /> : null}
          </MapGL>

          {drawnStats && (
            <div className="si-aoi-analysis-pill" dir="ltr">
              <span className="si-aoi-analysis-pill-label">AOI</span>
              <span className="si-aoi-analysis-pill-index">{selectedIndex}</span>
              <span className="si-aoi-analysis-pill-mean" style={{ color: aoiVizColor }}>{drawnStats.mean}</span>
            </div>
          )}

          <div className="si-map-floating-controls">
            <div className="si-map-floating-controls__row">
              <div className="si-map-floating-controls__left">
          <div
            ref={searchRef}
            className={`si-map-search ${isSearchOpen ? 'open' : 'collapsed'}`}
          >
            <button
              type="button"
              className="si-map-search-toggle"
              onClick={() => setIsSearchOpen(open => !open)}
            >
              <i className={isSearchOpen ? 'fa-solid fa-xmark' : 'fa-solid fa-magnifying-glass'}></i>
            </button>

            {isSearchOpen && (
              <div className="si-map-search-inner">
                <i className="fa-solid fa-magnifying-glass si-map-search-icon"></i>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search places"
                  className="si-map-search-input"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      performSearch();
                    }
                  }}
                />
                <button
                  type="button"
                  className="si-map-search-button"
                  onClick={performSearch}
                >
                  {isSearching ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-arrow-right"></i>}
                </button>
              </div>
            )}

            {isSearchOpen && showSearchResults && searchResults.length > 0 && (
              <div className="si-map-search-results">
                {searchResults.map(feature => {
                  const title = feature?.text || feature?.properties?.name || feature?.properties?.display_name || 'Result';
                  const subtitle = feature?.place_name
                    ? feature.place_name.replace(String(feature.text || '') + ', ', '')
                    : feature?.properties?.display_name && feature?.properties?.display_name !== title
                      ? feature.properties.display_name
                      : '';
                  const key =
                    feature?.id ||
                    feature?.properties?.place_id ||
                    feature?.properties?.osm_id ||
                    `${title}-${String(feature?.geometry?.coordinates || '')}`;
                  return (
                    <button
                      type="button"
                      key={key}
                      className="si-map-search-result"
                      onClick={() => handleSelectSearchResult(feature)}
                    >
                      <span className="si-map-search-result-title">{title}</span>
                      {subtitle && (
                        <span className="si-map-search-result-subtitle">
                          {subtitle}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
              <div className="si-basemap-toggle">
                <button
                  type="button"
                  className={`si-basemap-button ${isBasemapOpen ? 'active' : ''}`}
                  onClick={() => setIsBasemapOpen(open => !open)}
                  title="Basemap"
                >
                  <i className="fa-solid fa-globe"></i>
                </button>
                {isBasemapOpen && (
                  <div className="si-basemap-widget si-basemap-widget--grid">
                    {basemapCatalog.map(entry => {
                      const thumb = getBasemapThumbnail(entry, mapboxToken || '');
                      const isHybrid =
                        entry.id === 'mapbox-hybrid' || entry.id === 'esri-imagery-hybrid';
                      return (
                        <button
                          type="button"
                          key={entry.id}
                          className={`si-basemap-card ${activeBasemapId === entry.id ? 'active' : ''}`}
                          onClick={() => {
                            setBasemapId(entry.id);
                            setIsBasemapOpen(false);
                          }}
                        >
                          <span className="si-basemap-card-thumb">
                            <img src={thumb} alt="" />
                            {isHybrid && <span className="si-basemap-card-hybrid">Labels</span>}
                            {activeBasemapId === entry.id && (
                              <span className="si-basemap-card-check" aria-hidden>
                                <i className="fa-solid fa-check" />
                              </span>
                            )}
                          </span>
                          <span className="si-basemap-card-label">{entry.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              </div>
              <div className="si-map-floating-controls__right">
            <div className="si-env-rail">
            <div
              role="toolbar"
              aria-orientation="vertical"
              aria-label="Environmental map tools"
              className="si-env-toolbar container"
            >
              <calcite-action-group
                className="action-group--end"
                layout="vertical"
                overlay-positioning="absolute"
                scale="m"
                selection-mode="none"
                calcite-hydrated=""
              >
              <button
                type="button"
                  className={`si-env-calcite-action${isLayerDropdownOpen ? ' si-env-calcite-action--selected' : ''}`}
                  aria-pressed={isLayerDropdownOpen}
                  aria-label="Environmental layers and indices"
                  title="Environmental layers"
                onClick={() => setIsLayerDropdownOpen(open => !open)}
              >
                  <i className="fa-solid fa-layer-group" aria-hidden />
              </button>
                <span
                  className="si-env-toolbar-lit-hydration"
                  aria-hidden
                  dangerouslySetInnerHTML={{ __html: '<!--?lit$830856406$-->' }}
                />
                <slot name="actions-end" />
                <slot name="expand-tooltip" />
              </calcite-action-group>
            </div>
              <input
                ref={fileInputRef}
                type="file"
                className="add-layer-input"
                accept=".kml,.kmz,.zip,.geojson,.json,.csv"
                onChange={handleLayerFileChange}
              />
              {isLayerDropdownOpen && (
                <div
                  className={`si-env-panel${
                    expandedEnvSection === 'explore-stac' || expandedEnvSection === 'table-geo-ai'
                      ? ' si-env-panel--explore-stac'
                      : ''
                  }`}
                  dir="auto"
                >
                  <div className="si-env-panel-header">
                    <div className="si-env-header-top">
                      <div>
                        <div className="si-env-title">Environmental Index</div>
                        <div className="si-env-imagery-date">
                          Imagery date: {selectedDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="si-env-close"
                        onClick={() => setIsLayerDropdownOpen(false)}
                      >
                        <i className="fa-solid fa-xmark"></i>
                      </button>
                    </div>
                  </div>
                  <div className="si-env-panel-body">
                    <div
                      className="si-env-section-tabs si-env-section-tabs--four"
                      role="tablist"
                      aria-label="Environmental Index sections"
                    >
                      {[
                        { id: 'layers' as const, label: 'Layers', icon: 'fa-solid fa-layer-group' },
                        { id: 'explore-stac' as const, label: 'Explore STAC', icon: 'fa-solid fa-magnifying-glass-chart' },
                        {
                          id: 'remote-sensing' as const,
                          label: 'Remote sensing',
                          icon: 'fa-solid fa-satellite-dish',
                        },
                        {
                          id: 'table-geo-ai' as const,
                          label: 'Geo AI',
                          icon: 'fa-solid fa-comments',
                        },
                      ].map(section => (
                        <button
                          key={section.id}
                          type="button"
                          className={expandedEnvSection === section.id ? 'active' : ''}
                          onClick={() => setExpandedEnvSection(section.id)}
                          aria-label={section.label}
                          title={section.label}
                        >
                          <i className={section.icon} />
                        </button>
                      ))}
                    </div>
                    {expandedEnvSection === 'explore-stac' ? (
                      <div className="si-explore-stac si-explore-stac--embedded si-explore-stac--in-header">
            <div className="si-explore-stac-header">
              <div>
                <h2 id="si-explore-stac-title">Explore STAC</h2>
                <p className="si-explore-stac-sub">
                  {stacConnection.connectionName}
                  {showStacSearchUrlInChrome ? (
                    <>
                  <span className="si-explore-stac-sub-sep">·</span>
                      <a
                        className="si-explore-stac-url"
                        href={stacActiveSearchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={stacActiveSearchUrl}
                      >
                        {stacActiveSearchUrl}
                      </a>
                    </>
                  ) : null}
                </p>
              </div>
              <div className="si-explore-stac-header-actions">
                <button type="button" className="si-explore-linkish" onClick={refreshExploreStacCatalog} disabled={isLoadingStacCollections}>
                  {isLoadingStacCollections ? 'Refreshing…' : 'Refresh catalog'}
                </button>
              </div>
            </div>
            <div className="si-explore-stac-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={exploreTab === 'parameters'}
                className={exploreTab === 'parameters' ? 'active' : ''}
                onClick={() => setExploreTab('parameters')}
              >
                Parameters
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={exploreTab === 'results'}
                className={exploreTab === 'results' ? 'active' : ''}
                onClick={() => setExploreTab('results')}
              >
                Results
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={exploreTab === 'source'}
                className={exploreTab === 'source' ? 'active' : ''}
                onClick={() => setExploreTab('source')}
              >
                Source
              </button>
            </div>
            <div
              className={`si-explore-stac-body${exploreTab === 'results' ? ' si-explore-stac-body--results-tab' : ''}`}
            >
              {exploreTab === 'parameters' ? (
                <>
                  <div className="si-explore-collections-section">
                    <div className="si-explore-collections-section-label">Search collections</div>
                    <div className="si-explore-collections-search si-explore-collections-search--chrome">
                      <i className="fa-solid fa-magnifying-glass" aria-hidden />
                      <input
                        type="search"
                        placeholder="Filter by name…"
                        value={exploreCollectionSearch}
                        onChange={e => setExploreCollectionSearch(e.target.value)}
                        aria-label="Search collections"
                      />
                      {exploreCollectionSearch ? (
                        <button
                          type="button"
                          className="si-explore-search-clear"
                          onClick={() => setExploreCollectionSearch('')}
                          aria-label="Clear search"
                        >
                          <i className="fa-solid fa-xmark" aria-hidden />
                        </button>
                      ) : null}
                      <i className="fa-solid fa-chevron-down si-explore-collections-search-suffix" aria-hidden />
                    </div>
                    <div className="si-explore-collections-quick-actions">
                      <button type="button" className="si-explore-linkish" onClick={selectAllFilteredExploreCollections}>
                        Select all (filtered)
                      </button>
                      <button type="button" className="si-explore-linkish" onClick={clearExploreCollectionSelection}>
                        Clear selection
                      </button>
                    </div>
                    <div className="si-explore-collection-table-head">
                      <span />
                      <span>Name</span>
                      <span className="si-explore-col-meta-h" aria-hidden>
                        <i className="fa-solid fa-list" />
                      </span>
                    </div>
                    <div className="si-explore-collection-list-wrap si-explore-collection-list-wrap--parameters-top">
                      {isLoadingStacCollections ? (
                        <p className="si-explore-muted">Loading collections…</p>
                      ) : stacCollectionsLoadError ? (
                        <p className="si-explore-error">{stacCollectionsLoadError}</p>
                      ) : exploreFilteredCollections.length === 0 ? (
                        <p className="si-explore-muted">No collections match the filter.</p>
                      ) : (
                        <ul className="si-explore-collection-list">
                          {exploreFilteredCollections.map(c => {
                            const href = `${getStacCollectionsListUrl(stacConnection).replace(/\/$/, '')}/${encodeURIComponent(c.id)}`;
                            return (
                              <li key={c.id} className="si-explore-collection-row">
                                <input
                                  type="checkbox"
                                  checked={exploreSelectedCollectionIds.includes(c.id)}
                                  onChange={() => toggleExploreCollection(c.id)}
                                  aria-label={`Select ${c.id}`}
                                />
                                <span className="si-explore-collection-id" title={c.title}>
                                  {c.id}
                                </span>
                                <a
                                  className="si-explore-collection-link"
                                  href={href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Open collection metadata"
                                  onClick={e => e.stopPropagation()}
                                >
                                  <i className="fa-solid fa-list" aria-hidden />
                                </a>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                    <div className="si-explore-collections-summary">
                      <span className="si-explore-collections-summary-note">
                        {exploreSelectedCollectionIds.length} of {stacCatalogCollections.length} selected
                      </span>
                      <i className="fa-solid fa-border-all si-explore-collections-summary-grid" aria-hidden title="Selection summary" />
                    </div>
                  </div>

                  <div className="si-explore-accordions">
                    <div className="si-explore-acc">
                      <button type="button" className="si-explore-acc-btn" onClick={() => toggleExploreAccordionKey('description')}>
                        <span className="si-explore-acc-chev" aria-hidden>
                          <i className={`fa-solid ${openExploreAccordions.description ? 'fa-chevron-down' : 'fa-chevron-right'}`} />
                        </span>
                        Description
                      </button>
                      {openExploreAccordions.description ? (
                        <div className="si-explore-acc-panel">
                          <label className="si-explore-field si-explore-field--flush">
                            <span>Filter keyword (id, title, description)</span>
                            <textarea
                              className="si-explore-desc-textarea"
                              rows={4}
                              value={exploreDescriptionKeyword}
                              onChange={e => setExploreDescriptionKeyword(e.target.value)}
                              placeholder="e.g. Sentinel, Landsat, DEM"
                            />
                          </label>
                        </div>
                      ) : null}
                    </div>
                    <div className="si-explore-acc">
                      <button type="button" className="si-explore-acc-btn" onClick={() => toggleExploreAccordionKey('datetime')}>
                        <span className="si-explore-acc-chev" aria-hidden>
                          <i className={`fa-solid ${openExploreAccordions.datetime ? 'fa-chevron-down' : 'fa-chevron-right'}`} />
                        </span>
                        Date and Time
                      </button>
                      {openExploreAccordions.datetime ? (
                        <div className="si-explore-acc-panel">
                          <label className="si-explore-field si-explore-datetime-source">
                            <span>Time range source</span>
                            <select
                              className="si-explore-select"
                              value={exploreDateSourceMode}
                              onChange={e => {
                                const v = e.target.value as ExploreDateSourceMode;
                                if (v === 'manual') {
                                  setExploreDateStart(timeSeriesStart);
                                  setExploreDateEnd(timeSeriesEnd);
                                }
                                setExploreDateSourceMode(v);
                              }}
                              aria-label="Date and time source"
                            >
                              <option value="manual">As specified below</option>
                              <option value="environmental_parameter">{exploreSelectedCollectionsLabel}</option>
                              <option value="sentinel2_views">Sentinel-2 views</option>
                            </select>
                          </label>
                          {exploreDateSourceMode === 'manual' ? (
                            <p className="si-explore-datetime-linked-hint">
                              Dates are used only for Explore STAC search; adjust the Environmental Index timeline separately if
                              needed.
                            </p>
                          ) : exploreDateSourceMode === 'environmental_parameter' ? (
                            <p className="si-explore-datetime-linked-hint">
                              Search uses the <strong>Environmental Index</strong> time range (
                              {ENVIRONMENTAL_INDICES[selectedIndex].label}): you can edit the dates below or change{' '}
                              <strong>Time series</strong> in the Source panel.
                            </p>
                          ) : (
                            <p className="si-explore-datetime-linked-hint">
                              Same range as the Sentinel-2 / weekly workflow — edit the dates below or adjust{' '}
                              <strong>Time series</strong> in Source.
                            </p>
                          )}
                          <div className="si-explore-date-row">
                            <label className="si-explore-date-field">
                              <span>
                                <i className="fa-regular fa-calendar" aria-hidden /> Start date
                              </span>
                              <input
                                type="date"
                                value={exploreDateSourceMode === 'manual' ? exploreDateStart : timeSeriesStart}
                                onChange={e => {
                                  const v = e.target.value;
                                  if (exploreDateSourceMode === 'manual') {
                                    setExploreDateStart(v);
                                  } else {
                                    setTimeSeriesStart(v);
                                    setExploreDateStart(v);
                                  }
                                }}
                              />
                            </label>
                            <span className="si-explore-date-sep" aria-hidden>
                              —
                            </span>
                            <label className="si-explore-date-field">
                              <span>
                                <i className="fa-regular fa-calendar" aria-hidden /> End date
                              </span>
                              <input
                                type="date"
                                value={exploreDateSourceMode === 'manual' ? exploreDateEnd : timeSeriesEnd}
                                onChange={e => {
                                  const v = e.target.value;
                                  if (exploreDateSourceMode === 'manual') {
                                    setExploreDateEnd(v);
                                  } else {
                                    setTimeSeriesEnd(v);
                                    setExploreDateEnd(v);
                                  }
                                }}
                              />
                            </label>
                          </div>
                        </div>
                      ) : null}
                    </div>
                    <div className="si-explore-acc">
                      <button type="button" className="si-explore-acc-btn" onClick={() => toggleExploreAccordionKey('extent')}>
                        <span className="si-explore-acc-chev" aria-hidden>
                          <i className={`fa-solid ${openExploreAccordions.extent ? 'fa-chevron-down' : 'fa-chevron-right'}`} />
                        </span>
                        Extent
                      </button>
                      {openExploreAccordions.extent ? (
                        <div className="si-explore-acc-panel">
                          <label className="si-explore-field si-explore-field--tight">
                            <span>Spatial extent</span>
                            <div className="si-explore-extent-select-row">
                              <select
                                className="si-explore-select"
                                value={exploreExtentMode}
                                onChange={e => setExploreExtentMode(e.target.value as typeof exploreExtentMode)}
                                aria-label="Extent mode"
                              >
                                <option value="map">Current map view</option>
                                <option value="drawn" disabled={!drawnGeometry}>
                                  Drawn AOI{!drawnGeometry ? ' (none)' : ''}
                                </option>
                                <option value="layer" disabled={!pivots.length}>
                                  Uploaded fields / pivots{!pivots.length ? ' (none)' : ''}
                                </option>
                                <option value="default">Default demo extent</option>
                                <option value="manual">As specified below</option>
                              </select>
                              <button
                                type="button"
                                className="si-explore-extent-map-sync"
                                title="Copy current map extent into manual coordinates"
                                onClick={() => {
                                  const map = mapRef.current?.getMap?.() ?? mapRef.current;
                                  try {
                                    const b = map?.getBounds?.();
                                    if (!b) return;
                                    setExploreExtentMode('manual');
                                    setExploreManualBbox({
                                      north: b.getNorth().toFixed(5),
                                      south: b.getSouth().toFixed(5),
                                      east: b.getEast().toFixed(5),
                                      west: b.getWest().toFixed(5),
                                    });
                                  } catch {
                                    /* ignore */
                                  }
                                }}
                              >
                                <i className="fa-solid fa-map" aria-hidden />
                              </button>
                            </div>
                          </label>
                          {exploreExtentMode === 'manual' ? (
                            <div className="si-explore-bbox-diamond">
                              <div className="si-explore-bbox-diamond-label">Boundary (WGS84)</div>
                              <div className="si-explore-bbox-row si-explore-bbox-row--single">
                                <label>
                                  <span>Top (north)</span>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={exploreManualBbox.north}
                                    onChange={e => setExploreManualBbox(o => ({ ...o, north: e.target.value }))}
                                    placeholder="25.30"
                                  />
                                </label>
                              </div>
                              <div className="si-explore-bbox-row si-explore-bbox-row--pair">
                                <label>
                                  <span>Left (west)</span>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={exploreManualBbox.west}
                                    onChange={e => setExploreManualBbox(o => ({ ...o, west: e.target.value }))}
                                    placeholder="55.10"
                                  />
                                </label>
                                <label>
                                  <span>Right (east)</span>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={exploreManualBbox.east}
                                    onChange={e => setExploreManualBbox(o => ({ ...o, east: e.target.value }))}
                                    placeholder="55.35"
                                  />
                                </label>
                              </div>
                              <div className="si-explore-bbox-row si-explore-bbox-row--single">
                                <label>
                                  <span>Bottom (south)</span>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={exploreManualBbox.south}
                                    onChange={e => setExploreManualBbox(o => ({ ...o, south: e.target.value }))}
                                    placeholder="25.00"
                                  />
                                </label>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <div className="si-explore-acc">
                      <button type="button" className="si-explore-acc-btn" onClick={() => toggleExploreAccordionKey('ids')}>
                        <span className="si-explore-acc-chev" aria-hidden>
                          <i className={`fa-solid ${openExploreAccordions.ids ? 'fa-chevron-down' : 'fa-chevron-right'}`} />
                        </span>
                        ID(s)
                      </button>
                      {openExploreAccordions.ids ? (
                        <div className="si-explore-acc-panel">
                          <label className="si-explore-field">
                            <span>Item ids (comma, space, or newline)</span>
                            <textarea
                              value={exploreIdsText}
                              onChange={e => setExploreIdsText(e.target.value)}
                              rows={3}
                              placeholder="S2A_MSIL2A_..."
                            />
                          </label>
                        </div>
                      ) : null}
                    </div>
                    <div className="si-explore-acc">
                      <button type="button" className="si-explore-acc-btn" onClick={() => toggleExploreAccordionKey('attributes')}>
                        <span className="si-explore-acc-chev" aria-hidden>
                          <i className={`fa-solid ${openExploreAccordions.attributes ? 'fa-chevron-down' : 'fa-chevron-right'}`} />
                        </span>
                        Attributes
                      </button>
                      {openExploreAccordions.attributes ? (
                        <div className="si-explore-acc-panel">
                          <label className="si-explore-check">
                            <input
                              type="checkbox"
                              checked={exploreUseCloudFilter}
                              onChange={e => setExploreUseCloudFilter(e.target.checked)}
                            />
                            Apply eo:cloud_cover &lt; limit for Sentinel-2–style collections
                          </label>
                          <label className="si-explore-field">
                            <span>Max cloud cover (%)</span>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={exploreCloudCoverMax}
                              onChange={e => setExploreCloudCoverMax(Number(e.target.value))}
                            />
                          </label>
                        </div>
                      ) : null}
                    </div>
                    <div className="si-explore-acc">
                      <button type="button" className="si-explore-acc-btn" onClick={() => toggleExploreAccordionKey('limit')}>
                        <span className="si-explore-acc-chev" aria-hidden>
                          <i className={`fa-solid ${openExploreAccordions.limit ? 'fa-chevron-down' : 'fa-chevron-right'}`} />
                        </span>
                        Items per page
                      </button>
                      {openExploreAccordions.limit ? (
                        <div className="si-explore-acc-panel">
                          <label className="si-explore-field">
                            <span>API result limit (max 1000)</span>
                            <input
                              type="number"
                              min={1}
                              max={1000}
                              value={exploreLimit}
                              onChange={e => setExploreLimit(Number(e.target.value))}
                            />
                          </label>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </>
              ) : exploreTab === 'results' ? (
                <>
                  <div className="si-explore-results-toolbar si-explore-results-toolbar--rich">
                    <label className="si-explore-results-toolbar-check">
                      <input
                        type="checkbox"
                        disabled={!explorePageSelectionStats.keys.length}
                        checked={explorePageSelectionStats.allSelected}
                        ref={el => {
                          if (el) {
                            el.indeterminate =
                              explorePageSelectionStats.someSelected && !explorePageSelectionStats.allSelected;
                          }
                        }}
                        onChange={() => {
                          if (explorePageSelectionStats.allSelected) {
                            deselectAllExplorePageKeys(explorePageSelectionStats.keys);
                          } else {
                            selectAllExplorePageKeys(explorePageSelectionStats.keys);
                          }
                        }}
                        aria-label="Select all on this page"
                      />
                    </label>
                    <div className="si-explore-results-toolbar-icons" aria-hidden>
                      <i className="fa-solid fa-folder-plus" />
                      <i className="fa-solid fa-border-all" />
                    </div>
                    <span className="si-explore-results-count si-explore-results-count--inline">
                      {exploreSortedStacItems.length} items
                      {stacMosaicStaging.length > 0 ? (
                        <span className="si-explore-mosaic-chip" title="Scenes staged for mosaic">
                          {' '}
                          · mosaic {stacMosaicStaging.length}
                        </span>
                      ) : null}
                    </span>
                    <div className="si-explore-results-toolbar-spacer" />
                    <button
                      type="button"
                      className="si-explore-icon-btn"
                      title={exploreResultsSortDesc ? 'Newest first' : 'Oldest first'}
                      onClick={() => {
                        setExploreResultsSortDesc(d => !d);
                        setExploreResultsPage(0);
                      }}
                    >
                      <i className="fa-solid fa-arrow-down-wide-short" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="si-explore-icon-btn"
                      title="Refresh"
                      onClick={runExploreStacViewResults}
                      disabled={isLoadingStac || !exploreSelectedCollectionIds.length}
                    >
                      <i className={`fa-solid fa-rotate${isLoadingStac ? ' fa-spin' : ''}`} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="si-explore-icon-btn"
                      title="Zoom to all footprints"
                      onClick={zoomMapToStacFootprints}
                      disabled={!stacFootprintsGeoJson.features.length}
                    >
                      <i className="fa-solid fa-expand" aria-hidden />
                    </button>
                  </div>
                  <label className="si-explore-check-inline si-explore-footprints-toggle">
                    <input
                      type="checkbox"
                      checked={showStacFootprintsOnMap}
                      onChange={e => setShowStacFootprintsOnMap(e.target.checked)}
                    />
                    Footprints on map
                  </label>
                  <div className="si-explore-results-cards-wrap">
                    {exploreSortedStacItems.length === 0 ? (
                      <p className="si-explore-muted">Run a search from the Parameters tab.</p>
                    ) : (
                      <ul className="si-explore-results-cards">
                        {explorePaginatedStacItems.map((item: any) => {
                          const key = stacItemStableKey(item);
                          const thumbUrls = getStacItemThumbCandidateUrls(item, stacConnection);
                          const idFull = String(item.id ?? '');
                          const cloudRaw = item.properties?.['eo:cloud_cover'];
                          const cloudStr =
                            cloudRaw == null || cloudRaw === ''
                              ? '—'
                              : `${typeof cloudRaw === 'number' ? cloudRaw.toFixed(2) : cloudRaw}%`;
                          const dt = String(item.properties?.datetime ?? '—');
                          const sensor = getStacItemSensorLabel(item);
                          return (
                            <li key={key} className="si-explore-result-card">
                              <input
                                type="checkbox"
                                className="si-explore-result-card-check"
                                checked={exploreSelectedResultKeys.includes(key)}
                                onChange={() => toggleExploreResultKey(key)}
                                aria-label={`Select ${idFull}`}
                              />
                              <div className="si-explore-result-main">
                                <div className="si-explore-result-id" title={idFull}>
                                  {idFull.length > 52 ? `${idFull.slice(0, 52)}…` : idFull}
                                </div>
                                <div className="si-explore-result-meta">
                                  <span title={dt}>{dt.length > 24 ? `${dt.slice(0, 24)}…` : dt}</span>
                                  <span>{sensor}</span>
                                  <span>{cloudStr}</span>
                                  <span className="si-explore-result-collection">{String(item.collection ?? '')}</span>
                                </div>
                                <div className="si-explore-result-actions">
                                  <button
                                    type="button"
                                    className="si-explore-result-action-btn"
                                    title="Zoom to footprint"
                                    onClick={() => flyToStacItemExtent(item)}
                                  >
                                    <i className="fa-solid fa-map-location-dot" aria-hidden />
                                  </button>
                                  <div className="si-explore-add-wrap">
                                    <button
                                      type="button"
                                      className="si-explore-add-trigger"
                                      title="Add to map / scene"
                                      aria-expanded={stacAddToMenuKey === key}
                                      aria-haspopup="menu"
                                      onClick={e => {
                                        e.stopPropagation();
                                        setStacAddToMenuKey(k => (k === key ? null : key));
                                      }}
                                    >
                                      <i className="fa-solid fa-folder-plus" aria-hidden />
                                      <i className="fa-solid fa-chevron-down si-explore-add-chev" aria-hidden />
                                    </button>
                                    {stacAddToMenuKey === key ? (
                                      <ul className="si-explore-add-menu" role="menu">
                                        <li role="none">
                                          <button
                                            type="button"
                                            role="menuitem"
                                            className="si-explore-add-menu-item"
                                            onClick={() => void addStacToCurrentMap(item)}
                                          >
                                            <i className="fa-solid fa-map" aria-hidden />
                                            Add to Current Map
                                          </button>
                                        </li>
                                        <li role="none">
                                          <button
                                            type="button"
                                            role="menuitem"
                                            className="si-explore-add-menu-item"
                                            onClick={() => addStacToNewMap(item)}
                                          >
                                            <i className="fa-solid fa-map" aria-hidden />
                                            Add to New Map
                                          </button>
                                        </li>
                                        <li role="none">
                                          <button
                                            type="button"
                                            role="menuitem"
                                            className="si-explore-add-menu-item"
                                            onClick={() => void addStacToGlobalScene(item)}
                                          >
                                            <i className="fa-solid fa-globe" aria-hidden />
                                            Add to New Global Scene
                                          </button>
                                        </li>
                                        <li role="none">
                                          <button
                                            type="button"
                                            role="menuitem"
                                            className="si-explore-add-menu-item"
                                            onClick={() => void addStacToLocalScene(item)}
                                          >
                                            <i className="fa-solid fa-mountain" aria-hidden />
                                            Add to New Local Scene
                                          </button>
                                        </li>
                                        <li role="none">
                                          <button
                                            type="button"
                                            role="menuitem"
                                            className="si-explore-add-menu-item"
                                            onClick={() => addStacToMosaicStaging(item)}
                                          >
                                            <i className="fa-solid fa-layer-group" aria-hidden />
                                            Add to Mosaic Dataset
                                          </button>
                                        </li>
                                      </ul>
                                    ) : null}
                                  </div>
                                  <button
                                    type="button"
                                    className="si-explore-result-action-btn"
                                    title="Open item JSON"
                                    onClick={() => openExploreStacItemDetails(item)}
                                  >
                                    <i className="fa-solid fa-file-code" aria-hidden />
                                  </button>
                                  <button
                                    type="button"
                                    className="si-explore-result-action-btn"
                                    title="Preview on map"
                                    onClick={() => showStacItemThumbOnMap(item)}
                                  >
                                    <i className="fa-regular fa-image" aria-hidden />
                                  </button>
                                </div>
                              </div>
                              <div className="si-explore-result-thumb">
                                <StacExploreThumb hrefList={thumbUrls} reactKey={key} />
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                  {exploreSortedStacItems.length > 0 ? (
                    <div className="si-explore-results-footer-bar">
                      <div className="si-explore-results-footer-stats">
                        <span>
                          Page {exploreResultsPage + 1} : {explorePageSelectionStats.selectedOnPage} of{' '}
                          {explorePageSelectionStats.keys.length} selected
                        </span>
                        <span className="si-explore-results-footer-sep" />
                        <span>Total selected items: {exploreSelectedResultKeys.length}</span>
                      </div>
                      <div className="si-explore-results-footer-actions">
                        <button
                          type="button"
                          className="si-explore-page-btn"
                          disabled={exploreResultsPage <= 0}
                          onClick={() => setExploreResultsPage(p => Math.max(0, p - 1))}
                        >
                          Previous
                        </button>
                        <button
                          type="button"
                          className="si-explore-page-btn"
                          disabled={exploreResultsPage >= exploreResultsPageCount - 1}
                          onClick={() => setExploreResultsPage(p => Math.min(exploreResultsPageCount - 1, p + 1))}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="si-explore-stac-source-tab">{exploreStacSourcePanelContent}</div>
              )}
            </div>
            <div className="si-explore-stac-footer">
              {exploreTab === 'parameters' ? (
                <button
                  type="button"
                  className="si-explore-view-results"
                  disabled={isLoadingStac || !exploreSelectedCollectionIds.length}
                  onClick={runExploreStacViewResults}
                >
                  {isLoadingStac ? <i className="fa-solid fa-spinner fa-spin" aria-hidden /> : null}
                  View Results
                </button>
              ) : (
                <button type="button" className="si-stac-modal-cancel" onClick={() => setExploreTab('parameters')}>
                  Back to Parameters
                </button>
              )}
            </div>
                      </div>
                    
                    ) : null}
                    {expandedEnvSection === 'remote-sensing' && (
                      <div className="si-env-section-card si-field-analysis">
                        <div className="si-field-analysis-header">
                          <h2 className="si-field-analysis-title">Remote Sensing</h2>
                          <button
                            type="button"
                            className="si-field-analysis-close"
                            onClick={() => setIsLayerDropdownOpen(false)}
                            aria-label="Close panel"
                          >
                            <i className="fa-solid fa-xmark" aria-hidden />
                          </button>
                        </div>

                        <div className="si-field-analysis-section">
                          <div className="si-field-analysis-kicker">Imagery date</div>
                          <label className="si-field-analysis-field">
                            <input
                              type="date"
                              value={selectedDate.toISOString().split('T')[0]}
                              onChange={e => {
                                const v = e.target.value;
                                if (!v) return;
                                applySelectedDate(new Date(`${v}T12:00:00`));
                              }}
                              aria-label="Imagery date"
                            />
                          </label>
                          <p className="si-field-analysis-hint">
                            Select date for satellite imagery (Sentinel-2 updates every 3–5 days).
                          </p>
                        </div>

                        <div className="si-field-analysis-section">
                          <label className="si-field-analysis-field si-field-analysis-field--labeled">
                            <span className="si-field-analysis-label">Layer</span>
                            <select
                              className="si-field-analysis-select"
                              value={isLoadingLayers ? '' : wmsLayerSelectValue}
                              onChange={e => {
                                const v = e.target.value;
                                setWmsLayer(v);
                                const ids = Object.keys(ENVIRONMENTAL_INDICES) as EnvironmentalIndexId[];
                                if (ids.includes(v as EnvironmentalIndexId)) setSelectedIndex(v as EnvironmentalIndexId);
                              }}
                              disabled={isLoadingLayers}
                              aria-label="Layer"
                            >
                              {isLoadingLayers ? (
                                <option value="">Loading Sentinel Hub layers…</option>
                              ) : wmsLayers.length === 0 ? (
                                <option value="">No layers — save Sentinel API tokens in System Settings, then reopen</option>
                              ) : (
                                wmsLayers.map(layer => (
                                  <option key={layer.name} value={layer.name}>
                                    {layer.title}
                                  </option>
                                ))
                              )}
                            </select>
                          </label>
                          <p className="si-field-analysis-hint" style={{ marginTop: 6 }}>
                            Layers are loaded only from your Sentinel Hub WMS GetCapabilities response for instance{' '}
                            <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '10px', opacity: 0.95 }}>
                              {getSentinelHubWmsInstanceId().slice(0, 8)}…
                            </span>{' '}
                            (System Settings → Sentinel API tokens). No synthetic index list is shown here.
                          </p>
                        </div>

                        <div className="si-field-analysis-section">
                          <div className="si-field-analysis-kicker">Time-series analysis</div>
                          <div className="si-field-analysis-date-row">
                            <label className="si-field-analysis-field">
                              <span className="si-field-analysis-label">Start</span>
                              <input
                                type="date"
                                value={timeSeriesStart}
                                onChange={e => setTimeSeriesStart(e.target.value)}
                                aria-label="Time series start"
                              />
                            </label>
                            <label className="si-field-analysis-field">
                              <span className="si-field-analysis-label">End</span>
                              <input
                                type="date"
                                value={timeSeriesEnd}
                                onChange={e => setTimeSeriesEnd(e.target.value)}
                                aria-label="Time series end"
                              />
                            </label>
                          </div>
                          <button type="button" className="si-field-analysis-timeline-btn" onClick={generateFieldAnalysisTimeline}>
                            <i className="fa-solid fa-chart-line" aria-hidden />
                            Generate timeline
                          </button>
                          <p className="si-field-analysis-hint">
                            Browse satellite imagery changes over time. Select a date range and generate the timeline.
                          </p>
                        </div>

                        <div className="si-field-analysis-section">
                          <div className="si-field-analysis-kicker">Display options</div>
                          <div className="si-field-analysis-toggles">
                            <div className="display-toggle-row">
                              <span className="display-option-label">
                                <span className="display-dot field" aria-hidden />
                                Field boundaries
                              </span>
                              <label className="switch si-field-analysis-switch">
                                <input
                                  type="checkbox"
                                  checked={showFieldBoundaries}
                                  onChange={e => setShowFieldBoundaries(e.target.checked)}
                                  aria-label="Toggle field boundaries"
                                />
                                <span className="slider round" />
                              </label>
                            </div>
                            <div className="display-toggle-row">
                              <span className="display-option-label">
                                <span className="display-dot productivity" aria-hidden />
                                Productivity zones
                              </span>
                              <label className="switch si-field-analysis-switch">
                                <input
                                  type="checkbox"
                                  checked={showProductivityZones}
                                  onChange={e => setShowProductivityZones(e.target.checked)}
                                  aria-label="Toggle productivity zones"
                                />
                                <span className="slider round" />
                              </label>
                            </div>
                          </div>
                        </div>

                        <p className="si-field-analysis-footer-hint">Click on a field to view details.</p>
                        {fieldAnalysisStatus ? <p className="si-field-analysis-status">{fieldAnalysisStatus}</p> : null}
                      </div>
                    )}
                    {expandedEnvSection === 'table-geo-ai' && (
                      <div className="si-geo-explorer-root si-geo-explorer-root--unified">
                        <div className="si-env-section-card si-geo-explorer">
                          <div className="si-geo-explorer-header">
                            <h2 className="si-geo-explorer-title">Geo AI</h2>
                            <button
                              type="button"
                              className="si-geo-explorer-icon-btn"
                              onClick={clearCurrentGeoAiPanel}
                              aria-label="Clear chat"
                              title="Clear chat"
                            >
                              <i className="fa-solid fa-trash" aria-hidden />
                            </button>
                          </div>
                          <div className="si-geo-ai-model-tabs" role="tablist" aria-label="AI model">
                            <button
                              type="button"
                              role="tab"
                              aria-selected={geoAiModelTab === 'claude'}
                              className={`si-geo-ai-model-tab${geoAiModelTab === 'claude' ? ' si-geo-ai-model-tab--active' : ''}`}
                              onClick={() => setGeoAiModelTab('claude')}
                            >
                              Claude
                            </button>
                            <button
                              type="button"
                              role="tab"
                              aria-selected={geoAiModelTab === 'deepseek'}
                              className={`si-geo-ai-model-tab${geoAiModelTab === 'deepseek' ? ' si-geo-ai-model-tab--active' : ''}`}
                              onClick={() => setGeoAiModelTab('deepseek')}
                            >
                              DeepSeek
                            </button>
                            <button
                              type="button"
                              role="tab"
                              aria-selected={geoAiModelTab === 'gemini'}
                              className={`si-geo-ai-model-tab${geoAiModelTab === 'gemini' ? ' si-geo-ai-model-tab--active' : ''}`}
                              onClick={() => setGeoAiModelTab('gemini')}
                            >
                              Gemini
                            </button>
                          </div>

                          {geoAiModelTab === 'gemini' ? (
                            <>
                              <div className="si-geo-explorer-messages">
                                <div className="si-geo-explorer-row si-geo-explorer-row--model">
                                  <div className="si-geo-explorer-avatar" aria-hidden>
                                    <i className="fa-solid fa-globe" />
                                  </div>
                                  <div className="si-geo-explorer-bubble">
                                    Hello! Im Agro Cloud - GeoAI - Describe a place, upload an image, or ask for directions.
                                    When a location is clear, the map will fly there
                                  </div>
                                </div>
                                {geoExplorerMessages.map(msg => {
                                  const raw = messageDisplayText(msg);
                                  const show = msg.role === 'model' ? stripGeoExplorerBubbleDisplayText(raw) : raw;
                                  const hasImage = msg.parts.some(p => p.type === 'image');
                                  return (
                                    <div
                                      key={msg.id}
                                      className={`si-geo-explorer-row si-geo-explorer-row--${msg.role}`}
                                    >
                                      {msg.role === 'model' ? (
                                        <div className="si-geo-explorer-avatar" aria-hidden>
                                          <i className="fa-solid fa-wand-magic-sparkles" />
                                        </div>
                                      ) : null}
                                      <div className="si-geo-explorer-bubble">
                                        {show ? <p className="si-geo-explorer-bubble-text">{show}</p> : null}
                                        {msg.role === 'user' && hasImage ? (
                                          <p className="si-geo-explorer-bubble-meta">
                                            <i className="fa-solid fa-paperclip" aria-hidden /> Image attached
                                          </p>
                                        ) : null}
                                      </div>
                                    </div>
                                  );
                                })}
                                {geoExplorerBusy ? (
                                  <div className="si-geo-explorer-row si-geo-explorer-row--model">
                                    <div className="si-geo-explorer-avatar" aria-hidden>
                                      <i className="fa-solid fa-wand-magic-sparkles" />
                                    </div>
                                    <div className="si-geo-explorer-bubble si-geo-explorer-bubble--typing">
                                      <i className="fa-solid fa-spinner fa-spin" aria-hidden /> Thinking…
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                              {geoExplorerChatError ? (
                                <p className="si-geo-explorer-error">{geoExplorerChatError}</p>
                              ) : null}
                              {geoExplorerPendingImage ? (
                                <p className="si-geo-explorer-pending-img">
                                  <i className="fa-solid fa-image" aria-hidden /> Image ready to send
                                  <button
                                    type="button"
                                    className="si-geo-explorer-linkish"
                                    onClick={() => setGeoExplorerPendingImage(null)}
                                  >
                                    Remove
                                  </button>
                                </p>
                              ) : null}
                              <div className="si-geo-explorer-input-row">
                                <textarea
                                  className="si-geo-explorer-input"
                                  rows={2}
                                  value={geoExplorerDraft}
                                  onChange={e => setGeoExplorerDraft(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                      e.preventDefault();
                                      sendGeoExplorerChat();
                                    }
                                  }}
                                  placeholder="Describe a place, ask for directions, or plan a trip…"
                                  aria-label="Geo AI Gemini message"
                                  disabled={geoExplorerBusy}
                                />
                                <input
                                  ref={geoExplorerFileInputRef}
                                  type="file"
                                  className="si-geo-explorer-file-input"
                                  accept="image/*"
                                  onChange={onGeoExplorerAttachChange}
                                  aria-hidden
                                  tabIndex={-1}
                                />
                                <button
                                  type="button"
                                  className="si-geo-explorer-attach"
                                  onClick={() => geoExplorerFileInputRef.current?.click()}
                                  disabled={geoExplorerBusy}
                                  aria-label="Attach image"
                                  title="Attach image"
                                >
                                  <i className="fa-solid fa-paperclip" aria-hidden />
                                </button>
                                <button
                                  type="button"
                                  className="si-geo-explorer-send"
                                  onClick={sendGeoExplorerChat}
                                  disabled={
                                    geoExplorerBusy || (!geoExplorerDraft.trim() && !geoExplorerPendingImage)
                                  }
                                  aria-label="Send"
                                  title="Send"
                                >
                                  <i className="fa-solid fa-paper-plane" aria-hidden />
                                </button>
                              </div>
                              <p className="si-geo-explorer-footnote">
                                Powered by Google Gemini. Set <code>VITE_GEMINI_API_KEY</code> or save under System Settings →
                                API Tokens → Gemini API. Do not commit keys.
                              </p>
                            </>
                          ) : null}

                          {geoAiModelTab === 'claude' || geoAiModelTab === 'deepseek' ? (
                            <>
                              <div className="si-geo-explorer-messages">
                                <div className="si-geo-explorer-row si-geo-explorer-row--model">
                                  <div className="si-geo-explorer-avatar" aria-hidden>
                                    <i className="fa-solid fa-database" />
                                  </div>
                                  <div className="si-geo-explorer-bubble">
                                    Ask about fields, layers, or tables using only data from GIS Map saved layers and the
                                    Develop Dashboard → Data snapshot in this browser. Answers stay grounded in that context.
                                  </div>
                                </div>
                                {(geoAiModelTab === 'claude' ? geoAiChatMessages : geoDeepseekChatMessages).map(msg => (
                                  <div
                                    key={msg.id}
                                    className={`si-geo-explorer-row si-geo-explorer-row--${
                                      msg.role === 'user' ? 'user' : 'model'
                                    }`}
                                  >
                                    {msg.role === 'assistant' ? (
                                      <div className="si-geo-explorer-avatar" aria-hidden>
                                        <i className="fa-solid fa-robot" />
                                      </div>
                                    ) : null}
                                    <div className="si-geo-explorer-bubble">
                                    <p className="si-geo-explorer-bubble-text">
                                      {msg.role === 'assistant'
                                        ? stripGeoExplorerBubbleDisplayText(msg.text)
                                        : msg.text}
                                    </p>
                                    </div>
                                  </div>
                                ))}
                                {(geoAiModelTab === 'claude' ? geoAiBusy : geoDeepseekBusy) ? (
                                  <div className="si-geo-explorer-row si-geo-explorer-row--model">
                                    <div className="si-geo-explorer-avatar" aria-hidden>
                                      <i className="fa-solid fa-robot" />
                                    </div>
                                    <div className="si-geo-explorer-bubble si-geo-explorer-bubble--typing">
                                      <i className="fa-solid fa-spinner fa-spin" aria-hidden /> Thinking…
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                              {geoAiModelTab === 'claude' && geoAiChatError ? (
                                <p className="si-geo-explorer-error">{geoAiChatError}</p>
                              ) : null}
                              {geoAiModelTab === 'deepseek' && geoDeepseekChatError ? (
                                <p className="si-geo-explorer-error">{geoDeepseekChatError}</p>
                              ) : null}
                              <div className="si-geo-explorer-input-row">
                                <textarea
                                  className="si-geo-explorer-input"
                                  rows={2}
                                  value={geoAiModelTab === 'claude' ? geoAiDraft : geoDeepseekDraft}
                                  onChange={e =>
                                    geoAiModelTab === 'claude'
                                      ? setGeoAiDraft(e.target.value)
                                      : setGeoDeepseekDraft(e.target.value)
                                  }
                                  onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                      e.preventDefault();
                                      if (geoAiModelTab === 'claude') sendGeoAiChat();
                                      else sendGeoDeepseekChat();
                                    }
                                  }}
                                  placeholder={
                                    geoAiModelTab === 'claude'
                                      ? 'e.g. List layer names and fields from the attached GIS / Develop data…'
                                      : 'e.g. Summarize saved layers and Develop Dashboard fields (same context as Claude)…'
                                  }
                                  aria-label={
                                    geoAiModelTab === 'claude' ? 'Geo AI Claude message' : 'Geo AI DeepSeek message'
                                  }
                                  disabled={geoAiModelTab === 'claude' ? geoAiBusy : geoDeepseekBusy}
                                />
                                <button
                                  type="button"
                                  className="si-geo-explorer-send"
                                  onClick={geoAiModelTab === 'claude' ? sendGeoAiChat : sendGeoDeepseekChat}
                                  disabled={
                                    (geoAiModelTab === 'claude' ? geoAiBusy : geoDeepseekBusy) ||
                                    !(geoAiModelTab === 'claude' ? geoAiDraft : geoDeepseekDraft).trim()
                                  }
                                  aria-label="Send"
                                  title="Send"
                                >
                                  <i className="fa-solid fa-paper-plane" aria-hidden />
                                </button>
                              </div>
                              <p className="si-geo-explorer-footnote">
                                {geoAiModelTab === 'claude' ? (
                                  <>
                                    Powered by Anthropic Claude. Set <code>VITE_CLAUDE_API_KEY</code> or System Settings → API
                                    Tokens → Claude API. Context is rebuilt each send from GIS Content + Develop Dashboard Data.
                                  </>
                                ) : (
                                  <>
                                    Powered by DeepSeek. Set <code>VITE_DEEPSEEK_API_KEY</code> or System Settings → API Tokens
                                    → DeepSeek. Same GIS + Develop context as Claude; rebuilt each send.
                                  </>
                                )}
                              </p>
                            </>
                          ) : null}
                        </div>
                      </div>
                    )}
                    {expandedEnvSection === 'source' && (
                      <div className="si-env-section-card">{exploreStacSourcePanelContent}</div>
                    )}
                    {expandedEnvSection === 'layers' && (
                      <div className="si-env-section-card">
                        <button type="button" className="si-add-layer-btn" onClick={openAddLayerModal} aria-label="Add layer" title="Add layer">
                          <i className="fa-solid fa-plus" aria-hidden />
                        </button>
                        <div className="si-env-added-layers">
                          <div className="si-env-chart-title">Added layers</div>
                          {addedLayerEntries.length ? (
                            <div className="si-env-added-layers-list">
                              {addedLayerEntries.map(layer => (
                                <div
                                  key={layer.id}
                                  className={`si-env-layer-item${layer.visible ? ' active' : ''}${!layer.toggleable ? ' static' : ''}`}
                                  onClick={layer.toggleable ? layer.onToggle : undefined}
                                  role={layer.toggleable ? 'button' : undefined}
                                  tabIndex={layer.toggleable ? 0 : -1}
                                  onKeyDown={layer.toggleable ? e => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      layer.onToggle();
                                    }
                                  } : undefined}
                                  title={layer.toggleable ? 'Click to toggle visibility' : layer.label}
                                >
                                  <div className="si-env-layer-top">
                                    <div className="si-env-layer-info">
                                      <span className="si-env-layer-name">{layer.label}</span>
                                      {'meta' in layer && layer.meta ? (
                                        <span className="si-env-layer-submeta">{layer.meta}</span>
                                      ) : null}
                                    </div>
                                    {layer.toggleable ? (
                                      <span className="si-env-layer-toggle" aria-hidden>
                                        <span className="si-env-layer-toggle-knob" />
                                      </span>
                                    ) : (
                                      <span className="si-env-layer-meta-static">always on</span>
                                    )}
                                  </div>
                                  {'actionable' in layer && layer.actionable && 'sourceLayerId' in layer && layer.sourceLayerId ? (
                                    <div className="si-env-layer-actions">
                                      <button
                                        type="button"
                                        className="si-env-layer-action-btn"
                                        title="Sync layer"
                                        aria-label={`Sync ${layer.label}`}
                                        onClick={e => handleLayerActionClick(e, 'sync', layer.sourceLayerId)}
                                      >
                                        <i className={syncingLayerId === layer.sourceLayerId ? 'fa-solid fa-rotate-right fa-spin' : 'fa-solid fa-rotate-right'} aria-hidden />
                                      </button>
                                      <button
                                        type="button"
                                        className="si-env-layer-action-btn"
                                        title="Open tables"
                                        aria-label={`Open tables for ${layer.label}`}
                                        onClick={e => handleLayerActionClick(e, 'table', layer.sourceLayerId)}
                                      >
                                        <i className="fa-solid fa-table-cells" aria-hidden />
                                      </button>
                                      <button
                                        type="button"
                                        className="si-env-layer-action-btn"
                                        title="Symbology"
                                        aria-label={`Symbology for ${layer.label}`}
                                        onClick={e => handleLayerActionClick(e, 'symbology', layer.sourceLayerId)}
                                      >
                                        <i className="fa-solid fa-sliders" aria-hidden />
                                      </button>
                                      <button
                                        type="button"
                                        className="si-env-layer-action-btn"
                                        title="Legend"
                                        aria-label={`Legend for ${layer.label}`}
                                        onClick={e => handleLayerActionClick(e, 'legend', layer.sourceLayerId)}
                                      >
                                        <i className="fa-solid fa-key" aria-hidden />
                                      </button>
                                      <button
                                        type="button"
                                        className="si-env-layer-action-btn si-env-layer-action-btn--danger"
                                        title="Remove layer"
                                        aria-label={`Remove ${layer.label} from map`}
                                        onClick={e => handleLayerActionClick(e, 'remove', layer.sourceLayerId)}
                                      >
                                        <i className="fa-solid fa-trash-can" aria-hidden />
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="si-env-message">No layers added yet.</p>
                          )}
                        </div>
                        <label className="si-stac-footprints-toggle">
                          <input
                            type="checkbox"
                            checked={showStacFootprintsOnMap}
                            onChange={e => setShowStacFootprintsOnMap(e.target.checked)}
                          />
                          <span>Show STAC scene footprints on the map</span>
                        </label>
                        {stacMapThumb ? (
                          <button type="button" className="si-stac-clear-thumb-btn" onClick={clearStacMapThumb}>
                            Remove image preview from map
                          </button>
                        ) : null}
                        {pivots.length > 0 ? (
                          <p className="si-env-message">
                            <strong>{pivots.length}</strong> field pivot feature{pivots.length === 1 ? '' : 's'} on map (same visibility as the vector layer in the list).
                          </p>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
            </div>
            </div>
      </div>
      {isAddLayerModalOpen ? (
        <div
          className="gis-modal-overlay si-add-layer-gis-overlay"
          role="presentation"
          onMouseDown={e => {
            if (e.target === e.currentTarget) closeAddLayerModal();
          }}
        >
          <div
            className="gis-modal gis-modal-compact"
            role="dialog"
            aria-modal="true"
            aria-labelledby="si-layer-modal-title"
            onMouseDown={e => e.stopPropagation()}
          >
            <div className="gis-modal-compact-hero">
              <h2 className="gis-modal-compact-hero-title" id="si-layer-modal-title">
                Add GIS Layer
              </h2>
              <p className="gis-modal-compact-hero-lead">
                Connect services, database sources, or upload local GIS files.
              </p>
              </div>

            <div className="gis-modal-compact-tabs" role="tablist" aria-label="Layer source type">
                    <button
                      type="button"
                role="tab"
                aria-selected={addLayerTab === 'arcgis'}
                aria-label="ArcGIS Feature Service"
                title="ArcGIS Feature Service"
                className={(addLayerTab === 'arcgis' ? 'gis-compact-tab active' : 'gis-compact-tab') + ' gis-compact-tab--icon'}
                onClick={() => setAddLayerTab('arcgis')}
              >
                <i className="fa-solid fa-cloud" aria-hidden />
                    </button>
            <button
              type="button"
                role="tab"
                aria-selected={addLayerTab === 'database'}
                aria-label="Database Connection"
                title="Database Connection"
                className={(addLayerTab === 'database' ? 'gis-compact-tab active' : 'gis-compact-tab') + ' gis-compact-tab--icon'}
                onClick={() => setAddLayerTab('database')}
              >
                <i className="fa-solid fa-database" aria-hidden />
            </button>
                    <button
                      type="button"
                role="tab"
                aria-selected={addLayerTab === 'upload'}
                aria-label="Upload File"
                title="Upload File"
                className={(addLayerTab === 'upload' ? 'gis-compact-tab active' : 'gis-compact-tab') + ' gis-compact-tab--icon'}
                onClick={() => setAddLayerTab('upload')}
              >
                <i className="fa-solid fa-file-arrow-up" aria-hidden />
                    </button>
              </div>

            <div className="gis-modal-body">
              {addLayerTab === 'arcgis' ? (
                <div key="arcgis" role="tabpanel" aria-label="ArcGIS Feature Service">
                  <input
                    type="url"
                    className="gis-input"
                    placeholder="Feature Service URL"
                    value={addLayerUrl}
                    onChange={e => setAddLayerUrl(e.target.value)}
                    autoComplete="off"
                  />
                  <input
                    type="text"
                    className="gis-input"
                    placeholder="Token / API Key (optional)"
                    value={addLayerToken}
                    onChange={e => setAddLayerToken(e.target.value)}
                    autoComplete="off"
                  />
                  <input
                    type="text"
                    className="gis-input"
                    placeholder="Layer Name (optional)"
                    value={addLayerName}
                    onChange={e => setAddLayerName(e.target.value)}
                    autoComplete="off"
                  />
                  <button type="button" className="gis-btn-outline" onClick={importArcgisFeatureLayer} disabled={isConnectingLayer}>
                    <i className="fa-solid fa-link" aria-hidden /> {isConnectingLayer ? 'Connecting...' : 'Connect & Discover Layers'}
                  </button>
                  {discoveredArcgisLayers.length > 0 ? (
                    <div className="gis-discover-panel" aria-label="Discovered layers">
                      <div className="gis-discover-meta">FOUND {discoveredArcgisLayers.length} LAYER/TABLE(S):</div>
                      <div className="gis-form-field">
                        <div className="gis-form-label">Select Layer</div>
                        <div className="gis-select-wrap">
                        <select
                            className="gis-input gis-select"
                          value={selectedDiscoveredArcgisUrl}
                          onChange={e => {
                            const next = e.target.value;
                            setSelectedDiscoveredArcgisUrl(next);
                            const found = discoveredArcgisLayers.find(l => l.url === next);
                            if (found && !addLayerName.trim()) setAddLayerName(found.name);
                          }}
                            aria-label="Select discovered layer"
                        >
                          {discoveredArcgisLayers.map(l => (
                            <option key={l.url} value={l.url}>
                              {l.kind === 'table' ? `${l.name} (Table)` : l.geometryType ? `${l.name} (${l.geometryType})` : l.name}
                            </option>
                          ))}
                        </select>
                          <i className="fa-solid fa-chevron-down" aria-hidden />
                      </div>
                      </div>
                      <div className="gis-discovered-row">
                        <span className="gis-discovered-name">
                          {discoveredArcgisLayers.find(l => l.url === selectedDiscoveredArcgisUrl)?.name || 'Selected layer'}
                        </span>
                        <button
                          type="button"
                          className="gis-discovered-add"
                          onClick={addSelectedDiscoveredArcgisLayer}
                          disabled={!selectedDiscoveredArcgisUrl || isAddingDiscoveredArcgisLayer}
                        >
                          {isAddingDiscoveredArcgisLayer ? 'Adding…' : 'Add'}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : addLayerTab === 'database' ? (
                <div key="database" role="tabpanel" aria-label="Database Connection">
                  <div className="si-layer-form-grid-2">
                    <label className="si-layer-field">
                      <span>Database Platform</span>
                      <select className="gis-input" value={dbPlatform} onChange={e => setDbPlatform(e.target.value as (typeof DATABASE_PLATFORM_OPTIONS)[number])}>
                        {DATABASE_PLATFORM_OPTIONS.map(platform => (
                          <option key={platform} value={platform}>{platform}</option>
                        ))}
                      </select>
                    </label>
                    <label className="si-layer-field">
                      <span>Instance / Host</span>
                      <input type="text" className="gis-input" placeholder="server\\instance or host:port" value={dbInstance} onChange={e => setDbInstance(e.target.value)} />
                    </label>
                  </div>
                  <label className="si-layer-field">
                    <span>Authentication Type</span>
                    <select className="gis-input" value={dbAuthType} onChange={e => setDbAuthType(e.target.value as 'database' | 'operating-system')}>
                      <option value="database">Database authentication</option>
                      <option value="operating-system">Operating system authentication</option>
                    </select>
                  </label>
                  {dbAuthType === 'database' ? (
                    <div className="si-layer-form-grid-2">
                      <label className="si-layer-field">
                        <span>User Name</span>
                        <input type="text" className="gis-input" placeholder="db_user" value={dbUsername} onChange={e => setDbUsername(e.target.value)} />
                      </label>
                      <label className="si-layer-field">
                        <span>Password</span>
                        <input type="password" className="gis-input" placeholder="••••••••" value={dbPassword} onChange={e => setDbPassword(e.target.value)} />
                      </label>
                    </div>
                  ) : null}
                  <label className="si-layer-inline-check">
                    <input type="checkbox" checked={dbSaveCredentials} onChange={e => setDbSaveCredentials(e.target.checked)} />
                    <span>Save User/Password</span>
                  </label>
                  <div className="si-layer-form-grid-2">
                    <label className="si-layer-field">
                      <span>Database</span>
                      <input type="text" className="gis-input" placeholder="optional" value={dbName} onChange={e => setDbName(e.target.value)} />
                    </label>
                    <label className="si-layer-field">
                      <span>Connection File Name</span>
                      <input type="text" className="gis-input" placeholder="optional" value={dbConnectionFileName} onChange={e => setDbConnectionFileName(e.target.value)} />
                    </label>
                  </div>
                  <details className="si-layer-advanced">
                    <summary>Additional Properties</summary>
                    <small>
                      This profile is prepared in-app for future backend connector support. Validate required fields and save.
                    </small>
                  </details>
                  <button type="button" className="gis-btn-primary-full" onClick={handleDatabaseConnection}>
                    <i className="fa-solid fa-plug" aria-hidden /> Validate & Save Connection
                  </button>
                </div>
              ) : (
                <div key="upload" role="tabpanel" aria-label="Upload file">
                  <div
                    className="gis-dropzone"
                    role="button"
                    tabIndex={0}
                    aria-label="Drop a file here or click to browse"
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleUploadCustomLayerClick();
                      }
                    }}
                    onClick={() => handleUploadCustomLayerClick()}
                  >
                    <div className="gis-dropzone-icon" aria-hidden>
                      <i className="fa-solid fa-upload" />
                    </div>
                    <div className="gis-dropzone-text">Drop a file here or click to browse</div>
                    <div className="gis-dropzone-subtext">Supports: GeoJSON, KML, KMZ, Shapefile (.zip)</div>
                  </div>
                  <input type="text" className="gis-input" placeholder="Layer Name (optional)" value={addLayerName} onChange={e => setAddLayerName(e.target.value)} />
                  <button type="button" className="gis-btn-primary-full" onClick={handleUploadCustomLayerClick}>
                    <i className="fa-solid fa-upload" aria-hidden /> Upload & Import
                  </button>
                </div>
              )}
              {addLayerStatus ? <p className="gis-modal-compact-status">{addLayerStatus}</p> : null}
            </div>
            <div className="gis-modal-footer">
              <button type="button" className="gis-link-btn" onClick={closeAddLayerModal}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {activeLayerActionDialog && activeDialogLayer ? (
        <div
          className="si-layer-action-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="si-layer-action-title"
          onMouseDown={e => {
            if (e.target === e.currentTarget) setActiveLayerActionDialog(null);
          }}
        >
          <div className="si-layer-action-modal" onMouseDown={e => e.stopPropagation()}>
            <div className="si-layer-action-modal-header">
              <h3 id="si-layer-action-title">
                {activeLayerActionDialog.mode === 'table'
                  ? `Table - ${activeDialogLayer.name}`
                  : activeLayerActionDialog.mode === 'symbology'
                    ? `Styles - ${activeDialogLayer.name}`
                    : `Legend - ${activeDialogLayer.name}`}
              </h3>
              <button type="button" className="si-layer-action-close" onClick={() => setActiveLayerActionDialog(null)} aria-label="Close layer dialog">
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <div className="si-layer-action-modal-body">
              {activeLayerActionDialog.mode === 'table' ? (
                activeLayerColumns.length ? (
                  <div className="si-layer-action-table-layout">
                    <aside className="si-layer-action-table-tools">
                      <button type="button" onClick={() => setTableShowSelectedOnly(false)}><i className="fa-solid fa-house" /> Home</button>
                      <button type="button" onClick={() => setTableSelectedRowIds([])}><i className="fa-solid fa-eraser" /> Clear selection</button>
                      <button type="button" onClick={() => setTableShowSelectedOnly(true)}><i className="fa-solid fa-filter" /> Show selected</button>
                      <button type="button" onClick={() => setTableShowSelectedOnly(false)}><i className="fa-solid fa-list" /> Show all</button>
                      <button type="button" onClick={() => setTableSearchText('')}><i className="fa-solid fa-rotate-right" /> Refresh</button>
                      <button type="button" onClick={exportTableAsCsv}><i className="fa-solid fa-file-csv" /> Export CSV</button>
                    </aside>
                    <div className="si-layer-action-table-main">
                      <div className="si-layer-action-table-filters">
                        <input
                          type="text"
                          className="gis-input"
                          placeholder="Search all fields..."
                          value={tableSearchText}
                          onChange={e => setTableSearchText(e.target.value)}
                        />
                        <select className="gis-input" value={tableFilterField} onChange={e => setTableFilterField(e.target.value)}>
                          <option value="">All fields</option>
                          {activeLayerColumns.map(col => (
                            <option key={col} value={col}>{col}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          className="gis-input"
                          placeholder="Filter value..."
                          value={tableFilterValue}
                          onChange={e => setTableFilterValue(e.target.value)}
                        />
                      </div>
                      <div className="si-layer-action-table-wrap">
                        <table className="si-layer-action-table">
                          <thead>
                            <tr>
                              <th />
                              {activeLayerColumns.map(col => (
                                <th key={col}>{col}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {tableRowsFiltered.map(({ row, rowId }) => (
                              <tr key={rowId}>
                                <td>
                                  <input
                                    type="checkbox"
                                    checked={tableSelectedRowIds.includes(rowId)}
                                    onChange={e => {
                                      setTableSelectedRowIds(prev =>
                                        e.target.checked ? [...prev, rowId] : prev.filter(id => id !== rowId),
                                      );
                                    }}
                                  />
                                </td>
                                {activeLayerColumns.map(col => (
                                  <td key={`${rowId}-${col}`}>{String(row[col] ?? '')}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="si-layer-action-empty">No attributes found for this layer.</p>
                )
              ) : activeLayerActionDialog.mode === 'symbology' ? (
                <div className="si-layer-action-form">
                  <div className="si-layer-action-symbology-header">
                    <strong>Choose an attribute and visualization style. Preview updates live on the map.</strong>
                    <label className="si-layer-action-switch">
                      <input
                        type="checkbox"
                        checked={symbologyDraft.useArcGisOnline}
                        disabled={activeDialogLayer.source !== 'arcgis'}
                        onChange={e => setSymbologyDraft(prev => ({ ...prev, useArcGisOnline: e.target.checked }))}
                      />
                      <span>Use ArcGIS Online symbology</span>
                    </label>
                  </div>
                  {symbologyDraft.useArcGisOnline ? (
                    <p className="si-layer-action-note">
                      ArcGIS renderer preview is enabled. Uncheck "Use ArcGIS Online symbology" to configure custom styles.
                    </p>
                  ) : (
                    <>
                      <div className="si-layer-action-symbology-grid">
                        <label className="si-layer-action-field">
                          <span>Style</span>
                          <select
                            className="gis-input"
                            value={symbologyDraft.style}
                            onChange={e => setSymbologyDraft(prev => ({ ...prev, style: e.target.value as LayerStyleMode }))}
                          >
                            <option value="single">Single symbol</option>
                            <option value="classified">Counts and Amounts (color)</option>
                          </select>
                        </label>
                        <label className="si-layer-action-field">
                          <span>Color ramp</span>
                          <select
                            className="gis-input"
                            value={symbologyDraft.colorRamp}
                            onChange={e => setSymbologyDraft(prev => ({ ...prev, colorRamp: e.target.value as LayerSymbologyDraft['colorRamp'] }))}
                          >
                            <option value="viridis">Viridis</option>
                            <option value="green">Green</option>
                            <option value="warm">Warm</option>
                          </select>
                        </label>
                        <label className="si-layer-action-field">
                          <span>Classes</span>
                          <select
                            className="gis-input"
                            value={symbologyDraft.classes}
                            onChange={e => setSymbologyDraft(prev => ({ ...prev, classes: Number(e.target.value) }))}
                          >
                            {[3, 4, 5, 6, 7].map(v => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </label>
                        <label className="si-layer-action-field">
                          <span>Method</span>
                          <select
                            className="gis-input"
                            value={symbologyDraft.method}
                            onChange={e => setSymbologyDraft(prev => ({ ...prev, method: e.target.value as LayerClassMethod }))}
                          >
                            <option value="natural-breaks">Natural breaks</option>
                            <option value="equal-interval">Equal interval</option>
                          </select>
                        </label>
                        <label className="si-layer-action-field">
                          <span>Base color</span>
                          <input
                            type="color"
                            value={symbologyDraft.color}
                            onChange={e => setSymbologyDraft(prev => ({ ...prev, color: e.target.value }))}
                          />
                        </label>
                      </div>
                      <div className="si-layer-action-ramp-preview">
                        {COLOR_RAMPS[symbologyDraft.colorRamp].slice(0, symbologyDraft.classes).map((color, i) => (
                          <div key={`${color}-${i}`} className="si-layer-action-ramp-row">
                            <span className="si-layer-action-legend-swatch" style={{ background: color }} />
                            <strong>Class {i + 1}</strong>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  <div className="si-layer-action-modal-footer">
                    <button type="button" className="si-layer-action-footer-btn" onClick={() => setActiveLayerActionDialog(null)}>Cancel</button>
                    <button
                      type="button"
                      className="si-layer-action-footer-btn primary"
                      onClick={() => void applySymbologyDraft()}
                    >
                      Save Style
                    </button>
                  </div>
                </div>
              ) : (
                <div className="si-layer-action-legend">
                  <div className="si-layer-action-legend-row">
                    <span className="si-layer-action-legend-swatch" style={{ background: activeDialogLayer.color || '#22c55e' }} />
                    <div>
                      <strong>{activeDialogLayer.name}</strong>
                      <small>{Array.isArray(activeDialogLayer.geojson?.features) ? `${activeDialogLayer.geojson.features.length} feature(s)` : 'No feature count'}</small>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
      {isStacModalOpen ? (
        <>
        <div
          className="si-stac-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="si-stac-modal-title"
          onMouseDown={e => {
            if (e.target === e.currentTarget) {
              if (isAcsPickerOpen) return;
              closeStacModal();
            }
          }}
        >
          <div className="si-stac-modal" onMouseDown={e => e.stopPropagation()}>
            <div className="si-stac-modal-header">
              <h2 id="si-stac-modal-title">Create STAC connection</h2>
              <button type="button" className="si-stac-modal-close" aria-label="Close" onClick={closeStacModal}>
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <div className="si-stac-modal-body">
              <label className="si-stac-field">
                <span>Connection name</span>
                <input
                  type="text"
                  value={stacModalDraft.connectionName}
                  onChange={e => setStacModalDraft(d => ({ ...d, connectionName: e.target.value }))}
                  placeholder="e.g. My Planetary Computer"
                  autoComplete="off"
                />
              </label>
              <label className="si-stac-field">
                <span>Connection</span>
                <select
                  value={stacModalDraft.presetId}
                  onChange={e =>
                    setStacModalDraft(d => ({
                      ...d,
                      presetId: e.target.value as StacPresetId,
                    }))
                  }
                >
                  <option value="planetary-computer">Microsoft Planetary Computer</option>
                  <option value="custom">Custom STAC API URL</option>
                </select>
              </label>
              {stacModalDraft.presetId === 'custom' ? (
                <label className="si-stac-field">
                  <span>Catalog or search URL</span>
                  <input
                    type="url"
                    value={stacModalDraft.customCatalogBaseUrl}
                    onChange={e => setStacModalDraft(d => ({ ...d, customCatalogBaseUrl: e.target.value }))}
                    placeholder="https://example.com/stac/v1"
                  />
                  <small className="si-stac-field-hint">Provide API root (…/v1) or a full …/search URL.</small>
                </label>
              ) : null}

              <details className="si-stac-details">
                <summary>STAC API Authentication (Optional)</summary>
                <div className="si-stac-details-inner">
                  <label className="si-stac-field">
                    <span>Method</span>
                    <select
                      value={stacModalDraft.authMode}
                      onChange={e =>
                        setStacModalDraft(d => ({
                          ...d,
                          authMode: e.target.value as StacAuthMode,
                        }))
                      }
                    >
                      <option value="none">No Authentication</option>
                      <option value="bearer">Bearer token</option>
                    </select>
                  </label>
                  {stacModalDraft.authMode === 'bearer' ? (
                    <label className="si-stac-field">
                      <span>Token</span>
                      <input
                        type="password"
                        autoComplete="off"
                        value={stacModalDraft.bearerToken}
                        onChange={e => setStacModalDraft(d => ({ ...d, bearerToken: e.target.value }))}
                        placeholder="Session only — not saved to disk"
                      />
                    </label>
                  ) : null}
                  <button type="button" className="si-stac-signin-placeholder" disabled title="Use a bearer token above when your catalog requires it">
                    Sign In
                  </button>
                </div>
              </details>

              <details className="si-stac-details">
                <summary>Custom Headers (Optional)</summary>
                <div className="si-stac-details-inner">
                  <div className="si-stac-kv-table">
                    <div className="si-stac-kv-head"><span>Name</span><span>Value</span><span className="si-stac-kv-actions-h" /></div>
                    {stacModalDraft.customHeaders.map(row => (
                      <div key={row.id} className="si-stac-kv-row">
                        <input
                          value={row.name}
                          onChange={e =>
                            setStacModalDraft(d => ({
                              ...d,
                              customHeaders: d.customHeaders.map(r => (r.id === row.id ? { ...r, name: e.target.value } : r)),
                            }))
                          }
                          placeholder="Header-Name"
                        />
                        <input
                          value={row.value}
                          onChange={e =>
                            setStacModalDraft(d => ({
                              ...d,
                              customHeaders: d.customHeaders.map(r => (r.id === row.id ? { ...r, value: e.target.value } : r)),
                            }))
                          }
                          placeholder="value"
                        />
                        <button
                          type="button"
                          className="si-stac-kv-remove"
                          aria-label="Remove row"
                          onClick={() =>
                            setStacModalDraft(d => ({
                              ...d,
                              customHeaders: d.customHeaders.filter(r => r.id !== row.id),
                            }))
                          }
                        >
                          <i className="fa-solid fa-xmark" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="si-stac-add-row"
                    onClick={() => setStacModalDraft(d => ({ ...d, customHeaders: [...d.customHeaders, newStacKvRow()] }))}
                  >
                    <i className="fa-solid fa-plus" /> Add header
                  </button>
                </div>
              </details>

              <details className="si-stac-details">
                <summary>Custom Parameters (Optional)</summary>
                <div className="si-stac-details-inner">
                  <div className="si-stac-kv-table">
                    <div className="si-stac-kv-head"><span>Name</span><span>Value</span><span className="si-stac-kv-actions-h" /></div>
                    {stacModalDraft.customParams.map(row => (
                      <div key={row.id} className="si-stac-kv-row">
                        <input
                          value={row.name}
                          onChange={e =>
                            setStacModalDraft(d => ({
                              ...d,
                              customParams: d.customParams.map(r => (r.id === row.id ? { ...r, name: e.target.value } : r)),
                            }))
                          }
                        />
                        <input
                          value={row.value}
                          onChange={e =>
                            setStacModalDraft(d => ({
                              ...d,
                              customParams: d.customParams.map(r => (r.id === row.id ? { ...r, value: e.target.value } : r)),
                            }))
                          }
                        />
                        <button
                          type="button"
                          className="si-stac-kv-remove"
                          aria-label="Remove"
                          onClick={() =>
                            setStacModalDraft(d => ({
                              ...d,
                              customParams: d.customParams.filter(r => r.id !== row.id),
                            }))
                          }
                        >
                          <i className="fa-solid fa-xmark" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="si-stac-add-row"
                    onClick={() => setStacModalDraft(d => ({ ...d, customParams: [...d.customParams, newStacKvRow()] }))}
                  >
                    <i className="fa-solid fa-plus" /> Add parameter
                  </button>
                  <small className="si-stac-field-hint">Sent as query string on the STAC search request.</small>
                </div>
              </details>

              <div className="si-stac-details si-stac-cloud-block">
                <button
                  type="button"
                  className="si-stac-cloud-summary-btn"
                  onClick={openAcsPicker}
                  aria-expanded={isAcsPickerOpen}
                >
                  <span className="si-stac-cloud-summary-chevron" aria-hidden>▸</span>
                  <span className="si-stac-cloud-summary-label">Cloud Storage Connections (Optional)</span>
                  <span
                    className="si-stac-info-icon"
                    title="ملفات .acs من https://github.com/Esri/arcgis-for-mpc — للمرجعية؛ ArcGIS Pro يستهلكها محلياً"
                    onPointerDown={e => e.stopPropagation()}
                  >
                    <i className="fa-solid fa-circle-info" aria-hidden />
                  </span>
                </button>
                <div className="si-stac-details-inner si-stac-cloud-summary-body">
                  {stacModalDraft.cloudStorageEntries.length === 0 ? (
                    <p className="si-stac-cloud-hint">
                      انقر <strong>Cloud Storage Connections</strong> لفتح نافذة اختيار الملفات أو المسارات.
                    </p>
                  ) : (
                    <ul className="si-stac-cloud-list si-stac-cloud-list--compact">
                      {stacModalDraft.cloudStorageEntries.map((entry, idx) => (
                        <li key={`${idx}-${entry.slice(0, 48)}`}>
                          <span>{entry}</span>
                          <button
                            type="button"
                            className="si-stac-cloud-remove"
                            aria-label="Remove"
                            onClick={() =>
                              setStacModalDraft(d => ({
                                ...d,
                                cloudStorageEntries: d.cloudStorageEntries.filter((_, i) => i !== idx),
                              }))
                            }
                          >
                            <i className="fa-solid fa-xmark" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
            <div className="si-stac-modal-footer">
              <a className="si-stac-modal-help" href={STAC_HELP_LINKS.docs} target="_blank" rel="noopener noreferrer">
                Learn more about STAC
              </a>
              <div className="si-stac-modal-actions">
                <button type="button" className="si-stac-modal-cancel" onClick={closeStacModal}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="si-stac-modal-ok"
                  disabled={stacModalOkDisabled}
                  onClick={applyStacConnectionModal}
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
        {isAcsPickerOpen && (
          <div
            className="si-acs-picker-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="si-acs-picker-title"
            onMouseDown={e => {
              if (e.target === e.currentTarget) cancelAcsPicker();
            }}
          >
            <div className="si-acs-picker" onMouseDown={e => e.stopPropagation()}>
              <input
                ref={acsFileInputRef}
                type="file"
                className="si-acs-file-input-hidden"
                accept=".acs,.ACS,application/octet-stream"
                multiple
                onChange={onAcsFilesPicked}
              />
              <div className="si-acs-picker-header">
                <div>
                  <h2 id="si-acs-picker-title">Add Cloud Storage Connection File</h2>
                  <p className="si-acs-picker-subtitle">إضافة ملفات (.acs) أو مسارات — المتصفح يعرض أسماء الملفات المختارة؛ الصيغة الكاملة تُلصَق يدوياً</p>
                </div>
                <button type="button" className="si-stac-modal-close" aria-label="Close" onClick={cancelAcsPicker}>
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>
              <div className="si-acs-picker-breadcrumb-row">
                <span className="si-acs-breadcrumb" title="مثال هيكل مجلدات MPC">
                  Downloads <span className="si-acs-bc-sep">›</span> arcgis-for-mpc-main <span className="si-acs-bc-sep">›</span> AMPC_Resources <span className="si-acs-bc-sep">›</span> ACS_Files
                </span>
                <input
                  type="search"
                  className="si-acs-search"
                  placeholder="Search ACS_Files"
                  value={acsPickerFilter}
                  onChange={e => setAcsPickerFilter(e.target.value)}
                  aria-label="Filter file list"
                />
              </div>
              <div className="si-acs-picker-main">
                <div className="si-acs-file-list-head">
                  <span>Name</span>
                  <span>Type</span>
                </div>
                <ul className="si-acs-file-list">
                  {acsPickerStaging.length === 0 ? (
                    <li className="si-acs-file-list-empty">No files selected — use Browse to choose .acs files</li>
                  ) : (
                    acsPickerStaging
                      .filter(
                        n =>
                          !acsPickerFilter.trim() ||
                          n.toLowerCase().includes(acsPickerFilter.toLowerCase().trim()),
                      )
                      .map(name => (
                        <li key={name}>
                          <span className="si-acs-col-name">{name}</span>
                          <span className="si-acs-col-type">ArcGIS Cloud Storage Connection</span>
                          <button
                            type="button"
                            className="si-acs-row-remove"
                            aria-label={`Remove ${name}`}
                            onClick={() =>
                              setAcsPickerStaging(s => {
                                const i = s.indexOf(name);
                                return i === -1 ? s : [...s.slice(0, i), ...s.slice(i + 1)];
                              })
                            }
                          >
                            <i className="fa-solid fa-xmark" />
                          </button>
                        </li>
                      ))
                  )}
                </ul>
              </div>
              <div className="si-acs-picker-bottom">
                <label className="si-acs-manual-path">
                  <span>Name / full path (one per line)</span>
                  <textarea
                    value={acsPickerManualPath}
                    onChange={e => setAcsPickerManualPath(e.target.value)}
                    rows={3}
                    placeholder="C:\Users\…\esrims_pc_sentinel-2-l2a.acs"
                  />
                </label>
                <div className="si-acs-picker-bottom-bar">
                  <label className="si-acs-filter-dd">
                    <span className="si-sr-only">File type</span>
                    <select disabled aria-hidden className="si-acs-filter-select">
                      <option>Cloud Storage Connections</option>
                    </select>
                  </label>
                  <button type="button" className="si-acs-browse-btn" onClick={() => acsFileInputRef.current?.click()}>
                    <i className="fa-solid fa-folder-open" aria-hidden /> Browse…
                  </button>
                  <div className="si-acs-picker-okcancel">
                    <button type="button" className="si-stac-modal-cancel" onClick={cancelAcsPicker}>
                      Cancel
                    </button>
                    <button type="button" className="si-stac-modal-ok" onClick={confirmAcsPicker}>
                      OK
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        </>
      ) : null}
    </div>
  );
}
