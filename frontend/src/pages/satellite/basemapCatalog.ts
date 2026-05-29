/**
 * Shared basemap definitions for GIS Map (Leaflet) and Satellite Intelligence (Mapbox GL).
 * Esri tiles use server.arcgisonline.com …/tile/{z}/{y}/{x} (same scheme as existing World Imagery).
 * Mapbox raster tiles use {z}/{x}/{y}.
 */
import { getMapboxAccessToken, isMapboxGlInitPlaceholder } from '../../lib/mapboxAccessToken'
import { resolveMapboxProxyUrl } from '../../lib/mapboxProxyUrl'

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services'
const ATTR_ESRI = 'Tiles © Esri'
const ATTR_OSM = '© OpenStreetMap contributors'
const ATTR_CARTO = '© OpenStreetMap © CARTO'

export type LeafletTileSpec = { url: string; attribution: string; opacity?: number }

export type BasemapCatalogEntry = {
  id: string
  label: string
  /** Mapbox GL style URL or raster style JSON */
  mapboxStyle: string | Record<string, unknown>
  /** Leaflet TileLayer(s); omit when Mapbox-vector-only (Satellite page only with token) */
  leafletLayers?: LeafletTileSpec[]
  requiresMapboxToken?: boolean
}

const mbRaster = (path: string, token: string) =>
  token ? `https://api.mapbox.com/styles/v1/mapbox/${path}/tiles/256/{z}/{x}/{y}?access_token=${token}` : ''

const mbThumb = (path: string, token: string) =>
  token ? `https://api.mapbox.com/styles/v1/mapbox/${path}/tiles/256/2/1/2?access_token=${token}` : ''

function esriTile(servicePath: string): string {
  return `${ESRI}/${servicePath}/MapServer/tile/{z}/{y}/{x}`
}

/** ArcGIS Online folder paths — many basemaps are not at `/services/ServiceName`. */
const ESRI_CANVAS_LIGHT_BASE = 'Canvas/World_Light_Gray_Base'
const ESRI_CANVAS_LIGHT_REF = 'Canvas/World_Light_Gray_Reference'
const ESRI_CANVAS_DARK_BASE = 'Canvas/World_Dark_Gray_Base'
const ESRI_CANVAS_DARK_REF = 'Canvas/World_Dark_Gray_Reference'
const ESRI_OCEAN_BASE = 'Ocean/World_Ocean_Base'
const ESRI_OCEAN_REF = 'Ocean/World_Ocean_Reference'
const ESRI_REF_WORLD_OVERLAY = 'Reference/World_Reference_Overlay'

/** Mapbox GL raster sources need a single URL pattern; `{s}` (Leaflet subdomains) and `{r}` (Carto retina) are not expanded. */
export function tileUrlForMapboxGl(url: string): string {
  return url.replace(/\{s\}/gi, 'a').replace(/\{r\}/g, '')
}

export function rasterStyleFromTiles(layers: LeafletTileSpec[]): Record<string, unknown> {
  const sources: Record<string, unknown> = {}
  const mapLayers: unknown[] = []
  layers.forEach((L, i) => {
    const sid = `r${i}`
    sources[sid] = {
      type: 'raster',
      tiles: [tileUrlForMapboxGl(L.url)],
      tileSize: 256,
      attribution: L.attribution,
    }
    mapLayers.push({
      id: `layer-${i}`,
      type: 'raster',
      source: sid,
      paint: L.opacity != null ? { 'raster-opacity': L.opacity } : {},
    })
  })
  return { version: 8 as const, sources, layers: mapLayers }
}

const OSM_RASTER: Record<string, unknown> = rasterStyleFromTiles([
  { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: ATTR_OSM },
])

const OPENTOPO_RASTER: Record<string, unknown> = rasterStyleFromTiles([
  {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution:
      '© OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA)',
  },
])

const ESRI_IMAGERY = esriTile('World_Imagery')
const ESRI_IMAGERY_STYLE = rasterStyleFromTiles([{ url: ESRI_IMAGERY, attribution: ATTR_ESRI }])

