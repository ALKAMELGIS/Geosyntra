/**
 * Shared basemap definitions for GIS Map (Leaflet) and Satellite Intelligence (Mapbox GL).
 * Esri tiles use server.arcgisonline.com …/tile/{z}/{y}/{x} (same scheme as existing World Imagery).
 * Mapbox raster tiles use {z}/{x}/{y}.
 */
import { devMapboxProxyRewrite } from '../../lib/mapboxProxyUrl'
import type { Esri3dBuildingsSceneVariant } from '../../lib/esri3dBuildingsSceneUrl'
import { siMapboxStyleWithGlyphs } from './utils/siMap3DLabels'

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services'
const ATTR_ESRI = 'Tiles © Esri'
const ATTR_OSM = '© OpenStreetMap contributors'
const ATTR_CARTO = '© OpenStreetMap © CARTO'
const ATTR_GOOGLE = '© Google'

/**
 * Google Maps raster tiles (mt1.google.com). No {s} subdomain token — Mapbox GL replaces {s}
 * with 'a' (→ "mta.google.com", which does not resolve), so a fixed host is required.
 *   lyrs=y → satellite imagery + roads/labels (Google Earth look)
 *   lyrs=s → satellite imagery only
 *   lyrs=m → street/road map
 */
const googleTile = (lyrs: string) => `https://mt1.google.com/vt/lyrs=${lyrs}&x={x}&y={y}&z={z}`

/**
 * Unofficial Google vt tiles embed a grey "Map data not yet available" watermark above ~z20.
 * Cap raster source maxzoom so Mapbox overzooms crisp lower tiles instead of fetching blanks.
 */
export function rasterMaxZoomForTileUrl(url: string): number | undefined {
  if (/google\.com\/vt\//i.test(url)) return 20;
  return undefined;
}

export type LeafletTileSpec = { url: string; attribution: string; opacity?: number }

export type BasemapCatalogEntry = {
  id: string
  label: string
  /** Mapbox GL style URL or raster style JSON */
  mapboxStyle: string | Record<string, unknown>
  /** Leaflet TileLayer(s); omit when Mapbox-vector-only (Satellite page only with token) */
  leafletLayers?: LeafletTileSpec[]
  requiresMapboxToken?: boolean
  /** Esri Living Atlas global 3D Buildings scene layer (I3S SceneServer). */
  esri3dBuildings?: boolean
  /** Which I3S SceneServer to load when {@link esri3dBuildings} is true. Defaults to Esri global buildings. */
  esri3dBuildingsScene?: Esri3dBuildingsSceneVariant
  /** Gallery chips — e.g. 3D, beta (ArcGIS-style basemap picker). */
  badges?: string[]
}

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
    const maxzoom = rasterMaxZoomForTileUrl(L.url);
    sources[sid] = {
      type: 'raster',
      tiles: [tileUrlForMapboxGl(L.url)],
      tileSize: 256,
      attribution: L.attribution,
      ...(maxzoom != null ? { maxzoom } : {}),
    }
    mapLayers.push({
      id: `layer-${i}`,
      type: 'raster',
      source: sid,
      paint: L.opacity != null ? { 'raster-opacity': L.opacity } : {},
    })
  })
  return siMapboxStyleWithGlyphs({ version: 8 as const, sources, layers: mapLayers })
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

/** @deprecated Mapbox-hosted basemaps removed — option kept for call-site compatibility. */
export type BuildBasemapCatalogOptions = {
  includeMapboxVectorBasemaps?: boolean
  useMapboxTileProxy?: boolean
}

