/**
 * Shared basemap definitions for GIS Map (Leaflet) and Satellite Intelligence (Mapbox GL).
 * Esri tiles use server.arcgisonline.com …/tile/{z}/{y}/{x} (same scheme as existing World Imagery).
 * Mapbox raster tiles use {z}/{x}/{y}.
 */

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

const GOOGLE_RASTER: Record<string, unknown> = rasterStyleFromTiles([
  { url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', attribution: '© Google' },
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

/** Build catalog with Mapbox token-dependent URLs filled in for thumbnails / raster. */
export function buildBasemapCatalog(mapboxToken: string): BasemapCatalogEntry[] {
  const t = mapboxToken.trim()
  const mbSat = mbRaster('satellite-v9', t)
  const mbSatStd = mbRaster('standard-satellite', t)
  const mbHyb = mbRaster('satellite-streets-v12', t)

  const leafletMbSat: LeafletTileSpec[] = mbSat
    ? [{ url: mbSat, attribution: '© Mapbox © OpenStreetMap', opacity: 1 }]
    : [{ url: ESRI_IMAGERY, attribution: ATTR_ESRI }]

  const leafletMbHyb: LeafletTileSpec[] =
    mbSat && mbHyb
      ? [
          { url: mbSat, attribution: '© Mapbox © OpenStreetMap', opacity: 1 },
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
      label: 'Satellite (Mapbox Standard)',
      mapboxStyle: 'mapbox://styles/mapbox/standard-satellite',
      requiresMapboxToken: true,
      leafletLayers: leafletMbSat,
    },
    {
      id: 'mapbox-alkamelgis',
      label: 'Satellite (Mapbox v9)',
      mapboxStyle: 'mapbox://styles/mapbox/satellite-v9',
      requiresMapboxToken: true,
      leafletLayers: leafletMbSat,
    },
    {
      id: 'satellite',
      label: 'Satellite (Mapbox / Esri)',
      mapboxStyle: 'mapbox://styles/mapbox/satellite-v9',
      leafletLayers: leafletMbSat,
    },
    {
      id: 'google-earth',
      label: 'Google Earth',
      mapboxStyle: GOOGLE_RASTER,
      leafletLayers: [{ url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', attribution: '© Google' }],
    },
    {
      id: 'mapbox-hybrid',
      label: 'Hybrid',
      mapboxStyle: 'mapbox://styles/mapbox/satellite-streets-v12',
      leafletLayers: leafletMbHyb,
    },
    {
      id: 'hybrid',
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
      id: 'street',
      label: 'OpenStreetMap (short)',
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
      label: 'Topographic',
      mapboxStyle: rasterStyleFromTiles([{ url: esriTile('World_Topo_Map'), attribution: ATTR_ESRI }]),
      leafletLayers: [{ url: esriTile('World_Topo_Map'), attribution: ATTR_ESRI }],
    },
    {
      id: 'esri-navigation',
      label: 'Navigation',
      mapboxStyle: rasterStyleFromTiles([{ url: esriTile('World_Street_Map'), attribution: ATTR_ESRI }]),
      leafletLayers: [{ url: esriTile('World_Street_Map'), attribution: ATTR_ESRI }],
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
      label: 'Terrain with Labels',
      mapboxStyle: rasterStyleFromTiles([
        { url: esriTile('World_Terrain_Base'), attribution: ATTR_ESRI },
        { url: esriTile('World_Terrain_Reference'), attribution: ATTR_ESRI, opacity: 1 },
      ]),
      leafletLayers: [
        { url: esriTile('World_Terrain_Base'), attribution: ATTR_ESRI },
        { url: esriTile('World_Terrain_Reference'), attribution: ATTR_ESRI },
      ],
    },
    {
      id: 'esri-light-gray',
      label: 'Light Gray Canvas',
      mapboxStyle: rasterStyleFromTiles([
        { url: esriTile('World_Light_Gray_Base'), attribution: ATTR_ESRI },
        { url: esriTile('World_Light_Gray_Reference'), attribution: ATTR_ESRI, opacity: 1 },
      ]),
      leafletLayers: [
        { url: esriTile('World_Light_Gray_Base'), attribution: ATTR_ESRI },
        { url: esriTile('World_Light_Gray_Reference'), attribution: ATTR_ESRI },
      ],
    },
    {
      id: 'esri-dark-gray',
      label: 'Dark Gray Canvas',
      mapboxStyle: rasterStyleFromTiles([
        { url: esriTile('World_Dark_Gray_Base'), attribution: ATTR_ESRI },
        { url: esriTile('World_Dark_Gray_Reference'), attribution: ATTR_ESRI, opacity: 1 },
      ]),
      leafletLayers: [
        { url: esriTile('World_Dark_Gray_Base'), attribution: ATTR_ESRI },
        { url: esriTile('World_Dark_Gray_Reference'), attribution: ATTR_ESRI },
      ],
    },
    {
      id: 'esri-outdoor',
      label: 'Outdoor',
      mapboxStyle: rasterStyleFromTiles([{ url: esriTile('World_Topo_Map'), attribution: ATTR_ESRI }]),
      leafletLayers: [{ url: esriTile('World_Topo_Map'), attribution: ATTR_ESRI }],
    },
    {
      id: 'esri-oceans',
      label: 'Oceans',
      mapboxStyle: rasterStyleFromTiles([{ url: esriTile('Ocean_Basemap'), attribution: ATTR_ESRI }]),
      leafletLayers: [{ url: esriTile('Ocean_Basemap'), attribution: ATTR_ESRI }],
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
      id: 'esri-charted-territory',
      label: 'Charted Territory',
      mapboxStyle: rasterStyleFromTiles([{ url: esriTile('World_Shaded_Relief'), attribution: ATTR_ESRI }]),
      leafletLayers: [{ url: esriTile('World_Shaded_Relief'), attribution: ATTR_ESRI }],
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
    {
      id: 'google',
      label: 'Google Earth (short)',
      mapboxStyle: GOOGLE_RASTER,
      leafletLayers: [{ url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', attribution: '© Google' }],
    },
    {
      id: 'terrain',
      label: 'Terrain (OpenTopo short)',
      mapboxStyle: OPENTOPO_RASTER,
      leafletLayers: [
        {
          url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
          attribution:
            '© OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA)',
        },
      ],
    },
  ]

  const mapboxOnly: BasemapCatalogEntry[] = t
    ? [
        {
          id: 'mb-streets',
          label: 'Streets (Mapbox)',
          mapboxStyle: 'mapbox://styles/mapbox/streets-v12',
          requiresMapboxToken: true,
          leafletLayers: [{ url: mbRaster('streets-v12', t), attribution: '© Mapbox © OpenStreetMap' }],
        },
        {
          id: 'mb-outdoors',
          label: 'Outdoors (Mapbox)',
          mapboxStyle: 'mapbox://styles/mapbox/outdoors-v12',
          requiresMapboxToken: true,
          leafletLayers: [{ url: mbRaster('outdoors-v12', t), attribution: '© Mapbox © OpenStreetMap' }],
        },
        {
          id: 'mb-light',
          label: 'Light (Mapbox)',
          mapboxStyle: 'mapbox://styles/mapbox/light-v11',
          requiresMapboxToken: true,
          leafletLayers: [{ url: mbRaster('light-v11', t), attribution: '© Mapbox © OpenStreetMap' }],
        },
        {
          id: 'mb-dark',
          label: 'Dark (Mapbox)',
          mapboxStyle: 'mapbox://styles/mapbox/dark-v11',
          requiresMapboxToken: true,
          leafletLayers: [{ url: mbRaster('dark-v11', t), attribution: '© Mapbox © OpenStreetMap' }],
        },
        {
          id: 'mb-nav-day',
          label: 'Navigation (Mapbox)',
          mapboxStyle: 'mapbox://styles/mapbox/navigation-day-v1',
          requiresMapboxToken: true,
          leafletLayers: [{ url: mbRaster('navigation-day-v1', t), attribution: '© Mapbox © OpenStreetMap' }],
        },
        {
          id: 'mb-nav-night',
          label: 'Navigation (Mapbox Night)',
          mapboxStyle: 'mapbox://styles/mapbox/navigation-night-v1',
          requiresMapboxToken: true,
          leafletLayers: [{ url: mbRaster('navigation-night-v1', t), attribution: '© Mapbox © OpenStreetMap' }],
        },
      ]
    : []

  const dedup = new Map<string, BasemapCatalogEntry>()
  ;[...entries, ...mapboxOnly].forEach(e => {
    if (!dedup.has(e.id)) dedup.set(e.id, e)
  })
  return Array.from(dedup.values())
}

/** Style object for Mapbox GL when token is missing but raster tiles exist on the entry. */
export function mapboxGlStyleForEntry(entry: BasemapCatalogEntry, mapboxToken: string): string | Record<string, unknown> {
  const st = entry.mapboxStyle
  if (typeof st === 'string' && st.startsWith('mapbox://')) {
    const t = mapboxToken.trim()
    if (t) return st
    if (entry.leafletLayers?.length) return rasterStyleFromTiles(entry.leafletLayers)
  }
  return st
}

export function getBasemapThumbnail(entry: BasemapCatalogEntry, mapboxToken: string): string {
  const t = mapboxToken.trim()
  const first = entry.leafletLayers?.[0]?.url
  if (first) {
    if (first.includes('{z}')) {
      let u = first.replace('{s}', 'a').replace('{r}', '')
      if (first.includes('{x}') && first.includes('{y}')) {
        u = u.replace('{z}', '2').replace('{y}', '1').replace('{x}', '2')
      }
      return u
    }
  }
  if (t && entry.id.includes('mapbox-standard')) return mbThumb('standard-satellite', t)
  if (t && (entry.id === 'mapbox-alkamelgis' || entry.id === 'satellite')) return mbThumb('satellite-v9', t)
  if (t && entry.id === 'mapbox-hybrid') return mbThumb('satellite-streets-v12', t)
  return ESRI_IMAGERY.replace('{z}', '2').replace('{y}', '1').replace('{x}', '2')
}

export function catalogEntryById(catalog: BasemapCatalogEntry[], id: string): BasemapCatalogEntry | undefined {
  return catalog.find(e => e.id === id)
}

export const DEFAULT_BASEMAP_ID = 'mapbox-standard-satellite'
export const DEFAULT_BASEMAP_ID_NO_MAPBOX = 'esri'