export type BuildBasemapCatalogOptions = {
  /**
   * When false, omit Mapbox vector-only entries (`mb-streets`, `mb-outdoors`, …).
   * Raster-capable entries (`mapbox-standard-satellite`, `mapbox-hybrid`) stay visible.
   */
  includeMapboxVectorBasemaps?: boolean
  /** Route Mapbox raster tiles through `/api/mapbox-proxy` (production Hostinger — no pk in tile URLs). */
  useMapboxTileProxy?: boolean
}

/** Heavy Mapbox GL vector styles — not the raster satellite/hybrid entries. */
function entryUsesMapboxVectorBasemap(e: BasemapCatalogEntry): boolean {
  return e.id.startsWith('mb-')
}

function effectiveMapboxCatalogToken(raw: string): string {
  const t = raw.trim()
  if (!t || isMapboxGlInitPlaceholder(t)) return ''
  return t
}

function mbRasterUrl(path: string, token: string, useProxy: boolean): string {
  const upstream = `https://api.mapbox.com/styles/v1/mapbox/${path}/tiles/256/{z}/{x}/{y}`
  if (token) return `${upstream}?access_token=${encodeURIComponent(token)}`
  if (useProxy && typeof window !== 'undefined') {
    try {
      return resolveMapboxProxyUrl(upstream)
    } catch {
      return ''
    }
  }
  return ''
}

