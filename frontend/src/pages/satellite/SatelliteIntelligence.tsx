import React, { useState, useMemo, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import MapGL, { Source, Layer, NavigationControl, Marker } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import './SatelliteIntelligence.css';
import '../dashboards/develop-dashboard.css';
import { parseFile, parseRemoteUrlAsFile } from '../../utils/FileLoader';
import type { CircleCardinal, DrawStyleConfig, VertexRef } from './drawingUtils';
import {
  bboxToPolygonFeature,
  circleFromEdgeFeature,
  circleRefineCardinalLngLat,
  circleRefineCosLat,
  circleRefineRDeg,
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
  projectPointerToCircleCardinalEdge,
  saveDrawWorkspace,
  setVertexCoord,
  snapLngLatToBearingStep,
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
import { getSentinelHubWmsBaseUrl, subscribeSentinelHubWmsInstance } from '../../lib/sentinelHubWmsInstance';
import { buildSentinelHubWmsAoiClip, getDrawnGeometry } from '../../lib/sentinelHubWmsAoiClip';
import {
  GEO_AI_COPILOT_RULES,
  lastMapQueryCoordsFromMessages,
  lastMapQueryCoordsFromSimpleChatHistory,
  replaceUserMessageText,
  stripGeoExplorerBubbleDisplayText,
  type GeoExplorerMapLink,
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
import { appConfirm } from '../../lib/appDialog';
import { loadGisMapSavedLayers } from '../../lib/gisMapLayerStore';
import { satelliteCustomLayersToGeoAiLayers } from '../../lib/geoAiMapLayerSources';
import { geoExplorerTargetZoomForPinSource, runGeoExplorerGeminiTurn } from '../../lib/runGeoExplorerGeminiTurn';
import {
  buildGeoAiLayerPopupAttributeRows,
  pickGeoAiHumanPlaceFields,
  type GeoAiMapLayer,
} from '../../lib/geoExplorerLayerContext';
import { lngLatFromGeoAiFeatureLink, resolveGeoAiFeatureFromLink } from '../../lib/geoAiResolveTableMapLink';
import { runGeoAiStatsCommand, type GeoAiMapFirstSelection } from '../../lib/geoAiStatsEngine';
import { resolveGeoAiPinFromUserTextAndReply } from '../../lib/geoAiResolveMapCoords';
import { buildGeoAiFullWeatherSessionAppend } from '../../lib/geoAiWeatherContext';
import {
  siBrowserReportsMicrosoftEdge,
  siMapErrorSuggestsGlobeOrWebglFailure,
} from '../../lib/siMapboxGlobeCompat';
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
  fetchArcgisLayerPjson,
  pickRendererPrimaryField,
  sanitizeArcgisDrawingInfoForClient,
  slimArcgisLayerDefinitionForStorage,
} from '../../lib/arcgisDrawingInfoMapbox';
import {
  arcLegendLabelForFieldValue,
  buildArcFieldsByLower,
  getArcDisplayValue,
  type ArcgisLayerDefLite,
} from '../../lib/arcgisAttributeDisplay';
import type { SymbologyClassMethod, SymbologyColorRamp, SymbologyConfig, SymbologyStyle } from './components/LayerManager';
import {
  buildSymbologyContext,
  clampInt,
  darkenColor,
  describeArcGisRendererVisualization,
  getGeoJsonFields,
  getLayerGeometryKind,
  getNumericFields,
  inferVisualizationFromArcgisRenderer,
  normalizeSymbologyForLayer,
  type SymbologyContext,
} from './symbologyHelpers';
import { FieldVisibilityControl } from './components/FieldVisibilityControl';
import { GeoAiEditQuestionTool } from './components/GeoAiEditQuestionTool';
import { GeoExplorerGeminiInputRow } from './components/GeoExplorerGeminiInputRow';
import { GeoExplorerGeminiMessageParts } from './components/GeoExplorerGeminiMessageParts';
import type { AoiStaticMultiLayerLineChartDataset } from './components/AoiStaticMultiLayerLineChart';
import { SatelliteMapAnalysisChrome, SatelliteMapAnalysisToolbar } from './components/SatelliteMapAnalysisChrome';
import {
  buildStaticAoiMultiChartDatasets,
  defaultStaticAoiComparisonLayers,
  sortStaticAoiChartLayerIds,
  type StaticAoiChartLayerId,
} from './utils/staticAoiMultiChartData';
import {
  getAnalysisEngineBaseUrl,
  mpcProcess,
  type MpcProcessResult,
  type MpcTemplateId,
} from '../../lib/mpcPlanetaryApi';

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
const GEO_AI_CHAT_PAGE_SIZE = 40;

/** In-map Processing Options toolbar (Mapbox-style ctrl group). */
const SI_PROC_MAP_SECTIONS = [
  { id: 'layers' as const, label: 'Layers', icon: 'fa-solid fa-layer-group' },
  { id: 'explore-stac' as const, label: 'Explore STAC', icon: 'fa-solid fa-magnifying-glass-chart' },
  { id: 'remote-sensing' as const, label: 'Remote sensing', icon: 'fa-solid fa-satellite-dish' },
  { id: 'ai-detection-gis' as const, label: 'AI Detection in GIS', icon: 'fa-solid fa-magnifying-glass-location' },
  { id: 'table-geo-ai' as const, label: 'Geo AI', icon: 'fa-solid fa-comments' },
] as const;

type GeoAiInspectCardState = {
  title: string;
  rows: { label: string; value: string }[];
  lng: number;
  lat: number;
  areaName?: string;
  country?: string;
};

type NetfloraDetectionMode = 'aoi_first' | 'full_then_clip';
type NetfloraAoiSource = 'drawn' | 'view';
type NetfloraDetectionStats = {
  total: number;
  avgConfidence: number;
  byClass: Array<{ label: string; count: number; avgConfidence: number }>;
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
const NETFLORA_DETECTIONS_LAYER_ID = 'ai-detection-netflora-results';

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

function buildPcProcessingPreviewPngUrl(
  collection: string,
  itemId: string,
  spec: {
    assets: string[];
    expression?: string;
    rescale?: string;
    colormapName?: string;
    assetBidx?: string;
  },
  size = 2048,
  bbox?: [number, number, number, number] | null,
  widthOverride?: number,
  heightOverride?: number,
): string {
  const u = new URL('https://planetarycomputer.microsoft.com/api/data/v1/item/preview.png');
  u.searchParams.set('collection', collection);
  u.searchParams.set('item', itemId);
  u.searchParams.set('format', 'png');
  u.searchParams.set('nodata', '0');
  const resolvedWidth = Number.isFinite(widthOverride as number)
    ? Number(widthOverride)
    : Math.max(256, Math.min(4096, Math.floor(size)));
  const resolvedHeight = Number.isFinite(heightOverride as number)
    ? Number(heightOverride)
    : Math.max(256, Math.min(4096, Math.floor(size)));
  u.searchParams.set('width', String(Math.max(256, Math.min(4096, Math.floor(resolvedWidth)))));
  u.searchParams.set('height', String(Math.max(256, Math.min(4096, Math.floor(resolvedHeight)))));
  u.searchParams.set('assets', spec.assets.join(','));
  if (bbox && bbox.length >= 4 && bbox.every(v => Number.isFinite(v))) {
    u.searchParams.set('bbox', bbox.join(','));
  }
  if (spec.assetBidx) u.searchParams.set('asset_bidx', spec.assetBidx);
  if (spec.expression) u.searchParams.set('expression', spec.expression);
  if (spec.rescale) u.searchParams.set('rescale', spec.rescale);
  if (spec.colormapName) u.searchParams.set('colormap_name', spec.colormapName);
  return u.toString();
}

function findStacAssetNameCaseInsensitive(item: any, candidates: string[]): string | null {
  const assets = item?.assets && typeof item.assets === 'object' ? (item.assets as Record<string, unknown>) : null;
  if (!assets) return null;
  for (const candidate of candidates) {
    if (typeof assets[candidate] === 'object') return candidate;
  }
  const entries = Object.keys(assets);
  for (const candidate of candidates) {
    const lower = candidate.toLowerCase();
    const hit = entries.find(k => k.toLowerCase() === lower);
    if (hit) return hit;
  }
  return null;
}

function buildProcessingPreviewSpecsForItem(
  templateId: MpcTemplateId,
  item: any,
  indexOverride?: string,
): Array<{
  assets: string[];
  expression?: string;
  rescale?: string;
  colormapName?: string;
  assetBidx?: string;
}> {
  const aliases = {
    red: ['B04', 'red', 'SR_B4', 'b4', 'rededge'],
    blue: ['B02', 'blue', 'SR_B2', 'b2'],
    green: ['B03', 'green', 'SR_B3', 'b3'],
    nir: ['B08', 'nir08', 'nir', 'SR_B5', 'b8', 'b8a', 'B8A', 'B8'],
    rededge: ['B05', 'rededge', 'RE1', 'b5', 'SR_B5'],
    swir11: ['B11', 'swir16', 'swir1', 'SR_B6', 'b11', 'b6'],
    swir12: ['B12', 'swir22', 'swir2', 'SR_B7', 'b12', 'b7'],
  } as const;

  const pick = (keys: readonly string[]) => findStacAssetNameCaseInsensitive(item, [...keys]);
  const red = pick(aliases.red);
  const blue = pick(aliases.blue);
  const green = pick(aliases.green);
  const nir = pick(aliases.nir);
  const rededge = pick(aliases.rededge);
  const swir11 = pick(aliases.swir11);
  const swir12 = pick(aliases.swir12);

  if (indexOverride) {
    const id = String(indexOverride).toUpperCase();
    const NIR = nir ?? 'B08';
    const RED = red ?? 'B04';
    const GREEN = green ?? 'B03';
    const BLUE = blue ?? 'B02';
    const SWIR1 = swir11 ?? 'B11';
    const SWIR2 = swir12 ?? 'B12';
    const RE = rededge ?? 'B05';
    if (id === 'NDVI') return [{ assets: [NIR, RED], expression: `(${NIR}-${RED})/(${NIR}+${RED}+1e-6)`, rescale: '-1,1', colormapName: 'rdylgn' }];
    if (id === 'NDWI') return [{ assets: [GREEN, NIR], expression: `(${GREEN}-${NIR})/(${GREEN}+${NIR}+1e-6)`, rescale: '-1,1', colormapName: 'rdbu' }];
    if (id === 'NDMI') return [{ assets: [NIR, SWIR1], expression: `(${NIR}-${SWIR1})/(${NIR}+${SWIR1}+1e-6)`, rescale: '-1,1', colormapName: 'rdylgn' }];
    if (id === 'SAVI') return [{ assets: [NIR, RED], expression: `1.5*(${NIR}-${RED})/(${NIR}+${RED}+0.5)`, rescale: '-1,1', colormapName: 'rdylgn' }];
    if (id === 'EVI') return [{ assets: [NIR, RED, BLUE], expression: `2.5*(${NIR}-${RED})/(${NIR}+6*${RED}-7.5*${BLUE}+1)`, rescale: '-1,1', colormapName: 'rdylgn' }];
    if (id === 'GNDVI') return [{ assets: [NIR, GREEN], expression: `(${NIR}-${GREEN})/(${NIR}+${GREEN}+1e-6)`, rescale: '-1,1', colormapName: 'rdylgn' }];
    if (id === 'NBR') return [{ assets: [NIR, SWIR2], expression: `(${NIR}-${SWIR2})/(${NIR}+${SWIR2}+1e-6)`, rescale: '-1,1', colormapName: 'rdylgn' }];
    if (id === 'NDRE') return [{ assets: [NIR, RE], expression: `(${NIR}-${RE})/(${NIR}+${RE}+1e-6)`, rescale: '-1,1', colormapName: 'rdylgn' }];
    if (id === 'BSI') return [{ assets: [SWIR1, RED, NIR, BLUE], expression: `((${SWIR1}+${RED})-(${NIR}+${BLUE}))/((${SWIR1}+${RED})+(${NIR}+${BLUE})+1e-6)`, rescale: '-1,1', colormapName: 'rdbu' }];
    if (id === 'MNDWI') return [{ assets: [GREEN, SWIR1], expression: `(${GREEN}-${SWIR1})/(${GREEN}+${SWIR1}+1e-6)`, rescale: '-1,1', colormapName: 'rdbu' }];
  }

  if (templateId === 'ndvi_s2' || templateId === 'ndvi_landsat') {
    const preferredNir = nir ?? (templateId === 'ndvi_landsat' ? 'nir08' : 'B08');
    const preferredRed = red ?? (templateId === 'ndvi_landsat' ? 'red' : 'B04');
    return [
      {
        assets: [preferredNir, preferredRed],
        expression: `(${preferredNir}-${preferredRed})/(${preferredNir}+${preferredRed}+1e-6)`,
        rescale: '-1,1',
        colormapName: 'rdylgn',
      },
      {
        assets: templateId === 'ndvi_landsat' ? ['nir08', 'red'] : ['B08', 'B04'],
        expression: templateId === 'ndvi_landsat' ? '(nir08-red)/(nir08+red+1e-6)' : '(B08-B04)/(B08+B04+1e-6)',
        rescale: '-1,1',
        colormapName: 'rdylgn',
      },
    ];
  }

  if (templateId === 'ndmi_s2') {
    const preferredNir = nir ?? 'B08';
    const preferredSwir = swir11 ?? 'B11';
    return [
      {
        assets: [preferredNir, preferredSwir],
        expression: `(${preferredNir}-${preferredSwir})/(${preferredNir}+${preferredSwir}+1e-6)`,
        rescale: '-1,1',
        colormapName: 'viridis',
      },
      {
        assets: ['B08', 'B11'],
        expression: '(B08-B11)/(B08+B11+1e-6)',
        rescale: '-1,1',
        colormapName: 'viridis',
      },
    ];
  }

  if (templateId === 'false_color_s2') {
    const a1 = swir12 ?? 'B12';
    const a2 = nir ?? 'B08';
    const a3 = red ?? 'B04';
    return [
      { assets: [a1, a2, a3], assetBidx: `${a1}|1,${a2}|1,${a3}|1` },
      { assets: ['B12', 'B08', 'B04'], assetBidx: 'B12|1,B08|1,B04|1' },
    ];
  }

  const l1 = swir11 ?? 'swir16';
  const l2 = nir ?? 'nir08';
  const l3 = red ?? 'red';
  return [
    { assets: [l1, l2, l3], assetBidx: `${l1}|1,${l2}|1,${l3}|1` },
    { assets: ['swir16', 'nir08', 'red'], assetBidx: 'swir16|1,nir08|1,red|1' },
    ...(green ? [{ assets: [l1, l2, green], assetBidx: `${l1}|1,${l2}|1,${green}|1` }] : []),
  ];
}

async function probeAnalysisEngineBaseUrl(): Promise<string> {
  const candidates = ['http://127.0.0.1:8000', 'http://localhost:8000'];
  for (const base of candidates) {
    try {
      const ctrl = new AbortController();
      const timer = window.setTimeout(() => ctrl.abort(), 1800);
      const res = await fetch(`${base}/mpc/templates`, { signal: ctrl.signal });
      window.clearTimeout(timer);
      if (res.ok) return base;
    } catch {
      /* try next candidate */
    }
  }
  return '';
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
  /** Fields/types/domains for attribute table (coded-value descriptions). */
  arcgisLayerDefinition?: ArcgisLayerDefLite | null;
  /** Saved symbology (GIS Map–aligned); drives Style dialog defaults. */
  symbology?: SymbologyConfig;
}

const SI_TABLE_MAX_FEATURES = 10000;

type SiTableSearchMode = 'description' | 'code' | 'both';
type SiTableFilterOperator = 'contains' | 'equals' | 'not_equals' | 'empty' | 'not_empty';

function siSanitizeTableFileName(name: string) {
  const trimmed = name.trim() || 'layer';
  const cleaned = trimmed.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, ' ');
  return cleaned.length > 80 ? cleaned.slice(0, 80).trim() : cleaned;
}

function siComputeFeatureRowKey(feature: any, idx: number, cache: Map<object, string>): string {
  if (feature && typeof feature === 'object') {
    const cached = cache.get(feature);
    if (cached) return cached;
  }
  const direct = feature?.id;
  if (direct !== null && direct !== undefined && direct !== '') return String(direct);
  const props = feature?.properties;
  if (props && typeof props === 'object') {
    const candidates = ['OBJECTID', 'ObjectId', 'objectid', 'FID', 'fid', 'Id', 'ID', 'id'];
    for (const k of candidates) {
      const v = (props as any)[k];
      if (v !== null && v !== undefined && v !== '') {
        const key = `${k}:${String(v)}`;
        if (feature && typeof feature === 'object') cache.set(feature, key);
        return key;
      }
    }
  }
  const key = `idx:${idx}`;
  if (feature && typeof feature === 'object') cache.set(feature, key);
  return key;
}

function migrateStoredSymbology(raw: unknown): SymbologyConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const cr = o.colorRamp;
  let colorRamp: SymbologyColorRamp | undefined;
  if (cr === 'green') colorRamp = 'greens';
  else if (cr === 'warm') colorRamp = 'magma';
  else if (cr === 'viridis' || cr === 'blues' || cr === 'greens' || cr === 'plasma' || cr === 'magma' || cr === 'turbo') {
    colorRamp = cr;
  }
  let style = o.style;
  if (style === 'single') style = 'color';
  if (style === 'classified') style = 'unique';
  let method = o.method;
  if (method === 'natural-breaks') method = 'jenks';
  if (method === 'equal-interval') method = 'equal_interval';
  const out: SymbologyConfig = {};
  if (typeof o.useArcGisOnline === 'boolean') out.useArcGisOnline = o.useArcGisOnline;
  if (typeof style === 'string') out.style = style as SymbologyStyle;
  if (typeof o.field === 'string') out.field = o.field;
  if (typeof o.classes === 'number') out.classes = o.classes;
  if (typeof method === 'string') out.method = method as SymbologyClassMethod;
  if (colorRamp) out.colorRamp = colorRamp;
  if (typeof o.threshold === 'number') out.threshold = o.threshold;
  return Object.keys(out).length ? out : undefined;
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
      .map((x: any) => {
        const migratedSym = migrateStoredSymbology(x.symbology);
        let symbology = migratedSym;
        if (
          typeof symbology?.useArcGisOnline !== 'boolean' &&
          (x.source === 'arcgis' ||
            (x.arcgisDrawingInfo && typeof x.arcgisDrawingInfo === 'object') ||
            (x.arcgisLayerDefinition && typeof x.arcgisLayerDefinition === 'object') ||
            (typeof x.sourceUrl === 'string' && x.sourceUrl.trim()))
        ) {
          const fallbackOnline = typeof x.useArcGisSymbology === 'boolean' ? x.useArcGisSymbology : true;
          symbology = { ...(symbology ?? {}), useArcGisOnline: fallbackOnline };
        }
        return {
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
          useArcGisSymbology:
            x.source === 'arcgis'
              ? typeof x.useArcGisSymbology === 'boolean'
                ? x.useArcGisSymbology
                : true
              : typeof x.useArcGisSymbology === 'boolean'
                ? x.useArcGisSymbology
                : undefined,
          arcgisLayerDefinition:
            x.arcgisLayerDefinition && typeof x.arcgisLayerDefinition === 'object'
              ? (x.arcgisLayerDefinition as ArcgisLayerDefLite)
              : undefined,
          symbology,
        };
      });
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

/** Mapbox layer id `${sourceId}-fill|line|circle` → custom layer source id. */
function siVectorLayerIdToCustomSourceId(mapboxLayerId: string): string | null {
  const m = mapboxLayerId.match(/^(.+)-(fill|line|circle)$/);
  return m ? m[1] : null;
}

function siIdentifyLayerIsSkippable(layerId: string): boolean {
  if (!layerId) return true;
  if (layerId.startsWith('si-geo-ai-pin')) return true;
  if (layerId.startsWith('si-draw-draft')) return true;
  if (layerId.startsWith('si-edit-handles')) return true;
  if (layerId === 'sentinel-layer' || layerId === 'si-stac-thumb-layer') return true;
  if (layerId === 'background') return true;
  return false;
}

function siIdentifyTitleForLayerId(layerId: string, customLayers: CustomLayer[]): string {
  const sid = siVectorLayerIdToCustomSourceId(layerId);
  if (sid) {
    const c = customLayers.find(l => l.id === sid);
    if (c?.name) return c.name;
  }
  if (layerId.startsWith('agri-pivots')) return 'Pivot markers';
  if (layerId.startsWith('si-stac-footprints')) return 'STAC footprint';
  if (layerId.startsWith('drawn-index-geometry')) return 'Drawn AOI';
  return layerId.replace(/-(fill|line|circle)$/, '') || 'Feature';
}

function siArcgisDefForIdentifyLayerId(layerId: string, customLayers: CustomLayer[]): ArcgisLayerDefLite | null {
  const sid = siVectorLayerIdToCustomSourceId(layerId);
  if (!sid) return null;
  const c = customLayers.find(l => l.id === sid);
  return c?.arcgisLayerDefinition && typeof c.arcgisLayerDefinition === 'object' ? c.arcgisLayerDefinition : null;
}

function siSanitizeIdentifyProperties(raw: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith('mapbox_')) continue;
    if (k === 'layer' || k === 'id' || k === 'source_layer') continue;
    out[k] = v;
  }
  return out;
}

function siLayerMapboxStylePack(layer: CustomLayer): {
  fillFilter: any;
  lineFilter: any;
  pointFilter: any;
  fillPaint: Record<string, unknown>;
  linePaint: Record<string, unknown>;
  circlePaint: Record<string, unknown>;
} {
  const c = layer.color || '#22c55e';
  const useAg = layer.source === 'arcgis' && layer.useArcGisSymbology !== false && layer.arcgisDrawingInfo;
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

/** Symbology dialog state (GIS Map LayerManager schema + ArcGIS max-class bake slider). */
type SiSymbologyDraft = Required<SymbologyConfig> & { arcgisMaxCategories: number };

type SiBakeRamp = SymbologyColorRamp | 'service';

type AddLayerTab = 'giscontent' | 'arcgis' | 'upload' | 'database' | 'url' | 'raster';

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

/** Base pixel tolerance to snap to first vertex when closing; see polygonCloseSnapThresholdPx. */
const POLYGON_CLOSE_SNAP_BASE_PX = 20;
/** Snap radius to first vertex when closing; scales with zoom like vertex handles. */
function polygonCloseSnapThresholdPx(map: { getZoom?: () => number } | null | undefined): number {
  if (!map) return POLYGON_CLOSE_SNAP_BASE_PX;
  try {
    return Math.max(POLYGON_CLOSE_SNAP_BASE_PX, vertexHitThresholdPx(map as any));
  } catch {
    return POLYGON_CLOSE_SNAP_BASE_PX;
  }
}

/** Shift-constrained polygon edge bearings (degrees). */
const POLYGON_SNAP_BEARING_STEP_DEG = 15;

/** Snap placed vertices to existing ones while sketching (digitizing). */
const POLYGON_VERTEX_SNAP_PX = 20;

/**
 * Optional Sentinel Hub WMS index mask (NDVI / GNDVI / NDMI / NDWI / EVI profiles): alpha is zero where index is below this value.
 * null = AOI geometry clipping only (dataMask + GEOMETRY). Example: 0.35 hides very low NDVI inside the AOI (index below threshold).
 */
const WMS_AOI_INDEX_VISIBILITY_MIN: number | null = null;

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
const SI_SYMBOLOGY_BAKE_RAMPS: Record<SymbologyColorRamp, string[]> = {
  viridis: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'],
  blues: ['#eff6ff', '#bfdbfe', '#60a5fa', '#2563eb', '#1e3a8a'],
  greens: ['#f0fdf4', '#bbf7d0', '#4ade80', '#16a34a', '#14532d'],
  plasma: ['#0d0887', '#7e03a8', '#cc4778', '#f89540', '#f0f921'],
  magma: ['#000004', '#3b0f70', '#8c2981', '#de4968', '#fe9f6d', '#fcfdbf'],
  turbo: ['#30123b', '#3b4cc0', '#26a6d1', '#3de07e', '#f9e721', '#f20c0c'],
};

function esriColorArrayToCss(c: unknown): string | null {
  if (!Array.isArray(c) || c.length < 3) return null;
  const r = Math.max(0, Math.min(255, Math.round(Number(c[0]))));
  const g = Math.max(0, Math.min(255, Math.round(Number(c[1]))));
  const b = Math.max(0, Math.min(255, Math.round(Number(c[2]))));
  if (![r, g, b].every(n => Number.isFinite(n))) return null;
  let a = c.length >= 4 ? Number(c[3]) : 255;
  if (!Number.isFinite(a)) a = 255;
  const alpha = a <= 1 ? a : a / 255;
  const ao = Math.max(0, Math.min(1, alpha));
  return `rgba(${r},${g},${b},${ao})`;
}

function rampColorAt(ramp: string[], i: number, n: number): string {
  if (!ramp.length) return '#22c55e';
  if (n <= 1) return ramp[Math.floor((ramp.length - 1) / 2)]!;
  const t = i / (n - 1);
  const idx = Math.round(t * (ramp.length - 1));
  return ramp[Math.max(0, Math.min(ramp.length - 1, idx))]!;
}

function pointInAoiGeometry(lng: number, lat: number, geometry: any): boolean {
  if (!geometry || typeof geometry !== 'object') return false;
  if (geometry.type === 'Polygon') {
    return pointInPolygonGeometry(lng, lat, geometry as { type: string; coordinates: number[][][] });
  }
  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.some(
      (coords: number[][][]) => pointInPolygonGeometry(lng, lat, { type: 'Polygon', coordinates: coords }),
    );
  }
  return false;
}

function hexToEsriRgba(hex: string): [number, number, number, number] {
  const h = (hex || '#22c55e').replace('#', '');
  const pad = h.length === 3 ? h.split('').map(ch => ch + ch).join('') : h.padEnd(6, '0').slice(0, 6);
  const r = parseInt(pad.slice(0, 2), 16) || 34;
  const g = parseInt(pad.slice(2, 4), 16) || 197;
  const b = parseInt(pad.slice(4, 6), 16) || 94;
  return [r, g, b, 255];
}

function arcgisLegendPreviewRows(
  drawingInfo: Record<string, unknown> | null | undefined,
  colorRamp: SiBakeRamp,
  maxCategories: number,
  arcDef?: ArcgisLayerDefLite | null,
): Array<{ label: string; color: string }> {
  if (!drawingInfo || typeof drawingInfo !== 'object') return [];
  const ren = (drawingInfo as any)?.renderer;
  if (!ren || typeof ren !== 'object') return [];
  const t = String(ren.type || '');
  const max = Math.max(1, Math.min(40, Math.floor(maxCategories)));
  const ramp = colorRamp === 'service' ? null : SI_SYMBOLOGY_BAKE_RAMPS[colorRamp];

  if (t === 'uniqueValue') {
    const infos = (Array.isArray(ren.uniqueValueInfos) ? ren.uniqueValueInfos : []).slice(0, max);
    const fieldsByLower = buildArcFieldsByLower(arcDef ?? null);
    const fieldName = pickRendererPrimaryField(ren) || '';
    return infos.map((uvi: any, i: number) => {
      const rawVal = uvi?.value;
      const rawStr = rawVal === null || rawVal === undefined ? '' : String(rawVal);
      const uviLabel = String(uvi?.label ?? '').trim();
      let label = uviLabel || rawStr;
      if (arcDef && fieldName && rawStr !== '') {
        const resolved = arcLegendLabelForFieldValue(fieldName, rawStr, arcDef, fieldsByLower);
        if (resolved !== rawStr) label = resolved;
      }
      const color =
        ramp != null
          ? rampColorAt(ramp, i, Math.max(infos.length, 1))
          : esriColorArrayToCss(uvi?.symbol?.color) ?? '#64748b';
      return { label, color };
    });
  }
  if (t === 'classBreaks') {
    const raw = Array.isArray(ren.classBreakInfos) ? ren.classBreakInfos : [];
    const sorted = [...raw]
      .filter((br: any) => Number.isFinite(Number(br?.maxValue)))
      .sort((a: any, b: any) => {
        const ma = Number(a?.minValue);
        const mb = Number(b?.minValue);
        if (Number.isFinite(ma) && Number.isFinite(mb)) return ma - mb;
        return Number(a?.maxValue) - Number(b?.maxValue);
      });
    const sliced = sorted.slice(0, max);
    return sliced.map((br: any, i: number) => {
      const label = `${br?.minValue ?? ''} – ${br?.maxValue ?? ''}`;
      const color =
        ramp != null
          ? rampColorAt(ramp, i, Math.max(sliced.length, 1))
          : esriColorArrayToCss(br?.symbol?.color) ?? '#64748b';
      return { label, color };
    });
  }
  if (t === 'simple') {
    const sym = ren.symbol;
    const color =
      ramp != null
        ? rampColorAt(ramp, 0, 1)
        : esriColorArrayToCss(sym?.color) ?? '#22c55e';
    return [{ label: 'Symbol', color }];
  }
  return [];
}