/** Google / Esri / Carto / OSM rasters only — no Mapbox tile basemaps (lighter, no token conflicts). */
export function buildBasemapCatalog(_mapboxToken = '', _options?: BuildBasemapCatalogOptions): BasemapCatalogEntry[] {
  const entries: BasemapCatalogEntry[] = [
    {
      id: 'google-earth',
      label: 'Google Earth',
      mapboxStyle: rasterStyleFromTiles([{ url: googleTile('y'), attribution: ATTR_GOOGLE }]),
      leafletLayers: [{ url: googleTile('y'), attribution: ATTR_GOOGLE }],
    },
    {
      id: 'google-satellite',
      label: 'Google Satellite',
      mapboxStyle: rasterStyleFromTiles([{ url: googleTile('s'), attribution: ATTR_GOOGLE }]),
      leafletLayers: [{ url: googleTile('s'), attribution: ATTR_GOOGLE }],
    },
    {
      id: 'google-streets',
      label: 'Google Street',
      mapboxStyle: rasterStyleFromTiles([{ url: googleTile('m'), attribution: ATTR_GOOGLE }]),
      leafletLayers: [{ url: googleTile('m'), attribution: ATTR_GOOGLE }],
    },
    {
      id: 'satellite',
      label: 'Satellite (Esri)',
      mapboxStyle: ESRI_IMAGERY_STYLE,
      leafletLayers: [{ url: ESRI_IMAGERY, attribution: ATTR_ESRI }],
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

  return entries
}

/** Style object for Mapbox GL — always prefers entry raster tiles (no Mapbox style URLs). */
export function mapboxGlStyleForEntry(
  entry: BasemapCatalogEntry,
  _mapboxToken = '',
  _options?: { backendProxyConfigured?: boolean },
): string | Record<string, unknown> {
  const rasterLayers = entry.leafletLayers?.filter(L => L.url?.trim()) ?? []
  if (rasterLayers.length) {
    return rasterStyleFromTiles(rasterLayers)
  }
  if (typeof entry.mapboxStyle === 'object' && entry.mapboxStyle !== null) {
    return entry.mapboxStyle
  }
  return ESRI_IMAGERY_STYLE
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

export function getBasemapThumbnail(entry: BasemapCatalogEntry, _mapboxToken = ''): string {
  return devMapboxProxyRewrite(resolveBasemapThumbnailUrl(entry))
}

function resolveBasemapThumbnailUrl(entry: BasemapCatalogEntry): string {
  const first = entry.leafletLayers?.[0]?.url
  if (first) {
    const direct = rasterPreviewFromTemplate(first)
    if (direct) return direct
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
    google: 'google-satellite',
    'google-photorealistic': 'google-earth',
    'google-photorealistic-hybrid': 'google-earth',
    'google-photorealistic-3d': 'google-earth',
    'google-photorealistic-hybrid-3d': 'google-earth',
    'esri-navigation': 'esri-streets',
    'esri-outdoor': 'esri-topo',
    'esri-charted-territory': 'esri-shaded-relief',
    '3d-ed-building': 'satellite',
    '3D_ED_BUILDING': 'satellite',
    'openstreetmap-3d-buildings': 'satellite',
    'esri-3d-buildings': 'satellite',
    'osm-3d-buildings': 'satellite',
    'mapbox-standard-satellite': 'satellite',
    'mapbox-hybrid': 'esri-imagery-hybrid',
    'mb-streets': 'esri-streets',
    'mb-outdoors': 'esri-topo',
    'mb-light': 'carto-positron',
    'mb-dark': 'carto-dark-matter',
    'mb-nav-day': 'esri-streets',
    'mb-nav-night': 'esri-navigation-night',
  }
  return legacy[id] ?? id
}

export function catalogEntryById(catalog: BasemapCatalogEntry[], id: string): BasemapCatalogEntry | undefined {
  return catalog.find(e => e.id === id)
}

export function isEsri3dBuildingsBasemapEntry(
  entry: BasemapCatalogEntry | null | undefined,
): boolean {
  return Boolean(entry?.esri3dBuildings)
}

export function resolveEsri3dBuildingsSceneVariant(
  entry: BasemapCatalogEntry | null | undefined,
): Esri3dBuildingsSceneVariant {
  return entry?.esri3dBuildingsScene ?? 'esri'
}

export function partitionBasemapCatalog(catalog: BasemapCatalogEntry[]): {
  basemap3dEntries: BasemapCatalogEntry[]
  basemapRasterEntries: BasemapCatalogEntry[]
} {
  const basemap3dEntries = catalog.filter(isEsri3dBuildingsBasemapEntry)
  const basemapRasterEntries = catalog.filter(entry => !isEsri3dBuildingsBasemapEntry(entry))
  return { basemap3dEntries, basemapRasterEntries }
}

/** Startup default — Esri World Imagery; no Mapbox token needed for first paint. */
export const DEFAULT_BASEMAP_ID = 'satellite'

/** Startup fallback — same as {@link DEFAULT_BASEMAP_ID}. */
export const DEFAULT_BASEMAP_ID_NO_MAPBOX = 'satellite'

/** Ids used only while Mapbox is loading; upgrade to {@link DEFAULT_BASEMAP_ID} once available. */
export const STARTUP_BASEMAP_FALLBACK_IDS = new Set<string>([
  DEFAULT_BASEMAP_ID_NO_MAPBOX,
  'satellite',
  'osm',
  'esri',
])

/** Resolve the basemap id for Map Canvas first paint (config layer). */
export function resolveStartupBasemapId(
  _hasMapboxBasemap?: boolean,
  catalog: BasemapCatalogEntry[] = [],
): string {
  const resolved = resolveBasemapId(DEFAULT_BASEMAP_ID)
  if (catalogEntryById(catalog, resolved)) return resolved
  return DEFAULT_BASEMAP_ID
}

/** Keep basemap state valid when catalog changes or saved ids are renamed. */
export function reconcileBasemapId(
  currentId: string,
  _hasMapboxBasemap?: boolean,
  catalog: BasemapCatalogEntry[] = [],
  _options?: { promoteStartupFallbacks?: boolean },
): string {
  const resolved = resolveBasemapId(currentId)
  if (catalogEntryById(catalog, resolved)) return currentId
  const alias = resolveBasemapId(resolved)
  if (catalogEntryById(catalog, alias)) return alias
  return resolveStartupBasemapId(false, catalog)
}

/** @deprecated Mapbox tile basemaps removed from catalog. */
export const BASEMAP_CATALOG_OPTS_SATELLITE_NO_MAPBOX_VECTOR: BuildBasemapCatalogOptions = {
  includeMapboxVectorBasemaps: false,
}

/** Shared catalog builder for Satellite + GIS map — Google/Esri/Carto rasters only. */
export function buildRuntimeBasemapCatalog(_options?: {
  platformToken?: string
  mapboxConfigured?: boolean
  mapboxProxyMode?: boolean
  includeMapboxVectorBasemaps?: boolean
}): BasemapCatalogEntry[] {
  return buildBasemapCatalog()
}
