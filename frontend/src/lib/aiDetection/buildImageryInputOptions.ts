import type { BasemapCatalogEntry } from '../../pages/satellite/basemapCatalog'
import { catalogEntryById, resolveBasemapId } from '../../pages/satellite/basemapCatalog'
import type { ImageryInputGroup, ImageryInputKind, ImageryOption } from './types'

export type ImageryLayerSource = {
  id: string
  name: string
  visible?: boolean
  source?: 'arcgis' | 'upload' | 'api' | 'stac'
  sourceUrl?: string
  renderMode?: 'vector' | 'raster'
  importMetadata?: { format?: string; crs?: string; bytes?: number }
}

export type BuildImageryInputOptionsArgs = {
  basemapCatalog: BasemapCatalogEntry[]
  activeBasemapId: string
  wmsLayer: string
  wmsLayers: Array<{ name: string; title: string }>
  selectedDate: Date
  customLayers: ImageryLayerSource[]
  /** Include non-active satellite basemaps from the catalog (Internet tiled). */
  includeCatalogBasemaps?: boolean
}

export const IMAGERY_KIND_LABEL: Record<ImageryInputKind, string> = {
  basemap: 'Basemap',
  live_wms: 'Live',
  raster_dataset: 'Raster Dataset',
  raster_layer: 'Raster Layer',
  mosaic_layer: 'Mosaic Layer',
  image_service: 'Image Service',
  map_server: 'Map Server',
  map_server_layer: 'Map Server Layer',
  internet_tiled: 'Internet Tiled Layer',
  upload: 'Upload',
}

export const IMAGERY_INPUT_GROUP: Record<ImageryInputKind, ImageryInputGroup> = {
  basemap: 'live',
  live_wms: 'live',
  raster_dataset: 'raster',
  raster_layer: 'raster',
  mosaic_layer: 'raster',
  image_service: 'services',
  map_server: 'services',
  map_server_layer: 'services',
  internet_tiled: 'live',
  upload: 'raster',
}

export const IMAGERY_GROUP_LABEL: Record<ImageryInputGroup, string> = {
  live: 'Live & basemap',
  raster: 'Raster',
  services: 'ArcGIS & tiled services',
}

function formatImageryLabel(kind: ImageryInputKind, detail: string, active = false): string {
  const base = `${IMAGERY_KIND_LABEL[kind]} · ${detail}`
  return active ? `${base} (active)` : base
}

function isSatelliteBasemapEntry(entry: BasemapCatalogEntry): boolean {
  const id = entry.id.toLowerCase()
  const label = entry.label.toLowerCase()
  return (
    id.includes('satellite') ||
    id.includes('imagery') ||
    id.includes('hybrid') ||
    label.includes('satellite') ||
    label.includes('imagery') ||
    id === 'esri' ||
    id === 'mapbox-standard-satellite'
  )
}

function classifyCustomLayer(layer: ImageryLayerSource): ImageryInputKind | null {
  const url = (layer.sourceUrl || '').toLowerCase()

  if (layer.renderMode === 'raster') {
    if (url.includes('/imageserver')) return 'image_service'
    if (url.includes('mosaic') || url.includes('/md/')) return 'mosaic_layer'
    if (url.includes('/mapserver')) {
      return /\/\d+\/?$/.test(url) ? 'map_server_layer' : 'map_server'
    }
    const fmt = (layer.importMetadata?.format || '').toLowerCase()
    if (layer.source === 'stac' || fmt.includes('geotiff') || fmt.includes('tif') || fmt.includes('cog')) {
      return 'raster_dataset'
    }
    if (layer.source === 'api' && url) {
      if (url.includes('tile') || url.includes('{z}')) return 'internet_tiled'
      if (url.includes('imageserver')) return 'image_service'
    }
    return 'raster_layer'
  }

  if (layer.source === 'arcgis' && url) {
    if (url.includes('/imageserver')) return 'image_service'
    if (url.includes('mosaic')) return 'mosaic_layer'
    if (url.includes('/mapserver')) {
      return /\/\d+\/?$/.test(url) ? 'map_server_layer' : 'map_server'
    }
  }

  if (layer.source === 'api' && url) {
    if (url.includes('/imageserver')) return 'image_service'
    if (url.includes('mosaic')) return 'mosaic_layer'
    if (url.includes('/mapserver')) {
      return /\/\d+\/?$/.test(url) ? 'map_server_layer' : 'map_server'
    }
    if (url.includes('tile') || url.includes('{z}') || url.includes('wmts')) {
      return 'internet_tiled'
    }
  }

  return null
}

function pushOption(opts: ImageryOption[], seen: Set<string>, option: ImageryOption) {
  if (seen.has(option.id)) return
  seen.add(option.id)
  opts.push(option)
}

/** Build grouped input-raster choices for AI detection (basemap, live WMS, raster layers, ArcGIS services). */
export function buildImageryInputOptions(args: BuildImageryInputOptionsArgs): ImageryOption[] {
  const {
    basemapCatalog,
    activeBasemapId,
    wmsLayer,
    wmsLayers,
    selectedDate,
    customLayers,
    includeCatalogBasemaps = true,
  } = args

  const opts: ImageryOption[] = []
  const seen = new Set<string>()
  const resolvedActive = resolveBasemapId(activeBasemapId)
  const activeEntry = catalogEntryById(basemapCatalog, resolvedActive)

  if (activeEntry) {
    const googleAlias =
      resolvedActive === 'esri' || resolvedActive === 'satellite'
        ? ' · Google Satellite (Esri imagery)'
        : ''
    pushOption(opts, seen, {
      id: `basemap:${activeEntry.id}`,
      kind: 'basemap',
      group: 'live',
      label: formatImageryLabel('basemap', `${activeEntry.label}${googleAlias}`, true),
    })
  }

  if (includeCatalogBasemaps) {
    for (const entry of basemapCatalog) {
      if (!isSatelliteBasemapEntry(entry)) continue
      if (entry.id === activeEntry?.id) continue
      pushOption(opts, seen, {
        id: `basemap:${entry.id}`,
        kind: 'internet_tiled',
        group: 'live',
        label: formatImageryLabel('internet_tiled', entry.label),
      })
    }
  }

  const wmsName = wmsLayer.trim()
  if (wmsName) {
    const title = wmsLayers.find(l => l.name === wmsName)?.title || wmsName
    const date = selectedDate.toISOString().slice(0, 10)
    pushOption(opts, seen, {
      id: `wms:${wmsName}`,
      kind: 'live_wms',
      group: 'live',
      label: formatImageryLabel('live_wms', `Sentinel WMS · ${title} (${date})`, true),
    })
  }

  for (const layer of customLayers) {
    if (layer.visible === false) continue
    const kind = classifyCustomLayer(layer)
    if (!kind) continue
    pushOption(opts, seen, {
      id: `layer:${layer.id}`,
      kind,
      group: IMAGERY_INPUT_GROUP[kind],
      label: formatImageryLabel(kind, layer.name),
    })
  }

  return opts
}

export function resolveImageryApiType(
  imageryId: string,
  kind?: ImageryInputKind,
): 'wms' | 'upload' | 'layer' {
  if (imageryId.startsWith('upload:')) return 'upload'
  if (imageryId.startsWith('wms:')) return 'wms'
  if (imageryId.startsWith('basemap:')) return 'layer'
  if (kind === 'live_wms') return 'wms'
  return 'layer'
}