function applySymbologyToArcgisDrawingInfo(
  drawingInfo: Record<string, unknown>,
  colorRamp: SiBakeRamp,
  maxCategories: number,
): Record<string, unknown> | null {
  let di: any;
  try {
    di = JSON.parse(JSON.stringify(drawingInfo));
  } catch {
    return null;
  }
  const ren = di?.renderer;
  if (!ren || typeof ren !== 'object') return null;
  const t = String(ren.type || '');
  const max = Math.max(1, Math.min(40, Math.floor(maxCategories)));
  const useRamp = colorRamp !== 'service';
  const ramp = useRamp ? SI_SYMBOLOGY_BAKE_RAMPS[colorRamp as SymbologyColorRamp] : null;

  if (t === 'uniqueValue') {
    const infos = Array.isArray(ren.uniqueValueInfos) ? [...ren.uniqueValueInfos] : [];
    const sliced = infos.slice(0, max);
    ren.uniqueValueInfos = sliced.map((uvi: any, i: number) => {
      const u = uvi && typeof uvi === 'object' ? { ...uvi } : {};
      const sym =
        u.symbol && typeof u.symbol === 'object' ? JSON.parse(JSON.stringify(u.symbol)) : { type: 'esriSFS', style: 'esriSFSSolid' };
      sym.type = sym.type || 'esriSFS';
      sym.style = sym.style || 'esriSFSSolid';
      if (useRamp && ramp) {
        sym.color = hexToEsriRgba(rampColorAt(ramp, i, Math.max(sliced.length, 1)));
      }
      return { ...u, symbol: sym };
    });
    return sanitizeArcgisDrawingInfoForClient(di);
  }

  if (t === 'classBreaks') {
    const raw = Array.isArray(ren.classBreakInfos) ? [...ren.classBreakInfos] : [];
    const sorted = raw
      .filter((br: any) => Number.isFinite(Number(br?.maxValue)))
      .sort((a: any, b: any) => {
        const ma = Number(a?.minValue);
        const mb = Number(b?.minValue);
        if (Number.isFinite(ma) && Number.isFinite(mb)) return ma - mb;
        return Number(a?.maxValue) - Number(b?.maxValue);
      });
    const sliced = sorted.slice(0, max);
    ren.classBreakInfos = sliced.map((br: any, i: number) => {
      const b = br && typeof br === 'object' ? { ...br } : {};
      const sym =
        b.symbol && typeof b.symbol === 'object' ? JSON.parse(JSON.stringify(b.symbol)) : { type: 'esriSFS', style: 'esriSFSSolid' };
      sym.type = sym.type || 'esriSFS';
      sym.style = sym.style || 'esriSFSSolid';
      if (useRamp && ramp) {
        sym.color = hexToEsriRgba(rampColorAt(ramp, i, Math.max(sliced.length, 1)));
      }
      return { ...b, symbol: sym };
    });
    return sanitizeArcgisDrawingInfoForClient(di);
  }

  if (t === 'simple') {
    const sym =
      ren.symbol && typeof ren.symbol === 'object' ? JSON.parse(JSON.stringify(ren.symbol)) : { type: 'esriSFS', style: 'esriSFSSolid' };
    sym.type = sym.type || 'esriSFS';
    sym.style = sym.style || 'esriSFSSolid';
    if (useRamp && ramp) {
      sym.color = hexToEsriRgba(rampColorAt(ramp, 0, 1));
    }
    ren.symbol = sym;
    return sanitizeArcgisDrawingInfoForClient(di);
  }

  return null;
}