/** Build catalog with Mapbox token-dependent URLs filled in for thumbnails / raster. */
export function buildBasemapCatalog(mapboxToken: string, options?: BuildBasemapCatalogOptions): BasemapCatalogEntry[] {
  const includeMapboxVector = options?.includeMapboxVectorBasemaps !== false
  const useProxy = Boolean(options?.useMapboxTileProxy)
  const t = effectiveMapboxCatalogToken(mapboxToken)
  const mbSatStd = mbRasterUrl('standard-satellite', t, useProxy) || mbRaster('standard-satellite', t)
  const mbSatV9 = mbRasterUrl('satellite-v9', t, useProxy) || mbRaster('satellite-v9', t)
  /** Leaflet TileLayer uses styles/v1 raster tiles: classic `satellite-v9` is reliable; `standard-satellite` often returns blank/black (GL-first style). */
  const mbUnderlay = mbSatV9 || mbSatStd
  const mbHyb =
    mbRasterUrl('satellite-streets-v12', t, useProxy) || mbRaster('satellite-streets-v12', t)

  const leafletMbSat: LeafletTileSpec[] = mbUnderlay
    ? [{ url: mbUnderlay, attribution: '© Mapbox © OpenStreetMap', opacity: 1 }]
    : [{ url: ESRI_IMAGERY, attribution: ATTR_ESRI }]

  const leafletMbHyb: LeafletTileSpec[] =
    mbUnderlay && mbHyb
      ? [
          { url: mbUnderlay, attribution: '© Mapbox © OpenStreetMap', opacity: 1 },
          {
            url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            attribution: ATTR_OSM,
            opacity: 0.35,
          },
        ]
      : [
          { url: ESRI_IMAGERY, attribution: ATTR_ESRI },
          { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: ATTR_OSM, opacity: 0.35 },
        ]

  const entries: BasemapCatalogEntry[] = [
    {
      id: 'mapbox-standard-satellite',
      label: 'Satellite (Mapbox)',
      mapboxStyle: 'mapbox://styles/mapbox/standard-satellite',
      requiresMapboxToken: true,
      leafletLayers: leafletMbSat,
    },
    {
      id: 'satellite',
      label: 'Satellite (Esri)',
      mapboxStyle: ESRI_IMAGERY_STYLE,
      leafletLayers: [{ url: ESRI_IMAGERY, attribution: ATTR_ESRI }],
    },
    {
      id: 'mapbox-hybrid',
      label: 'Hybrid (imagery + labels)',
      mapboxStyle: 'mapbox://styles/mapbox/satellite-streets-v12',
      leafletLayers: leafletMbHyb,
    },
    {
      id: 'terrain-opentopo',
      label: 'Terrain (OpenTopo)',
      mapboxStyle: OPENTOPO_RASTER,
      leafletLayers: [
        {
          url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
          attribution:
            '© OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA)',
        },
      ],
    },
    {
      id: 'osm',
      label: 'OpenStreetMap',
      mapboxStyle: OSM_RASTER,
      leafletLayers: [{ url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: ATTR_OSM }],
    },
    {
      id: 'esri',
      label: 'Esri World Imagery',
      mapboxStyle: ESRI_IMAGERY_STYLE,
      leafletLayers: [{ url: ESRI_IMAGERY, attribution: ATTR_ESRI }],
    },
    {
      id: 'esri-imagery-hybrid',
      label: 'Imagery Hybrid',
      mapboxStyle: rasterStyleFromTiles([
        { url: ESRI_IMAGERY, attribution: ATTR_ESRI },
        {
          url: esriTile('Reference/World_Boundaries_and_Places'),
          attribution: ATTR_ESRI,
          opacity: 1,
        },
      ]),
      leafletLayers: [
        { url: ESRI_IMAGERY, attribution: ATTR_ESRI },
        { url: esriTile('Reference/World_Boundaries_and_Places'), attribution: ATTR_ESRI, opacity: 1 },
      ],
    },
    {
      id: 'esri-streets',
      label: 'Streets',
      mapboxStyle: rasterStyleFromTiles([{ url: esriTile('World_Street_Map'), attribution: ATTR_ESRI }]),
      leafletLayers: [{ url: esriTile('World_Street_Map'), attribution: ATTR_ESRI }],
    },
    {
      id: 'esri-topo',
      label: 'Topographic / Outdoor',
      mapboxStyle: rasterStyleFromTiles([{ url: esriTile('World_Topo_Map'), attribution: ATTR_ESRI }]),
      leafletLayers: [{ url: esriTile('World_Topo_Map'), attribution: ATTR_ESRI }],
    },
    {
      id: 'esri-navigation-night',
      label: 'Streets (Night)',
      mapboxStyle: rasterStyleFromTiles([
        { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attribution: ATTR_CARTO },
      ]),
      leafletLayers: [
        { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attribution: ATTR_CARTO },
      ],
    },
    {
      id: 'esri-terrain-labels',
      label: 'Terrain with labels (Esri)',
      mapboxStyle: rasterStyleFromTiles([
        { url: esriTile('World_Terrain_Base'), attribution: ATTR_ESRI },
        { url: esriTile(ESRI_REF_WORLD_OVERLAY), attribution: ATTR_ESRI, opacity: 1 },
      ]),
      leafletLayers: [
        { url: esriTile('World_Terrain_Base'), attribution: ATTR_ESRI },
        { url: esriTile(ESRI_REF_WORLD_OVERLAY), attribution: ATTR_ESRI },
      ],
    },
    {
      id: 'esri-light-gray',
      label: 'Light Gray Canvas',
      mapboxStyle: rasterStyleFromTiles([
        { url: esriTile(ESRI_CANVAS_LIGHT_BASE), attribution: ATTR_ESRI },
        { url: esriTile(ESRI_CANVAS_LIGHT_REF), attribution: ATTR_ESRI, opacity: 1 },
      ]),
      leafletLayers: [
        { url: esriTile(ESRI_CANVAS_LIGHT_BASE), attribution: ATTR_ESRI },
        { url: esriTile(ESRI_CANVAS_LIGHT_REF), attribution: ATTR_ESRI },
      ],
    },
    {
      id: 'esri-dark-gray',
      label: 'Dark Gray Canvas',
      mapboxStyle: rasterStyleFromTiles([
        { url: esriTile(ESRI_CANVAS_DARK_BASE), attribution: ATTR_ESRI },
        { url: esriTile(ESRI_CANVAS_DARK_REF), attribution: ATTR_ESRI, opacity: 1 },
      ]),
      leafletLayers: [
        { url: esriTile(ESRI_CANVAS_DARK_BASE), attribution: ATTR_ESRI },
        { url: esriTile(ESRI_CANVAS_DARK_REF), attribution: ATTR_ESRI },
      ],
    },
    {
      id: 'esri-oceans',
      label: 'Oceans',
      mapboxStyle: rasterStyleFromTiles([
        { url: esriTile(ESRI_OCEAN_BASE), attribution: ATTR_ESRI },
        { url: esriTile(ESRI_OCEAN_REF), attribution: ATTR_ESRI, opacity: 1 },
      ]),
      leafletLayers: [
        { url: esriTile(ESRI_OCEAN_BASE), attribution: ATTR_ESRI },
        { url: esriTile(ESRI_OCEAN_REF), attribution: ATTR_ESRI },
      ],
    },
    {
      id: 'esri-natgeo',
      label: 'National Geographic',
      mapboxStyle: rasterStyleFromTiles([{ url: esriTile('NatGeo_World_Map'), attribution: ATTR_ESRI }]),
      leafletLayers: [{ url: esriTile('NatGeo_World_Map'), attribution: ATTR_ESRI }],
    },
    {
      id: 'esri-shaded-relief',
      label: 'Shaded Relief',
      mapboxStyle: rasterStyleFromTiles([{ url: esriTile('World_Shaded_Relief'), attribution: ATTR_ESRI }]),
      leafletLayers: [{ url: esriTile('World_Shaded_Relief'), attribution: ATTR_ESRI }],
    },
    {
      id: 'esri-physical',
      label: 'World Physical',
      mapboxStyle: rasterStyleFromTiles([{ url: esriTile('World_Physical_Map'), attribution: ATTR_ESRI }]),
      leafletLayers: [{ url: esriTile('World_Physical_Map'), attribution: ATTR_ESRI }],
    },
    {
      id: 'carto-positron',
      label: 'Light (Carto)',
      mapboxStyle: rasterStyleFromTiles([
        { url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', attribution: ATTR_CARTO },
      ]),
      leafletLayers: [
        { url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', attribution: ATTR_CARTO },
      ],
    },
    {
      id: 'carto-dark-matter',
      label: 'Dark (Carto)',
      mapboxStyle: rasterStyleFromTiles([
        { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attribution: ATTR_CARTO },
      ]),
      leafletLayers: [
        { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attribution: ATTR_CARTO },
      ],
    },
  ]

  const mapboxOnly: BasemapCatalogEntry[] = includeMapboxVector && t
    ? [
        {
          id: 'mb-streets',
          label: 'Streets (Mapbox)',
          mapboxStyle: 'mapbox://styles/mapbox/streets-v12',
          requiresMapboxToken: true,
          leafletLayers: [
            {
              url: mbRasterUrl('streets-v12', t, useProxy) || mbRaster('streets-v12', t) || esriTile('World_Street_Map'),
              attribution: t ? '© Mapbox © OpenStreetMap' : ATTR_ESRI,
            },
          ],
        },
        {
          id: 'mb-outdoors',
          label: 'Outdoors (Mapbox)',
          mapboxStyle: 'mapbox://styles/mapbox/outdoors-v12',
          requiresMapboxToken: true,
          leafletLayers: [
            {
              url: mbRasterUrl('outdoors-v12', t, useProxy) || mbRaster('outdoors-v12', t) || esriTile('World_Topo_Map'),
              attribution: t ? '© Mapbox © OpenStreetMap' : ATTR_ESRI,
            },
          ],
        },
        {
          id: 'mb-light',
          label: 'Light (Mapbox)',
          mapboxStyle: 'mapbox://styles/mapbox/light-v11',
          requiresMapboxToken: true,
          leafletLayers: [
            {
              url: mbRasterUrl('light-v11', t, useProxy) || mbRaster('light-v11', t) || esriTile('Canvas/World_Light_Gray_Base'),
              attribution: t ? '© Mapbox © OpenStreetMap' : ATTR_ESRI,
            },
          ],
        },
        {
          id: 'mb-dark',
          label: 'Dark (Mapbox)',
          mapboxStyle: 'mapbox://styles/mapbox/dark-v11',
          requiresMapboxToken: true,
          leafletLayers: [
            {
              url: mbRasterUrl('dark-v11', t, useProxy) || mbRaster('dark-v11', t) || esriTile('Canvas/World_Dark_Gray_Base'),
              attribution: t ? '© Mapbox © OpenStreetMap' : ATTR_ESRI,
            },
          ],
        },
        {
          id: 'mb-nav-day',
          label: 'Navigation (Mapbox)',
          mapboxStyle: 'mapbox://styles/mapbox/navigation-day-v1',
          requiresMapboxToken: true,
          leafletLayers: [
            {
              url:
                mbRasterUrl('navigation-day-v1', t, useProxy) ||
                mbRaster('navigation-day-v1', t) ||
                esriTile('World_Street_Map'),
              attribution: t ? '© Mapbox © OpenStreetMap' : ATTR_ESRI,
            },
          ],
        },
        {
          id: 'mb-nav-night',
          label: 'Navigation (Mapbox Night)',
          mapboxStyle: 'mapbox://styles/mapbox/navigation-night-v1',
          requiresMapboxToken: true,
          leafletLayers: [
            {
              url:
                mbRasterUrl('navigation-night-v1', t, useProxy) ||
                mbRaster('navigation-night-v1', t) ||
                esriTile('World_Street_Map'),
              attribution: t ? '© Mapbox © OpenStreetMap' : ATTR_ESRI,
            },
          ],
        },
      ]
    : []

  let combined: BasemapCatalogEntry[] = [...entries, ...mapboxOnly]
  if (!includeMapboxVector) {
    combined = combined.filter(e => !entryUsesMapboxVectorBasemap(e))
  }

  const dedup = new Map<string, BasemapCatalogEntry>()
  combined.forEach(e => {
    if (!dedup.has(e.id)) dedup.set(e.id, e)
  })
  return Array.from(dedup.values())
}

/** Style object for Mapbox GL when token is missing but raster tiles exist on the entry. */
export function mapboxGlStyleForEntry(
  entry: BasemapCatalogEntry,
  mapboxToken: string,
  options?: { backendProxyConfigured?: boolean },
): string | Record<string, unknown> {
  const st = entry.mapboxStyle
  if (typeof st === 'string' && st.startsWith('mapbox://')) {
    const t = mapboxToken.trim()
    const proxy = Boolean(options?.backendProxyConfigured)
    if (t && (!isMapboxGlInitPlaceholder(t) || proxy)) return st
    if (proxy) return st
    if (entry.leafletLayers?.length) {
      const layers = entry.leafletLayers.filter(L => L.url?.trim())
      if (layers.length) return rasterStyleFromTiles(layers)
    }
    return ESRI_IMAGERY_STYLE
  }
  return st
}

function rasterPreviewFromTemplate(template: string): string | null {
  if (!template.includes('{z}') || !template.includes('{x}') || !template.includes('{y}')) return null
  return template
    .replace(/\{s\}/gi, 'a')
    .replace(/\{r\}/g, '')
    .replace(/\{z\}/g, '2')
    .replace(/\{y\}/g, '1')
    .replace(/\{x\}/g, '2')
}

export function getBasemapThumbnail(entry: BasemapCatalogEntry, mapboxToken: string): string {
  const t = mapboxToken.trim()
  // Gallery <img> previews: raster tiles for `standard-satellite` often return blank; use classic Mapbox raster styles.
  if (t && entry.id === 'mapbox-standard-satellite') {
    const u = mbThumb('satellite-v9', t)
    if (u) return u
  }
  if (t && entry.id === 'mapbox-hybrid') {
    const u = mbThumb('satellite-streets-v12', t)
    if (u) return u
  }

  const first = entry.leafletLayers?.[0]?.url
  if (first) {
    if (first.includes('api.mapbox.com') && t && first.includes('{z}')) {
      let u = first.includes('access_token=') ? first : `${first}${first.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(t)}`
      const p = rasterPreviewFromTemplate(u)
      if (p) return p
    }
    const direct = rasterPreviewFromTemplate(first)
    if (direct) return direct
  }
  if (t && entry.id.startsWith('mb-')) {
    const map: Record<string, string> = {
      'mb-streets': 'streets-v12',
      'mb-outdoors': 'outdoors-v12',
      'mb-light': 'light-v11',
      'mb-dark': 'dark-v11',
      'mb-nav-day': 'navigation-day-v1',
      'mb-nav-night': 'navigation-night-v1',
    }
    const path = map[entry.id]
    if (path) return mbThumb(path, t)
  }
  return ESRI_IMAGERY.replace('{z}', '2').replace('{y}', '1').replace('{x}', '2')
}

/** Map saved UI / config ids to current catalog ids after deduplication or renames. */
export function resolveBasemapId(id: string): string {
  const legacy: Record<string, string> = {
    'mapbox-alkamelgis': 'satellite',
    hybrid: 'esri-imagery-hybrid',
    street: 'osm',
    streets: 'esri-streets',
    dark: 'esri-dark-gray',
    topographic: 'esri-topo',
    topo: 'esri-topo',
    terrain: 'terrain-opentopo',
    'google-earth': 'esri',
    google: 'esri',
    'esri-navigation': 'esri-streets',
    'esri-outdoor': 'esri-topo',
    'esri-charted-territory': 'esri-shaded-relief',
  }
  return legacy[id] ?? id
}

export function catalogEntryById(catalog: BasemapCatalogEntry[], id: string): BasemapCatalogEntry | undefined {
  return catalog.find(e => e.id === id)
}

/** Startup default — Esri satellite raster (fast first paint; Mapbox token still used for GL engine). */
export const DEFAULT_BASEMAP_ID = 'satellite'

/** Startup fallback before Mapbox is ready — Esri world imagery (still satellite). */
export const DEFAULT_BASEMAP_ID_NO_MAPBOX = 'satellite'

/** Ids used only while Mapbox is loading; upgrade to {@link DEFAULT_BASEMAP_ID} once available. */
export const STARTUP_BASEMAP_FALLBACK_IDS = new Set<string>([
  DEFAULT_BASEMAP_ID_NO_MAPBOX,
  'osm',
  'esri',
])

/** Resolve the basemap id for Map Canvas first paint (config layer). */
export function resolveStartupBasemapId(
  hasMapboxBasemap: boolean,
  catalog: BasemapCatalogEntry[] = [],
): string {
  const preferred = hasMapboxBasemap ? DEFAULT_BASEMAP_ID : DEFAULT_BASEMAP_ID_NO_MAPBOX
  const resolved = resolveBasemapId(preferred)
  if (catalogEntryById(catalog, resolved)) return resolved
  if (hasMapboxBasemap && catalogEntryById(catalog, DEFAULT_BASEMAP_ID_NO_MAPBOX)) {
    return DEFAULT_BASEMAP_ID_NO_MAPBOX
  }
  return preferred
}

function shouldUpgradeStartupBasemap(
  _currentId: string,
  _hasMapboxBasemap: boolean,
  _catalog: BasemapCatalogEntry[],
): boolean {
  /** Keep lightweight Esri startup basemap — do not auto-switch to Mapbox Standard (heavy vector). */
  return false
}

/** Keep basemap state valid and promote startup fallbacks when Mapbox becomes ready (state layer). */
export function reconcileBasemapId(
  currentId: string,
  hasMapboxBasemap: boolean,
  catalog: BasemapCatalogEntry[],
  options?: { promoteStartupFallbacks?: boolean },
): string {
  const promote = options?.promoteStartupFallbacks ?? false
  const resolved = resolveBasemapId(currentId)
  if (catalogEntryById(catalog, resolved)) {
    if (promote && shouldUpgradeStartupBasemap(resolved, hasMapboxBasemap, catalog)) {
      return DEFAULT_BASEMAP_ID
    }
    return currentId
  }
  const alias = resolveBasemapId(resolved)
  if (catalogEntryById(catalog, alias)) return alias
  return resolveStartupBasemapId(hasMapboxBasemap, catalog)
}

/** Default Mapbox vector style when MAPBOX env is configured. */
export const MAPBOX_STREETS_STYLE_URL = 'mapbox://styles/mapbox/streets-v12'

/** Satellite page: Esri/OSM/Carto + Mapbox raster satellite/hybrid; omit heavy Mapbox vector styles. */
export const BASEMAP_CATALOG_OPTS_SATELLITE_NO_MAPBOX_VECTOR: BuildBasemapCatalogOptions = {
  includeMapboxVectorBasemaps: false,
}

/** Shared catalog builder for Satellite + GIS map (Hostinger proxy + pk session). */
export function buildRuntimeBasemapCatalog(options: {
  platformToken?: string
  mapboxConfigured?: boolean
  mapboxProxyMode?: boolean
  includeMapboxVectorBasemaps?: boolean
}): BasemapCatalogEntry[] {
  const platform = (options.platformToken ?? '').trim()
  const catalogToken = platform || getMapboxAccessToken()
  const configured = Boolean(options.mapboxConfigured)
  const includeVector =
    options.includeMapboxVectorBasemaps !== undefined
      ? options.includeMapboxVectorBasemaps
      : configured
  return buildBasemapCatalog(catalogToken, {
    includeMapboxVectorBasemaps: includeVector,
    useMapboxTileProxy:
      configured && Boolean(options.mapboxProxyMode) && !platform,
  })
}
