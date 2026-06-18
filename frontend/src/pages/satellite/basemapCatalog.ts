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

/**
 * Unofficial Google vt tiles embed a grey "Map data not yet available" watermark above ~z19
 * (worse in 3D globe / terrain). Cap raster source maxzoom so Mapbox overzooms crisp lower tiles.
 */
export const GOOGLE_RASTER_MAX_ZOOM = 19;

/** Esri World_Terrain_Base MapServer — cached through level 13. */
export const ESRI_WORLD_TERRAIN_MAX_ZOOM = 13;

export function isGoogleRasterTileUrl(url: string): boolean {
  return /google\.com\/vt\//i.test(url);
}

export function isEsriWorldTerrainTileUrl(url: string): boolean {
  return /World_Terrain_Base/i.test(url);
}

export function isGoogleBasemapId(id: string): boolean {
  const raw = id.trim().toLowerCase();
  return raw === 'google' || raw.startsWith('google-') || raw.includes('photorealistic');
}

export function rasterMaxZoomForTileUrl(url: string): number | undefined {
  if (isGoogleRasterTileUrl(url)) return GOOGLE_RASTER_MAX_ZOOM;
  if (isEsriWorldTerrainTileUrl(url)) return ESRI_WORLD_TERRAIN_MAX_ZOOM;
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
  /** Google Map Tiles API — Photorealistic 3D mesh (3D Tiles via backend proxy). */
  googlePhotorealistic3d?: boolean
  /** Gallery chips — e.g. 3D, beta (ArcGIS-style basemap picker). */
  badges?: string[]
  /** Optional gallery thumbnail (ArcGIS vector basemaps). */
  thumbnailUrl?: string
  /** Esri Living Atlas World Elevation Terrain vector basemap. */
  esriWorldElevationTerrain?: boolean
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

/** Google Earth satellite imagery (2D raster — not Photorealistic 3D mesh). */
const GOOGLE_EARTH_SATELLITE = 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'
const ATTR_GOOGLE = '© Google'
const GOOGLE_EARTH_STYLE = rasterStyleFromTiles([
  { url: GOOGLE_EARTH_SATELLITE, attribution: ATTR_GOOGLE },
])

/** Esri Living Atlas World Terrain Base (shaded relief + bathymetry). */
export const ESRI_WORLD_TERRAIN_BASE_URL = esriTile('World_Terrain_Base')
const ESRI_WORLD_TERRAIN_STYLE = rasterStyleFromTiles([
  { url: ESRI_WORLD_TERRAIN_BASE_URL, attribution: ATTR_ESRI },
])

/** @deprecated Mapbox-hosted basemaps removed — option kept for call-site compatibility. */
export type BuildBasemapCatalogOptions = {
  includeMapboxVectorBasemaps?: boolean
  useMapboxTileProxy?: boolean
}

/** Google / Esri / Carto / OSM rasters only — no Mapbox tile basemaps (lighter, no token conflicts). */
export function buildBasemapCatalog(_mapboxToken = '', _options?: BuildBasemapCatalogOptions): BasemapCatalogEntry[] {
  const entries: BasemapCatalogEntry[] = [
    {
      id: 'esri',
      label: 'Esri World Imagery',
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
      id: 'esri-world-terrain',
      label: 'World Terrain (Esri)',
      mapboxStyle: ESRI_WORLD_TERRAIN_STYLE,
      leafletLayers: [{ url: ESRI_WORLD_TERRAIN_BASE_URL, attribution: ATTR_ESRI }],
      badges: ['3D'],
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
      id: 'google-earth',
      label: 'Google Earth',
      mapboxStyle: GOOGLE_EARTH_STYLE,
      leafletLayers: [{ url: GOOGLE_EARTH_SATELLITE, attribution: ATTR_GOOGLE }],
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
        { url: ESRI_WORLD_TERRAIN_BASE_URL, attribution: ATTR_ESRI },
        { url: esriTile(ESRI_REF_WORLD_OVERLAY), attribution: ATTR_ESRI, opacity: 1 },
      ]),
      leafletLayers: [
        { url: ESRI_WORLD_TERRAIN_BASE_URL, attribution: ATTR_ESRI },
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
  if (typeof entry.mapboxStyle === 'string' && entry.mapboxStyle.trim()) {
    return entry.mapboxStyle.trim()
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
  if (entry.thumbnailUrl?.trim()) return entry.thumbnailUrl.trim()
  if (isGooglePhotorealistic3dBasemapEntry(entry)) {
    return ESRI_IMAGERY.replace('{z}', '2').replace('{y}', '1').replace('{x}', '2')
  }
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
    satellite: 'esri',
    'mapbox-alkamelgis': 'esri',
    hybrid: 'esri-imagery-hybrid',
    street: 'osm',
    streets: 'esri-streets',
    dark: 'esri-dark-gray',
    topographic: 'esri-topo',
    topo: 'esri-topo',
    terrain: 'esri-world-terrain',
    'world-terrain': 'esri-world-terrain',
    'esri-world-terrain-base': 'esri-world-terrain',
    EsriWorldElevationTerrain: 'esri',
    'esri-world-elevation': 'esri',
    'esri-world-elevation-terrain': 'esri',
    'world-elevation-terrain': 'esri',
    google: 'google-earth',
    'google-satellite': 'google-earth',
    'google-streets': 'esri-streets',
    'google-photorealistic': 'google-earth',
    'google-photorealistic-hybrid': 'google-earth',
    'google-photorealistic-3d': 'esri',
    'google-photorealistic-hybrid-3d': 'esri',
    'esri-navigation': 'esri-streets',
    'esri-outdoor': 'esri-topo',
    'esri-charted-territory': 'esri-shaded-relief',
    '3d-ed-building': 'esri',
    '3D_ED_BUILDING': 'esri',
    'openstreetmap-3d-buildings': 'esri',
    'esri-3d-buildings': 'esri',
    'osm-3d-buildings': 'esri',
    'mapbox-standard-satellite': 'esri',
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

export function isGooglePhotorealistic3dBasemapEntry(
  entry: BasemapCatalogEntry | null | undefined,
): boolean {
  return Boolean(entry?.googlePhotorealistic3d)
}

/** True when the entry already uses Esri World_Terrain_Base as a primary raster. */
export function basemapUsesEsriWorldTerrainBase(entry: BasemapCatalogEntry | null | undefined): boolean {
  return (
    entry?.leafletLayers?.some(L => /World_Terrain_Base/i.test(L.url)) ??
    false
  )
}

const IMAGERY_FORWARD_BASEMAP_RE =
  /World_Imagery|World_Street|World_Topo|NatGeo|cartocdn|openstreetmap|World_Physical|World_Shaded_Relief/i

/**
 * Satellite / hybrid basemaps that benefit from Esri World Terrain underlay in 3D Earth mode.
 * Skips pure terrain basemaps and Google Photorealistic 3D mesh.
 */
export function isImageryForwardBasemapEntry(entry: BasemapCatalogEntry | null | undefined): boolean {
  if (!entry?.leafletLayers?.length) return false
  if (isGooglePhotorealistic3dBasemapEntry(entry)) return false
  if (basemapUsesEsriWorldTerrainBase(entry)) return false
  if (entry.id === 'terrain-opentopo') return false
  return entry.leafletLayers.some(L => IMAGERY_FORWARD_BASEMAP_RE.test(L.url))
}

/**
 * All raster basemaps except Google 3D mesh and entries that already use World_Terrain_Base
 * as the primary surface (avoids duplicate relief tiles).
 */
export function basemapSupportsEarthHybridUnderlay(entry: BasemapCatalogEntry | null | undefined): boolean {
  if (!entry?.leafletLayers?.length) return false
  if (isGooglePhotorealistic3dBasemapEntry(entry)) return false
  if (basemapUsesEsriWorldTerrainBase(entry)) return false
  return true
}

export function is3dMeshBasemapEntry(entry: BasemapCatalogEntry | null | undefined): boolean {
  return isEsri3dBuildingsBasemapEntry(entry) || isGooglePhotorealistic3dBasemapEntry(entry)
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

/** Startup default — Esri World Imagery satellite raster. */
export const DEFAULT_BASEMAP_ID = 'esri'

/** Startup fallback — same as {@link DEFAULT_BASEMAP_ID}. */
export const DEFAULT_BASEMAP_ID_NO_MAPBOX = 'esri'

/** Ids used only while Mapbox is loading; upgrade to {@link DEFAULT_BASEMAP_ID} once available. */
export const STARTUP_BASEMAP_FALLBACK_IDS = new Set<string>([
  DEFAULT_BASEMAP_ID_NO_MAPBOX,
  'google-earth',
  'esri',
  'satellite',
  'osm',
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
  if (catalogEntryById(catalog, resolved)) {
    return catalogEntryById(catalog, currentId) ? currentId : resolved
  }
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