type ExploreDateSourceMode = 'manual' | 'environmental_parameter' | 'sentinel2_views';
const LOCAL_PROCESSING_TEMPLATES: Array<{ id: MpcTemplateId; label: string; collections?: string[] }> = [
  { id: 'ndvi_s2', label: 'NDVI (Sentinel-2)', collections: ['sentinel-2-l2a'] },
  { id: 'false_color_s2', label: 'False Color (Sentinel-2)', collections: ['sentinel-2-l2a'] },
  { id: 'ndmi_s2', label: 'Moisture Index / NDMI (Sentinel-2)', collections: ['sentinel-2-l2a'] },
  { id: 'ndvi_landsat', label: 'NDVI (Landsat-8/9)', collections: ['landsat-c2-l2'] },
  { id: 'false_color_landsat', label: 'False Color (Landsat-8/9)', collections: ['landsat-c2-l2'] },
];
const REMOTE_SENSING_HIDDEN_LAYER_IDS = new Set([
  'NDVI',
  'NDWI',
  'NDMI',
  'SAVI',
  'EVI',
  'GNDVI',
  'NBR',
  'NDRE',
  'BSI',
  'MNDWI',
]);
const DEFAULT_MPC_CATALOG_URL = 'https://planetarycomputer.microsoft.com/catalog';
const DEFAULT_MPC_ACS_ZIP_PATH = 'C:\\Users\\mohamed.abass.WUSOOM\\Downloads\\ACS_Files.zip';

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
  /** Mapbox-style processing bar: expanded shows icon + short label per section. */
  const [procMbRowExpanded, setProcMbRowExpanded] = useState(false);
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
  const [is3DView, setIs3DView] = useState(() => true);
  const [cloudCoverage, setCloudCoverage] = useState(20);
  const [isTimelinePlaying, setIsTimelinePlaying] = useState(false);
  const [mapStaticChartsOpen, setMapStaticChartsOpen] = useState(false);
  const [staticChartComparisonLayers, setStaticChartComparisonLayers] = useState<StaticAoiChartLayerId[]>(() =>
    defaultStaticAoiComparisonLayers(),
  );
  const [selectedIndex, setSelectedIndex] = useState<EnvironmentalIndexId>('NDWI');
  const selectedIndexConfig =
    ENVIRONMENTAL_INDICES[selectedIndex] ?? ENVIRONMENTAL_INDICES.NDWI;
  useEffect(() => {
    if (Object.prototype.hasOwnProperty.call(ENVIRONMENTAL_INDICES, selectedIndex)) return;
    setSelectedIndex('NDWI');
  }, [selectedIndex]);
  const [selectedPivotId, setSelectedPivotId] = useState('all');
  const [weeklyComposites, setWeeklyComposites] = useState<WeeklyComposite[]>([]);
  /** True only after the user (or RS Run path) successfully builds the field timeline — drives Generate ⟷ Stop label. */
  const [fieldTimelineSessionActive, setFieldTimelineSessionActive] = useState(false);
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
  const [runtimeAnalysisEngineBaseUrl, setRuntimeAnalysisEngineBaseUrl] = useState('');
  const [selectedMpcTemplateId, setSelectedMpcTemplateId] = useState<MpcTemplateId>('ndvi_s2');
  const [mpcProcessResult, setMpcProcessResult] = useState<MpcProcessResult | null>(null);
  const [mpcClipToAoi, setMpcClipToAoi] = useState(true);
  const [mpcTileSize, setMpcTileSize] = useState(1024);
  const [autoRunNdviOnScenePick, setAutoRunNdviOnScenePick] = useState(true);
  const [processingTargetStacItem, setProcessingTargetStacItem] = useState<any | null>(null);
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
  const [showStacFootprintsOnMap, setShowStacFootprintsOnMap] = useState(false);
  const [isWmsOverlayVisible, setIsWmsOverlayVisible] = useState(true);
  const [stacMapThumb, setStacMapThumb] = useState<null | { url: string; coordinates: [[number, number], [number, number], [number, number], [number, number]] }>(
    null,
  );
  const [isStacThumbVisible, setIsStacThumbVisible] = useState(true);
  const [stacMapThumbLabel, setStacMapThumbLabel] = useState('');
  const [isAddLayerModalOpen, setIsAddLayerModalOpen] = useState(false);
  /** Home = pick source; gis-list = full-screen GIS Content step (like Develop); source-forms = ArcGIS / upload / URL / database. */
  const [siAddLayerWizard, setSiAddLayerWizard] = useState<'home' | 'gis-list' | 'source-forms'>('home');
  const [addLayerTab, setAddLayerTab] = useState<AddLayerTab>('giscontent');
  const [addLayerUrl, setAddLayerUrl] = useState('');
  const [addLayerRemoteUrl, setAddLayerRemoteUrl] = useState('');
  const [addLayerToken, setAddLayerToken] = useState(() => (typeof window !== 'undefined' ? getArcgisPortalToken() : ''));
  const [addLayerName, setAddLayerName] = useState('');
  const [addLayerStatus, setAddLayerStatus] = useState('');
  const [isConnectingLayer, setIsConnectingLayer] = useState(false);
  const [discoveredArcgisLayers, setDiscoveredArcgisLayers] = useState<Array<{ id: number; name: string; url: string; kind: 'layer' | 'table'; geometryType?: string }>>([]);
  const [selectedDiscoveredArcgisUrl, setSelectedDiscoveredArcgisUrl] = useState('');
  const [isAddingDiscoveredArcgisLayer, setIsAddingDiscoveredArcgisLayer] = useState(false);
  const [gisContentCandidates, setGisContentCandidates] = useState<
    Array<{
      id: string;
      name: string;
      data: any;
      source?: 'arcgis' | 'upload' | 'url';
      sourceUrl?: string;
      authToken?: string;
      color?: string;
      useArcGisSymbology?: boolean;
      arcgisDrawingInfo?: Record<string, unknown> | null;
      arcgisLayerDefinition?: ArcgisLayerDefLite | null;
    }>
  >([]);
  const [isLoadingGisContentCandidates, setIsLoadingGisContentCandidates] = useState(false);
  const [addingGisContentCandidateId, setAddingGisContentCandidateId] = useState<string | null>(null);
  const [isImportingRemoteLayer, setIsImportingRemoteLayer] = useState(false);
  const [activeLayerActionDialog, setActiveLayerActionDialog] = useState<null | { mode: 'table' | 'symbology' | 'legend'; layerId: string }>(null);
  const [syncingLayerId, setSyncingLayerId] = useState<string | null>(null);
  const [tableSearchText, setTableSearchText] = useState('');
  const [tableSearchMode, setTableSearchMode] = useState<SiTableSearchMode>('description');
  const [tableFilterField, setTableFilterField] = useState('');
  const [tableFilterOperator, setTableFilterOperator] = useState<SiTableFilterOperator>('contains');
  const [tableFilterValue, setTableFilterValue] = useState('');
  const [tableShowSelectedOnly, setTableShowSelectedOnly] = useState(false);
  const [tableSelectedKeys, setTableSelectedKeys] = useState<Set<string>>(() => new Set());
  const [tableToolsCollapsed, setTableToolsCollapsed] = useState(true);
  const [draggingSiTableField, setDraggingSiTableField] = useState<string | null>(null);
  const [hiddenSiTableFieldsByLayerId, setHiddenSiTableFieldsByLayerId] = useState<Record<string, Set<string>>>({});
  const [siTableFieldOrderByLayerId, setSiTableFieldOrderByLayerId] = useState<Record<string, string[]>>({});
  const [symbologyDraft, setSymbologyDraft] = useState<SiSymbologyDraft>({
    useArcGisOnline: true,
    style: 'color',
    field: '',
    classes: 5,
    method: 'jenks',
    colorRamp: 'viridis',
    threshold: Number.NaN,
    arcgisMaxCategories: 8,
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
  const [showEditHandles, setShowEditHandles] = useState(false);
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
  const [netfloraRasterPath, setNetfloraRasterPath] = useState('');
  const [netfloraInputLayerId, setNetfloraInputLayerId] = useState('');
  const [netfloraWeightsPath, setNetfloraWeightsPath] = useState('model_weights.pt');
  const [netfloraImageSize, setNetfloraImageSize] = useState(1536);
  const [netfloraThreshold, setNetfloraThreshold] = useState(0.25);
  const [netfloraDetectionMode, setNetfloraDetectionMode] = useState<NetfloraDetectionMode>('full_then_clip');
  const [netfloraAoiSource, setNetfloraAoiSource] = useState<NetfloraAoiSource>('drawn');
  const [netfloraAddInputToProject, setNetfloraAddInputToProject] = useState(true);
  const [netfloraGeneratePdf, setNetfloraGeneratePdf] = useState(false);
  const [netfloraOutputPath, setNetfloraOutputPath] = useState('');
  const [netfloraOpenOutputAfterRun, setNetfloraOpenOutputAfterRun] = useState(true);
  const [netfloraReportPath, setNetfloraReportPath] = useState('');
  const [netfloraUploadedResults, setNetfloraUploadedResults] = useState<any | null>(null);
  const [netfloraFilteredResults, setNetfloraFilteredResults] = useState<any | null>(null);
  const [netfloraStats, setNetfloraStats] = useState<NetfloraDetectionStats | null>(null);
  const [netfloraBusy, setNetfloraBusy] = useState(false);
  const [netfloraStatus, setNetfloraStatus] = useState('');
  const [expandedEnvSection, setExpandedEnvSection] = useState<
    | 'source'
    | 'layers'
    | 'explore-stac'
    | 'remote-sensing'
    | 'ai-detection-gis'
    | 'table-geo-ai'
  >('source');
  const [geoExplorerMessages, setGeoExplorerMessages] = useState<GeoExplorerMessage[]>([]);
  const [geoExplorerVisibleCount, setGeoExplorerVisibleCount] = useState(GEO_AI_CHAT_PAGE_SIZE);
  const [geoAiSmartSuggestionsEnabled, setGeoAiSmartSuggestionsEnabled] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem('geo_ai_smart_suggestions_enabled_v1') !== '0';
  });
  const [geoExplorerDraft, setGeoExplorerDraft] = useState('');
  const [geoExplorerPendingImage, setGeoExplorerPendingImage] = useState<{
    mime: string;
    base64: string;
  } | null>(null);
  const [geoExplorerBusy, setGeoExplorerBusy] = useState(false);
  /** Distinguishes full send vs in-place question edit so the UI shows “Updating…” instead of “Thinking…”. */
  const [geoExplorerAwaitKind, setGeoExplorerAwaitKind] = useState<'send' | 'edit'>('send');
  const [geoExplorerChatError, setGeoExplorerChatError] = useState('');
  const [geoAiPinLngLat, setGeoAiPinLngLat] = useState<[number, number] | null>(null);
  const [geoAiInspectCard, setGeoAiInspectCard] = useState<null | GeoAiInspectCardState>(null);
  /** Last Geo AI user message (any model) — drives inspect-popup field pick + map identify context. */
  const geoAiLastUserMapQueryRef = useRef<string>('');
  const geoAiReverseGeocodeKeyRef = useRef<string>('');
  const geoExplorerFileInputRef = useRef<HTMLInputElement | null>(null);
  const geoExplorerInFlightRef = useRef(false);
  const [geoAiModelTab, setGeoAiModelTab] = useState<'gemini' | 'claude' | 'deepseek'>('gemini');
  const [geoAiChatMessages, setGeoAiChatMessages] = useState<Array<{ id: string; role: 'user' | 'assistant'; text: string }>>(
    [],
  );
  const [geoAiClaudeVisibleCount, setGeoAiClaudeVisibleCount] = useState(GEO_AI_CHAT_PAGE_SIZE);
  const [geoAiDraft, setGeoAiDraft] = useState('');
  const [geoAiBusy, setGeoAiBusy] = useState(false);
  const [geoAiChatError, setGeoAiChatError] = useState('');
  const geoAiInFlightRef = useRef(false);
  const [geoDeepseekChatMessages, setGeoDeepseekChatMessages] = useState<
    Array<{ id: string; role: 'user' | 'assistant'; text: string }>
  >([]);
  const [geoAiDeepseekVisibleCount, setGeoAiDeepseekVisibleCount] = useState(GEO_AI_CHAT_PAGE_SIZE);
  const [geoDeepseekDraft, setGeoDeepseekDraft] = useState('');
  const [geoDeepseekBusy, setGeoDeepseekBusy] = useState(false);
  const [geoDeepseekChatError, setGeoDeepseekChatError] = useState('');
  const geoDeepseekInFlightRef = useRef(false);
  const [polygonClosingSnap, setPolygonClosingSnap] = useState(false);
  /** 1 during interaction; animates toward 0 while clearing AOI overlays for a smooth fade-out */
  const [drawVisualOpacity, setDrawVisualOpacity] = useState(1);
  const drawFadeRafRef = useRef<number | null>(null);
  const [drawAssistHint, setDrawAssistHint] = useState('');
  const [circleRadiusM, setCircleRadiusM] = useState<number | null>(null);
  /** After initial circle drag: center + edge with N/E/S/W handles before Enter commits. */
  const [circleRefineDraft, setCircleRefineDraft] = useState<null | { center: [number, number]; edge: [number, number] }>(
    null,
  );
  const [circleRefineActiveHandle, setCircleRefineActiveHandle] = useState<
    null | 'center' | CircleCardinal | 'pan'
  >(null);
  const acsFileInputRef = useRef<HTMLInputElement | null>(null);
  const exploreCatalogSigRef = useRef('');
  const searchRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any | null>(null);
  /** One-shot fallback to Mercator when Globe/WebGL errors (e.g. some Edge + GPU combos). */
  const siGlobeWebglFailoverRef = useRef(false);
  const siTableFeatureKeyCacheRef = useRef<Map<object, string>>(new Map());
  const drawnGeometryRef = useRef<any | null>(null);
  const dragRectCircleRef = useRef<null | { kind: 'rectangle' | 'circle' | 'box_select'; start: [number, number] }>(null);
  const circleRefineDraftRef = useRef<null | { center: [number, number]; edge: [number, number] }>(null);
  const circleRefineInteractionRef = useRef<
    null | { type: 'handle'; h: 'center' | CircleCardinal } | { type: 'pan'; last: [number, number] }
  >(null);
  const circleRefineLastMoveRef = useRef<[number, number] | null>(null);
  const preEditGeomRef = useRef<any | null>(null);
  const polylineStartRef = useRef<[number, number] | null>(null);
  polylineStartRef.current = polylineStart;
  const mapDrawToolRef = useRef<MapDrawTool>('select');
  mapDrawToolRef.current = mapDrawTool;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const geoExplorerMessagesRef = useRef<HTMLDivElement | null>(null);
  const geoAiClaudeMessagesRef = useRef<HTMLDivElement | null>(null);
  const geoAiDeepseekMessagesRef = useRef<HTMLDivElement | null>(null);
  const geoExplorerLoadOlderRef = useRef<{ top: number; height: number } | null>(null);
  const geoAiClaudeLoadOlderRef = useRef<{ top: number; height: number } | null>(null);
  const geoAiDeepseekLoadOlderRef = useRef<{ top: number; height: number } | null>(null);
  const netfloraUploadInputRef = useRef<HTMLInputElement | null>(null);
  const skipNextMapClickRef = useRef(false);
  /** While drawing a polygon: index of vertex being dragged, or null. */
  const polygonRingSketchDragRef = useRef<number | null>(null);
  const editDragRef = useRef<null | { mode: 'vertex'; ref: VertexRef } | { mode: 'pan'; last: [number, number] }>(null);
  const consoleErrorRef = useRef<typeof console.error | null>(null);
  const stacFocusHydratedRef = useRef(false);

  const visibleGeoExplorerMessages = useMemo(
    () => geoExplorerMessages.slice(Math.max(0, geoExplorerMessages.length - geoExplorerVisibleCount)),
    [geoExplorerMessages, geoExplorerVisibleCount],
  );
  const geoExplorerHasOlderMessages = geoExplorerMessages.length > geoExplorerVisibleCount;
  const visibleGeoAiClaudeMessages = useMemo(
    () => geoAiChatMessages.slice(Math.max(0, geoAiChatMessages.length - geoAiClaudeVisibleCount)),
    [geoAiChatMessages, geoAiClaudeVisibleCount],
  );
  const geoAiClaudeHasOlderMessages = geoAiChatMessages.length > geoAiClaudeVisibleCount;
  const visibleGeoAiDeepseekMessages = useMemo(
    () => geoDeepseekChatMessages.slice(Math.max(0, geoDeepseekChatMessages.length - geoAiDeepseekVisibleCount)),
    [geoDeepseekChatMessages, geoAiDeepseekVisibleCount],
  );
  const geoAiDeepseekHasOlderMessages = geoDeepseekChatMessages.length > geoAiDeepseekVisibleCount;

  const loadOlderGeoExplorerMessages = useCallback(() => {
    if (!geoExplorerHasOlderMessages) return;
    const el = geoExplorerMessagesRef.current;
    if (el) geoExplorerLoadOlderRef.current = { top: el.scrollTop, height: el.scrollHeight };
    setGeoExplorerVisibleCount(prev => Math.min(geoExplorerMessages.length, prev + GEO_AI_CHAT_PAGE_SIZE));
  }, [geoExplorerHasOlderMessages, geoExplorerMessages.length]);
  const loadOlderGeoAiClaudeMessages = useCallback(() => {
    if (!geoAiClaudeHasOlderMessages) return;
    const el = geoAiClaudeMessagesRef.current;
    if (el) geoAiClaudeLoadOlderRef.current = { top: el.scrollTop, height: el.scrollHeight };
    setGeoAiClaudeVisibleCount(prev => Math.min(geoAiChatMessages.length, prev + GEO_AI_CHAT_PAGE_SIZE));
  }, [geoAiClaudeHasOlderMessages, geoAiChatMessages.length]);
  const loadOlderGeoAiDeepseekMessages = useCallback(() => {
    if (!geoAiDeepseekHasOlderMessages) return;
    const el = geoAiDeepseekMessagesRef.current;
    if (el) geoAiDeepseekLoadOlderRef.current = { top: el.scrollTop, height: el.scrollHeight };
    setGeoAiDeepseekVisibleCount(prev => Math.min(geoDeepseekChatMessages.length, prev + GEO_AI_CHAT_PAGE_SIZE));
  }, [geoAiDeepseekHasOlderMessages, geoDeepseekChatMessages.length]);

  const runSatelliteGeoExplorerGeminiPipeline = useCallback(
    async (args: {
      historyWithUser: GeoExplorerMessage[];
      userTextForMapFallback: string;
      coordsSourceMessages: GeoExplorerMessage[];
      skipLocalStatsBecausePendingImage: boolean;
      questionEditInPlace: boolean;
    }) => {
      const {
        historyWithUser,
        userTextForMapFallback,
        coordsSourceMessages,
        skipLocalStatsBecausePendingImage,
        questionEditInPlace,
      } = args;
      const trimmed = userTextForMapFallback.trim();
      const apiKey = geminiApiKey.trim();
      if (!apiKey) return;
      try {
        if (!skipLocalStatsBecausePendingImage && trimmed) {
          const savedLayersForStats = await loadGisMapSavedLayers();
          const mergedLayersForStats: GeoAiMapLayer[] = [
            ...satelliteCustomLayersToGeoAiLayers(customLayers),
            ...savedLayersForStats.map(l => ({
              name: l.name,
              clientLayerId: String(l.id),
              visible: l.visible,
              source: l.source,
              data: l.data,
              arcgisLayerDefinition: (l as { arcgisLayerDefinition?: GeoAiMapLayer['arcgisLayerDefinition'] })
                .arcgisLayerDefinition,
            })),
          ];
          const localStats = runGeoAiStatsCommand(trimmed, mergedLayersForStats);
          if (localStats?.handled) {
            const mid =
              typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `geo-s-${Date.now()}`;
            const parts: GeoExplorerPart[] = [{ type: 'text', text: localStats.reply }];
            if (localStats.table) parts.push({ type: 'dataTable', table: localStats.table });
            const modelMsg: GeoExplorerMessage = { id: mid, role: 'model', parts };
            setGeoExplorerMessages(h => [...h, modelMsg]);
            if (localStats.mapFirstSync?.selections?.length) {
              queueMicrotask(() => applySatelliteGeoAiMapFirstSync(localStats.mapFirstSync!.selections));
            }
            return;
          }
        }
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
          lastMapQueryCoords: lastMapQueryCoordsFromMessages(coordsSourceMessages),
          inspectAnchorLngLat:
            geoAiInspectCard != null ? ([geoAiInspectCard.lng, geoAiInspectCard.lat] as [number, number]) : null,
          mapPopup: null,
          addedLayersHeading: '### Satellite — Added layers (this map — si-env / vector layers)',
          attachGisSavedLayers: true,
          extraSystemAppend: developAppend || undefined,
          questionEditInPlace,
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
              rows: buildGeoAiLayerPopupAttributeRows(me.layerHit, {
                maxRows: 28,
                queryContext: userTextForMapFallback,
                inspectCoords: { lng: me.coords[0], lat: me.coords[1] },
              }),
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
    },
    [
      geminiApiKey,
      customLayers,
      mapboxToken,
      openWeatherApiKey,
      geoAiPinLngLat,
      geoAiInspectCard,
      is3DView,
    ],
  );

  const saveEditedGeoExplorerGeminiQuestion = useCallback(
    (messageId: string, nextText: string) => {
      const trimmed = nextText.trim();
      if (!trimmed) return;
      if (geoExplorerInFlightRef.current) return;
      const apiKey = geminiApiKey.trim();
      if (!apiKey) {
        setGeoExplorerChatError(
          'Add a Gemini API key: System Settings → API Tokens → Gemini API (saved in this browser), or set VITE_GEMINI_API_KEY at build time. Never commit keys to Git.',
        );
        return;
      }

      let snapshot: GeoExplorerMessage[] | null = null;
      setGeoExplorerMessages(prev => {
        const i = prev.findIndex(m => m.id === messageId);
        if (i < 0) return prev;
        const updated = replaceUserMessageText(prev[i], trimmed);
        snapshot = [...prev.slice(0, i), updated];
        return snapshot;
      });

      if (!snapshot?.length) return;

      geoAiLastUserMapQueryRef.current = trimmed;
      setGeoExplorerChatError('');
      geoExplorerInFlightRef.current = true;
      setGeoExplorerBusy(true);
      setGeoExplorerAwaitKind('edit');
      queueMicrotask(() =>
        void runSatelliteGeoExplorerGeminiPipeline({
          historyWithUser: snapshot!,
          userTextForMapFallback: trimmed,
          coordsSourceMessages: snapshot!,
          skipLocalStatsBecausePendingImage: false,
          questionEditInPlace: true,
        }),
      );
    },
    [geminiApiKey, runSatelliteGeoExplorerGeminiPipeline],
  );

  useLayoutEffect(() => {
    const el = geoExplorerMessagesRef.current;
    const restore = geoExplorerLoadOlderRef.current;
    if (!el || !restore) return;
    el.scrollTop = restore.top + (el.scrollHeight - restore.height);
    geoExplorerLoadOlderRef.current = null;
  }, [geoExplorerVisibleCount]);
  useLayoutEffect(() => {
    const el = geoAiClaudeMessagesRef.current;
    const restore = geoAiClaudeLoadOlderRef.current;
    if (!el || !restore) return;
    el.scrollTop = restore.top + (el.scrollHeight - restore.height);
    geoAiClaudeLoadOlderRef.current = null;
  }, [geoAiClaudeVisibleCount]);
  useLayoutEffect(() => {
    const el = geoAiDeepseekMessagesRef.current;
    const restore = geoAiDeepseekLoadOlderRef.current;
    if (!el || !restore) return;
    el.scrollTop = restore.top + (el.scrollHeight - restore.height);
    geoAiDeepseekLoadOlderRef.current = null;
  }, [geoAiDeepseekVisibleCount]);

  useLayoutEffect(() => {
    const el = geoExplorerMessagesRef.current;
    if (!el || geoExplorerLoadOlderRef.current) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= 56) el.scrollTop = el.scrollHeight;
  }, [geoExplorerMessages.length, geoExplorerBusy]);
  useLayoutEffect(() => {
    const el = geoAiClaudeMessagesRef.current;
    if (!el || geoAiClaudeLoadOlderRef.current) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= 56) el.scrollTop = el.scrollHeight;
  }, [geoAiChatMessages.length, geoAiBusy]);
  useLayoutEffect(() => {
    const el = geoAiDeepseekMessagesRef.current;
    if (!el || geoAiDeepseekLoadOlderRef.current) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= 56) el.scrollTop = el.scrollHeight;
  }, [geoDeepseekChatMessages.length, geoDeepseekBusy]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('geo_ai_smart_suggestions_enabled_v1', geoAiSmartSuggestionsEnabled ? '1' : '0');
  }, [geoAiSmartSuggestionsEnabled]);

  const geoAiSuggestContext = useMemo(() => {
    const allLayers = satelliteCustomLayersToGeoAiLayers(customLayers);
    const layerNames = allLayers.map(l => l.name).filter(Boolean);
    const fieldSet = new Set<string>();
    const numericSet = new Set<string>();
    const geomOps = new Set<string>();
    for (const layer of allLayers) {
      const fc = (layer.geojson && layer.geojson.type === 'FeatureCollection' && Array.isArray(layer.geojson.features))
        ? layer.geojson.features
        : layer.data && layer.data.type === 'FeatureCollection' && Array.isArray(layer.data.features)
          ? layer.data.features
          : [];
      for (const f of fc.slice(0, 120)) {
        const p = f.properties;
        if (p && typeof p === 'object') {
          for (const [k, v] of Object.entries(p)) {
            fieldSet.add(k);
            if (typeof v === 'number' || (typeof v === 'string' && Number.isFinite(Number(v)))) numericSet.add(k);
          }
        }
        const gt = String(f.geometry?.type ?? '');
        if (gt.includes('Polygon')) {
          geomOps.add('Within');
          geomOps.add('Intersects');
          geomOps.add('Buffer');
          geomOps.add('Contains');
          geomOps.add('Clip');
        } else if (gt.includes('Line')) {
          geomOps.add('Intersects');
          geomOps.add('Buffer');
          geomOps.add('Near');
        } else if (gt.includes('Point')) {
          geomOps.add('Within');
          geomOps.add('Near');
          geomOps.add('Buffer');
        }
      }
    }
    return {
      layers: layerNames.slice(0, 20),
      fields: [...fieldSet].sort((a, b) => a.localeCompare(b)).slice(0, 80),
      numericFields: [...numericSet].sort((a, b) => a.localeCompare(b)).slice(0, 60),
      geometryOps: [...geomOps].slice(0, 8),
    };
  }, [customLayers]);

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

  const normalizeDetectionConfidence = (props: Record<string, any>): number => {
    const candidates = [props.confidence, props.score, props.probability, props.conf];
    for (const v of candidates) {
      const n = Number(v);
      if (Number.isFinite(n)) return n > 1 ? n / 100 : n;
    }
    return 0;
  };

  const normalizeDetectionClass = (props: Record<string, any>): string => {
    const raw = props.class ?? props.class_name ?? props.species ?? props.label ?? props.name ?? 'Unknown';
    const txt = String(raw || '').trim();
    return txt || 'Unknown';
  };

  const normalizeBboxLike = (bboxLike: any): [number, number, number, number] | null => {
    if (!Array.isArray(bboxLike) || bboxLike.length < 4) return null;
    const a = Number(bboxLike[0]);
    const b = Number(bboxLike[1]);
    const c = Number(bboxLike[2]);
    const d = Number(bboxLike[3]);
    if (![a, b, c, d].every(Number.isFinite)) return null;
    if (c > a && d > b) return [a, b, c, d];
    const w = Math.abs(c);
    const h = Math.abs(d);
    if (w === 0 || h === 0) return null;
    return [a, b, a + w, b + h];
  };

  const bboxesIntersect = (a: [number, number, number, number], b: [number, number, number, number]) =>
    a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

  const getDetectionFeatureBbox = (feature: any): [number, number, number, number] | null => {
    const fromGeom = getGeoJsonBounds(feature);
    if (fromGeom) return fromGeom;
    const fromProps = normalizeBboxLike(feature?.properties?.bbox ?? feature?.bbox);
    return fromProps;
  };

  const normalizeNetfloraDetectionCollection = (raw: any) => {
    const fc =
      raw?.type === 'FeatureCollection'
        ? raw
        : Array.isArray(raw?.features)
          ? { type: 'FeatureCollection', features: raw.features }
          : Array.isArray(raw)
            ? { type: 'FeatureCollection', features: raw }
            : null;
    if (!fc || !Array.isArray(fc.features)) return null;
    const features = fc.features
      .map((f: any, idx: number) => {
        const props = typeof f?.properties === 'object' && f.properties ? { ...f.properties } : {};
        const confidence = normalizeDetectionConfidence(props);
        const className = normalizeDetectionClass(props);
        const bbox = getDetectionFeatureBbox(f);
        const geometry =
          f?.geometry && typeof f.geometry === 'object'
            ? f.geometry
            : bbox
              ? {
                  type: 'Polygon',
                  coordinates: [
                    [
                      [bbox[0], bbox[1]],
                      [bbox[2], bbox[1]],
                      [bbox[2], bbox[3]],
                      [bbox[0], bbox[3]],
                      [bbox[0], bbox[1]],
                    ],
                  ],
                }
              : null;
        if (!geometry) return null;
        return {
          type: 'Feature',
          id: String(f?.id ?? `det-${idx}-${Math.random().toString(36).slice(2, 7)}`),
          geometry,
          properties: {
            ...props,
            className,
            confidence,
            confidenceBand: confidence >= 0.75 ? 'High' : confidence >= 0.5 ? 'Medium' : 'Low',
            bbox: bbox ?? null,
            bboxText: bbox ? `${bbox[0].toFixed(6)}, ${bbox[1].toFixed(6)}, ${bbox[2].toFixed(6)}, ${bbox[3].toFixed(6)}` : 'n/a',
          },
        };
      })
      .filter(Boolean);
    return { type: 'FeatureCollection', features };
  };

  const netfloraAoiFeature = useMemo(() => {
    if (netfloraAoiSource === 'drawn' && drawnGeometry) return drawnGeometry;
    const map = mapRef.current?.getMap?.() ?? mapRef.current;
    const b = map?.getBounds?.();
    if (!b) return null;
    return bboxToPolygonFeature(b.getWest(), b.getSouth(), b.getEast(), b.getNorth(), 'Current map view AOI');
  }, [drawnGeometry, netfloraAoiSource]);

  const netfloraAoiBounds = useMemo(() => (netfloraAoiFeature ? getGeoJsonBounds(netfloraAoiFeature) : null), [netfloraAoiFeature]);

  const netfloraInputLayerOptions = useMemo(() => {
    const opts: Array<{ id: string; label: string }> = [];
    if (wmsLayer.trim()) {
      const title = wmsLayers.find(l => l.name === wmsLayer)?.title || wmsLayer;
      opts.push({
        id: `wms:${wmsLayer}`,
        label: `Raster · Sentinel WMS · ${title} (${selectedDate.toISOString().slice(0, 10)})`,
      });
    }
    for (const layer of customLayers) {
      const geom = getLayerGeometryKind(layer.geojson);
      const kind = geom === 'point' || geom === 'line' || geom === 'polygon' ? 'Vector' : 'Layer';
      opts.push({ id: `layer:${layer.id}`, label: `${kind} · ${layer.name}` });
    }
    return opts;
  }, [customLayers, selectedDate, wmsLayer, wmsLayers]);

  const runNetfloraDetection = useCallback(() => {
    if (!netfloraUploadedResults?.features?.length) {
      setNetfloraStatus('Upload NetFlora detections GeoJSON first, then run detection.');
      return;
    }
    setNetfloraBusy(true);
    try {
      const all = Array.isArray(netfloraUploadedResults.features) ? netfloraUploadedResults.features : [];
      const filtered = all.filter((ft: any) => {
        const conf = Number(ft?.properties?.confidence ?? 0);
        if (!Number.isFinite(conf) || conf < netfloraThreshold) return false;
        if (!netfloraAoiBounds) return true;
        if (netfloraDetectionMode === 'aoi_first' || netfloraDetectionMode === 'full_then_clip') {
          const box = getDetectionFeatureBbox(ft);
          if (!box) return false;
          return bboxesIntersect(box, netfloraAoiBounds);
        }
        return true;
      });
      const out = { type: 'FeatureCollection', features: filtered };
      const classAgg = new Map<string, { count: number; sum: number }>();
      let confSum = 0;
      for (const f of filtered) {
        const cls = String(f?.properties?.className || 'Unknown');
        const conf = Number(f?.properties?.confidence ?? 0);
        const row = classAgg.get(cls) ?? { count: 0, sum: 0 };
        row.count += 1;
        row.sum += Number.isFinite(conf) ? conf : 0;
        classAgg.set(cls, row);
        confSum += Number.isFinite(conf) ? conf : 0;
      }
      const byClass = Array.from(classAgg.entries())
        .map(([label, row]) => ({
          label,
          count: row.count,
          avgConfidence: row.count ? row.sum / row.count : 0,
        }))
        .sort((a, b) => b.count - a.count);
      const stats: NetfloraDetectionStats = {
        total: filtered.length,
        avgConfidence: filtered.length ? confSum / filtered.length : 0,
        byClass,
      };
      setNetfloraFilteredResults(out);
      setNetfloraStats(stats);
      setCustomLayers(prev => {
        const name = 'NetFlora AI detections';
        const nextLayer: CustomLayer = {
          id: NETFLORA_DETECTIONS_LAYER_ID,
          name,
          source: 'api',
          sourceUrl: 'netflora://local-results',
          authToken: null,
          geojson: out as any,
          visible: true,
          color: '#22c55e',
          symbology: {
            useArcGisOnline: false,
            style: 'color',
            field: 'confidence',
            classes: 5,
            method: 'quantile',
            colorRamp: 'greens',
            threshold: netfloraThreshold,
          },
        };
        const has = prev.some(l => l.id === NETFLORA_DETECTIONS_LAYER_ID);
        return has ? prev.map(l => (l.id === NETFLORA_DETECTIONS_LAYER_ID ? { ...l, ...nextLayer } : l)) : [...prev, nextLayer];
      });
      setNetfloraStatus(`Detection completed: ${filtered.length} objects mapped to GIS layer.`);
    } catch (e) {
      setNetfloraStatus(e instanceof Error ? e.message : 'Failed to run detection workflow.');
    } finally {
      setNetfloraBusy(false);
    }
  }, [netfloraUploadedResults, netfloraThreshold, netfloraAoiBounds, netfloraDetectionMode]);

  const onNetfloraUploadChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rawText = await file.text();
      const parsed = JSON.parse(rawText);
      const normalized = normalizeNetfloraDetectionCollection(parsed);
      if (!normalized || !normalized.features?.length) {
        setNetfloraStatus('No valid detection features found in uploaded file.');
        return;
      }
      setNetfloraUploadedResults(normalized);
      setNetfloraFilteredResults(null);
      setNetfloraStats(null);
      setNetfloraStatus(`Loaded ${normalized.features.length} detections from ${file.name}.`);
    } catch (err) {
      setNetfloraStatus(err instanceof Error ? err.message : 'Failed to parse uploaded detections file.');
    } finally {
      e.target.value = '';
    }
  }, []);

  const exportNetfloraResults = useCallback(() => {
    if (!netfloraFilteredResults?.features?.length) {
      setNetfloraStatus('No filtered detection results to export.');
      return;
    }
    downloadTextFile(
      `netflora-detections-${Date.now()}.geojson`,
      JSON.stringify(netfloraFilteredResults, null, 2),
      'application/geo+json',
    );
    setNetfloraStatus('Exported filtered detections as GeoJSON.');
  }, [netfloraFilteredResults]);

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

  const pickFirstPolygonAoiFeature = (geojson: any): { type: 'Feature'; geometry: any; properties: Record<string, unknown> } | null => {
    if (!geojson || typeof geojson !== 'object') return null;
    if (geojson.type === 'Feature') {
      const g = (geojson as any).geometry;
      if (g?.type === 'Polygon' || g?.type === 'MultiPolygon') {
        return {
          type: 'Feature',
          geometry: g,
          properties: (geojson as any).properties || {},
        };
      }
      return null;
    }
    if (geojson.type === 'FeatureCollection' && Array.isArray((geojson as any).features)) {
      for (const ft of (geojson as any).features) {
        const g = ft?.geometry;
        if (g?.type === 'Polygon' || g?.type === 'MultiPolygon') {
          return {
            type: 'Feature',
            geometry: g,
            properties: ft?.properties || {},
          };
        }
      }
      return null;
    }
    if (geojson.type === 'Polygon' || geojson.type === 'MultiPolygon') {
      return { type: 'Feature', geometry: geojson, properties: {} };
    }
    return null;
  };

  const applyUploadedAoiToAnalysis = (geojson: any, layerName: string) => {
    const feature = pickFirstPolygonAoiFeature(geojson);
    if (!feature) return false;
    setGeomUndoStack([]);
    setGeomRedoStack([]);
    updateDrawnStats(feature as any);
    setExploreExtentMode('drawn');
    setMapDrawTool('select');
    setMapDragPanEnabled(true);
    setFieldAnalysisStatus(`AOI loaded from "${layerName}". You can run analysis inside this AOI.`);
    return true;
  };

  const focusGeoJsonOnMap = (geojson: any) => {
    const bounds = getGeoJsonBounds(geojson);
    if (!bounds) return;
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
    }
  };

  const importAoiDataSourceFile = async (file: File) => {
    const parsed = await parseFile(file);
    if (parsed.type !== 'geojson') {
      throw new Error('Selected file has no spatial geometry.');
    }
    const geo = parsed.data;
    const polygonAoi = pickFirstPolygonAoiFeature(geo);
    if (!polygonAoi) {
      throw new Error('AOI must contain at least one Polygon or MultiPolygon geometry.');
    }

    const id = `custom-${Date.now()}-${file.name}`;
    const layerName = addLayerName.trim() || file.name;
    setCustomLayers(prev => [
      ...prev,
      {
        id,
        name: layerName,
        geojson: geo,
        visible: true,
        source: 'upload',
      }
    ]);
    setAddLayerStatus(`Imported AOI data source: ${layerName}`);
    setAddLayerName('');
    setIsAddLayerModalOpen(false);

    const bounds = getGeoJsonBounds(geo);
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
    applyUploadedAoiToAnalysis(geo, layerName);
  };

  const handleLayerFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      await importAoiDataSourceFile(file);
    } catch (error) {
      console.error('Failed to add layer', error);
      setAddLayerStatus(error instanceof Error ? error.message : 'Failed to import file layer.');
    } finally {
      event.target.value = '';
    }
  };

  const toggle3DView = () => {
    const mapInstance = mapRef.current?.getMap ? mapRef.current.getMap() : mapRef.current;
    const nextIs3D = true;
    siGlobeWebglFailoverRef.current = false;
    setIs3DView(true);

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

  const siForceGlobeProjection = useCallback(() => {
    const mapInstance = mapRef.current?.getMap ? mapRef.current.getMap() : mapRef.current;
    if (!mapInstance) return;
    if (typeof mapInstance.setProjection === 'function') {
      try {
        mapInstance.setProjection({ name: 'globe' });
      } catch {
      }
    }
    if (typeof mapInstance.easeTo === 'function') {
      try {
        mapInstance.easeTo({
          pitch: Math.max(typeof viewState.pitch === 'number' ? viewState.pitch : 0, 55),
          bearing: typeof viewState.bearing === 'number' ? viewState.bearing : 0,
          duration: 0,
        });
      } catch {
      }
    }
    setIs3DView(true);
  }, [viewState.bearing, viewState.pitch]);

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
    setSiAddLayerWizard('home');
    setAddLayerTab('giscontent');
    setDiscoveredArcgisLayers([]);
    setSelectedDiscoveredArcgisUrl('');
    setAddLayerRemoteUrl('');
    setGisContentCandidates([]);
    setAddingGisContentCandidateId(null);
    setIsAddLayerModalOpen(true);
  };

  const openAoiDataSourceUploader = () => {
    openAddLayerModal();
    setSiAddLayerWizard('source-forms');
    setAddLayerTab('upload');
    setAddLayerStatus('Upload AOI as SHP (.zip), KML/KMZ, or GeoJSON.');
  };

  const closeAddLayerModal = () => {
    setIsAddLayerModalOpen(false);
    setSiAddLayerWizard('home');
    setAddLayerStatus('');
    setDiscoveredArcgisLayers([]);
    setSelectedDiscoveredArcgisUrl('');
    setAddingGisContentCandidateId(null);
  };

  const goSiAddLayerWizardHome = () => {
    setSiAddLayerWizard('home');
    setAddLayerTab('giscontent');
    setAddLayerStatus('');
    setAddingGisContentCandidateId(null);
  };

  useEffect(() => {
    if (!isAddLayerModalOpen || siAddLayerWizard !== 'gis-list') return;
    let cancelled = false;
    setIsLoadingGisContentCandidates(true);
    setAddLayerStatus('');
    loadGisMapSavedLayers()
      .then(layers => {
        if (cancelled) return;
        const candidates = (Array.isArray(layers) ? layers : [])
          .filter((l: any) => l?.type === 'geojson' && l?.data && typeof l?.data === 'object')
          .map((l: any) => ({
            id: String(l.id ?? `gis-${Math.random().toString(36).slice(2)}`),
            name: String(l.name || 'GIS content layer'),
            data: l.data,
            source: l.source === 'arcgis' || l.source === 'upload' || l.source === 'url' ? l.source : undefined,
            sourceUrl: typeof l.url === 'string' ? l.url : undefined,
            authToken: typeof l.authToken === 'string' ? l.authToken : undefined,
            color: typeof l.color === 'string' ? l.color : undefined,
            useArcGisSymbology: typeof l?.symbology?.useArcGisOnline === 'boolean' ? l.symbology.useArcGisOnline : undefined,
            arcgisDrawingInfo:
              l?.arcgisRenderer && typeof l.arcgisRenderer === 'object'
                ? (sanitizeArcgisDrawingInfoForClient({ renderer: l.arcgisRenderer }) as Record<string, unknown> | null)
                : null,
            arcgisLayerDefinition:
              l?.arcgisLayerDefinition && typeof l.arcgisLayerDefinition === 'object'
                ? (slimArcgisLayerDefinitionForStorage(l.arcgisLayerDefinition) ?? null)
                : null,
          }));
        setGisContentCandidates(candidates);
      })
      .catch(() => {
        if (!cancelled) setGisContentCandidates([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingGisContentCandidates(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAddLayerModalOpen, siAddLayerWizard]);

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
      const [res, drawingInfoRaw, pjson] = await Promise.all([
        fetch(finalUrl),
        fetchArcgisLayerDrawingInfo(selectedDiscoveredArcgisUrl, tokenTrim),
        fetchArcgisLayerPjson(selectedDiscoveredArcgisUrl, tokenTrim),
      ]);
      if (!res.ok) throw new Error(`query failed (${res.status})`);
      const data = await res.json();
      if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
        throw new Error('Service did not return GeoJSON features.');
      }
      const arcgisDrawingInfo = drawingInfoRaw ? sanitizeArcgisDrawingInfoForClient(drawingInfoRaw) : null;
      const arcgisLayerDefinition = slimArcgisLayerDefinitionForStorage(pjson) ?? null;
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
          useArcGisSymbology: true,
          arcgisLayerDefinition,
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

  const addGisContentLayerByCandidateId = (candidateId: string) => {
    const picked = gisContentCandidates.find(c => c.id === candidateId);
    if (!picked) {
      setAddLayerStatus('Select a GIS Content layer first.');
      return;
    }
    setAddingGisContentCandidateId(candidateId);
    try {
      const id = `gis-content-${Date.now()}`;
      setCustomLayers(prev => [
        ...prev,
        {
          id,
          name: addLayerName.trim() || picked.name,
          geojson: picked.data,
          visible: true,
          source: picked.source === 'arcgis' ? 'arcgis' : 'api',
          sourceUrl: picked.sourceUrl,
          authToken: picked.authToken,
          color: picked.color || '#22c55e',
          useArcGisSymbology: picked.source === 'arcgis' ? picked.useArcGisSymbology !== false : undefined,
          arcgisDrawingInfo: picked.source === 'arcgis' ? picked.arcgisDrawingInfo ?? null : undefined,
          arcgisLayerDefinition: picked.source === 'arcgis' ? picked.arcgisLayerDefinition ?? null : undefined,
        },
      ]);
      setAddLayerStatus(`Imported from GIS Content: ${picked.name}`);
      setAddLayerName('');
      setIsAddLayerModalOpen(false);
      setSiAddLayerWizard('home');
    } finally {
      setAddingGisContentCandidateId(null);
    }
  };

  const importRemoteUrlLayer = async () => {
    const raw = addLayerRemoteUrl.trim();
    if (!raw) {
      setAddLayerStatus('Enter a remote URL (GeoJSON/ZIP/KML or Raster/Image service endpoint).');
      return;
    }
    setIsImportingRemoteLayer(true);
    setAddLayerStatus('Downloading and parsing remote layer...');
    try {
      const file = await parseRemoteUrlAsFile(raw);
      const parsed = await parseFile(file);
      if (parsed.type !== 'geojson') {
        throw new Error('URL must point to a geospatial source (GeoJSON/KML/KMZ/ZIP or Raster/Image service endpoint).');
      }
      const id = `remote-${Date.now()}`;
      setCustomLayers(prev => [
        ...prev,
        {
          id,
          name: addLayerName.trim() || parsed.filename || 'Remote Layer',
          geojson: parsed.data,
          visible: true,
          source: 'api',
          sourceUrl: raw,
        },
      ]);
      setAddLayerStatus(`Imported remote layer: ${parsed.filename}`);
      setAddLayerName('');
      setAddLayerRemoteUrl('');
      setIsAddLayerModalOpen(false);
    } catch (e) {
      setAddLayerStatus(e instanceof Error ? e.message : 'Failed to import remote URL layer.');
    } finally {
      setIsImportingRemoteLayer(false);
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
      const [drawingInfoRaw, pjson] = await Promise.all([
        fetchArcgisLayerDrawingInfo(layer.sourceUrl, layer.authToken),
        fetchArcgisLayerPjson(layer.sourceUrl, layer.authToken),
      ]);
      const arcgisDrawingInfo = drawingInfoRaw ? sanitizeArcgisDrawingInfoForClient(drawingInfoRaw) : null;
      const arcgisLayerDefinition = slimArcgisLayerDefinitionForStorage(pjson) ?? layer.arcgisLayerDefinition ?? null;
      setCustomLayers(prev =>
        prev.map(item =>
          item.id === layer.id
            ? {
                ...item,
                geojson: data,
                arcgisDrawingInfo: arcgisDrawingInfo ?? item.arcgisDrawingInfo ?? null,
                arcgisLayerDefinition,
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
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [activeDialogLayer]);

  const orderedSiTableFields = useMemo(() => {
    if (!activeDialogLayer) return [] as string[];
    const order = siTableFieldOrderByLayerId[activeDialogLayer.id] ?? [];
    return [...order.filter(f => activeLayerColumns.includes(f)), ...activeLayerColumns.filter(f => !order.includes(f))];
  }, [activeDialogLayer, activeLayerColumns, siTableFieldOrderByLayerId]);

  const activeTableFeatures = useMemo(() => {
    if (!activeDialogLayer) return [] as any[];
    const features = Array.isArray(activeDialogLayer.geojson?.features) ? activeDialogLayer.geojson.features : [];
    return features.slice(0, SI_TABLE_MAX_FEATURES);
  }, [activeDialogLayer]);

  const arcDefSiTable = useMemo(
    () => (activeDialogLayer?.source === 'arcgis' ? activeDialogLayer.arcgisLayerDefinition ?? null : null),
    [activeDialogLayer?.arcgisLayerDefinition, activeDialogLayer?.source],
  );

  const arcFieldsByLowerSi = useMemo(() => buildArcFieldsByLower(arcDefSiTable), [arcDefSiTable]);

  const visibleSiTableFields = useMemo(() => {
    if (!activeDialogLayer) return [] as string[];
    const hidden = hiddenSiTableFieldsByLayerId[activeDialogLayer.id] ?? new Set<string>();
    return orderedSiTableFields.filter(f => !hidden.has(f));
  }, [activeDialogLayer, orderedSiTableFields, hiddenSiTableFieldsByLayerId]);

  const siFilteredTableFeatures = useMemo(() => {
    if (!activeDialogLayer) return [] as any[];
    const cache = siTableFeatureKeyCacheRef.current;
    const domainMode = 'description' as const;

    const getAdv = (ft: any, fieldName: string, raw: any) =>
      getArcDisplayValue(ft, fieldName, raw, arcDefSiTable, arcFieldsByLowerSi, domainMode);

    const getTableSearchText = (ft: any, fieldName: string, mode: SiTableSearchMode) => {
      const value = getAdv(ft, fieldName, ft?.properties?.[fieldName]);
      if (mode === 'description') return value.description || value.display || value.code;
      if (mode === 'code') return value.code;
      return [value.display, value.description, value.code].filter(Boolean).join(' ');
    };

    const passesRuleFilter = (ft: any) => {
      if (!tableFilterField) return true;
      const haystack = getTableSearchText(ft, tableFilterField, 'both').toLowerCase();
      const needle = tableFilterValue.trim().toLowerCase();
      if (tableFilterOperator === 'empty') return haystack.length === 0;
      if (tableFilterOperator === 'not_empty') return haystack.length > 0;
      if (!needle) return true;
      if (tableFilterOperator === 'equals') return haystack === needle;
      if (tableFilterOperator === 'not_equals') return haystack !== needle;
      return haystack.includes(needle);
    };

    const selectedSubset = tableShowSelectedOnly
      ? activeTableFeatures.filter((ft, idx) => tableSelectedKeys.has(siComputeFeatureRowKey(ft, idx, cache)))
      : activeTableFeatures;

    const ruleFiltered = selectedSubset.filter(passesRuleFilter);

    const q = tableSearchText.trim().toLowerCase();
    if (!q) return ruleFiltered;
    const fields = orderedSiTableFields;
    return ruleFiltered.filter(ft =>
      fields.some(fieldName => getTableSearchText(ft, fieldName, tableSearchMode).toLowerCase().includes(q)),
    );
  }, [
    activeDialogLayer,
    activeTableFeatures,
    arcDefSiTable,
    arcFieldsByLowerSi,
    orderedSiTableFields,
    tableFilterField,
    tableFilterOperator,
    tableFilterValue,
    tableShowSelectedOnly,
    tableSearchText,
    tableSearchMode,
    tableSelectedKeys,
  ]);

  const siSymbologyNormalized = useMemo(() => {
    if (!activeDialogLayer) return null;
    const canUseArcGisOnline =
      activeDialogLayer.source === 'arcgis' ||
      Boolean(activeDialogLayer.arcgisDrawingInfo) ||
      Boolean((activeDialogLayer.arcgisLayerDefinition as any)?.drawingInfo) ||
      Boolean(activeDialogLayer.sourceUrl?.trim());
    return normalizeSymbologyForLayer(activeDialogLayer.geojson, activeDialogLayer.source, symbologyDraft, canUseArcGisOnline);
  }, [activeDialogLayer, symbologyDraft]);

  const siSymbologyCtx = useMemo((): SymbologyContext | null => {
    if (!activeDialogLayer?.geojson || !siSymbologyNormalized) return null;
    return buildSymbologyContext(activeDialogLayer.geojson, siSymbologyNormalized);
  }, [activeDialogLayer?.geojson, siSymbologyNormalized]);

  const arcgisRendererType = useMemo(
    () => String((activeDialogLayer?.arcgisDrawingInfo as any)?.renderer?.type || ''),
    [activeDialogLayer],
  );
  const canUseArcGisOnline = useMemo(
    () =>
      Boolean(
        activeDialogLayer &&
          (activeDialogLayer.source === 'arcgis' ||
            activeDialogLayer.arcgisDrawingInfo ||
            (activeDialogLayer.arcgisLayerDefinition as any)?.drawingInfo ||
            activeDialogLayer.sourceUrl?.trim()),
      ),
    [activeDialogLayer],
  );

  useEffect(() => {
    if (!activeLayerActionDialog || activeLayerActionDialog.mode !== 'table') return;
    siTableFeatureKeyCacheRef.current = new Map();
    setTableSearchText('');
    setTableSearchMode('description');
    setTableFilterField('');
    setTableFilterOperator('contains');
    setTableFilterValue('');
    setTableShowSelectedOnly(false);
    setTableSelectedKeys(new Set());
    setTableToolsCollapsed(true);
    setDraggingSiTableField(null);
  }, [activeLayerActionDialog]);

  useEffect(() => {
    if (!activeLayerActionDialog || activeLayerActionDialog.mode !== 'symbology' || !activeDialogLayer) return;
    const di = activeDialogLayer.arcgisDrawingInfo as any;
    const ren = di?.renderer;
    const t = String(ren?.type || '');
    let maxCat = 8;
    if (t === 'uniqueValue' && Array.isArray(ren.uniqueValueInfos)) {
      const n = ren.uniqueValueInfos.length;
      maxCat = n > 0 ? Math.min(8, n) : 8;
    } else if (t === 'classBreaks' && Array.isArray(ren.classBreakInfos)) {
      const n = ren.classBreakInfos.filter((br: any) => Number.isFinite(Number(br?.maxValue))).length;
      maxCat = n > 0 ? Math.min(8, n) : 8;
    }
    const savedSym = activeDialogLayer.symbology;
    const resolvedUseArcGisOnline = !canUseArcGisOnline
      ? false
      : typeof savedSym?.useArcGisOnline === 'boolean'
        ? savedSym.useArcGisOnline
        : typeof activeDialogLayer.useArcGisSymbology === 'boolean'
          ? activeDialogLayer.useArcGisSymbology
          : true;
    const inferred = inferVisualizationFromArcgisRenderer(ren);
    const base: SymbologyConfig = {
      ...savedSym,
      ...inferred,
      useArcGisOnline: resolvedUseArcGisOnline,
    };
    const normalized = normalizeSymbologyForLayer(activeDialogLayer.geojson, activeDialogLayer.source, base, canUseArcGisOnline);
    setSymbologyDraft({
      ...normalized,
      arcgisMaxCategories: maxCat,
    });
  }, [activeLayerActionDialog, activeDialogLayer, canUseArcGisOnline]);

  const applySymbologyDraft = async () => {
    if (!activeDialogLayer) return;
    try {
      const normalized = normalizeSymbologyForLayer(
        activeDialogLayer.geojson,
        activeDialogLayer.source,
        symbologyDraft,
        canUseArcGisOnline,
      );
      const symbologyToSave: SymbologyConfig = {
        useArcGisOnline: canUseArcGisOnline ? normalized.useArcGisOnline : false,
        style: normalized.style,
        field: normalized.field,
        classes: normalized.classes,
        method: normalized.method,
        colorRamp: normalized.colorRamp,
        threshold: normalized.threshold,
      };

      const hasArcgisRendererSupport =
        activeDialogLayer.source === 'arcgis' ||
        Boolean(activeDialogLayer.arcgisDrawingInfo) ||
        Boolean((activeDialogLayer.arcgisLayerDefinition as any)?.drawingInfo);

      const rampHex = SI_SYMBOLOGY_BAKE_RAMPS[normalized.colorRamp];
      const nextColor =
        normalized.style === 'unique'
          ? activeDialogLayer.color || '#22c55e'
          : rampHex[Math.max(0, Math.min(rampHex.length - 1, normalized.classes - 1))] ?? '#22c55e';

      if (hasArcgisRendererSupport) {
        let di =
          activeDialogLayer.arcgisDrawingInfo ??
          (sanitizeArcgisDrawingInfoForClient((activeDialogLayer.arcgisLayerDefinition as any)?.drawingInfo) as Record<
            string,
            unknown
          > | null);
        if (!di && activeDialogLayer.sourceUrl?.trim()) {
          const raw = await fetchArcgisLayerDrawingInfo(activeDialogLayer.sourceUrl!, activeDialogLayer.authToken);
          di = (raw && sanitizeArcgisDrawingInfoForClient(raw)) || null;
        }

        if (symbologyDraft.useArcGisOnline) {
          if (!di || !arcgisDrawingInfoToFillPaint(di)) {
            setStacStatus('Could not load a supported ArcGIS renderer (drawingInfo) for this layer.');
            return;
          }
          const baked =
            applySymbologyToArcgisDrawingInfo(
              di as Record<string, unknown>,
              'service',
              arcgisRendererType === 'simple' ? 1 : symbologyDraft.arcgisMaxCategories,
            ) ?? (sanitizeArcgisDrawingInfoForClient(di) as Record<string, unknown> | null);
          if (!baked || !arcgisDrawingInfoToFillPaint(baked)) {
            setStacStatus('Could not apply symbology to this layer renderer.');
            return;
          }
          setCustomLayers(prev =>
            prev.map(l =>
              l.id === activeDialogLayer.id
                ? { ...l, arcgisDrawingInfo: baked, useArcGisSymbology: true, color: nextColor, symbology: symbologyToSave }
                : l,
            ),
          );
        } else {
          const maxForBake = normalized.classes;
          const baked = di
            ? applySymbologyToArcgisDrawingInfo(di as Record<string, unknown>, normalized.colorRamp, maxForBake)
            : null;
          setCustomLayers(prev =>
            prev.map(l =>
              l.id === activeDialogLayer.id
                ? {
                    ...l,
                    arcgisDrawingInfo: baked ?? l.arcgisDrawingInfo ?? null,
                    useArcGisSymbology: false,
                    color: nextColor,
                    symbology: symbologyToSave,
                  }
                : l,
            ),
          );
        }
        setActiveLayerActionDialog(null);
        setStacStatus(`Style saved for "${activeDialogLayer.name}".`);
        return;
      }

      setCustomLayers(prev =>
        prev.map(l =>
          l.id === activeDialogLayer.id ? { ...l, useArcGisSymbology: false, color: nextColor, symbology: symbologyToSave } : l,
        ),
      );
      setActiveLayerActionDialog(null);
      setStacStatus(`Style saved for "${activeDialogLayer.name}".`);
    } catch (e) {
      setStacStatus(e instanceof Error ? e.message : 'Failed to save style.');
    }
  };

  const updateSymbologyDraft = useCallback(
    (patch: Partial<SiSymbologyDraft>) => {
      setSymbologyDraft(prev => {
        if (!activeDialogLayer) return prev;
        let merged: SiSymbologyDraft = { ...prev, ...patch };
        if (patch.useArcGisOnline === true) {
          const ren =
            (activeDialogLayer.arcgisDrawingInfo as any)?.renderer ??
            (activeDialogLayer.arcgisLayerDefinition as any)?.drawingInfo?.renderer;
          merged = { ...merged, ...inferVisualizationFromArcgisRenderer(ren) };
        }
        const normalized = normalizeSymbologyForLayer(
          activeDialogLayer.geojson,
          activeDialogLayer.source,
          merged,
          canUseArcGisOnline,
        );
        return { ...normalized, arcgisMaxCategories: merged.arcgisMaxCategories };
      });
    },
    [activeDialogLayer, canUseArcGisOnline],
  );

  const moveSiTableColumn = (from: string, to: string) => {
    if (!activeDialogLayer || !from || !to || from === to) return;
    const current = orderedSiTableFields.slice();
    const fromIndex = current.indexOf(from);
    const toIndex = current.indexOf(to);
    if (fromIndex < 0 || toIndex < 0) return;
    current.splice(fromIndex, 1);
    current.splice(toIndex, 0, from);
    setSiTableFieldOrderByLayerId(prev => ({ ...prev, [activeDialogLayer.id]: current }));
  };

  const moveSiTableColumnByOffset = (fieldName: string, offset: number) => {
    if (!activeDialogLayer) return;
    const current = orderedSiTableFields.slice();
    const fromIndex = current.indexOf(fieldName);
    const toIndex = fromIndex + offset;
    if (fromIndex < 0 || toIndex < 0 || toIndex >= current.length) return;
    current.splice(fromIndex, 1);
    current.splice(toIndex, 0, fieldName);
    setSiTableFieldOrderByLayerId(prev => ({ ...prev, [activeDialogLayer.id]: current }));
  };

  const renderSiTableHighlightedValue = (text: string) => {
    const q = tableSearchText.trim();
    if (!q) return text;
    const lower = text.toLowerCase();
    const at = lower.indexOf(q.toLowerCase());
    if (at < 0) return text;
    return (
      <>
        {text.slice(0, at)}
        <mark className="gis-table-match">{text.slice(at, at + q.length)}</mark>
        {text.slice(at + q.length)}
      </>
    );
  };

  const zoomSiTableToSelection = () => {
    const map = mapRef.current?.getMap?.() ?? mapRef.current;
    if (!map || !activeDialogLayer) return;
    const cache = siTableFeatureKeyCacheRef.current;
    const selectedFeatures = activeTableFeatures.filter((ft, idx) =>
      tableSelectedKeys.has(siComputeFeatureRowKey(ft, idx, cache)),
    );
    if (!selectedFeatures.length) return;
    const fc = { type: 'FeatureCollection', features: selectedFeatures };
    const bounds = getGeoJsonBounds(fc);
    if (!bounds || typeof map.fitBounds !== 'function') return;
    map.fitBounds(
      [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[3]],
      ],
      { padding: 80, duration: 800, maxZoom: 16 },
    );
  };

  const siTableGoHome = () => {
    const map = mapRef.current?.getMap?.() ?? mapRef.current;
    if (!map || !activeDialogLayer?.geojson) return;
    const bounds = getGeoJsonBounds(activeDialogLayer.geojson);
    if (!bounds || typeof map.fitBounds !== 'function') return;
    map.fitBounds(
      [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[3]],
      ],
      { padding: 80, duration: 800 },
    );
  };

  const exportTableAsCsv = () => {
    if (!activeDialogLayer || !visibleSiTableFields.length) return;
    const domainMode = 'description' as const;
    const escapeCsv = (value: unknown) => {
      const text = value === null || value === undefined ? '' : String(value);
      return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const header = visibleSiTableFields.map(escapeCsv).join(',');
    const rows = siFilteredTableFeatures.map(ft =>
      visibleSiTableFields
        .map(f =>
          escapeCsv(getArcDisplayValue(ft, f, ft?.properties?.[f], arcDefSiTable, arcFieldsByLowerSi, domainMode).display),
        )
        .join(','),
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${siSanitizeTableFileName(activeDialogLayer.name)}-descriptions.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const saveSiTableFormat = () => {
    if (!activeDialogLayer) return;
    const payload = {
      displayMode: 'description' as const,
      searchMode: tableSearchMode,
      hiddenFields: Array.from(hiddenSiTableFieldsByLayerId[activeDialogLayer.id] ?? []),
      fieldOrder: orderedSiTableFields,
      filter: { field: tableFilterField, operator: tableFilterOperator, value: tableFilterValue },
    };
    try {
      localStorage.setItem(`si-table-format:${activeDialogLayer.id}`, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  };

  const applySiTableFormat = () => {
    if (!activeDialogLayer) return;
    try {
      const raw = localStorage.getItem(`si-table-format:${activeDialogLayer.id}`);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.searchMode === 'description' || parsed?.searchMode === 'code' || parsed?.searchMode === 'both') {
        setTableSearchMode(parsed.searchMode);
      }
      if (Array.isArray(parsed?.hiddenFields)) {
        setHiddenSiTableFieldsByLayerId(prev => ({
          ...prev,
          [activeDialogLayer.id]: new Set(parsed.hiddenFields.map(String)),
        }));
      }
      if (Array.isArray(parsed?.fieldOrder)) {
        setSiTableFieldOrderByLayerId(prev => ({ ...prev, [activeDialogLayer.id]: parsed.fieldOrder.map(String) }));
      }
      if (parsed?.filter && typeof parsed.filter === 'object') {
        setTableFilterField(typeof parsed.filter.field === 'string' ? parsed.filter.field : '');
        setTableFilterOperator(
          ['contains', 'equals', 'not_equals', 'empty', 'not_empty'].includes(parsed.filter.operator)
            ? parsed.filter.operator
            : 'contains',
        );
        setTableFilterValue(typeof parsed.filter.value === 'string' ? parsed.filter.value : '');
      }
    } catch {
      /* ignore */
    }
  };

  const handleLayerActionClick = async (
    event: React.MouseEvent<HTMLButtonElement>,
    action: 'sync' | 'table' | 'symbology' | 'legend' | 'remove' | 'rename' | 'editAoi',
    layerId: string,
  ) => {
    event.stopPropagation();
    const layer = customLayers.find(item => item.id === layerId);
    if (!layer) return;
    if (action === 'remove') {
      const ok = await appConfirm(
        `Remove layer "${layer.name}" from the map? It will stay removed after you refresh the page.`,
        { title: 'Remove layer', danger: true, confirmLabel: 'Remove', cancelLabel: 'Cancel' },
      );
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
    if (action === 'rename') {
      const nextNameRaw = window.prompt('Rename layer', layer.name);
      if (nextNameRaw === null) return;
      const nextName = nextNameRaw.trim();
      if (!nextName) {
        setStacStatus('Layer name cannot be empty.');
        return;
      }
      setCustomLayers(prev => prev.map(item => (item.id === layerId ? { ...item, name: nextName } : item)));
      setStacStatus(`Layer renamed to "${nextName}".`);
      return;
    }
    if (action === 'editAoi') {
      const applied = applyUploadedAoiToAnalysis(layer.geojson, layer.name);
      if (!applied) {
        setStacStatus('Selected AOI layer has no valid polygon geometry.');
        return;
      }
      focusGeoJsonOnMap(layer.geojson);
      setStacStatus(`AOI analysis now uses "${layer.name}".`);
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
    const range = selectedIndexConfig.range;
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
    if (!synthetic.length) {
      setFieldAnalysisStatus('No weekly windows in the selected date range.');
      setFieldTimelineSessionActive(false);
      return;
    }
    setWeeklyComposites(synthetic);
    setFieldTimelineSessionActive(true);
    setFieldAnalysisStatus(`Timeline ready: ${synthetic.length} week(s) for ${selectedIndexConfig.label}.`);
  };

  const stopFieldAnalysisTimeline = useCallback(() => {
    setIsTimelinePlaying(false);
    setWeeklyComposites([]);
    setFieldTimelineSessionActive(false);
    setFieldAnalysisStatus('Timeline stopped. Adjust the date range and tap Generate timeline to start again.');
  }, []);

  useEffect(() => {
    if (weeklyComposites.length === 0) setFieldTimelineSessionActive(false);
  }, [weeklyComposites.length]);

  /** Same control: generate weekly strip, or stop playback and clear it for a fresh run. */
  const onFieldAnalysisTimelinePrimaryClick = () => {
    if (fieldTimelineSessionActive) {
      stopFieldAnalysisTimeline();
      return;
    }
    generateFieldAnalysisTimeline();
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
    setProcessingTargetStacItem(item);
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

  const downloadStacExploreItem = (item: any) => {
    closeStacAddMenu();
    const collRaw = getStacItemCollection(item);
    const idRaw = item?.id != null ? String(item.id) : 'item';
    const safe = (s: string) =>
      s
        .trim()
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
        .replace(/\s+/g, '_')
        .slice(0, 96) || 'item';
    const filename = `stac-item_${safe(collRaw)}_${safe(idRaw)}.json`;
    try {
      downloadTextFile(filename, JSON.stringify(item, null, 2), 'application/json');
      setStacStatus(`Downloaded STAC item: ${filename}`);
    } catch (e) {
      setStacStatus(e instanceof Error ? e.message : 'Download failed.');
    }
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
      setProcessingTargetStacItem(parsed.item);
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
        const stableKey = stacItemStableKey(item);
        return {
          type: 'Feature' as const,
          properties: {
            id: String(item.id ?? ''),
            collection: String(item.collection ?? ''),
            datetime: String(item.properties?.datetime ?? ''),
            stacKey: stableKey,
          },
          geometry,
        };
      })
      .filter((f): f is NonNullable<typeof f> => f != null);
    return { type: 'FeatureCollection' as const, features };
  }, [stacItems]);

  const stacItemsByStableKey = useMemo(() => {
    const m = new Map<string, any>();
    for (const item of stacItems) {
      m.set(stacItemStableKey(item), item);
    }
    return m;
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

  const analysisEngineBaseUrl = useMemo(() => getAnalysisEngineBaseUrl(), []);
  const effectiveAnalysisEngineBaseUrl = analysisEngineBaseUrl || runtimeAnalysisEngineBaseUrl;

  useEffect(() => {
    if (analysisEngineBaseUrl) return;
    if (runtimeAnalysisEngineBaseUrl) return;
    if (expandedEnvSection !== 'explore-stac') return;
    let cancelled = false;
    void probeAnalysisEngineBaseUrl().then(url => {
      if (!cancelled && url) setRuntimeAnalysisEngineBaseUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [analysisEngineBaseUrl, runtimeAnalysisEngineBaseUrl, expandedEnvSection]);

  const resolveExploreAoiFeature = useCallback((): GeoJSON.Feature => {
    const drawnGeom = drawnGeometry?.geometry;
    const pivotGeom = selectedPivot?.feature?.geometry;
    const fcBounds = getGeoJsonBounds(pivotGeoJson);
    if (exploreExtentMode === 'drawn' && drawnGeom) {
      return { type: 'Feature', geometry: drawnGeom, properties: { source: 'drawn' } };
    }
    if (exploreExtentMode === 'layer') {
      if (pivotGeom) return { type: 'Feature', geometry: pivotGeom, properties: { source: 'layer' } };
      if (fcBounds) return bboxToPolygonFeature(fcBounds[0], fcBounds[1], fcBounds[2], fcBounds[3]);
    }
    if (exploreExtentMode === 'manual') {
      const n = parseFloat(exploreManualBbox.north);
      const s = parseFloat(exploreManualBbox.south);
      const e = parseFloat(exploreManualBbox.east);
      const w = parseFloat(exploreManualBbox.west);
      if ([n, s, e, w].every(Number.isFinite)) return bboxToPolygonFeature(w, s, e, n);
    }
    if (exploreExtentMode === 'map') {
      const map = mapRef.current?.getMap?.() ?? mapRef.current;
      try {
        const b = map?.getBounds?.();
        if (b) return bboxToPolygonFeature(b.getWest(), b.getSouth(), b.getEast(), b.getNorth());
      } catch {
        /* ignore map getBounds issues */
      }
    }
    return { type: 'Feature', geometry: DUBAI_STAC_INTERSECTS, properties: { source: 'default' } };
  }, [drawnGeometry, selectedPivot, pivotGeoJson, exploreExtentMode, exploreManualBbox]);

  const findCompatibleStacItemForTemplate = useCallback(
    async (
      templateId: MpcTemplateId,
      aoi: GeoJSON.Feature,
      dStart: string,
      dEnd: string,
      collectionOverride?: string[],
      indexOverride?: string,
    ): Promise<any | null> => {
      try {
        const effectiveCollections = (collectionOverride?.length ? collectionOverride : exploreSelectedCollectionIds)
          .map(v => String(v || '').trim())
          .filter(Boolean);
        if (!effectiveCollections.length) return null;
        const res = await fetch(stacActiveSearchUrl, {
          method: 'POST',
          headers: buildStacRequestHeaders(stacConnection),
          body: JSON.stringify({
            collections: effectiveCollections,
            intersects: aoi.geometry,
            datetime: `${dStart}/${dEnd}`,
            limit: Math.max(20, Math.min(120, exploreLimit)),
            query: exploreUseCloudFilter ? { 'eo:cloud_cover': { lte: Number(exploreCloudCoverMax) } } : undefined,
          }),
        });
        if (!res.ok) return null;
        const json = await res.json();
        const features = Array.isArray(json?.features) ? json.features : [];
        for (const item of features) {
          const assets = (item?.assets && typeof item.assets === 'object' ? item.assets : {}) as Record<string, unknown>;
          const names = new Set(Object.keys(assets).map(k => String(k).toLowerCase()));
          const specs = buildProcessingPreviewSpecsForItem(templateId, item, indexOverride).filter(spec =>
            spec.assets.every(a => names.has(String(a).toLowerCase())),
          );
          if (specs.length) return item;
        }
        return null;
      } catch {
        return null;
      }
    },
    [
      stacActiveSearchUrl,
      stacConnection,
      exploreSelectedCollectionIds,
      exploreLimit,
      exploreUseCloudFilter,
      exploreCloudCoverMax,
    ],
  );

  const runMpcTemplateProcessing = async (templateOverride?: MpcTemplateId, forcedTargetItem?: any, indexOverride?: string) => {
    const templateToRun = templateOverride ?? selectedMpcTemplateId;
    const selectedKey = exploreSelectedResultKeys[0];
    const selectedItemFromResults = selectedKey
      ? exploreSortedStacItems.find((x: any) => stacItemStableKey(x) === selectedKey) ?? null
      : null;
    const targetItem = forcedTargetItem ?? processingTargetStacItem ?? selectedItemFromResults;
    if (!targetItem) {
      setStacStatus('Add STAC scene to Current Map (or select one scene in Results) before running template.');
      return;
    }
    const targetCollection = getStacItemCollection(targetItem);
    const effectiveCollections = exploreSelectedCollectionIds.length
      ? [...exploreSelectedCollectionIds]
      : targetCollection
        ? [targetCollection]
        : [];
    if (!effectiveCollections.length) {
      setStacStatus('Select at least one collection in Parameters tab.');
      return;
    }
    const dStart = exploreEffectiveDatetime.start;
    const dEnd = exploreEffectiveDatetime.end;
    if (!dStart || !dEnd) {
      setStacStatus('Set start and end date in Date and Time.');
      return;
    }
    const aoi = resolveExploreAoiFeature();
    setMpcProcessResult(null);
    setProcessingTargetStacItem(targetItem);

    if (!effectiveAnalysisEngineBaseUrl) {
      try {
        let effectiveItem = targetItem;
        const coll = getStacItemCollection(targetItem);
        const itemId = getStacItemIdForThumb(targetItem);
        if (!coll || !itemId) throw new Error('Missing STAC collection/item id for selected scene.');
        let bbox = Array.isArray(targetItem?.bbox) && targetItem.bbox.length >= 4 ? (targetItem.bbox as number[]) : null;
        if (!bbox && targetItem?.geometry) {
          const gbounds = getGeoJsonBounds({ type: 'Feature', geometry: targetItem.geometry, properties: {} });
          if (gbounds) bbox = [...gbounds];
        }
        if (!bbox || bbox.length < 4) throw new Error('Scene bbox is missing; cannot place processed preview on map.');
        const availableAssets = new Set(
          Object.keys((effectiveItem?.assets && typeof effectiveItem.assets === 'object' ? effectiveItem.assets : {}) as Record<string, unknown>).map(k =>
            String(k).toLowerCase(),
          ),
        );
        let specs = buildProcessingPreviewSpecsForItem(templateToRun, effectiveItem, indexOverride).filter(spec =>
          spec.assets.every(a => availableAssets.has(String(a).toLowerCase())),
        );
        if (!specs.length) {
            const autoItem = await findCompatibleStacItemForTemplate(
              templateToRun,
              aoi,
              dStart,
              dEnd,
              effectiveCollections,
              indexOverride,
            );
          if (autoItem) {
            effectiveItem = autoItem;
            setProcessingTargetStacItem(autoItem);
            const assets2 = (autoItem?.assets && typeof autoItem.assets === 'object' ? autoItem.assets : {}) as Record<string, unknown>;
            const names2 = new Set(Object.keys(assets2).map(k => String(k).toLowerCase()));
            specs = buildProcessingPreviewSpecsForItem(templateToRun, autoItem, indexOverride).filter(spec =>
              spec.assets.every(a => names2.has(String(a).toLowerCase())),
            );
          }
          if (!specs.length) {
            throw new Error(
              `Scene is missing required bands for ${templateToRun}. Available assets: ${
                Array.from(availableAssets).slice(0, 20).join(', ') || 'none'
              }`,
            );
          }
        }
        const effColl = getStacItemCollection(effectiveItem);
        const effItemId = getStacItemIdForThumb(effectiveItem);
        if (!effColl || !effItemId) throw new Error('Could not resolve compatible STAC item for rendering.');
        const renderBbox = mpcClipToAoi && aoi ? (getGeoJsonBounds(aoi as any) as [number, number, number, number] | null) : null;
        const targetBbox = renderBbox && renderBbox.every(v => Number.isFinite(v)) ? renderBbox : (bbox as [number, number, number, number]);
        const latMid = ((targetBbox[1] + targetBbox[3]) / 2) * (Math.PI / 180);
        const metersPerDegLat = 110540;
        const metersPerDegLon = 111320 * Math.max(0.2, Math.cos(latMid));
        const pixelW10m = Math.max(256, Math.min(4096, Math.round(((targetBbox[2] - targetBbox[0]) * metersPerDegLon) / 10)));
        const pixelH10m = Math.max(256, Math.min(4096, Math.round(((targetBbox[3] - targetBbox[1]) * metersPerDegLat) / 10)));
        const urls = [1, 0.75, 0.5].flatMap(scale =>
          specs.map(spec =>
            buildPcProcessingPreviewPngUrl(
              effColl,
              effItemId,
              spec,
              2048,
              targetBbox,
              Math.round(pixelW10m * scale),
              Math.round(pixelH10m * scale),
            ),
          ),
        );
        let blobUrl = await fetchStacMapOverlayBlobUrl(urls);
        if (!blobUrl) {
          const genericCandidates = getStacItemThumbCandidateUrls(effectiveItem, stacConnection, { forMapOverlay: true });
          blobUrl = await fetchStacMapOverlayBlobUrl(genericCandidates);
        }
        if (!blobUrl) throw new Error('Could not render processing template preview for this scene. Check required scene assets or enable backend URL.');
        const [w, s, e, n] = targetBbox;
        setStacMapThumb(prev => {
          revokeStacMapOverlayBlob(prev?.url);
          return { url: blobUrl, coordinates: bboxToRgCoordinates([w, s, e, n]) };
        });
        setIsStacThumbVisible(true);
        setStacMapThumbLabel(`STAC imagery (${templateToRun}): ${effItemId}`);
        setMpcProcessResult({
          ok: true,
          template_id: templateToRun,
          collections: [effColl],
          datetime: `${dStart}/${dEnd}`,
          item_count: 1,
          detail: 'Frontend render mode (no analysis backend URL configured).',
          label: LOCAL_PROCESSING_TEMPLATES.find(t => t.id === templateToRun)?.label ?? templateToRun,
          processing: {
            clip_to_aoi: mpcClipToAoi,
            tile_size: Math.max(256, Math.min(4096, Number(mpcTileSize) || 1024)),
            mode: 'frontend preview mode',
          },
        } as MpcProcessResult);
        setStacStatus('Processing template applied to the added STAC layer (frontend mode).');
      } catch (err) {
        setStacStatus(err instanceof Error ? err.message : 'Processing failed.');
      }
      return;
    }

    try {
      const result = await mpcProcess(effectiveAnalysisEngineBaseUrl, {
        aoi,
        collections: effectiveCollections,
        datetime: `${dStart}/${dEnd}`,
        template_id: templateToRun,
        max_items: Math.max(1, Math.min(80, exploreLimit)),
        max_cloud_cover: exploreUseCloudFilter ? exploreCloudCoverMax : undefined,
        catalog_url: DEFAULT_MPC_CATALOG_URL,
        acs_zip_path: DEFAULT_MPC_ACS_ZIP_PATH,
        clip_to_aoi: mpcClipToAoi,
        tile_size: Math.max(256, Math.min(4096, Number(mpcTileSize) || 1024)),
      });
      setMpcProcessResult(result);
      setStacStatus(`Processing template completed: ${result.label || result.template_id}.`);
    } catch (err) {
      setStacStatus(err instanceof Error ? err.message : 'Processing failed.');
    }
  };

  async function runRsAnalysisFromAssistant(options?: {
    keepCurrentSection?: boolean;
    forcedIndex?: string;
    /** When true, do not rebuild the weekly timeline or open static charts (map Run = clip AOI + layer only). */
    skipTimelineAndCharts?: boolean;
  }) {
    if (!drawnGeometry) {
      setFieldAnalysisStatus('Draw AOI first, then press Run Analysis.');
      setMapDrawTool('polygon');
      return;
    }

    const templateByIndex: Record<string, MpcTemplateId> = {
      NDVI: 'ndvi_s2',
      NDMI: 'ndmi_s2',
      NDWI: 'false_color_s2',
      SAVI: 'ndvi_s2',
      EVI: 'ndvi_s2',
      GNDVI: 'ndvi_s2',
      NBR: 'false_color_s2',
      NDRE: 'ndvi_s2',
      BSI: 'false_color_s2',
      MNDWI: 'false_color_s2',
      LST: 'false_color_s2',
    };

    const activeIndex = options?.forcedIndex || wmsLayerSelectValue || selectedIndex;
    const template = templateByIndex[activeIndex] ?? 'ndvi_s2';
    const selectedTemplate = LOCAL_PROCESSING_TEMPLATES.find(t => t.id === template);
    const templateCollections = selectedTemplate?.collections ?? ['sentinel-2-l2a'];
    setSelectedMpcTemplateId(template);
    // Map "Run" (skipTimelineAndCharts) must only affect analysis rasters — not turn on pivot-wide fills,
    // which look like a global green tint over the basemap outside the AOI.
    if (options?.skipTimelineAndCharts) {
      setShowFieldBoundaries(false);
      setShowProductivityZones(false);
    } else {
      setShowFieldBoundaries(true);
      setShowProductivityZones(true);
    }
    setMpcClipToAoi(true);
    setIsWmsOverlayVisible(true);

    const dStart = exploreEffectiveDatetime.start || timeSeriesStart;
    const dEnd = exploreEffectiveDatetime.end || timeSeriesEnd;
    const drawnGeom = drawnGeometry?.geometry as GeoJSON.Geometry | undefined;
    const aoi: GeoJSON.Feature = drawnGeom
      ? { type: 'Feature', geometry: drawnGeom, properties: { source: 'drawn' } }
      : resolveExploreAoiFeature();
    if (!aoi || !dStart || !dEnd) {
      setIsStacThumbVisible(false);
      setFieldAnalysisStatus('Set AOI and date range before running analysis.');
      return;
    }

    let target = processingTargetStacItem;
    if (!target) {
      target = await findCompatibleStacItemForTemplate(template, aoi, dStart, dEnd, templateCollections, activeIndex);
    }
    if (!target) {
      setIsStacThumbVisible(false);
      setFieldAnalysisStatus(
        'No Sentinel scene in the catalog for this AOI and date range. WMS is clipped to your AOI; adjust dates or add a scene from Explore STAC.',
      );
      return;
    }

    setProcessingTargetStacItem(target);
    // Keep Explore STAC tab isolated from Remote Sensing state.
    setIsStacThumbVisible(true);
    await runMpcTemplateProcessing(template, target, activeIndex);
    if (!options?.keepCurrentSection) {
      setExpandedEnvSection('remote-sensing');
    }
    // Keep the legacy environmental index in sync whenever selected RS index is natively supported.
    if (Object.prototype.hasOwnProperty.call(ENVIRONMENTAL_INDICES, activeIndex)) {
      setSelectedIndex(activeIndex as EnvironmentalIndexId);
      setWmsLayer(activeIndex);
    }
    if (!options?.skipTimelineAndCharts) {
      generateFieldAnalysisTimeline();
    }
    setFieldAnalysisStatus(`Run completed for ${activeIndex}. Results rendered inside AOI.`);
  }

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

  const aoiFiveClassLegend = useMemo(() => {
    const cfg = selectedIndexConfig;
    const fallbackMin = cfg.range[0];
    const fallbackMax = cfg.range[1];
    let minV = drawnStats ? Math.max(fallbackMin, Math.min(fallbackMax, drawnStats.min)) : fallbackMin;
    let maxV = drawnStats ? Math.max(fallbackMin, Math.min(fallbackMax, drawnStats.max)) : fallbackMax;
    if (!Number.isFinite(minV) || !Number.isFinite(maxV) || maxV <= minV) {
      minV = fallbackMin;
      maxV = fallbackMax;
    }
    const span = maxV - minV;
    if (span < (fallbackMax - fallbackMin) * 0.08) {
      minV = fallbackMin;
      maxV = fallbackMax;
    }
    const step = (maxV - minV) / 5;
    return Array.from({ length: 5 }).map((_, i) => {
      const lower = Number((minV + i * step).toFixed(3));
      const upper = Number((i === 4 ? maxV : minV + (i + 1) * step).toFixed(3));
      return {
        idx: i,
        lower,
        upper,
        color: rampColorAt(cfg.palette, i, 5),
        label: `Class ${i + 1}: ${lower.toFixed(2)} - ${upper.toFixed(2)}`,
      };
    });
  }, [selectedIndexConfig, drawnStats]);

  const aoiHeatPointGeoJson = useMemo(() => {
    if (!drawnGeometry?.geometry || !mpcProcessResult) return null;
    const bounds = getGeoJsonBounds(drawnGeometry as any);
    if (!bounds) return null;
    const [w, s, e, n] = bounds;
    if (![w, s, e, n].every(Number.isFinite) || e <= w || n <= s) return null;
    const width = e - w;
    const height = n - s;
    const aspect = width / Math.max(height, 1e-9);
    const cols = Math.max(22, Math.min(56, Math.round(34 * Math.max(0.6, Math.min(1.8, aspect)))));
    const rows = Math.max(22, Math.min(56, Math.round(34 / Math.max(0.6, Math.min(1.8, aspect)))));
    const dx = width / cols;
    const dy = height / rows;
    const minV = mpcProcessResult.statistics?.min ?? aoiFiveClassLegend[0]?.lower ?? -1;
    const maxV = mpcProcessResult.statistics?.max ?? aoiFiveClassLegend[aoiFiveClassLegend.length - 1]?.upper ?? 1;
    const meanV = mpcProcessResult.statistics?.mean ?? (minV + maxV) / 2;
    const span = Math.max(1e-9, maxV - minV);
    const seed = selectedIndex.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const features: any[] = [];
    for (let yy = 0; yy < rows; yy += 1) {
      for (let xx = 0; xx < cols; xx += 1) {
        const cx = w + (xx + 0.5) * dx;
        const cy = s + (yy + 0.5) * dy;
        if (!pointInAoiGeometry(cx, cy, drawnGeometry.geometry)) continue;
        const gx = (xx + 0.5) / cols;
        const gy = (yy + 0.5) / rows;
        const wave = Math.sin((xx + seed * 0.01) * 0.9) * 0.12 + Math.cos((yy + seed * 0.02) * 0.85) * 0.1;
        const gradient = gx * 0.55 + gy * 0.35 + wave;
        const normalized = clampUnit(gradient);
        const value = minV + normalized * span * 0.82 + (meanV - minV) * 0.18;
        const classIdx = Math.max(0, Math.min(4, Math.floor(((value - minV) / span) * 5)));
        const cls = aoiFiveClassLegend[classIdx] ?? aoiFiveClassLegend[0];
        features.push({
          type: 'Feature',
          properties: {
            value: Number(value.toFixed(3)),
            weight: Number(clampUnit((value - minV) / span).toFixed(4)),
            classId: classIdx + 1,
            classLabel: cls?.label ?? `Class ${classIdx + 1}`,
            color: cls?.color ?? '#22c55e',
          },
          geometry: {
            type: 'Point',
            coordinates: [cx, cy],
          },
        });
      }
    }
    return { type: 'FeatureCollection', features };
  }, [drawnGeometry, aoiFiveClassLegend, selectedIndex, mpcProcessResult]);

  const aoiHeatmapColorExpression = useMemo(() => {
    const c = aoiFiveClassLegend.map(x => x.color);
    return [
      'interpolate',
      ['linear'],
      ['heatmap-density'],
      0.0, 'rgba(0,0,0,0)',
      0.18, c[0] ?? '#7c3aed',
      0.36, c[1] ?? '#3b82f6',
      0.56, c[2] ?? '#22c55e',
      0.78, c[3] ?? '#f59e0b',
      1.0, c[4] ?? '#ef4444',
    ] as any;
  }, [aoiFiveClassLegend]);

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
    const cfg = selectedIndexConfig;
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
  }, [selectedIndexConfig, showFieldBoundaries, showProductivityZones]);

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

  useEffect(() => {
    return () => {
      if (drawFadeRafRef.current != null) cancelAnimationFrame(drawFadeRafRef.current);
    };
  }, []);

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
    setGeoExplorerVisibleCount(GEO_AI_CHAT_PAGE_SIZE);
    setGeoExplorerDraft('');
    setGeoExplorerPendingImage(null);
    setGeoExplorerChatError('');
    setGeoAiPinLngLat(null);
    setGeoAiInspectCard(null);
    geoAiLastUserMapQueryRef.current = '';
  }, []);

  const clearGeoAiChat = useCallback(() => {
    geoAiInFlightRef.current = false;
    setGeoAiBusy(false);
    setGeoAiChatMessages([]);
    setGeoAiClaudeVisibleCount(GEO_AI_CHAT_PAGE_SIZE);
    setGeoAiDraft('');
    setGeoAiChatError('');
    setGeoAiInspectCard(null);
    geoAiLastUserMapQueryRef.current = '';
  }, []);

  const clearGeoDeepseekChat = useCallback(() => {
    geoDeepseekInFlightRef.current = false;
    setGeoDeepseekBusy(false);
    setGeoDeepseekChatMessages([]);
    setGeoAiDeepseekVisibleCount(GEO_AI_CHAT_PAGE_SIZE);
    setGeoDeepseekDraft('');
    setGeoDeepseekChatError('');
    setGeoAiInspectCard(null);
    geoAiLastUserMapQueryRef.current = '';
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
          rows: buildGeoAiLayerPopupAttributeRows(pin.layerHit, {
            maxRows: 28,
            queryContext: userText,
            inspectCoords: { lng: pin.coords[0], lat: pin.coords[1] },
          }),
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

  const sendGeoExplorerChat = useCallback((voiceOverrideText?: string) => {
    const trimmed = (voiceOverrideText ?? geoExplorerDraft).trim();
    if (geoExplorerInFlightRef.current) return;
    if (!trimmed && !geoExplorerPendingImage) return;
    if (trimmed) geoAiLastUserMapQueryRef.current = trimmed;
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

    const composerHadPendingImage = !!geoExplorerPendingImage;
    setGeoExplorerDraft('');
    setGeoExplorerPendingImage(null);
    setGeoExplorerChatError('');
    geoExplorerInFlightRef.current = true;
    setGeoExplorerBusy(true);
    setGeoExplorerAwaitKind('send');

    setGeoExplorerMessages(prev => {
      const historyWithUser = [...prev, userMsg];
      queueMicrotask(() =>
        void runSatelliteGeoExplorerGeminiPipeline({
          historyWithUser,
          userTextForMapFallback,
          coordsSourceMessages: prev,
          skipLocalStatsBecausePendingImage: composerHadPendingImage,
          questionEditInPlace: false,
        }),
      );
      return historyWithUser;
    });
  }, [
    geminiApiKey,
    geoExplorerDraft,
    geoExplorerPendingImage,
    runSatelliteGeoExplorerGeminiPipeline,
  ]);

  const onSiGeoAiTableMapAction = useCallback(
    (action: 'zoom' | 'highlight' | 'focus' | 'openTable', link: GeoExplorerMapLink) => {
      let lng: number;
      let lat: number;
      let title = 'Selected feature';
      let featureInspect: GeoAiInspectCardState | null = null;
      if (link.type === 'feature') {
        const ll = lngLatFromGeoAiFeatureLink(link, customLayers);
        if (!ll) return;
        [lng, lat] = ll;
        const resolved = resolveGeoAiFeatureFromLink(link, customLayers);
        if (resolved) {
          const clean = siSanitizeIdentifyProperties(resolved.properties);
          title = resolved.layerName;
          featureInspect = {
            title,
            rows: buildGeoAiLayerPopupAttributeRows(
              { properties: clean, arcgisLayerDefinition: resolved.arcgisLayerDefinition },
              {
                maxRows: 28,
                queryContext: geoAiLastUserMapQueryRef.current,
                inspectCoords: { lng, lat },
              },
            ),
            lng,
            lat,
            ...pickGeoAiHumanPlaceFields(clean),
          };
        }
      } else {
        lng = link.lng;
        lat = link.lat;
        if (link.layerName) title = link.layerName;
      }
      const zTarget = Math.max(
        geoExplorerTargetZoomForPinSource('layer'),
        action === 'highlight' ? 14 : 17,
      );
      setGeoAiPinLngLat([lng, lat]);
      setViewState(vs => ({
        ...vs,
        longitude: lng,
        latitude: lat,
        zoom: Math.max(typeof vs.zoom === 'number' ? vs.zoom : 2, zTarget),
        pitch: is3DView ? Math.max(typeof vs.pitch === 'number' ? vs.pitch : 0, 42) : vs.pitch ?? 0,
        bearing: typeof vs.bearing === 'number' ? vs.bearing : 0,
      }));
      if (action === 'focus' || action === 'openTable' || action === 'highlight' || link.type === 'feature') {
        if (featureInspect) {
          setGeoAiInspectCard(featureInspect);
        } else {
          setGeoAiInspectCard({
            title,
            rows: [
              { label: 'Longitude', value: lng.toFixed(6) },
              { label: 'Latitude', value: lat.toFixed(6) },
            ],
            lng,
            lat,
          });
        }
      } else if (link.type === 'coords' && link.layerName) {
        setGeoAiInspectCard({
          title: link.layerName,
          rows: [
            { label: 'Longitude', value: lng.toFixed(6) },
            { label: 'Latitude', value: lat.toFixed(6) },
          ],
          lng,
          lat,
        });
      }
    },
    [customLayers, is3DView],
  );

  const applySatelliteGeoAiMapFirstSync = useCallback(
    (selections: GeoAiMapFirstSelection[]) => {
      const first = Array.isArray(selections) ? selections[0] : null;
      if (!first) return;
      onSiGeoAiTableMapAction('zoom', {
        type: 'feature',
        layerId: first.layerId,
        featureKey: first.featureKey,
      });
    },
    [onSiGeoAiTableMapAction],
  );

  const sendGeoAiChat = useCallback((voiceOverrideText?: string) => {
    const trimmed = (voiceOverrideText ?? geoAiDraft).trim();
    if (geoAiInFlightRef.current || !trimmed) return;
    geoAiLastUserMapQueryRef.current = trimmed;
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
          const savedLayersForStats = await loadGisMapSavedLayers();
          const mergedLayersForStats: GeoAiMapLayer[] = [
            ...satelliteCustomLayersToGeoAiLayers(customLayers),
            ...savedLayersForStats.map(l => ({
              name: l.name,
              clientLayerId: String(l.id),
              visible: l.visible,
              source: l.source,
              data: l.data,
              arcgisLayerDefinition: (l as { arcgisLayerDefinition?: GeoAiMapLayer['arcgisLayerDefinition'] })
                .arcgisLayerDefinition,
            })),
          ];
          const localStats = runGeoAiStatsCommand(trimmed, mergedLayersForStats);
          if (localStats?.handled) {
            const aid = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `gaic-s-${Date.now()}`;
            setGeoAiChatMessages(h => [...h, { id: aid, role: 'assistant', text: localStats.reply }]);
            if (localStats.mapFirstSync?.selections?.length) {
              queueMicrotask(() => applySatelliteGeoAiMapFirstSync(localStats.mapFirstSync!.selections));
            }
            return;
          }
          const dataCtx = await buildGeoAiDataContext(undefined, {
            satelliteLayers: satelliteCustomLayersToGeoAiLayers(customLayers),
          });
          const prior = historyWithUser.slice(0, -1);
          const savedLayers = await loadGisMapSavedLayers();
          const mergedGeoAiLayers: GeoAiMapLayer[] = [
            ...satelliteCustomLayersToGeoAiLayers(customLayers),
            ...savedLayers.map(l => ({
              name: l.name,
              visible: l.visible,
              source: l.source,
              data: l.data,
              arcgisLayerDefinition: (l as { arcgisLayerDefinition?: GeoAiMapLayer['arcgisLayerDefinition'] })
                .arcgisLayerDefinition,
            })),
          ];
          const weatherAppend = await buildGeoAiFullWeatherSessionAppend({
            userText: trimmed,
            pinLngLat: geoAiPinLngLat,
            lastMapQueryCoords: lastMapQueryCoordsFromSimpleChatHistory(prior),
            inspectAnchorLngLat:
              geoAiInspectCard != null ? ([geoAiInspectCard.lng, geoAiInspectCard.lat] as [number, number]) : null,
            combinedLayers: mergedGeoAiLayers,
            mapboxAccessToken: mapboxToken || undefined,
            openWeatherApiKey,
            mapPopup: null,
          });
          const system = `${GEO_AI_CHAT_SYSTEM_BASE}\n\n---\n## Geo AI Copilot mission\n${GEO_AI_COPILOT_RULES}${weatherAppend}\n\n---\nDATA CONTEXT (authoritative for this session turn):\n${dataCtx}`;
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
  }, [
    claudeApiKey,
    geoAiDraft,
    applySatelliteGeoAiMapUi,
    customLayers,
    mapboxToken,
    openWeatherApiKey,
    geoAiPinLngLat,
    geoAiInspectCard,
  ]);

  const sendGeoDeepseekChat = useCallback((voiceOverrideText?: string) => {
    const trimmed = (voiceOverrideText ?? geoDeepseekDraft).trim();
    if (geoDeepseekInFlightRef.current || !trimmed) return;
    geoAiLastUserMapQueryRef.current = trimmed;
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
          const savedLayersForStats = await loadGisMapSavedLayers();
          const mergedLayersForStats: GeoAiMapLayer[] = [
            ...satelliteCustomLayersToGeoAiLayers(customLayers),
            ...savedLayersForStats.map(l => ({
              name: l.name,
              clientLayerId: String(l.id),
              visible: l.visible,
              source: l.source,
              data: l.data,
              arcgisLayerDefinition: (l as { arcgisLayerDefinition?: GeoAiMapLayer['arcgisLayerDefinition'] })
                .arcgisLayerDefinition,
            })),
          ];
          const localStats = runGeoAiStatsCommand(trimmed, mergedLayersForStats);
          if (localStats?.handled) {
            const aid = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `gds-s-${Date.now()}`;
            setGeoDeepseekChatMessages(h => [...h, { id: aid, role: 'assistant', text: localStats.reply }]);
            if (localStats.mapFirstSync?.selections?.length) {
              queueMicrotask(() => applySatelliteGeoAiMapFirstSync(localStats.mapFirstSync!.selections));
            }
            return;
          }
          const dataCtx = await buildGeoAiDataContext(undefined, {
            satelliteLayers: satelliteCustomLayersToGeoAiLayers(customLayers),
          });
          const prior = historyWithUser.slice(0, -1);
          const savedDs = await loadGisMapSavedLayers();
          const mergedDsLayers: GeoAiMapLayer[] = [
            ...satelliteCustomLayersToGeoAiLayers(customLayers),
            ...savedDs.map(l => ({
              name: l.name,
              clientLayerId: String(l.id),
              visible: l.visible,
              source: l.source,
              data: l.data,
              arcgisLayerDefinition: (l as { arcgisLayerDefinition?: GeoAiMapLayer['arcgisLayerDefinition'] })
                .arcgisLayerDefinition,
            })),
          ];
          const weatherAppendDs = await buildGeoAiFullWeatherSessionAppend({
            userText: trimmed,
            pinLngLat: geoAiPinLngLat,
            lastMapQueryCoords: lastMapQueryCoordsFromSimpleChatHistory(prior),
            inspectAnchorLngLat:
              geoAiInspectCard != null ? ([geoAiInspectCard.lng, geoAiInspectCard.lat] as [number, number]) : null,
            combinedLayers: mergedDsLayers,
            mapboxAccessToken: mapboxToken || undefined,
            openWeatherApiKey,
            mapPopup: null,
          });
          const system = `${GEO_AI_CHAT_SYSTEM_BASE}\n\n---\n## Geo AI Copilot mission\n${GEO_AI_COPILOT_RULES}${weatherAppendDs}\n\n---\nDATA CONTEXT (authoritative for this session turn):\n${dataCtx}`;
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
  }, [
    deepseekApiKey,
    geoDeepseekDraft,
    applySatelliteGeoAiMapUi,
    customLayers,
    mapboxToken,
    openWeatherApiKey,
    geoAiPinLngLat,
    geoAiInspectCard,
  ]);

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

  const endPolygonSketchDrag = useCallback(() => {
    if (polygonRingSketchDragRef.current === null) return;
    polygonRingSketchDragRef.current = null;
    circleRefineLastMoveRef.current = null;
    setMapDragPanEnabled(true);
    skipNextMapClickRef.current = true;
  }, []);

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
    if (!map || !spec) {
      setMapDragPanEnabled(true);
      return;
    }
    const end = clientPointToLngLat(map, clientX, clientY);
    if (!end) {
      setMapDragPanEnabled(true);
      return;
    }
    const [lng1, lat1] = spec.start;
    const [lng2, lat2] = end;
    if (Math.hypot(lng2 - lng1, lat2 - lat1) < 1e-7) {
      setMapDragPanEnabled(true);
      return;
    }
    if (spec.kind === 'circle') {
      setCircleRadiusM(null);
      setCircleRefineDraft({ center: [lng1, lat1], edge: [lng2, lat2] });
      setDrawAssistHint(
        'Drag N/E/S/W to resize, center to move, inside AOI to pan. Enter to apply, Esc to cancel.',
      );
      setMapDragPanEnabled(false);
      skipNextMapClickRef.current = true;
      return;
    }
    setCircleRadiusM(null);
    setMapDragPanEnabled(true);
    const feature = bboxToPolygonFeature(
      lng1,
      lat1,
      lng2,
      lat2,
      spec.kind === 'box_select' ? 'Box AOI' : 'Drawn rectangle',
    );
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
  circleRefineDraftRef.current = circleRefineDraft;

  useEffect(() => {
    if (mapDrawTool !== 'polygon') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      const ring = polygonRingRef.current;
      if (ring.length < 3) return;
      e.preventDefault();
      polygonRingSketchDragRef.current = null;
      setMapDragPanEnabled(true);
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

  useLayoutEffect(() => {
    if (mapDrawTool !== 'polygon') return;
    if (polygonRingSketchDragRef.current !== null) return;
    setMapDragPanEnabled(polygonRing.length === 0);
  }, [mapDrawTool, polygonRing.length]);

  useEffect(() => {
    if (mapDrawTool !== 'circle') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t) {
        const tag = t.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable) return;
      }
      if (e.key !== 'Enter') return;
      const d = circleRefineDraftRef.current;
      if (!d) return;
      e.preventDefault();
      circleRefineInteractionRef.current = null;
      circleRefineLastMoveRef.current = null;
      setCircleRefineActiveHandle(null);
      const feature = circleFromEdgeFeature(d.center[0], d.center[1], d.edge[0], d.edge[1], 128);
      commitUserGeometryRef.current(feature);
      setCircleRefineDraft(null);
      setDrawAssistHint('');
      setMapDrawTool('select');
      setShowEditHandles(false);
      setMapDragPanEnabled(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mapDrawTool]);

  const applyMapDrawTool = (tool: MapDrawTool) => {
    dragRectCircleRef.current = null;
    polygonRingSketchDragRef.current = null;
    circleRefineInteractionRef.current = null;
    setRectCirclePreview(null);
    setPointerLngLat(null);
    setPolylineStart(null);
    setPolygonRing([]);
    setPolygonClosingSnap(false);
    setDrawAssistHint('');
    setCircleRadiusM(null);
    setCircleRefineDraft(null);
    setCircleRefineActiveHandle(null);
    setShowEditHandles(tool === 'select' && !!drawnGeometryRef.current);
    setMapDrawTool(tool);
    if (tool === 'rectangle' || tool === 'box_select' || tool === 'circle') {
      setMapDragPanEnabled(false);
    } else if (tool === 'polygon') {
      setMapDragPanEnabled(true);
    } else {
      setMapDragPanEnabled(true);
    }
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
    if (circleRefineDraft) {
      circleRefineInteractionRef.current = null;
      setCircleRefineDraft(null);
      setCircleRefineActiveHandle(null);
      setDrawAssistHint('');
      setMapDragPanEnabled(false);
      return;
    }
    if (mapDrawTool === 'polygon' && polygonRing.length > 0) {
      polygonRingSketchDragRef.current = null;
      setMapDragPanEnabled(true);
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
    polygonRingSketchDragRef.current = null;
    circleRefineInteractionRef.current = null;
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
    setCircleRefineDraft(null);
    setCircleRefineActiveHandle(null);
    setMapDrawTool('select');
  }, []);

  const clearAllAoiDrawing = useCallback(() => {
    setGeomUndoStack([]);
    setGeomRedoStack([]);
    setDrawnGeometry(null);
    setDrawnStats(null);
    setPolylineStart(null);
    setPolygonRing([]);
    setRectCirclePreview(null);
    setPointerLngLat(null);
    dragRectCircleRef.current = null;
    polygonRingSketchDragRef.current = null;
    editDragRef.current = null;
    preEditGeomRef.current = null;
    setPolygonClosingSnap(false);
    setDrawAssistHint('');
    setCircleRadiusM(null);
    setCircleRefineDraft(null);
    setCircleRefineActiveHandle(null);
    circleRefineInteractionRef.current = null;
    circleRefineLastMoveRef.current = null;
    skipNextMapClickRef.current = false;
    setMapDrawTool('select');
    setShowEditHandles(false);
    setMapDragPanEnabled(true);
    setExploreExtentMode(prev => (prev === 'drawn' ? 'default' : prev));
  }, []);

  /** Fade AOI sketch + clipped raster overlay, then purge geometry and restore pan (basemap / vector layers unchanged). */
  const clearSatelliteDrawingWithFade = useCallback(() => {
    const hasVisual =
      drawnGeometry != null ||
      rectCirclePreview != null ||
      polygonRing.length > 0 ||
      circleRefineDraft != null ||
      polylineStart != null ||
      mapDrawTool !== 'select';

    const finish = () => {
      clearAllAoiDrawing();
      setDrawVisualOpacity(1);
    };

    if (!hasVisual) {
      finish();
      return;
    }

    if (drawFadeRafRef.current != null) {
      cancelAnimationFrame(drawFadeRafRef.current);
      drawFadeRafRef.current = null;
    }

    const start = performance.now();
    const duration = 300;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - t * t;
      setDrawVisualOpacity(eased);
      if (t < 1) {
        drawFadeRafRef.current = requestAnimationFrame(tick);
      } else {
        drawFadeRafRef.current = null;
        finish();
      }
    };
    drawFadeRafRef.current = requestAnimationFrame(tick);
  }, [
    clearAllAoiDrawing,
    drawnGeometry,
    rectCirclePreview,
    polygonRing.length,
    circleRefineDraft,
    polylineStart,
    mapDrawTool,
  ]);

  const handleMapPointerDown = (evt: any) => {
    const orig = evt.originalEvent as MouseEvent | undefined;
    if (orig && 'button' in orig && (orig as MouseEvent).button !== 0) return;
    const lng = evt.lngLat.lng;
    const lat = evt.lngLat.lat;
    const map = getMapInstance();
    if (!map) return;

    if (mapDrawTool === 'circle' && circleRefineDraft) {
      const draft = circleRefineDraft;
      const [clng, clat] = draft.center;
      const [elng, elat] = draft.edge;
      const rDeg = circleRefineRDeg(draft.center, draft.edge);
      const cosLat = circleRefineCosLat(clat);
      const hitPx = Math.max(POLYGON_VERTEX_SNAP_PX, vertexHitThresholdPx(map) * 1.05);
      if (lngLatPixelDistance(map, [lng, lat], draft.center) <= hitPx * 1.15) {
        circleRefineInteractionRef.current = { type: 'handle', h: 'center' };
        setCircleRefineActiveHandle('center');
        circleRefineLastMoveRef.current = [lng, lat];
        setMapDragPanEnabled(false);
        return;
      }
      const dirs: CircleCardinal[] = ['n', 'e', 's', 'w'];
      for (const c of dirs) {
        const p = circleRefineCardinalLngLat(draft.center, rDeg, cosLat, c);
        if (lngLatPixelDistance(map, [lng, lat], p) <= hitPx) {
          circleRefineInteractionRef.current = { type: 'handle', h: c };
          setCircleRefineActiveHandle(c);
          circleRefineLastMoveRef.current = [lng, lat];
          setMapDragPanEnabled(false);
          return;
        }
      }
      const ringGeom = circleFromEdgeFeature(clng, clat, elng, elat, 48, 'hit').geometry;
      if (pointInPolygonGeometry(lng, lat, ringGeom)) {
        circleRefineInteractionRef.current = { type: 'pan', last: [lng, lat] };
        setCircleRefineActiveHandle('pan');
        circleRefineLastMoveRef.current = [lng, lat];
        setMapDragPanEnabled(false);
        return;
      }
      return;
    }

    if (mapDrawTool === 'polygon' && polygonRing.length > 0) {
      const ring = polygonRing;
      const hitPx = Math.max(POLYGON_VERTEX_SNAP_PX, vertexHitThresholdPx(map));
      for (let vi = ring.length - 1; vi >= 0; vi -= 1) {
        const p = ring[vi]!;
        const d = lngLatPixelDistance(map, [lng, lat], p);
        if (d > hitPx) continue;
        if (vi === 0 && ring.length >= 3) continue;
        polygonRingSketchDragRef.current = vi;
        setMapDragPanEnabled(false);
        return;
      }
    }

    if (mapDrawTool === 'rectangle' || mapDrawTool === 'circle' || mapDrawTool === 'box_select') {
      if (mapDrawTool === 'circle' && circleRefineDraft) return;
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
    const cri = circleRefineInteractionRef.current;
    if (cri && mapDrawTool === 'circle' && circleRefineDraft) {
      const draft = circleRefineDraft;
      const last = circleRefineLastMoveRef.current;
      if (!last) {
        circleRefineLastMoveRef.current = [lng, lat];
        return;
      }
      const dLng = lng - last[0];
      const dLat = lat - last[1];
      circleRefineLastMoveRef.current = [lng, lat];
      if (cri.type === 'handle' && cri.h === 'center') {
        setCircleRefineDraft({
          center: [draft.center[0] + dLng, draft.center[1] + dLat],
          edge: [draft.edge[0] + dLng, draft.edge[1] + dLat],
        });
      } else if (cri.type === 'handle' && cri.h !== 'center') {
        const newEdge = projectPointerToCircleCardinalEdge(draft.center, cri.h, [lng, lat]);
        setCircleRefineDraft({ center: draft.center, edge: newEdge });
      } else if (cri.type === 'pan') {
        setCircleRefineDraft({
          center: [draft.center[0] + dLng, draft.center[1] + dLat],
          edge: [draft.edge[0] + dLng, draft.edge[1] + dLat],
        });
      }
      setPolygonClosingSnap(false);
      return;
    }
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

    const sketchVi = polygonRingSketchDragRef.current;
    if (sketchVi !== null && mapDrawTool === 'polygon') {
      let lngLat: [number, number] = [lng, lat];
      if (map && polygonRing.length >= 1) {
        const others = polygonRing.filter((_, j) => j !== sketchVi) as [number, number][];
        const { lng: sx, lat: sy, snapped } = snapLngLatToNearestVertex(map, lng, lat, others, POLYGON_VERTEX_SNAP_PX);
        if (snapped) lngLat = [sx, sy];
      }
      const shiftKey = !!(evt?.originalEvent as MouseEvent | undefined)?.shiftKey;
      const nRing = polygonRing.length;
      if (map && shiftKey && nRing >= 2) {
        const prevI = (sketchVi + nRing - 1) % nRing;
        const anchor = polygonRing[prevI]!;
        lngLat = snapLngLatToBearingStep(anchor, lngLat, POLYGON_SNAP_BEARING_STEP_DEG);
      }
      const nextRing = polygonRing.map((p, j) => (j === sketchVi ? lngLat : p)) as [number, number][];
      setPolygonRing(nextRing);
      setPointerLngLat(lngLat);
      if (map && nextRing.length >= 3) {
        const closePx = polygonCloseSnapThresholdPx(map);
        const d0 = lngLatPixelDistance(map, lngLat, nextRing[0]!);
        setPolygonClosingSnap(d0 <= closePx);
        setDrawAssistHint(d0 <= closePx ? 'Click first vertex to close polygon' : '');
      } else {
        setPolygonClosingSnap(false);
        setDrawAssistHint('');
      }
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
      const ring = polygonRing;
      const shiftKey = !!(evt?.originalEvent as MouseEvent | undefined)?.shiftKey;
      let ptr: [number, number] = [lng, lat];
      if (map && shiftKey && ring.length >= 1) {
        const anchor = ring[ring.length - 1]!;
        ptr = snapLngLatToBearingStep(anchor, ptr, POLYGON_SNAP_BEARING_STEP_DEG);
      }
      setPointerLngLat(ptr);
      if (map && ring.length >= 3) {
        const closePx = polygonCloseSnapThresholdPx(map);
        const d = lngLatPixelDistance(map, ptr, ring[0]);
        const snap = d <= closePx;
        setPolygonClosingSnap(snap);
        setDrawAssistHint(snap ? 'Click first vertex to close polygon' : '');
      } else {
        setPolygonClosingSnap(false);
        setDrawAssistHint(polygonRing.length ? 'Place vertices; Enter or right-click to finish' : '');
      }
    } else if (
      (mapDrawTool === 'rectangle' || mapDrawTool === 'box_select') ||
      (mapDrawTool === 'circle' && !circleRefineDraft)
    ) {
      setPointerLngLat([lng, lat]);
      setPolygonClosingSnap(false);
      setDrawAssistHint('');
    } else {
      setPointerLngLat(null);
      setPolygonClosingSnap(false);
      setDrawAssistHint('');
    }
    if (!circleRefineDraft) setCircleRadiusM(null);
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

  const endPolygonSketchDragRef = useRef(endPolygonSketchDrag);
  endPolygonSketchDragRef.current = endPolygonSketchDrag;

  useEffect(() => {
    const onUp = (e: PointerEvent) => {
      if (dragRectCircleRef.current) {
        interactionEndRef.current.finalizeRect(e.clientX, e.clientY);
      }
      if (circleRefineInteractionRef.current) {
        circleRefineInteractionRef.current = null;
        circleRefineLastMoveRef.current = null;
        setCircleRefineActiveHandle(null);
        if (mapDrawToolRef.current === 'circle' && circleRefineDraftRef.current) {
          setMapDragPanEnabled(false);
        }
      }
      if (editDragRef.current) {
        interactionEndRef.current.endEdit();
      }
      endPolygonSketchDragRef.current();
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
      const t = e.target as HTMLElement | null;
      if (t) {
        const tag = t.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable) return;
      }
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (e.key === 'Backspace' && mapDrawToolRef.current === 'polygon' && polygonRingRef.current.length > 0) {
        e.preventDefault();
        polygonRingSketchDragRef.current = null;
        setMapDragPanEnabled(true);
        setPolygonRing(prev => prev.slice(0, -1));
        return;
      }
      if (mod && k === 'z' && !e.shiftKey) {
        if (mapDrawToolRef.current === 'circle' && circleRefineDraftRef.current) {
          e.preventDefault();
          circleRefineInteractionRef.current = null;
          circleRefineLastMoveRef.current = null;
          setCircleRefineActiveHandle(null);
          setCircleRefineDraft(null);
          setDrawAssistHint('');
          setMapDragPanEnabled(false);
          return;
        }
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
        setGeoAiInspectCard(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cancelCurrentDrawing]);

  /** Layer ids passed to queryRenderedFeatures (must exist on the style). */
  const satelliteQueryableLayerIds = useMemo(() => {
    const ids: string[] = [];
    if (!isMapLoaded) return ids;
    for (const layer of customLayers) {
      if (!layer.visible) continue;
      ids.push(`${layer.id}-fill`, `${layer.id}-line`, `${layer.id}-circle`);
    }
    if (pivots.length > 0) {
      ids.push('agri-pivots-fill', 'agri-pivots-outline');
    }
    if (showStacFootprintsOnMap && stacFootprintsGeoJson.features.length > 0) {
      ids.push('si-stac-footprints-fill', 'si-stac-footprints-line');
    }
    if (drawnGeometry) {
      ids.push('drawn-index-geometry-fill', 'drawn-index-geometry-line', 'drawn-index-geometry-point');
    }
    return ids;
  }, [
    isMapLoaded,
    customLayers,
    pivots.length,
    showStacFootprintsOnMap,
    stacFootprintsGeoJson.features.length,
    drawnGeometry,
  ]);

  const handleMapClickDraw = (lng: number, lat: number, clickEv?: MouseEvent | null) => {
    if (skipNextMapClickRef.current) {
      skipNextMapClickRef.current = false;
      return;
    }
    if (mapDrawTool === 'select') {
      try {
        const map = getMapInstance() as {
          project?: (lngLat: [number, number]) => { x: number; y: number };
          queryRenderedFeatures?: (
            geometry: [number, number] | [number, number][],
            opts?: { layers?: string[] },
          ) => Array<{ layer?: { id?: string }; properties?: Record<string, unknown> }>;
        } | null;
        if (map?.project && map.queryRenderedFeatures) {
          const pt = map.project([lng, lat]);
          const opts =
            satelliteQueryableLayerIds.length > 0 ? { layers: satelliteQueryableLayerIds } : undefined;
          let hits = map.queryRenderedFeatures([pt.x, pt.y], opts ?? undefined) ?? [];
          if (!opts) {
            hits = hits.filter(h => !siIdentifyLayerIsSkippable(String(h?.layer?.id ?? '')));
          }
          const prefer = (
            a: { layer?: { id?: string } },
            b: { layer?: { id?: string } },
          ) => {
            const la = String(a?.layer?.id ?? '');
            const lb = String(b?.layer?.id ?? '');
            const rank = (id: string) => (/-fill$/.test(id) ? 0 : /-circle$/.test(id) ? 1 : 2);
            return rank(la) - rank(lb);
          };
          hits = [...hits].sort(prefer);
          const hit = hits[0];
          const layerId = String(hit?.layer?.id ?? '');
          if (hit && layerId && !siIdentifyLayerIsSkippable(layerId)) {
            const title = siIdentifyTitleForLayerId(layerId, customLayers);
            const rawProps =
              hit.properties && typeof hit.properties === 'object' && !Array.isArray(hit.properties)
                ? (hit.properties as Record<string, unknown>)
                : {};
            const clean = siSanitizeIdentifyProperties(rawProps);
            if (layerId.startsWith('si-stac-footprints')) {
              const stacKey = String(rawProps?.stacKey ?? '').trim();
              const fromKey = stacKey ? stacItemsByStableKey.get(stacKey) : null;
              const fromFallback =
                fromKey ??
                stacItems.find(
                  item =>
                    String(item?.id ?? '') === String(rawProps?.id ?? '') &&
                    String(item?.collection ?? '') === String(rawProps?.collection ?? ''),
                ) ??
                null;
              if (fromFallback) {
                const sceneKey = stacItemStableKey(fromFallback);
                const sceneCollection = getStacItemCollection(fromFallback);
                const autoTemplate: MpcTemplateId =
                  String(sceneCollection).toLowerCase() === 'landsat-c2-l2' ? 'ndvi_landsat' : 'ndvi_s2';
                setProcessingTargetStacItem(fromFallback);
                setExploreSelectedResultKeys([sceneKey]);
                setShowStacFootprintsOnMap(true);
                setExpandedEnvSection('explore-stac');
                setExploreTab('results');
                if (sceneCollection) {
                  setExploreSelectedCollectionIds(prev => (prev.includes(sceneCollection) ? prev : [...prev, sceneCollection]));
                }
                setStacStatus(`Selected STAC footprint: ${String(fromFallback?.id ?? 'scene')}.`);
                if (autoRunNdviOnScenePick) {
                  setSelectedMpcTemplateId(autoTemplate);
                  void runMpcTemplateProcessing(autoTemplate, fromFallback);
                }
              }
              return;
            }
            const arcDef = siArcgisDefForIdentifyLayerId(layerId, customLayers);
            setGeoAiInspectCard({
              title,
              rows: buildGeoAiLayerPopupAttributeRows(
                { properties: clean, arcgisLayerDefinition: arcDef },
                {
                  maxRows: 28,
                  queryContext: geoAiLastUserMapQueryRef.current,
                  inspectCoords: { lng, lat },
                },
              ),
              lng,
              lat,
              ...pickGeoAiHumanPlaceFields(clean),
            });
            return;
          }
        }
      } catch {
        /* ignore identify errors */
      }
      setGeoAiInspectCard(null);
      return;
    }
    if (mapDrawTool === 'freehand' || mapDrawTool === 'text' || mapDrawTool === 'lasso') return;
    if (mapDrawTool === 'rectangle' || mapDrawTool === 'circle' || mapDrawTool === 'box_select') return;

    if (mapDrawTool === 'polygon') {
      const map = getMapInstance();
      const shiftKey = !!clickEv?.shiftKey;
      let lngLat: [number, number] = [lng, lat];
      if (map && shiftKey && polygonRing.length >= 1) {
        const anchor = polygonRing[polygonRing.length - 1]!;
        lngLat = snapLngLatToBearingStep(anchor, lngLat, POLYGON_SNAP_BEARING_STEP_DEG);
      }
      if (map && polygonRing.length >= 3) {
        const closePx = polygonCloseSnapThresholdPx(map);
        const d = lngLatPixelDistance(map, lngLat, polygonRing[0]);
        if (d <= closePx) {
          polygonRingSketchDragRef.current = null;
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
          lngLat[0],
          lngLat[1],
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
    polygonRingSketchDragRef.current = null;
    setMapDragPanEnabled(true);
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
    if (mapDrawTool === 'circle' && circleRefineDraft) {
      const { center: [clng, clat], edge: [elng, elat] } = circleRefineDraft;
      features.push(circleFromEdgeFeature(clng, clat, elng, elat, 96, 'Refine'));
      const rDeg = circleRefineRDeg([clng, clat], [elng, elat]);
      const cosLat = circleRefineCosLat(clat);
      const dirs: CircleCardinal[] = ['n', 'e', 's', 'w'];
      for (const c of dirs) {
        const p = circleRefineCardinalLngLat([clng, clat], rDeg, cosLat, c);
        features.push({
          type: 'Feature',
          properties: { draftRole: 'circleCardinal', dir: c },
          geometry: { type: 'Point', coordinates: p },
        });
      }
      features.push({
        type: 'Feature',
        properties: { draftRole: 'circleCenter' },
        geometry: { type: 'Point', coordinates: [clng, clat] },
      });
    }
    if (mapDrawTool === 'polygon') {
      const ring = polygonRing;
      if (pointerLngLat && ring.length >= 2) {
        const withPtr = [...ring, pointerLngLat, ring[0]!] as [number, number][];
        features.push({
          type: 'Feature',
          properties: { draftRole: 'polyPreviewFill' },
          geometry: { type: 'Polygon', coordinates: [withPtr] },
        });
      } else if (ring.length >= 3) {
        const closed = [...ring, ring[0]!] as [number, number][];
        features.push({
          type: 'Feature',
          properties: { draftRole: 'polyPreviewFill' },
          geometry: { type: 'Polygon', coordinates: [closed] },
        });
      }
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
  }, [mapDrawTool, polygonRing, polylineStart, pointerLngLat, rectCirclePreview, polygonClosingSnap, circleRefineDraft]);

  const editHandlesGeoJson = useMemo(() => {
    if (mapDrawTool !== 'select' || !showEditHandles || !drawnGeometry) return null;
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
  }, [mapDrawTool, showEditHandles, drawnGeometry]);

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

  /** Timeline playback: prefer generated weekly composites; fallback to rolling 14-day strip */
  useEffect(() => {
    if (!isTimelinePlaying) return;

    if (weeklyComposites.length > 0) {
      const interval = setInterval(() => {
        setSelectedDate(prev => {
          const iso = prev.toISOString().split('T')[0];
          let idx = weeklyComposites.findIndex(w => iso >= w.startDate && iso <= w.endDate);
          if (idx < 0) idx = 0;
          idx = (idx + 1) % weeklyComposites.length;
          const w = weeklyComposites[idx];
          const d = new Date(`${w.startDate}T12:00:00`);
          const iso2 = d.toISOString().split('T')[0];
          setTimeSeriesStart(ps => (ps && iso2 < ps ? iso2 : ps || iso2));
          setTimeSeriesEnd(pe => (pe && iso2 > pe ? iso2 : pe || iso2));
          return d;
        });
      }, 1400);
      return () => clearInterval(interval);
    }

    if (!dates.length) return;

    const interval = setInterval(() => {
      setSelectedDate(prev => {
        let index = dates.findIndex(d => d.full.toDateString() === prev.toDateString());
        if (index === -1) index = 0;
        index = (index + 1) % dates.length;
        const next = dates[index].full;
        const iso = next.toISOString().split('T')[0];
        setTimeSeriesStart(ps => (ps && iso < ps ? iso : ps || iso));
        setTimeSeriesEnd(pe => (pe && iso > pe ? iso : pe || iso));
        return next;
      });
    }, 1200);

    return () => clearInterval(interval);
  }, [isTimelinePlaying, weeklyComposites, dates]);

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
    const allowed = wmsLayers.filter(
      l => !REMOTE_SENSING_HIDDEN_LAYER_IDS.has(String(l.name || '').trim().toUpperCase()),
    );
    if (!allowed.length) {
      setWmsLayer('');
      return;
    }
    setWmsLayer(prev => (prev && allowed.some(l => l.name === prev) ? prev : allowed[0]!.name));
  }, [wmsLayers]);

  /** When the chosen WMS layer matches a built-in environmental index id, keep charts/AOI logic in sync. */
  useEffect(() => {
    const raw = wmsLayer.trim();
    if (!raw) return;
    const upper = raw.toUpperCase();
    const alias: EnvironmentalIndexId | null =
      upper.includes('LST') || upper.includes('TEMP') ? 'LST' :
      upper.includes('NDSI') || upper.includes('SNOW') ? 'NDSI' :
      upper.includes('EVI') && !upper.includes('NEVI') ? 'EVI' :
      upper.includes('NDMI') || upper.includes('MOISTURE') ? 'NDMI' :
      upper.includes('NDWI') || upper.includes('MNDWI') || upper.includes('WATER') ? 'NDWI' :
      // Vegetation-like indices not in EnvironmentalIndexId map are normalized to SAVI.
      (upper.includes('SAVI') || upper.includes('NDVI') || upper.includes('GNDVI') || upper.includes('NDRE') || upper.includes('NBR') || upper.includes('BSI')) ? 'SAVI' :
      null;
    if (alias) setSelectedIndex(alias);
  }, [wmsLayer]);

  const visibleWmsLayers = useMemo(
    () => wmsLayers.filter(l => !REMOTE_SENSING_HIDDEN_LAYER_IDS.has(String(l.name || '').trim().toUpperCase())),
    [wmsLayers],
  );

  const activeWmsLayer = useMemo(() => {
    const t = wmsLayer.trim();
    if (t && visibleWmsLayers.some(l => l.name === t)) return t;
    const first = visibleWmsLayers.find(l => l.name.trim().length > 0)?.name.trim() ?? '';
    if (first) return first;
    if (selectedIndex === 'LST') return '';
    return selectedIndex;
  }, [wmsLayer, visibleWmsLayers, selectedIndex]);

  const remoteSensingLayerOptions = useMemo(() => {
    const named = new Map<string, string>();
    for (const layer of visibleWmsLayers) {
      const id = String(layer.name || '').trim();
      if (!id) continue;
      named.set(id, String(layer.title || id).trim() || id);
    }
    return Array.from(named.entries()).map(([id, label]) => ({ id, label }));
  }, [visibleWmsLayers]);

  const wmsLayerSelectValue = useMemo(() => {
    const t = wmsLayer.trim();
    if (t && remoteSensingLayerOptions.some(l => l.id === t)) return t;
    return remoteSensingLayerOptions[0]?.id ?? '';
  }, [wmsLayer, remoteSensingLayerOptions]);

  const wmsDate = selectedDate.toISOString().split('T')[0];
  const sentinelVisible = isWmsOverlayVisible && !!activeWmsLayer;
  const normalizedDrawnAoiGeometry = useMemo(() => getDrawnGeometry(drawnGeometry), [drawnGeometry]);
  const sentinelAoiVisible = sentinelVisible && !!normalizedDrawnAoiGeometry;
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
  const effectiveMapStyle = mapStyle;
  const effectiveMapStyleUsesMapboxHost = typeof effectiveMapStyle === 'string' && effectiveMapStyle.startsWith('mapbox://');
  const mapboxTokenTrimmed = (mapboxToken || '').trim();
  const mapboxAccessTokenForMap = mapboxTokenTrimmed || (!effectiveMapStyleUsesMapboxHost ? 'pk.si-raster-fallback-token' : undefined);

  /** Avoid Mapbox "Style is not done loading" by not mounting GeoJSON/Layer children until style is ready; reset after basemap/token change. */
  const basemapStyleGateRef = useRef(false);
  useLayoutEffect(() => {
    if (!basemapStyleGateRef.current) {
      basemapStyleGateRef.current = true;
      return;
    }
    setIsMapLoaded(false);
  }, [activeBasemapId, mapboxToken]);

  useEffect(() => {
    if (isMapLoaded) return;
    const timeoutMs = siBrowserReportsMicrosoftEdge() ? 3500 : 6000;
    const t = window.setTimeout(() => {
      if (isMapLoaded) return;
      setStacStatus('Map is taking longer than expected to load, retrying globe rendering.');
      setIs3DView(true);
    }, timeoutMs);
    return () => window.clearTimeout(t);
  }, [isMapLoaded]);

  useEffect(() => {
    if (!isMapLoaded) return;
    siForceGlobeProjection();
    // Some style/basemap loads can temporarily revert to mercator; retry briefly.
    const retries = [120, 320, 700, 1200];
    const timers = retries.map(ms => window.setTimeout(siForceGlobeProjection, ms));
    return () => {
      timers.forEach(id => window.clearTimeout(id));
    };
  }, [isMapLoaded, activeBasemapId, effectiveMapStyle, siForceGlobeProjection]);

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
      {
        id: 'sentinel-wms',
        label: activeWmsLayer || 'Remote sensing layer',
        meta: drawnGeometry ? 'Index raster (AOI clip)' : 'Index raster (draw AOI first)',
        visible: sentinelAoiVisible,
        toggleable: true,
        actionable: false,
        onToggle: toggleWmsOverlayVisibility,
      },
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
        const isUploadAoiLayer =
          layer.source === 'upload' &&
          pickFirstPolygonAoiFeature(layer.geojson) !== null;
        const sourceType =
          lower.includes('arcgis') ? 'ArcGIS' :
          lower.includes('kml') || lower.includes('kmz') ? 'KML/KMZ' :
          lower.includes('shp') || lower.includes('shape') ? 'SHP' :
          'Vector layer';
        return {
          id: `custom-${layer.id}`,
          label: layer.name,
          meta: `${isUploadAoiLayer ? 'AOI data source - ' : ''}${sourceType}${featureCount ? ` - ${featureCount} feature${featureCount === 1 ? '' : 's'}` : ''}`,
          visible: layer.visible,
          toggleable: true,
          actionable: true,
          sourceLayerId: layer.id,
          supportsAoiEdit: isUploadAoiLayer,
          supportsRename: true,
          onToggle: () => toggleCustomLayerVisibility(layer.id, !layer.visible),
        };
      }),
    ],
    [
      activeWmsLayer,
      currentBasemapLabel,
      customLayers,
      isStacThumbVisible,
      drawnGeometry,
      sentinelAoiVisible,
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

  const satelliteTimelineChips = useMemo(
    () =>
      weeklyComposites.map(w => ({
        id: `w-${w.weekIndex}-${w.startDate}`,
        shortLabel: `${w.startDate.slice(5, 7)}-${w.startDate.slice(8, 10)}`,
        fullDate: w.startDate,
        mean: w.mean,
      })),
    [weeklyComposites],
  );

  const satellitePivotBars = useMemo(
    () => pivotChartRows.map(r => ({ name: r.name, value: r.value })),
    [pivotChartRows],
  );

  const satelliteWeeklyMeans = useMemo(() => weeklyComposites.map(w => w.mean), [weeklyComposites]);

  const staticAoiChartAoiKey = useMemo(() => {
    if (!drawnGeometry) return null;
    try {
      return JSON.stringify(drawnGeometry);
    } catch {
      return 'aoi';
    }
  }, [drawnGeometry]);

  const staticAoiMultiLineData = useMemo(() => {
    if (!weeklyComposites.length) {
      return {
        labels: [] as string[],
        datasets: [] as AoiStaticMultiLayerLineChartDataset[],
        hasLst: false,
      };
    }
    const built = buildStaticAoiMultiChartDatasets(
      weeklyComposites,
      staticChartComparisonLayers,
      staticAoiChartAoiKey,
    );
    return {
      labels: built.labels,
      datasets: built.datasets,
      hasLst: staticChartComparisonLayers.includes('LST'),
    };
  }, [weeklyComposites, staticChartComparisonLayers, staticAoiChartAoiKey]);

  const handleStaticComparisonLayerToggle = useCallback((id: StaticAoiChartLayerId) => {
    setStaticChartComparisonLayers(prev => {
      if (prev.includes(id)) {
        if (prev.length <= 1) return prev;
        return sortStaticAoiChartLayerIds(prev.filter(x => x !== id));
      }
      return sortStaticAoiChartLayerIds([...prev, id]);
    });
  }, []);

  const satelliteActiveChipId = useMemo(() => {
    if (!weeklyComposites.length) return null;
    const iso = selectedDate.toISOString().split('T')[0];
    const hit =
      weeklyComposites.find(w => iso >= w.startDate && iso <= w.endDate) ?? weeklyComposites[0];
    return `w-${hit.weekIndex}-${hit.startDate}`;
  }, [weeklyComposites, selectedDate]);

  const handleSatelliteTimelineStep = (dir: -1 | 1) => {
    if (!weeklyComposites.length) return;
    const iso = selectedDate.toISOString().split('T')[0];
    let i = weeklyComposites.findIndex(w => iso >= w.startDate && iso <= w.endDate);
    if (i < 0) i = 0;
    i = (i + dir + weeklyComposites.length) % weeklyComposites.length;
    const w = weeklyComposites[i];
    applySelectedDate(new Date(`${w.startDate}T12:00:00`));
  };

  const handleSatelliteChipPick = (id: string) => {
    const w = weeklyComposites.find(x => `w-${x.weekIndex}-${x.startDate}` === id);
    if (w) applySelectedDate(new Date(`${w.startDate}T12:00:00`));
  };

  const satelliteToolbarTool: 'rectangle' | 'polygon' | 'circle' | 'select' =
    mapDrawTool === 'rectangle' || mapDrawTool === 'polygon' || mapDrawTool === 'circle' || mapDrawTool === 'select'
      ? mapDrawTool
      : 'select';

  const satelliteHasClearableDrawing = useMemo(
    () =>
      drawnGeometry != null ||
      rectCirclePreview != null ||
      polygonRing.length > 0 ||
      circleRefineDraft != null ||
      polylineStart != null ||
      mapDrawTool !== 'select',
    [drawnGeometry, rectCirclePreview, polygonRing.length, circleRefineDraft, polylineStart, mapDrawTool],
  );

  /** Sentinel Hub: GEOMETRY (3857 WKT) + EVALSCRIPT (RGBA, alpha = dataMask × optional index mask). */
  const sentinelHubWmsAoiClip = useMemo(
    () =>
      buildSentinelHubWmsAoiClip(drawnGeometry, activeWmsLayer, {
        indexVisibilityMin: WMS_AOI_INDEX_VISIBILITY_MIN,
      }),
    [drawnGeometry, activeWmsLayer],
  );

  const wmsTileUrl = useMemo(() => {
    const safeLayer = encodeURIComponent(activeWmsLayer);
    const start = timeSeriesStart || wmsDate;
    const end = timeSeriesEnd || wmsDate;
    let url =
      `${wmsBaseUrl}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0` +
      `&LAYERS=${safeLayer}` +
      `&BBOX={bbox-epsg-3857}&CRS=EPSG:3857` +
      `&FORMAT=image/png&TRANSPARENT=true&WIDTH=512&HEIGHT=512` +
      `&TIME=${start}/${end}&MAXCC=${cloudCoverage}&SHOWLOGO=false&WARNINGS=true`;
    if (sentinelHubWmsAoiClip.geometryWkt3857) {
      url += `&GEOMETRY=${encodeURIComponent(sentinelHubWmsAoiClip.geometryWkt3857)}`;
    }
    if (sentinelHubWmsAoiClip.evalscriptB64) {
      url += `&EVALSCRIPT=${encodeURIComponent(sentinelHubWmsAoiClip.evalscriptB64)}`;
    }
    return url;
  }, [
    activeWmsLayer,
    timeSeriesStart,
    timeSeriesEnd,
    wmsDate,
    cloudCoverage,
    wmsBaseUrl,
    sentinelHubWmsAoiClip.geometryWkt3857,
    sentinelHubWmsAoiClip.evalscriptB64,
  ]);

  /**
   * Limits Sentinel WMS tile requests to the AOI bounding box (extract-by-mask style for tiles).
   * Basemap layers are unaffected; only the raster overlay source uses these bounds.
   */
  const wmsRasterAoiBoundsLngLat = useMemo((): [number, number, number, number] | null => {
    if (!normalizedDrawnAoiGeometry) return null;
    const raw =
      getGeoJsonBounds({
        type: 'Feature',
        geometry: normalizedDrawnAoiGeometry,
        properties: {},
      } as any) ?? getGeoJsonBounds(drawnGeometry as any);
    if (!raw) return null;
    let [w, s, e, n] = raw;
    if (![w, s, e, n].every(Number.isFinite)) return null;
    const eps = 1e-4;
    if (e <= w) {
      const c = (w + e) / 2;
      w = c - eps;
      e = c + eps;
    }
    if (n <= s) {
      const c = (s + n) / 2;
      s = c - eps;
      n = c + eps;
    }
    const padX = Math.max((e - w) * 0.02, 1e-6);
    const padY = Math.max((n - s) * 0.02, 1e-6);
    return [w - padX, s - padY, e + padX, n + padY];
  }, [normalizedDrawnAoiGeometry, drawnGeometry]);

  const drawnAoiWmsClipReady =
    !!normalizedDrawnAoiGeometry &&
    (!!wmsRasterAoiBoundsLngLat || !!sentinelHubWmsAoiClip.geometryWkt3857);

  /**
   * react-map-gl <Source> does not apply standalone `bounds` updates (see updateSource in library).
   * Sync Mapbox RasterTileSource.setBounds after mount so AOI clipping always matches the sketch.
   */
  useLayoutEffect(() => {
    if (!isMapLoaded || !sentinelAoiVisible) return;
    const map = mapRef.current?.getMap?.() ?? mapRef.current;
    if (!map?.isStyleLoaded?.()) return;
    const sync = () => {
      try {
        const src = map.getSource('sentinel-source') as { setBounds?: (b: [number, number, number, number] | null) => void } | null;
        if (!src || typeof src.setBounds !== 'function') return;
        src.setBounds(wmsRasterAoiBoundsLngLat ?? null);
      } catch {
        /* ignore map/source race during style rebuild */
      }
    };
    const t = window.setTimeout(sync, 0);
    map.once('idle', sync);
    return () => {
      window.clearTimeout(t);
      map.off('idle', sync);
    };
  }, [isMapLoaded, sentinelAoiVisible, wmsRasterAoiBoundsLngLat, wmsTileUrl, activeWmsLayer, wmsDate, drawnGeometry]);

  const circleRefineHud = useMemo(() => {
    if (!circleRefineDraft || mapDrawTool !== 'circle') return null;
    const [clng, clat] = circleRefineDraft.center;
    const [elng, elat] = circleRefineDraft.edge;
    const radiusM = haversineDistanceMeters(clng, clat, elng, elat);
    const diameterM = 2 * radiusM;
    const areaHa = (Math.PI * radiusM * radiusM) / 10_000;
    return { radiusM, diameterM, areaHa };
  }, [circleRefineDraft, mapDrawTool]);

  const siMapCursor = useMemo(() => {
    if (circleRefineActiveHandle === 'center') return 'move';
    if (circleRefineActiveHandle === 'n' || circleRefineActiveHandle === 's') return 'ns-resize';
    if (circleRefineActiveHandle === 'e' || circleRefineActiveHandle === 'w') return 'ew-resize';
    if (circleRefineActiveHandle === 'pan') return 'grab';
    if (['point', 'polyline', 'polygon', 'rectangle', 'circle', 'box_select'].includes(mapDrawTool)) {
      return 'crosshair';
    }
    if (mapDrawTool === 'select' && drawnGeometry) return 'pointer';
    return 'grab';
  }, [mapDrawTool, drawnGeometry, circleRefineActiveHandle]);

  const siMapDrawingTitle = useMemo(() => {
    if (mapDrawTool === 'circle' && circleRefineDraft) {
      return 'Circle: drag N/E/S/W to resize, center to move, inside to pan. Enter to apply, Esc to cancel.';
    }
    if (mapDrawTool === 'circle') return 'Circle: click-drag from center outward, then adjust handles.';
    if (mapDrawTool === 'rectangle' || mapDrawTool === 'box_select') return 'Rectangle: click-drag on the map.';
    if (mapDrawTool === 'polygon') return 'Polygon: click corners; Enter or first corner to close.';
    return '';
  }, [mapDrawTool, circleRefineDraft]);

  const polygonSketchHudText = useMemo(() => {
    if (mapDrawTool !== 'polygon') return '';
    if (polygonRing.length === 0) {
      return 'Click to add corners. Hold Shift for 15°-step edges from the last point. Drag green vertices to adjust; first corner closes the ring when you have 3+ points.';
    }
    if (polygonRing.length === 1) {
      return 'Click for the next corner. Shift constrains the edge to 15° bearings from the previous point. Backspace removes the last point.';
    }
    if (polygonRing.length === 2) {
      return 'Add one more corner, then close: click the first corner, Enter, or right-click. Shift keeps the next edge on 15° steps from the last point.';
    }
    if (polygonClosingSnap) return '';
    return `${polygonRing.length} vertices — Shift for 15° edges, drag green dots, Backspace or Ctrl+Z undoes last point, Enter to finish.`;
  }, [mapDrawTool, polygonRing.length, polygonClosingSnap]);

  return (
    <div className="si-page">
      <div className="si-main-content">
        {/* Map viewport: MapGL fills this box; SatelliteMapAnalysisChrome portals MapToolsDock into mapboxgl-canvas-container */}
        <div
          className={`si-map-container${
            ['point', 'polyline', 'polygon', 'rectangle', 'circle', 'box_select'].includes(mapDrawTool)
              ? ' si-map-container--drawing'
              : ''
          }`}
          title={siMapDrawingTitle || undefined}
        >
          {(circleRadiusM !== null && rectCirclePreview?.kind === 'circle') ||
          circleRefineHud ||
          drawAssistHint ||
          (mapDrawTool === 'polygon' && polygonSketchHudText) ? (
            <div className="si-draw-live-hud" aria-live="polite">
              {circleRadiusM !== null && rectCirclePreview?.kind === 'circle' ? (
                <span className="si-draw-live-hud-radius">
                  Radius:{' '}
                  {circleRadiusM < 1000
                    ? `${Math.round(circleRadiusM)} m`
                    : `${(circleRadiusM / 1000).toFixed(2)} km`}
                </span>
              ) : null}
              {circleRefineHud ? (
                <span className="si-draw-live-hud-metrics">
                  <span className="si-draw-live-hud-radius">
                    R{' '}
                    {circleRefineHud.radiusM < 1000
                      ? `${Math.round(circleRefineHud.radiusM)} m`
                      : `${(circleRefineHud.radiusM / 1000).toFixed(2)} km`}
                  </span>
                  <span className="si-draw-live-hud-sep" aria-hidden>
                    ·
                  </span>
                  <span>
                    D{' '}
                    {circleRefineHud.diameterM < 1000
                      ? `${Math.round(circleRefineHud.diameterM)} m`
                      : `${(circleRefineHud.diameterM / 1000).toFixed(2)} km`}
                  </span>
                  <span className="si-draw-live-hud-sep" aria-hidden>
                    ·
                  </span>
                  <span>
                    A{' '}
                    {circleRefineHud.areaHa < 100
                      ? `${circleRefineHud.areaHa.toFixed(2)} ha`
                      : `${(circleRefineHud.areaHa / 100).toFixed(2)} km²`}
                  </span>
                </span>
              ) : null}
              {drawAssistHint || polygonSketchHudText ? (
                <span className="si-draw-live-hud-hint">{drawAssistHint || polygonSketchHudText}</span>
              ) : null}
            </div>
          ) : null}
          <MapGL
            key={`si-map-globe:${mapboxAccessTokenForMap ? 'token' : 'no-token'}`}
            ref={mapRef}
            {...viewState}
            onMove={evt => setViewState(evt.viewState)}
            onMouseDown={handleMapPointerDown}
            onMouseMove={handleMapPointerMove}
            onTouchStart={handleMapPointerDown}
            onTouchMove={handleMapPointerMove}
            onClick={evt => handleMapClickDraw(evt.lngLat.lng, evt.lngLat.lat, evt.originalEvent ?? undefined)}
            onContextMenu={handleMapContextMenu}
            style={{
              width: '100%',
              height: '100%',
              cursor: siMapCursor,
            }}
            mapStyle={effectiveMapStyle}
            mapboxAccessToken={mapboxAccessTokenForMap}
            projection={{ name: 'globe' }}
            renderWorldCopies={false}
            dragRotate
            pitchWithRotate
            fog={{ 'range': [0.5, 10], 'color': '#020617', 'horizon-blend': 0.1 }}
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
              const lowerMessage = String(message || '').toLowerCase();
              if (
                !siGlobeWebglFailoverRef.current &&
                (siMapErrorSuggestsGlobeOrWebglFailure(String(message)) ||
                  lowerMessage.includes('access token') ||
                  lowerMessage.includes('mapbox'))
              ) {
                siGlobeWebglFailoverRef.current = true;
                setIs3DView(true);
                setStacStatus('Map detected a rendering issue and is retrying in 3D Globe mode.');
                return;
              }
              console.warn('Map Error:', e);
            }}
            onStyleData={() => siForceGlobeProjection()}
            onLoad={() => {
              setIsMapLoaded(true);
              siForceGlobeProjection();
            }}
          >
            {isMapLoaded ? (
              <>
                {customLayers.map(layer => {
                  if (!layer.visible) return null;
                  const st = siLayerMapboxStylePack(layer);
                  return (
                    <Source
                      key={`${layer.id}-${layer.source === 'arcgis' && layer.useArcGisSymbology !== false && layer.arcgisDrawingInfo ? 'ag' : 'c'}`}
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
                        'fill-opacity': Math.min(0.45, drawStyle.fillOpacity + 0.12) * drawVisualOpacity,
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
                        'line-opacity': 0.9 * drawVisualOpacity,
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
                        'line-opacity': 0.95 * drawVisualOpacity,
                      }}
                    />
                    <Layer
                      id="si-draw-draft-vertex"
                      type="circle"
                      filter={[
                        'any',
                        ['==', ['get', 'draftRole'], 'polyVertex'],
                        ['==', ['get', 'draftRole'], 'circleCenter'],
                        ['==', ['get', 'draftRole'], 'circleCardinal'],
                      ]}
                      paint={{
                        'circle-radius': [
                          'match',
                          ['get', 'draftRole'],
                          'circleCenter',
                          12,
                          'circleCardinal',
                          10,
                          9,
                        ] as any,
                        'circle-color': [
                          'match',
                          ['get', 'draftRole'],
                          'circleCenter',
                          '#fbbf24',
                          'circleCardinal',
                          '#86efac',
                          '#bbf7d0',
                        ] as any,
                        'circle-stroke-width': 2,
                        'circle-stroke-color': '#14532d',
                        'circle-opacity': drawVisualOpacity,
                        'circle-stroke-opacity': drawVisualOpacity,
                      }}
                    />
                    <Layer
                      id="si-draw-draft-pt"
                      type="circle"
                      filter={[
                        'all',
                        ['==', ['geometry-type'], 'Point'],
                        ['!=', ['get', 'draftRole'], 'polyVertex'],
                        ['!=', ['get', 'draftRole'], 'circleCenter'],
                        ['!=', ['get', 'draftRole'], 'circleCardinal'],
                      ]}
                      paint={{
                        'circle-radius': 6,
                        'circle-color': drawStyle.strokeColor,
                        'circle-stroke-width': 2,
                        'circle-stroke-color': '#0f172a',
                        'circle-opacity': drawVisualOpacity,
                        'circle-stroke-opacity': drawVisualOpacity,
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
                        'fill-opacity': drawStyle.fillOpacity * drawVisualOpacity,
                      }}
                    />
                  </Source>
                )}
                {false && aoiHeatPointGeoJson?.features?.length ? (
                  <Source id="si-aoi-heat-source" type="geojson" data={aoiHeatPointGeoJson as any}>
                    <Layer
                      id="si-aoi-heatmap"
                      type="heatmap"
                      paint={{
                        'heatmap-weight': ['coalesce', ['get', 'weight'], 0.2],
                        'heatmap-intensity': 1.15,
                        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 7, 18, 12, 28, 16, 42],
                        'heatmap-opacity': 0.78,
                        'heatmap-color': aoiHeatmapColorExpression,
                      }}
                    />
                    <Layer
                      id="si-aoi-heat-points"
                      type="circle"
                      minzoom={13}
                      paint={{
                        'circle-radius': 2,
                        'circle-color': ['coalesce', ['get', 'color'], '#22c55e'],
                        'circle-opacity': 0.32,
                      }}
                    />
                  </Source>
                ) : null}

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
                        'circle-opacity': 0.95 * drawVisualOpacity,
                        'circle-stroke-opacity': drawVisualOpacity,
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

            {isMapLoaded && sentinelAoiVisible && drawnAoiWmsClipReady && (
              <Source
                key={`sentinel-${activeWmsLayer}-${wmsDate}-${wmsRasterAoiBoundsLngLat?.join(',') ?? 'world'}-${sentinelHubWmsAoiClip.geometryWkt3857 ? 'g1' : 'g0'}-${sentinelHubWmsAoiClip.evalscriptB64 ? 'e1' : 'e0'}`}
                id="sentinel-source"
                type="raster"
                tiles={[wmsTileUrl]}
                tileSize={512}
                bounds={wmsRasterAoiBoundsLngLat ?? undefined}
              >
                <Layer
                  id="sentinel-layer"
                  type="raster"
                  paint={{
                    'raster-opacity':
                      (sentinelHubWmsAoiClip.evalscriptB64 ? 1 : 0.85) *
                      (drawnGeometry != null && wmsRasterAoiBoundsLngLat ? drawVisualOpacity : 1),
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

            {isMapLoaded && drawnGeometry ? (
              <Source id="drawn-index-geometry-outline-source" type="geojson" data={drawnGeometry as any}>
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
                    'line-opacity': drawVisualOpacity,
                  }}
                />
                <Layer
                  id="drawn-index-geometry-point"
                  type="circle"
                  filter={['==', ['geometry-type'], 'Point']}
                  paint={{
                    'circle-radius': drawStyle.pointRadius,
                    'circle-color': drawStyle.fillColor,
                    'circle-opacity': Math.min(1, drawStyle.fillOpacity + 0.55) * drawVisualOpacity,
                    'circle-stroke-color': drawStyle.strokeColor,
                    'circle-stroke-width': Math.max(1, drawStyle.strokeWidth / 2),
                    'circle-stroke-opacity': drawVisualOpacity,
                  }}
                />
              </Source>
            ) : null}

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
                  aria-label="Feature identify — attributes at click location"
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

          <SatelliteMapAnalysisChrome
            weeklyChips={satelliteTimelineChips}
            activeChipId={satelliteActiveChipId}
            onPickChip={handleSatelliteChipPick}
            timelinePlaying={isTimelinePlaying}
            onTogglePlay={() => setIsTimelinePlaying(p => !p)}
            onStep={handleSatelliteTimelineStep}
            timelineVisible={weeklyComposites.length > 0}
            mapTool={satelliteToolbarTool}
            onMapTool={t => applyMapDrawTool(t)}
            hasClearableDrawing={satelliteHasClearableDrawing}
            onClearDrawing={clearSatelliteDrawingWithFade}
            hasAoi={!!drawnGeometry}
            staticChartsOpen={mapStaticChartsOpen}
            onToggleStaticCharts={() => setMapStaticChartsOpen(o => !o)}
            weeklyMeans={satelliteWeeklyMeans}
            pivotBars={satellitePivotBars}
            indexLabel={selectedIndexConfig.label}
            staticMultiLineLabels={staticAoiMultiLineData.labels}
            staticMultiLineDatasets={staticAoiMultiLineData.datasets}
            staticMultiLineHasLst={staticAoiMultiLineData.hasLst}
            staticComparisonLayers={staticChartComparisonLayers}
            onStaticComparisonLayerToggle={handleStaticComparisonLayerToggle}
            mapRef={mapRef}
            mapLoaded={isMapLoaded}
          />

          {false && aoiHeatPointGeoJson?.features?.length ? (
            <div className="si-aoi-class-legend" dir="ltr">
              <div className="si-aoi-class-legend-title">{selectedIndex} classified (5 classes)</div>
              {aoiFiveClassLegend.map(row => (
                <div key={row.idx} className="si-aoi-class-legend-row">
                  <span className="si-aoi-class-legend-swatch" style={{ background: row.color }} />
                  <span>{row.label}</span>
                </div>
              ))}
            </div>
          ) : null}
          {mpcProcessResult && stacMapThumb ? (
            <div className="si-map-analysis-pill" dir="ltr">
              <div className="si-map-analysis-pill-title">
                {mpcProcessResult.label || mpcProcessResult.template_id}
              </div>
              <div className="si-map-analysis-pill-row">
                <span>Items: {mpcProcessResult.item_count}</span>
                <span>{mpcProcessResult.datetime}</span>
              </div>
              {mpcProcessResult.statistics ? (
                <div className="si-map-analysis-pill-row">
                  <span>min {mpcProcessResult.statistics.min.toFixed(3)}</span>
                  <span>max {mpcProcessResult.statistics.max.toFixed(3)}</span>
                  <span>mean {mpcProcessResult.statistics.mean.toFixed(3)}</span>
                </div>
              ) : null}
            </div>
          ) : null}

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
            <div className="si-env-rail si-env-rail--mapbox-float">
              <div
                className={`si-proc-mb-row${procMbRowExpanded ? ' si-proc-mb-row--expanded' : ' si-proc-mb-row--collapsed'}`}
                role="tablist"
                aria-label="Processing options"
              >
                {SI_PROC_MAP_SECTIONS.map(section => (
                  <button
                    key={section.id}
                    type="button"
                    role="tab"
                    aria-selected={expandedEnvSection === section.id && isLayerDropdownOpen}
                    className={`si-proc-mb-btn${expandedEnvSection === section.id && isLayerDropdownOpen ? ' si-proc-mb-btn--active' : ''}`}
                    title={section.label}
                    aria-label={section.label}
                    onClick={() => {
                      setExpandedEnvSection(section.id);
                      setIsLayerDropdownOpen(true);
                    }}
                  >
                    <i className={section.icon} aria-hidden />
                    {procMbRowExpanded ? <span className="si-proc-mb-btn-label">{section.label}</span> : null}
                  </button>
                ))}
                <button
                  type="button"
                  className="si-proc-mb-toggle"
                  onClick={() => setProcMbRowExpanded(v => !v)}
                  title={procMbRowExpanded ? 'Icon bar only' : 'Show section labels'}
                  aria-label={procMbRowExpanded ? 'Icon bar only' : 'Show section labels'}
                  aria-expanded={procMbRowExpanded}
                >
                  <i className={procMbRowExpanded ? 'fa-solid fa-angles-left' : 'fa-solid fa-angles-right'} aria-hidden />
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="add-layer-input"
                accept=".kml,.kmz,.zip,.geojson,.json,.csv,.tif,.tiff,.img,.vrt,.jp2,.ecw"
                onChange={handleLayerFileChange}
              />
              {isLayerDropdownOpen && (
                <div
                  className={`si-env-panel si-env-panel--mapbox-drop${
                    expandedEnvSection === 'explore-stac' || expandedEnvSection === 'table-geo-ai'
                      ? ' si-env-panel--explore-stac'
                      : ''
                  }`}
                  dir="auto"
                >
                  <div className="si-env-panel-header">
                    <div className="si-env-header-top">
                      <div>
                        <div className="si-env-title">Processing Options</div>
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
            <div className="si-explore-stac-tabs" role="tablist" aria-label="Explore STAC sections">
              <button
                type="button"
                role="tab"
                aria-selected={exploreTab === 'parameters'}
                className={`si-explore-stac-tab${exploreTab === 'parameters' ? ' active' : ''}`}
                onClick={() => setExploreTab('parameters')}
                title="Parameters"
                aria-label="Parameters — search and filters"
              >
                <i className="fa-solid fa-sliders" aria-hidden />
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={exploreTab === 'results'}
                className={`si-explore-stac-tab${exploreTab === 'results' ? ' active' : ''}`}
                onClick={() => setExploreTab('results')}
                title="Results"
                aria-label="Results"
              >
                <i className="fa-solid fa-chart-column" aria-hidden />
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={exploreTab === 'source'}
                className={`si-explore-stac-tab${exploreTab === 'source' ? ' active' : ''}`}
                onClick={() => setExploreTab('source')}
                title="Source"
                aria-label="Source catalog"
              >
                <i className="fa-solid fa-database" aria-hidden />
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
                              {selectedIndexConfig.label}): you can edit the dates below or change{' '}
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
                                            onClick={() => downloadStacExploreItem(item)}
                                          >
                                            <i className="fa-solid fa-download" aria-hidden />
                                            Download
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
                              ) : remoteSensingLayerOptions.length === 0 ? (
                                <option value="">No Sentinel Hub WMS layers — check API tokens / instance ID.</option>
                              ) : (
                                remoteSensingLayerOptions.map(layer => (
                                  <option key={layer.id} value={layer.id}>
                                    {layer.label}
                                  </option>
                                ))
                              )}
                            </select>
                          </label>
                          {!isLoadingLayers && remoteSensingLayerOptions.length > 0 ? (
                            <div className="si-field-analysis-layer-visibility">
                              <label className="si-field-analysis-checkbox-row">
                                <input
                                  type="checkbox"
                                  checked={isWmsOverlayVisible}
                                  onChange={e => setIsWmsOverlayVisible(e.target.checked)}
                                  aria-label="Show imagery layer on map"
                                />
                                <span>
                                  Show{' '}
                                  <strong>
                                    {remoteSensingLayerOptions.find(o => o.id === wmsLayerSelectValue)?.label ??
                                      selectedIndexConfig.label}
                                  </strong>{' '}
                                  on map
                                </span>
                              </label>
                            </div>
                          ) : null}
                          <button
                            type="button"
                            className="si-field-analysis-aoi-upload-btn"
                            onClick={openAoiDataSourceUploader}
                            title="Add Data Source (AOI): SHP (.zip), KML/KMZ, GeoJSON"
                          >
                            <i className="fa-solid fa-cloud-arrow-up" aria-hidden />
                            <span>Add Data Source (AOI)</span>
                          </button>
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
                          <div className="si-field-analysis-map-tools">
                            <div className="si-field-analysis-kicker si-field-analysis-map-tools-kicker">Analysis tools</div>
                            <SatelliteMapAnalysisToolbar
                              embedded
                              mapTool={satelliteToolbarTool}
                              onMapTool={t => applyMapDrawTool(t)}
                              hasClearableDrawing={satelliteHasClearableDrawing}
                              onClearDrawing={clearSatelliteDrawingWithFade}
                              hasAoi={!!drawnGeometry}
                              staticChartsOpen={mapStaticChartsOpen}
                              onToggleStaticCharts={() => setMapStaticChartsOpen(o => !o)}
                              weeklyMeans={satelliteWeeklyMeans}
                              pivotBars={satellitePivotBars}
                              indexLabel={selectedIndexConfig.label}
                              staticMultiLineLabels={staticAoiMultiLineData.labels}
                              staticMultiLineDatasets={staticAoiMultiLineData.datasets}
                              staticMultiLineHasLst={staticAoiMultiLineData.hasLst}
                              staticComparisonLayers={staticChartComparisonLayers}
                              onStaticComparisonLayerToggle={handleStaticComparisonLayerToggle}
                            />
                          </div>
                          <div className="si-rs-actions si-rs-actions--compact">
                            <button
                              type="button"
                              className={
                                'si-field-analysis-timeline-btn' +
                                (fieldTimelineSessionActive ? ' si-field-analysis-timeline-btn--stop' : '')
                              }
                              onClick={onFieldAnalysisTimelinePrimaryClick}
                              aria-label={
                                fieldTimelineSessionActive
                                  ? 'Stop Timeline: pause map playback and clear weekly chips'
                                  : 'Generate weekly timeline from selected date range'
                              }
                            >
                              <i
                                className={fieldTimelineSessionActive ? 'fa-solid fa-stop' : 'fa-solid fa-chart-line'}
                                aria-hidden
                              />
                              {fieldTimelineSessionActive ? 'Stop Timeline' : 'Generate timeline'}
                            </button>
                          </div>
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

                        {fieldAnalysisStatus ? <p className="si-field-analysis-status">{fieldAnalysisStatus}</p> : null}
                      </div>
                    )}
                    {expandedEnvSection === 'ai-detection-gis' && (
                      <div className="si-env-section-card si-field-analysis">
                        <div className="si-field-analysis-header">
                          <h2 className="si-field-analysis-title">AI Detection in GIS</h2>
                          <button
                            type="button"
                            className="si-field-analysis-close"
                            onClick={() => setIsLayerDropdownOpen(false)}
                            aria-label="Close panel"
                          >
                            <i className="fa-solid fa-xmark" aria-hidden />
                          </button>
                        </div>
                        <input
                          ref={netfloraUploadInputRef}
                          type="file"
                          accept=".geojson,.json"
                          className="add-layer-input"
                          onChange={onNetfloraUploadChange}
                        />
                        {netfloraStats ? (
                          <div className="si-field-analysis-section">
                            <div className="si-field-analysis-kicker">Detection analytics (inside AOI)</div>
                            <div className="si-netflora-stats-grid">
                              <div className="si-netflora-stat-card">
                                <span>Total detections</span>
                                <strong>{netfloraStats.total}</strong>
                              </div>
                              <div className="si-netflora-stat-card">
                                <span>Average confidence</span>
                                <strong>{(netfloraStats.avgConfidence * 100).toFixed(1)}%</strong>
                              </div>
                            </div>
                            <div className="si-netflora-class-list">
                              {netfloraStats.byClass.map(row => (
                                <div key={row.label} className="si-netflora-class-row">
                                  <div className="si-netflora-class-meta">
                                    <strong>{row.label}</strong>
                                    <span>{row.count} detections</span>
                                  </div>
                                  <div className="si-netflora-class-bar">
                                    <span style={{ width: `${Math.max(8, (row.count / Math.max(1, netfloraStats.total)) * 100)}%` }} />
                                  </div>
                                  <em>{(row.avgConfidence * 100).toFixed(1)}%</em>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )}
                    {expandedEnvSection === 'table-geo-ai' && (
                      <div className="si-geo-explorer-root si-geo-explorer-root--unified">
                        <div className="si-env-section-card si-geo-explorer">
                          <div className="si-geo-explorer-header">
                            <h2 className="si-geo-explorer-title">Geo AI</h2>
                            <div className="si-geo-explorer-header-actions">
                              <button
                                type="button"
                                className="si-geo-explorer-icon-btn"
                                onClick={() => setGeoAiSmartSuggestionsEnabled(v => !v)}
                                aria-label={geoAiSmartSuggestionsEnabled ? 'Disable smart suggestions' : 'Enable smart suggestions'}
                                title={geoAiSmartSuggestionsEnabled ? 'Smart Suggestions: on' : 'Smart Suggestions: off'}
                              >
                                <i className="fa-solid fa-wand-magic-sparkles" aria-hidden />
                              </button>
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
                              <div
                                className="si-geo-explorer-messages"
                                ref={geoExplorerMessagesRef}
                                onScroll={() => {
                                  const el = geoExplorerMessagesRef.current;
                                  if (!el || !geoExplorerHasOlderMessages) return;
                                  if (el.scrollTop <= 24) loadOlderGeoExplorerMessages();
                                }}
                              >
                                {geoExplorerHasOlderMessages ? (
                                  <button
                                    type="button"
                                    className="si-geo-explorer-load-more"
                                    onClick={loadOlderGeoExplorerMessages}
                                    aria-label="Load older messages"
                                  >
                                    Load earlier messages
                                  </button>
                                ) : null}
                                <div className="si-geo-explorer-row si-geo-explorer-row--model">
                                  <div className="si-geo-explorer-avatar" aria-hidden>
                                    <i className="fa-solid fa-globe" />
                                  </div>
                                  <div className="si-geo-explorer-bubble">
                                    Hello! Im Agro Cloud - GeoAI - Describe a place, upload an image, or ask for directions.
                                    When a location is clear, the map will fly there
                                  </div>
                                </div>
                                {visibleGeoExplorerMessages.map(msg => (
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
                                      <GeoExplorerGeminiMessageParts
                                        msg={msg}
                                        cssPrefix="si-geo-explorer"
                                        onTableMapAction={onSiGeoAiTableMapAction}
                                        onSaveEditedUserMessage={saveEditedGeoExplorerGeminiQuestion}
                                        onSendEditedToComposer={setGeoExplorerDraft}
                                        suggestLayers={geoAiSuggestContext.layers}
                                        suggestFields={geoAiSuggestContext.fields}
                                        suggestNumericFields={geoAiSuggestContext.numericFields}
                                      />
                                    </div>
                                  </div>
                                ))}
                                {geoExplorerBusy ? (
                                  <div className="si-geo-explorer-row si-geo-explorer-row--model">
                                    <div className="si-geo-explorer-avatar" aria-hidden>
                                      <i className="fa-solid fa-wand-magic-sparkles" />
                                    </div>
                                    <div className="si-geo-explorer-bubble si-geo-explorer-bubble--typing">
                                      <i className="fa-solid fa-spinner fa-spin" aria-hidden />{' '}
                                      {geoExplorerAwaitKind === 'edit' ? 'Updating…' : 'Thinking…'}
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
                              <GeoExplorerGeminiInputRow
                                cssPrefix="si-geo-explorer"
                                draft={geoExplorerDraft}
                                onDraftChange={setGeoExplorerDraft}
                                onSend={sendGeoExplorerChat}
                                busy={geoExplorerBusy}
                                pendingImage={geoExplorerPendingImage}
                                fileInputRef={geoExplorerFileInputRef}
                                onAttachChange={onGeoExplorerAttachChange}
                                textareaAriaLabel="Geo AI Gemini message"
                                availableLayers={geoAiSuggestContext.layers}
                                availableFields={geoAiSuggestContext.fields}
                                availableNumericFields={geoAiSuggestContext.numericFields}
                                availableGeometryOps={geoAiSuggestContext.geometryOps}
                                smartSuggestionsEnabled={geoAiSmartSuggestionsEnabled}
                              />
                              <p className="si-geo-explorer-footnote">
                                Powered by Google Gemini. Set <code>VITE_GEMINI_API_KEY</code> or save under System Settings →
                                API Tokens → Gemini API. Do not commit keys.
                              </p>
                            </>
                          ) : null}

                          {geoAiModelTab === 'claude' || geoAiModelTab === 'deepseek' ? (
                            <>
                              <div
                                className="si-geo-explorer-messages"
                                ref={geoAiModelTab === 'claude' ? geoAiClaudeMessagesRef : geoAiDeepseekMessagesRef}
                                onScroll={() => {
                                  const isClaude = geoAiModelTab === 'claude';
                                  const el = isClaude ? geoAiClaudeMessagesRef.current : geoAiDeepseekMessagesRef.current;
                                  const hasOlder = isClaude ? geoAiClaudeHasOlderMessages : geoAiDeepseekHasOlderMessages;
                                  if (!el || !hasOlder) return;
                                  if (el.scrollTop <= 24) {
                                    if (isClaude) loadOlderGeoAiClaudeMessages();
                                    else loadOlderGeoAiDeepseekMessages();
                                  }
                                }}
                              >
                                {(geoAiModelTab === 'claude' ? geoAiClaudeHasOlderMessages : geoAiDeepseekHasOlderMessages) ? (
                                  <button
                                    type="button"
                                    className="si-geo-explorer-load-more"
                                    onClick={() => {
                                      if (geoAiModelTab === 'claude') loadOlderGeoAiClaudeMessages();
                                      else loadOlderGeoAiDeepseekMessages();
                                    }}
                                    aria-label="Load older messages"
                                  >
                                    Load earlier messages
                                  </button>
                                ) : null}
                                <div className="si-geo-explorer-row si-geo-explorer-row--model">
                                  <div className="si-geo-explorer-avatar" aria-hidden>
                                    <i className="fa-solid fa-database" />
                                  </div>
                                  <div className="si-geo-explorer-bubble">
                                    Ask about fields, layers, or tables using only data from GIS Map saved layers and the
                                    Develop Dashboard → Data snapshot in this browser. Answers stay grounded in that context.
                                  </div>
                                </div>
                                {(geoAiModelTab === 'claude' ? visibleGeoAiClaudeMessages : visibleGeoAiDeepseekMessages).map(msg => (
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
                                      {msg.role === 'assistant' ? (
                                        <p className="si-geo-explorer-bubble-text">
                                          {stripGeoExplorerBubbleDisplayText(msg.text)}
                                        </p>
                                      ) : (
                                        <GeoAiEditQuestionTool
                                          cssPrefix="si-geo-explorer"
                                          messageId={msg.id}
                                          originalText={msg.text}
                                          onCommit={next =>
                                            (geoAiModelTab === 'claude' ? setGeoAiChatMessages : setGeoDeepseekChatMessages)(
                                              prev => prev.map(m => (m.id === msg.id ? { ...m, text: next } : m)),
                                            )
                                          }
                                          onUseInComposer={
                                            geoAiModelTab === 'claude' ? setGeoAiDraft : setGeoDeepseekDraft
                                          }
                                          suggestLayers={geoAiSuggestContext.layers}
                                          suggestFields={geoAiSuggestContext.fields}
                                          suggestNumericFields={geoAiSuggestContext.numericFields}
                                        />
                                      )}
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
                              <GeoExplorerGeminiInputRow
                                cssPrefix="si-geo-explorer"
                                draft={geoAiModelTab === 'claude' ? geoAiDraft : geoDeepseekDraft}
                                onDraftChange={v =>
                                  geoAiModelTab === 'claude' ? setGeoAiDraft(v) : setGeoDeepseekDraft(v)
                                }
                                onSend={t =>
                                  geoAiModelTab === 'claude' ? sendGeoAiChat(t) : sendGeoDeepseekChat(t)
                                }
                                busy={geoAiModelTab === 'claude' ? geoAiBusy : geoDeepseekBusy}
                                pendingImage={null}
                                showAttach={false}
                                placeholder={
                                  geoAiModelTab === 'claude'
                                    ? 'e.g. List layer names and fields from the attached GIS / Develop data…'
                                    : 'e.g. Summarize saved layers and Develop Dashboard fields (same context as Claude)…'
                                }
                                textareaAriaLabel={
                                  geoAiModelTab === 'claude' ? 'Geo AI Claude message' : 'Geo AI DeepSeek message'
                                }
                                availableLayers={geoAiSuggestContext.layers}
                                availableFields={geoAiSuggestContext.fields}
                                availableNumericFields={geoAiSuggestContext.numericFields}
                                availableGeometryOps={geoAiSuggestContext.geometryOps}
                                smartSuggestionsEnabled={geoAiSmartSuggestionsEnabled}
                              />
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
                                      {'supportsAoiEdit' in layer && layer.supportsAoiEdit ? (
                                        <button
                                          type="button"
                                          className="si-env-layer-action-btn"
                                          title="Use as AOI for analysis"
                                          aria-label={`Use ${layer.label} as AOI`}
                                          onClick={e => handleLayerActionClick(e, 'editAoi', layer.sourceLayerId)}
                                        >
                                          <i className="fa-solid fa-draw-polygon" aria-hidden />
                                        </button>
                                      ) : null}
                                      {'supportsRename' in layer && layer.supportsRename ? (
                                        <button
                                          type="button"
                                          className="si-env-layer-action-btn"
                                          title="Rename layer"
                                          aria-label={`Rename ${layer.label}`}
                                          onClick={e => handleLayerActionClick(e, 'rename', layer.sourceLayerId)}
                                        >
                                          <i className="fa-solid fa-pen-to-square" aria-hidden />
                                        </button>
                                      ) : null}
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
            className={`gis-modal gis-modal-compact ddb-add-source-modal${siAddLayerWizard === 'home' ? ' ddb-add-source-modal--home' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="si-layer-modal-title"
            onMouseDown={e => e.stopPropagation()}
          >
            {siAddLayerWizard === 'home' ? (
              <>
                <div className="gis-modal-compact-hero">
                  <h2 className="gis-modal-compact-hero-title" id="si-layer-modal-title">
                    Add Source Data
                  </h2>
                  <p className="gis-modal-compact-hero-lead">
                    Choose how you want to add layers to the registry for analytics and maps.
                  </p>
                </div>
                <div className="si-add-source-options" role="radiogroup" aria-label="Layer source type">
                  {[
                    {
                      id: 'giscontent' as AddLayerTab,
                      title: 'Select from GIS Content',
                      sub: 'Use layers already saved in GIS Map in this browser.',
                      icon: 'fa-solid fa-layer-group',
                    },
                    {
                      id: 'arcgis' as AddLayerTab,
                      title: 'Provide an ArcGIS Server layer URL',
                      sub: 'Connect to a feature service and pick a layer or table.',
                      icon: 'fa-solid fa-link',
                    },
                    {
                      id: 'upload' as AddLayerTab,
                      title: 'Upload a file',
                      sub: 'GeoJSON, KML, KMZ, Shapefile (zip), CSV with coordinates, and more.',
                      icon: 'fa-solid fa-file-arrow-up',
                    },
                    {
                      id: 'url' as AddLayerTab,
                      title: 'From URL',
                      sub: 'Remote GeoJSON / ZIP / KML.',
                      icon: 'fa-solid fa-globe',
                    },
                    {
                      id: 'raster' as AddLayerTab,
                      title: 'Raster path / URL',
                      sub: 'GeoTIFF/Image Service path or remote raster URL.',
                      icon: 'fa-regular fa-image',
                    },
                    {
                      id: 'database' as AddLayerTab,
                      title: 'Get Data',
                      sub: 'Database, web URL, and advanced connectors.',
                      icon: 'fa-solid fa-database',
                    },
                  ].map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      className="si-add-source-option"
                      onClick={() => {
                        setAddLayerTab(opt.id);
                        if (opt.id === 'giscontent') setSiAddLayerWizard('gis-list');
                        else setSiAddLayerWizard('source-forms');
                      }}
                    >
                      <span className="si-add-source-option-radio" aria-hidden />
                      <span className="si-add-source-option-icon" aria-hidden>
                        <i className={opt.icon} />
                      </span>
                      <span className="si-add-source-option-main">
                        <strong>{opt.title}</strong>
                        <small>{opt.sub}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            ) : siAddLayerWizard === 'gis-list' ? (
              <>
                <div className="ddb-add-source-modal__head">
                  <div className="gis-modal-compact-title" id="si-layer-modal-title">
                    Add Source Data
                  </div>
                  <button type="button" className="ddb-add-source-back" onClick={goSiAddLayerWizardHome}>
                    <i className="fa-solid fa-arrow-left" aria-hidden /> All options
                  </button>
                </div>
                <div className="ddb-add-source-gis-list gis-modal-body">
                  <div className="si-add-source-gis-banner">
                    <p className="ddb-add-source-gis-hint">
                      Layers below come from your <strong>GIS Map</strong> session (IndexedDB). Import copies feature data into
                      this map.
                    </p>
                  </div>
                  {isLoadingGisContentCandidates ? (
                    <div className="ddb-add-source-loading">
                      <i className="fa-solid fa-spinner fa-spin" aria-hidden /> Loading GIS Content…
                    </div>
                  ) : gisContentCandidates.length === 0 ? (
                    <div className="ddb-add-source-empty">
                      <i className="fa-regular fa-folder-open" aria-hidden />
                      <p>No saved layers yet. Open GIS Map, add a layer, then return here.</p>
                    </div>
                  ) : (
                    <ul className="ddb-gis-content-list">
                      {gisContentCandidates.map(layer => {
                        const busy = addingGisContentCandidateId === layer.id;
                        const sourceLabel =
                          layer.source === 'arcgis'
                            ? 'ArcGIS'
                            : layer.source === 'upload'
                              ? 'Upload'
                              : layer.source === 'url'
                                ? 'URL'
                                : null;
                        return (
                          <li key={layer.id} className="ddb-gis-content-row">
                            <div className="ddb-gis-content-meta">
                              <span className="ddb-gis-content-name">{layer.name}</span>
                              <span className="ddb-gis-content-badges">
                                <span className="ddb-gis-badge">GeoJSON</span>
                                {sourceLabel ? (
                                  <span className="ddb-gis-badge ddb-gis-badge--muted">{sourceLabel}</span>
                                ) : (
                                  <span className="ddb-gis-badge ddb-gis-badge--muted">Local</span>
                                )}
                              </span>
                            </div>
                            <button
                              type="button"
                              className="ddb-gis-content-add-btn"
                              disabled={busy}
                              onClick={() => addGisContentLayerByCandidateId(layer.id)}
                            >
                              {busy ? 'Adding…' : 'Add'}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="ddb-add-source-modal__head">
                  <div className="gis-modal-compact-title" id="si-layer-modal-title">
                    Add Source Data
                  </div>
                  <button type="button" className="ddb-add-source-back" onClick={goSiAddLayerWizardHome}>
                    <i className="fa-solid fa-arrow-left" aria-hidden /> All options
                  </button>
                </div>
                <div className="gis-modal-compact-tabs" role="tablist" aria-label="Add layer source">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={addLayerTab === 'arcgis'}
                    className={(addLayerTab === 'arcgis' ? 'gis-compact-tab active' : 'gis-compact-tab') + ' gis-compact-tab--icon'}
                    title="ArcGIS Feature Service"
                    onClick={() => setAddLayerTab('arcgis')}
                  >
                    <i className="fa-solid fa-link" aria-hidden />
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={addLayerTab === 'upload'}
                    className={(addLayerTab === 'upload' ? 'gis-compact-tab active' : 'gis-compact-tab') + ' gis-compact-tab--icon'}
                    title="Upload file"
                    onClick={() => setAddLayerTab('upload')}
                  >
                    <i className="fa-solid fa-file-arrow-up" aria-hidden />
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={addLayerTab === 'url'}
                    className={(addLayerTab === 'url' ? 'gis-compact-tab active' : 'gis-compact-tab') + ' gis-compact-tab--icon'}
                    title="From URL"
                    onClick={() => setAddLayerTab('url')}
                  >
                    <i className="fa-solid fa-globe" aria-hidden />
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={addLayerTab === 'raster'}
                    className={(addLayerTab === 'raster' ? 'gis-compact-tab active' : 'gis-compact-tab') + ' gis-compact-tab--icon'}
                    title="Raster path / URL"
                    onClick={() => setAddLayerTab('raster')}
                  >
                    <i className="fa-regular fa-image" aria-hidden />
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={addLayerTab === 'database'}
                    className={(addLayerTab === 'database' ? 'gis-compact-tab active' : 'gis-compact-tab') + ' gis-compact-tab--icon'}
                    title="Database"
                    onClick={() => setAddLayerTab('database')}
                  >
                    <i className="fa-solid fa-database" aria-hidden />
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
              ) : addLayerTab === 'url' || addLayerTab === 'raster' ? (
                <div key="url" role="tabpanel" aria-label="Remote URL">
                  <input
                    type="url"
                    className="gis-input"
                    placeholder={
                      addLayerTab === 'raster'
                        ? 'Raster path / URL (GeoTIFF, Image Service, tile endpoint)'
                        : 'https://.../layer.geojson or .zip'
                    }
                    value={addLayerRemoteUrl}
                    onChange={e => setAddLayerRemoteUrl(e.target.value)}
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
                  <button type="button" className="gis-btn-primary-full" onClick={() => void importRemoteUrlLayer()} disabled={isImportingRemoteLayer}>
                    <i className="fa-solid fa-cloud-arrow-down" aria-hidden />{' '}
                    {isImportingRemoteLayer ? 'Importing…' : addLayerTab === 'raster' ? 'Import Raster path / URL' : 'Import from URL'}
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
                    onDragOver={e => {
                      e.preventDefault();
                    }}
                    onDrop={e => {
                      e.preventDefault();
                      const file = e.dataTransfer?.files?.[0];
                      if (!file) return;
                      void (async () => {
                        try {
                          await importAoiDataSourceFile(file);
                        } catch (error) {
                          setAddLayerStatus(error instanceof Error ? error.message : 'Failed to import dropped AOI file.');
                        }
                      })();
                    }}
                  >
                    <div className="gis-dropzone-icon" aria-hidden>
                      <i className="fa-solid fa-upload" />
                    </div>
                    <div className="gis-dropzone-text">Drop a file here or click to browse</div>
                    <div className="gis-dropzone-subtext">
                      Supports: SHP (.zip), KML/KMZ, GeoJSON.
                    </div>
                  </div>
                  <input type="text" className="gis-input" placeholder="Layer Name (optional)" value={addLayerName} onChange={e => setAddLayerName(e.target.value)} />
                  <button type="button" className="gis-btn-primary-full" onClick={handleUploadCustomLayerClick}>
                    <i className="fa-solid fa-upload" aria-hidden /> Upload & Import
                  </button>
                </div>
              )}
                </div>
              </>
            )}
            {addLayerStatus ? <p className="gis-modal-compact-status">{addLayerStatus}</p> : null}
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
          <div
            className={
              activeLayerActionDialog.mode === 'symbology'
                ? 'si-layer-action-modal gis-modal gis-modal-styles'
                : `si-layer-action-modal${activeLayerActionDialog.mode === 'table' ? ' si-layer-action-modal--gis-table' : ''}`
            }
            onMouseDown={e => e.stopPropagation()}
          >
            {activeLayerActionDialog.mode === 'symbology' ? (
              <div className="gis-modal-header">
                <div className="gis-modal-header-left">
                  <div className="gis-modal-icon" aria-hidden="true">
                    <i className="fa-solid fa-palette" />
                  </div>
                  <div className="gis-modal-title" id="si-layer-action-title">
                    Styles - {activeDialogLayer.name}
                  </div>
                </div>
                <button
                  className="gis-sidebar-close"
                  type="button"
                  onClick={() => setActiveLayerActionDialog(null)}
                  aria-label="Close dialog"
                >
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <div className="si-layer-action-modal-header">
                <h3 id="si-layer-action-title">
                  {activeLayerActionDialog.mode === 'table' ? (
                    <>
                      <span className="si-layer-action-modal-table-title" aria-hidden>
                        <i className="fa-solid fa-table" />
                      </span>
                      <span>Table — {activeDialogLayer.name}</span>
                    </>
                  ) : (
                    `Legend - ${activeDialogLayer.name}`
                  )}
                </h3>
                <button type="button" className="si-layer-action-close" onClick={() => setActiveLayerActionDialog(null)} aria-label="Close layer dialog">
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>
            )}
            <div className={activeLayerActionDialog.mode === 'symbology' ? 'gis-modal-body' : 'si-layer-action-modal-body'}>
              {activeLayerActionDialog.mode === 'table' ? (
                activeLayerColumns.length ? (
                  <div
                    className={`si-layer-action-table-layout si-layer-action-table-layout--gis${tableToolsCollapsed ? ' si-layer-action-table-layout--tools-collapsed' : ''}`}
                  >
                    <aside
                      className={
                        tableToolsCollapsed
                          ? 'gis-table-dock-sidebar collapsed si-layer-action-table-tools'
                          : 'gis-table-dock-sidebar si-layer-action-table-tools'
                      }
                      aria-label="Table tools"
                    >
                      <button
                        className="gis-table-toolbtn"
                        type="button"
                        onClick={() => void zoomSiTableToSelection()}
                        disabled={tableSelectedKeys.size === 0}
                        title="Zoom to selection"
                      >
                        <i className="fa-solid fa-magnifying-glass-plus" aria-hidden />
                        <span className="gis-table-tooltext">Zoom to selection</span>
                      </button>
                      <button className="gis-table-toolbtn" type="button" onClick={siTableGoHome} title="Home">
                        <i className="fa-solid fa-house" aria-hidden />
                        <span className="gis-table-tooltext">Home</span>
                      </button>
                      <div className="gis-table-toolsep" role="separator" />
                      <button
                        className="gis-table-toolbtn"
                        type="button"
                        onClick={() => setTableSelectedKeys(new Set())}
                        disabled={tableSelectedKeys.size === 0}
                        title="Clear selection"
                      >
                        <i className="fa-solid fa-eraser" aria-hidden />
                        <span className="gis-table-tooltext">Clear selection</span>
                      </button>
                      <button
                        className="gis-table-toolbtn"
                        type="button"
                        onClick={() => setTableShowSelectedOnly(true)}
                        disabled={tableSelectedKeys.size === 0}
                        title="Show selected"
                      >
                        <i className="fa-solid fa-filter" aria-hidden />
                        <span className="gis-table-tooltext">Show selected</span>
                      </button>
                      <button
                        className="gis-table-toolbtn"
                        type="button"
                        onClick={() => setTableShowSelectedOnly(false)}
                        disabled={!tableShowSelectedOnly}
                        title="Show all"
                      >
                        <i className="fa-solid fa-list" aria-hidden />
                        <span className="gis-table-tooltext">Show all</span>
                      </button>
                      <div className="gis-table-toolsep" role="separator" />
                      <button
                        className="gis-table-toolbtn"
                        type="button"
                        onClick={() => void refreshArcgisLayer(activeDialogLayer)}
                        disabled={
                          activeDialogLayer.source !== 'arcgis' ||
                          !activeDialogLayer.sourceUrl?.trim() ||
                          syncingLayerId === activeDialogLayer.id
                        }
                        title="Refresh"
                      >
                        <i className="fa-solid fa-rotate-right" aria-hidden />
                        <span className="gis-table-tooltext">{syncingLayerId === activeDialogLayer.id ? 'Refreshing…' : 'Refresh'}</span>
                      </button>
                      <div className="gis-table-toolsep" role="separator" />
                      <button className="gis-table-toolbtn" type="button" onClick={exportTableAsCsv} title="Export CSV">
                        <i className="fa-solid fa-file-export" aria-hidden />
                        <span className="gis-table-tooltext">Export CSV</span>
                      </button>
                      <button className="gis-table-toolbtn" type="button" onClick={saveSiTableFormat} title="Save format">
                        <i className="fa-solid fa-floppy-disk" aria-hidden />
                        <span className="gis-table-tooltext">Save format</span>
                      </button>
                      <button className="gis-table-toolbtn" type="button" onClick={applySiTableFormat} title="Apply format">
                        <i className="fa-solid fa-layer-group" aria-hidden />
                        <span className="gis-table-tooltext">Apply format</span>
                      </button>
                      <button
                        className="gis-table-toolbtn gis-table-toolbtn--icon-only"
                        type="button"
                        onClick={() => setTableToolsCollapsed(v => !v)}
                        aria-expanded={!tableToolsCollapsed}
                        aria-label={tableToolsCollapsed ? 'Expand tools' : 'Collapse tools'}
                        title={tableToolsCollapsed ? 'Expand tools' : 'Collapse tools'}
                      >
                        <i className={tableToolsCollapsed ? 'fa-solid fa-angles-right' : 'fa-solid fa-angles-left'} aria-hidden />
                      </button>
                    </aside>
                    <div className="si-layer-action-table-main gis-layer-table-wrap gis-table-dock-table">
                      <div className="gis-table-dock-header si-table-modal-subheader">
                        <div className="gis-table-dock-meta si-table-modal-meta">
                          {activeTableFeatures.length} record{activeTableFeatures.length === 1 ? '' : 's'}, {tableSelectedKeys.size} selected
                        </div>
                      </div>
                      <div className="gis-layer-table-meta">
                        <div className="gis-layer-table-metatext">
                          {tableShowSelectedOnly ? `Showing selected: ${siFilteredTableFeatures.length}` : `Showing ${siFilteredTableFeatures.length}`}{' '}
                          of {activeTableFeatures.length} feature(s)
                          {activeTableFeatures.length >= SI_TABLE_MAX_FEATURES ? ` (first ${SI_TABLE_MAX_FEATURES} loaded)` : ''}
                        </div>
                        <div className="gis-table-controls">
                          <label className="gis-table-domain-toggle">
                            <span>Search mode</span>
                            <select
                              value={tableSearchMode}
                              onChange={e => setTableSearchMode(e.target.value as SiTableSearchMode)}
                              aria-label="Table search mode"
                            >
                              <option value="description">Description</option>
                              <option value="code">Code</option>
                              <option value="both">Both</option>
                            </select>
                          </label>
                          <label className="gis-table-search">
                            <i className="fa-solid fa-magnifying-glass" aria-hidden />
                            <input
                              value={tableSearchText}
                              onChange={e => setTableSearchText(e.target.value)}
                              placeholder={
                                tableSearchMode === 'code'
                                  ? 'Search codes...'
                                  : tableSearchMode === 'both'
                                    ? 'Search descriptions or codes...'
                                    : 'Search descriptions...'
                              }
                              aria-label="Search table"
                            />
                          </label>
                        </div>
                      </div>
                      <div className="gis-table-advanced-controls" aria-label="Advanced table filter">
                        <label>
                          <span>Filter field</span>
                          <select value={tableFilterField} onChange={e => setTableFilterField(e.target.value)}>
                            <option value="">All records</option>
                            {orderedSiTableFields.map(f => (
                              <option key={f} value={f}>
                                {f}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>Rule</span>
                          <select
                            value={tableFilterOperator}
                            onChange={e => setTableFilterOperator(e.target.value as SiTableFilterOperator)}
                          >
                            <option value="contains">Contains</option>
                            <option value="equals">Equals</option>
                            <option value="not_equals">Not equals</option>
                            <option value="empty">Is empty</option>
                            <option value="not_empty">Is not empty</option>
                          </select>
                        </label>
                        <label>
                          <span>Value</span>
                          <input
                            value={tableFilterValue}
                            onChange={e => setTableFilterValue(e.target.value)}
                            disabled={tableFilterOperator === 'empty' || tableFilterOperator === 'not_empty'}
                            placeholder="Filter value"
                          />
                        </label>
                        <button
                          className="gis-table-filter-clear"
                          type="button"
                          onClick={() => {
                            setTableFilterField('');
                            setTableFilterOperator('contains');
                            setTableFilterValue('');
                          }}
                        >
                          Clear filter
                        </button>
                      </div>
                      <div className="si-layer-action-table-wrap">
                        <table className="gis-layer-table si-layer-action-table">
                          <thead>
                            <tr>
                              <th className="gis-layer-table-select">
                                <input
                                  type="checkbox"
                                  aria-label="Select all rows"
                                  checked={
                                    siFilteredTableFeatures.length > 0 &&
                                    siFilteredTableFeatures.every(ft => {
                                      const idx = activeTableFeatures.indexOf(ft);
                                      if (idx < 0) return false;
                                      return tableSelectedKeys.has(
                                        siComputeFeatureRowKey(ft, idx, siTableFeatureKeyCacheRef.current),
                                      );
                                    })
                                  }
                                  onChange={() => {
                                    const cache = siTableFeatureKeyCacheRef.current;
                                    const keysOnScreen = siFilteredTableFeatures
                                      .map(ft => {
                                        const idx = activeTableFeatures.indexOf(ft);
                                        return idx >= 0 ? siComputeFeatureRowKey(ft, idx, cache) : '';
                                      })
                                      .filter(Boolean);
                                    const everySel =
                                      keysOnScreen.length > 0 && keysOnScreen.every(k => tableSelectedKeys.has(k));
                                    setTableSelectedKeys(prev => {
                                      const next = new Set(prev);
                                      if (everySel) keysOnScreen.forEach(k => next.delete(k));
                                      else keysOnScreen.forEach(k => next.add(k));
                                      return next;
                                    });
                                  }}
                                />
                              </th>
                              {visibleSiTableFields.map(f => (
                                <th
                                  key={f}
                                  draggable
                                  className={draggingSiTableField === f ? 'gis-table-column-dragging' : undefined}
                                  title="Drag to reorder column"
                                  onDragStart={e => {
                                    setDraggingSiTableField(f);
                                    e.dataTransfer.effectAllowed = 'move';
                                    e.dataTransfer.setData('text/plain', f);
                                  }}
                                  onDragOver={e => {
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = 'move';
                                  }}
                                  onDrop={e => {
                                    e.preventDefault();
                                    moveSiTableColumn(e.dataTransfer.getData('text/plain') || draggingSiTableField || '', f);
                                    setDraggingSiTableField(null);
                                  }}
                                  onDragEnd={() => setDraggingSiTableField(null)}
                                >
                                  <span className="gis-table-column-label">
                                    <i className="fa-solid fa-grip-vertical" aria-hidden />
                                    {f}
                                    <span className="gis-table-column-actions">
                                      <button
                                        type="button"
                                        onClick={() => moveSiTableColumnByOffset(f, -1)}
                                        disabled={orderedSiTableFields.indexOf(f) <= 0}
                                        aria-label={`Move ${f} column left`}
                                        title="Move left"
                                      >
                                        <i className="fa-solid fa-chevron-left" aria-hidden />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => moveSiTableColumnByOffset(f, 1)}
                                        disabled={orderedSiTableFields.indexOf(f) >= orderedSiTableFields.length - 1}
                                        aria-label={`Move ${f} column right`}
                                        title="Move right"
                                      >
                                        <i className="fa-solid fa-chevron-right" aria-hidden />
                                      </button>
                                    </span>
                                  </span>
                                </th>
                              ))}
                              <th className="gis-layer-table-actions" aria-label="Actions" />
                              <th className="gis-layer-table-fieldvis" aria-label="Field visibility">
                                <FieldVisibilityControl
                                  layerId={activeDialogLayer.id}
                                  fields={orderedSiTableFields}
                                  hiddenFields={hiddenSiTableFieldsByLayerId[activeDialogLayer.id] ?? new Set()}
                                  onChangeHiddenFields={next =>
                                    setHiddenSiTableFieldsByLayerId(prev => ({ ...prev, [activeDialogLayer.id]: next }))
                                  }
                                />
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {siFilteredTableFeatures.map(ft => {
                              const idx = activeTableFeatures.indexOf(ft);
                              const rowKey =
                                idx >= 0 ? siComputeFeatureRowKey(ft, idx, siTableFeatureKeyCacheRef.current) : '';
                              const isSel = rowKey ? tableSelectedKeys.has(rowKey) : false;
                              return (
                                <tr key={rowKey || JSON.stringify(ft?.properties ?? {})} className={isSel ? 'gis-row-selected' : undefined}>
                                  <td className="gis-layer-table-select">
                                    <input
                                      type="checkbox"
                                      aria-label="Select row"
                                      checked={isSel}
                                      disabled={!rowKey}
                                      onChange={() => {
                                        if (!rowKey) return;
                                        setTableSelectedKeys(prev => {
                                          const next = new Set(prev);
                                          if (next.has(rowKey)) next.delete(rowKey);
                                          else next.add(rowKey);
                                          return next;
                                        });
                                      }}
                                    />
                                  </td>
                                  {visibleSiTableFields.map(f => {
                                    const v = ft?.properties?.[f];
                                    const out = getArcDisplayValue(ft, f, v, arcDefSiTable, arcFieldsByLowerSi, 'description');
                                    return (
                                      <td key={f} title={out.title}>
                                        <span
                                          className={[
                                            'gis-domain-cell',
                                            out.missingDescription ? 'missing-description' : '',
                                          ]
                                            .filter(Boolean)
                                            .join(' ')}
                                        >
                                          {out.missingDescription ? (
                                            <i className="fa-solid fa-triangle-exclamation" aria-hidden title="No domain description" />
                                          ) : null}
                                          {renderSiTableHighlightedValue(out.display)}
                                        </span>
                                      </td>
                                    );
                                  })}
                                  <td className="gis-layer-table-actions">
                                    <button
                                      className="gis-table-rowbtn"
                                      type="button"
                                      aria-label="Zoom to feature"
                                      title="Zoom to feature"
                                      onClick={() => {
                                        const map = mapRef.current?.getMap?.() ?? mapRef.current;
                                        if (!map || !ft?.geometry) return;
                                        const b = getGeoJsonBounds({
                                          type: 'Feature',
                                          geometry: ft.geometry,
                                          properties: {},
                                        });
                                        if (!b || typeof map.fitBounds !== 'function') return;
                                        map.fitBounds(
                                          [
                                            [b[0], b[1]],
                                            [b[2], b[3]],
                                          ],
                                          { padding: 120, duration: 600, maxZoom: 17 },
                                        );
                                      }}
                                    >
                                      <i className="fa-solid fa-crosshairs" aria-hidden />
                                    </button>
                                  </td>
                                  <td className="gis-layer-table-fieldvis" aria-hidden />
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="si-layer-action-empty">No attributes found for this layer.</p>
                )
              ) : activeLayerActionDialog.mode === 'symbology' ? (
                <>
                  <div className="gis-style-hero">
                    <div className="gis-style-subtitle">Choose an attribute and visualization style. Preview updates live on the map.</div>
                    <label
                      className={`gis-style-check${
                        !canUseArcGisOnline && !symbologyDraft.useArcGisOnline ? ' gis-style-check--disabled' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(symbologyDraft.useArcGisOnline)}
                        disabled={!canUseArcGisOnline && !symbologyDraft.useArcGisOnline}
                        onChange={e => {
                          const on = e.target.checked;
                          if (on) {
                            updateSymbologyDraft({ useArcGisOnline: true });
                            if (
                              !activeDialogLayer.arcgisDrawingInfo &&
                              typeof activeDialogLayer.sourceUrl === 'string' &&
                              activeDialogLayer.sourceUrl.trim()
                            ) {
                              void (async () => {
                                try {
                                  const raw = await fetchArcgisLayerDrawingInfo(activeDialogLayer.sourceUrl!, activeDialogLayer.authToken);
                                  const cleaned = raw ? sanitizeArcgisDrawingInfoForClient(raw) : null;
                                  if (!cleaned) return;
                                  setCustomLayers(prev =>
                                    prev.map(l => (l.id === activeDialogLayer.id ? { ...l, arcgisDrawingInfo: cleaned } : l)),
                                  );
                                } catch {
                                  /* keep toggle usable even if renderer fetch fails */
                                }
                              })();
                            }
                          } else {
                            updateSymbologyDraft({ useArcGisOnline: false });
                          }
                        }}
                      />
                      <span>Use ArcGIS Online symbology</span>
                    </label>
                  </div>

                  {symbologyDraft.useArcGisOnline ? (
                    <>
                      <div className="gis-style-info">
                        ArcGIS renderer preview is enabled. Uncheck &quot;Use ArcGIS Online symbology&quot; to configure custom styles.
                      </div>
                      {(() => {
                        const renderer =
                          (activeDialogLayer.arcgisDrawingInfo as any)?.renderer ??
                          (activeDialogLayer.arcgisLayerDefinition as any)?.drawingInfo?.renderer;
                        const visLabel = describeArcGisRendererVisualization(renderer);
                        const styleLabel =
                          symbologyDraft.style === 'unique'
                            ? 'Types (unique symbols)'
                            : symbologyDraft.style === 'color_size'
                              ? 'Counts and Amounts (color + size)'
                              : symbologyDraft.style === 'size'
                                ? 'Counts and Amounts (size)'
                                : symbologyDraft.style === 'dot_density'
                                  ? 'Dot density'
                                  : symbologyDraft.style === 'threshold_markers'
                                    ? 'Single symbol + threshold markers'
                                    : 'Counts and Amounts (color)';
                        return (
                          <div className="gis-style-card" aria-label="ArcGIS visualization">
                            <div className="gis-style-grid">
                              <div className="gis-style-field">
                                <div className="gis-style-label">Visualization style</div>
                                <div className="gis-style-readonly" title={visLabel}>
                                  {renderer ? visLabel : 'Loading or unavailable — sync the layer if symbols look wrong.'}
                                </div>
                              </div>
                              <div className="gis-style-field">
                                <div className="gis-style-label">Linked custom style (when unchecked)</div>
                                <div className="gis-style-readonly">
                                  {styleLabel}
                                  {symbologyDraft.field ? ` · ${symbologyDraft.field}` : ''}
                                </div>
                              </div>
                            </div>
                            {renderer?.type === 'heatmap' ? (
                              <div className="gis-style-info" style={{ marginTop: 10 }}>
                                Heatmap renderers are not reproduced on this Mapbox map; use custom styles or a heatmap-capable client for this
                                visualization.
                              </div>
                            ) : null}
                          </div>
                        );
                      })()}
                    </>
                  ) : (
                    (() => {
                      const allFields = getGeoJsonFields(activeDialogLayer.geojson);
                      const numericFields = getNumericFields(activeDialogLayer.geojson);
                      const ctx = siSymbologyCtx;
                      const geometryKind = ctx?.geometryKind ?? getLayerGeometryKind(activeDialogLayer.geojson);
                      const isUnique = symbologyDraft.style === 'unique';
                      const classes = clampInt(symbologyDraft.classes, 2, 12);
                      const showColor =
                        symbologyDraft.style === 'color' ||
                        symbologyDraft.style === 'color_size' ||
                        (isUnique && geometryKind !== 'line');
                      const showSize = symbologyDraft.style === 'size' || symbologyDraft.style === 'color_size';
                      const showMethod =
                        symbologyDraft.style !== 'unique' && symbologyDraft.style !== 'threshold_markers';
                      const showClasses = true;
                      const arcDef = activeDialogLayer.arcgisLayerDefinition ?? null;
                      const fieldsByLower = buildArcFieldsByLower(arcDef);
                      const fieldNm = symbologyDraft.field;
                      const layerFeatures = Array.isArray((activeDialogLayer.geojson as any)?.features)
                        ? ((activeDialogLayer.geojson as any).features as any[])
                        : [];
                      const uniqueLegendLabel = (val: string) => {
                        if (!fieldNm) return val;
                        const rep = layerFeatures.find((f: any) => {
                          const r = f?.properties?.[fieldNm];
                          if (r === null || r === undefined || r === '') return false;
                          return String(r) === val;
                        });
                        if (rep && arcDef) {
                          const raw = rep.properties?.[fieldNm];
                          return (
                            getArcDisplayValue(rep, fieldNm, raw, arcDef, fieldsByLower, 'description').display || val
                          );
                        }
                        if (arcDef) return arcLegendLabelForFieldValue(fieldNm, val, arcDef, fieldsByLower);
                        return val;
                      };
                      const legendItems = (() => {
                        const items: Array<{
                          label: string;
                          kind: 'line' | 'point' | 'polygon';
                          color: string;
                          width: number;
                          dash?: string;
                          fill?: string;
                        }> = [];
                        if (!ctx) return items;
                        const baseStroke = activeDialogLayer.color || '#22c55e';
                        const baseWeight = 2;
                        const kind: 'line' | 'point' | 'polygon' =
                          geometryKind === 'polygon' ? 'polygon' : geometryKind === 'point' ? 'point' : 'line';
                        if (symbologyDraft.style === 'unique') {
                          if (kind === 'line') {
                            const vals = ctx.categories.length ? ctx.categories : Object.keys(ctx.uniqueDashes);
                            vals.slice(0, 12).forEach(val => {
                              items.push({
                                label: uniqueLegendLabel(val),
                                kind,
                                color: baseStroke,
                                width: baseWeight,
                                dash: ctx.uniqueDashes[val] ?? '',
                              });
                            });
                            if (vals.length === 0) items.push({ label: 'No values', kind, color: baseStroke, width: baseWeight });
                            return items;
                          }
                          const vals = ctx.categories.length ? ctx.categories : Object.keys(ctx.categoryColors);
                          vals.slice(0, 12).forEach(val => {
                            const fill = ctx.categoryColors[val] ?? ctx.otherColor;
                            items.push({
                              label: uniqueLegendLabel(val),
                              kind,
                              color: darkenColor(fill, 0.25),
                              width: baseWeight,
                              fill,
                            });
                          });
                          if (vals.length === 0)
                            items.push({ label: 'No values', kind, color: baseStroke, width: baseWeight, fill: baseStroke });
                          return items;
                        }
                        if (symbologyDraft.style === 'threshold_markers') {
                          items.push({ label: 'Base', kind, color: baseStroke, width: baseWeight });
                          items.push({
                            label: `Marker ≥ ${ctx.threshold.toFixed(2)}`,
                            kind: 'point',
                            color: '#ef4444',
                            width: 4,
                            fill: '#ef4444',
                          });
                          return items;
                        }
                        const breaks = ctx.breaks;
                        for (let i = 0; i < Math.min(classes, breaks.length - 1); i += 1) {
                          const a = breaks[i];
                          const b = breaks[i + 1];
                          const label = `${a.toFixed(2)} – ${b.toFixed(2)}`;
                          const color = showColor ? ctx.colors[i] ?? baseStroke : baseStroke;
                          const width = showSize ? ctx.widths[i] ?? baseWeight : baseWeight;
                          const dash = symbologyDraft.style === 'dot_density' ? ctx.dotDashes[i] : undefined;
                          if (kind === 'polygon') {
                            const fill = showColor ? color : baseStroke;
                            items.push({ label, kind, color: darkenColor(fill, 0.25), width, dash, fill });
                          } else if (kind === 'point') {
                            const fill = showColor ? color : baseStroke;
                            items.push({ label, kind, color: darkenColor(fill, 0.25), width, dash, fill });
                          } else {
                            items.push({ label, kind, color, width, dash });
                          }
                        }
                        return items;
                      })();

                      return (
                        <>
                          <div className="gis-style-card">
                            <div className="gis-style-grid">
                              <div className="gis-style-field">
                                <div className="gis-style-label">Style</div>
                                <div className="gis-style-selectwrap">
                                  <select
                                    className="gis-style-select"
                                    value={symbologyDraft.style}
                                    onChange={e => updateSymbologyDraft({ style: e.target.value as SymbologyStyle })}
                                  >
                                    <option value="unique">Types (unique symbols)</option>
                                    <option value="color">Counts and Amounts (color)</option>
                                    <option value="size">Counts and Amounts (size)</option>
                                    <option value="color_size">Counts and Amounts (color + size)</option>
                                    <option value="dot_density">Dot density</option>
                                    <option value="threshold_markers">Single symbol + threshold markers</option>
                                  </select>
                                  <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                                </div>
                              </div>

                              <div className="gis-style-field">
                                <div className="gis-style-label">{isUnique ? 'Attribute (categorical)' : 'Attribute (numeric)'}</div>
                                <div className="gis-style-selectwrap">
                                  <select
                                    className="gis-style-select"
                                    value={symbologyDraft.field}
                                    onChange={e => updateSymbologyDraft({ field: e.target.value })}
                                  >
                                    {isUnique ? (
                                      allFields.length ? null : (
                                        <option value="">No fields</option>
                                      )
                                    ) : numericFields.length ? null : (
                                      <option value="">No numeric fields</option>
                                    )}
                                    {(isUnique ? allFields : numericFields).map(f => (
                                      <option key={f} value={f}>
                                        {f}
                                      </option>
                                    ))}
                                  </select>
                                  <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                                </div>
                              </div>

                              {showColor ? (
                                <div className="gis-style-field">
                                  <div className="gis-style-label">Color ramp</div>
                                  <div className="gis-style-selectwrap">
                                    <select
                                      className="gis-style-select"
                                      value={symbologyDraft.colorRamp}
                                      onChange={e => updateSymbologyDraft({ colorRamp: e.target.value as SymbologyColorRamp })}
                                    >
                                      <option value="viridis">Viridis</option>
                                      <option value="blues">Blues</option>
                                      <option value="greens">Greens</option>
                                      <option value="plasma">Plasma</option>
                                      <option value="magma">Magma</option>
                                      <option value="turbo">Turbo</option>
                                    </select>
                                    <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                                  </div>
                                </div>
                              ) : null}

                              {showClasses ? (
                                <div className="gis-style-field">
                                  <div className="gis-style-label">{isUnique ? 'Max categories' : 'Classes'}</div>
                                  <div className="gis-style-selectwrap">
                                    <select
                                      className="gis-style-select"
                                      value={String(classes)}
                                      onChange={e => updateSymbologyDraft({ classes: parseInt(e.target.value, 10) })}
                                    >
                                      {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
                                        <option key={n} value={String(n)}>
                                          {n}
                                        </option>
                                      ))}
                                    </select>
                                    <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                                  </div>
                                </div>
                              ) : null}

                              {showMethod ? (
                                <div className="gis-style-field">
                                  <div className="gis-style-label">Method</div>
                                  <div className="gis-style-selectwrap">
                                    <select
                                      className="gis-style-select"
                                      value={symbologyDraft.method}
                                      onChange={e => updateSymbologyDraft({ method: e.target.value as SymbologyClassMethod })}
                                    >
                                      <option value="jenks">Natural breaks</option>
                                      <option value="quantile">Quantile</option>
                                      <option value="equal_interval">Equal interval</option>
                                    </select>
                                    <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                                  </div>
                                </div>
                              ) : null}

                              {symbologyDraft.style === 'threshold_markers' ? (
                                <div className="gis-style-field">
                                  <div className="gis-style-label">Threshold</div>
                                  <input
                                    className="gis-style-input"
                                    type="number"
                                    value={Number.isFinite(symbologyDraft.threshold) ? String(symbologyDraft.threshold) : ''}
                                    onChange={e =>
                                      updateSymbologyDraft({
                                        threshold: e.target.value === '' ? Number.NaN : Number(e.target.value),
                                      })
                                    }
                                    placeholder="Threshold"
                                  />
                                </div>
                              ) : null}
                            </div>
                          </div>

                          <div className="gis-style-card gis-style-card-legend">
                            <div className="gis-style-legend">
                              {legendItems.map((it, idx) => (
                                <div key={idx} className="gis-style-legend-row">
                                  <svg width="62" height="14" viewBox="0 0 62 14" aria-hidden="true">
                                    {it.kind === 'line' ? (
                                      <line
                                        x1="4"
                                        y1="7"
                                        x2="58"
                                        y2="7"
                                        stroke={it.color}
                                        strokeWidth={it.width}
                                        strokeLinecap="round"
                                        strokeDasharray={it.dash || undefined}
                                      />
                                    ) : it.kind === 'polygon' ? (
                                      <rect x="18" y="2" width="26" height="10" rx="3" fill={it.fill || it.color} stroke={it.color} strokeWidth="2" />
                                    ) : (
                                      <circle cx="31" cy="7" r="5" fill={it.fill || it.color} stroke={it.color} strokeWidth="2" />
                                    )}
                                  </svg>
                                  <div className="gis-style-legend-text">{it.label}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </>
                      );
                    })()
                  )}

                  <div className="gis-style-footer">
                    <button className="gis-btn" type="button" onClick={() => setActiveLayerActionDialog(null)}>
                      Cancel
                    </button>
                    <button className="gis-btn gis-btn-primary" type="button" onClick={() => void applySymbologyDraft()}>
                      Save Style
                    </button>
                  </div>
                </>
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
