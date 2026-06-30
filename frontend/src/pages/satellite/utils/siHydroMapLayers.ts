/**
 * Imperative Map Layer Registry for the Hydro Watershed tool. Each output renders
 * into its own persistent `si-hydro-*` source + layer with a stable z-order,
 * AOI-clipped, never touching the basemap. Resilient to transient
 * `isStyleLoaded() === false` (camera/tiles/3D) by re-applying the latest desired
 * state once the map settles. Mirrors the SAR Flood registry.
 */

import type { Map as MapboxMap, GeoJSONSource, ImageSource } from 'mapbox-gl'
import type { HydroCoordinates, HydroWatershedResult, HydroWsLayerKey } from '../../../lib/hydroWatershed/hydroEngine'

export type SiHydroLayerKey = HydroWsLayerKey

/** Bottom → top render order: rasters first, then streams, watershed outline & outlet on top. */
export const SI_HYDRO_LAYER_ORDER: SiHydroLayerKey[] = [
  'elevation',
  'hillshade',
  'slope',
  'flowAccum',
  'streams',
  'watershed',
]

export const SI_HYDRO_LAYER_LABEL: Record<SiHydroLayerKey, string> = {
  elevation: 'Hydro · Elevation',
  hillshade: 'Hydro · Hillshade',
  slope: 'Hydro · Slope',
  flowAccum: 'Hydro · Flow accumulation',
  streams: 'Hydro · Stream network',
  watershed: 'Hydro · Watershed',
}

const WATERSHED_FILL = 'si-hydro-watershed-fill'
const WATERSHED_LINE = 'si-hydro-watershed-line'
const STREAMS_LINE = 'si-hydro-streams-line'
const OUTLET_RING = 'si-hydro-outlet-ring'
const OUTLET_DOT = 'si-hydro-outlet-dot'

const RASTER_KEYS: SiHydroLayerKey[] = ['elevation', 'hillshade', 'slope', 'flowAccum']

/**
 * Resampling per raster: continuous fields (elevation/hillshade/slope) read
 * smoother with bilinear interpolation (no blocky cells when zoomed in), while
 * flow accumulation keeps `nearest` so its channels stay crisp/classified.
 */
const RASTER_RESAMPLING: Record<SiHydroLayerKey, 'linear' | 'nearest'> = {
  elevation: 'linear',
  hillshade: 'linear',
  slope: 'linear',
  flowAccum: 'nearest',
  streams: 'nearest',
  watershed: 'nearest',
}

const LAYER_IDS: Record<SiHydroLayerKey, string[]> = {
  elevation: ['si-hydro-elevation-raster'],
  hillshade: ['si-hydro-hillshade-raster'],
  slope: ['si-hydro-slope-raster'],
  flowAccum: ['si-hydro-flowaccum-raster'],
  streams: [STREAMS_LINE],
  watershed: [WATERSHED_FILL, WATERSHED_LINE, OUTLET_RING, OUTLET_DOT],
}

const sourceId = (key: SiHydroLayerKey): string => `si-hydro-src-${key}`
const OUTLET_SOURCE = 'si-hydro-src-outlet'

const RASTER_URL_OF = (
  result: HydroWatershedResult,
  key: SiHydroLayerKey,
): string | undefined => {
  switch (key) {
    case 'elevation':
      return result.elevationImageUrl
    case 'hillshade':
      return result.hillshadeImageUrl
    case 'slope':
      return result.slopeImageUrl
    case 'flowAccum':
      return result.flowAccumImageUrl
    default:
      return undefined
  }
}

export const SI_HYDRO_DEFAULT_OPACITY: Record<SiHydroLayerKey, number> = {
  elevation: 0.9,
  hillshade: 0.85,
  slope: 0.82,
  flowAccum: 0.92,
  streams: 1,
  watershed: 1,
}

export type SiHydroStreamMode = 'strahler' | 'shreve'

export type SiHydroRenderState = {
  result: HydroWatershedResult | null
  mounted: boolean
  visibility: Record<SiHydroLayerKey, boolean>
  /** Classification driving the drainage-network colour/width ramp. */
  streamMode: SiHydroStreamMode
}

const rasterUrlMemory = new WeakMap<MapboxMap, Partial<Record<SiHydroLayerKey, string>>>()
const vectorDataMemory = new WeakMap<MapboxMap, Partial<Record<string, unknown>>>()

function rasterMem(map: MapboxMap): Partial<Record<SiHydroLayerKey, string>> {
  let m = rasterUrlMemory.get(map)
  if (!m) {
    m = {}
    rasterUrlMemory.set(map, m)
  }
  return m
}
function vectorMem(map: MapboxMap): Partial<Record<string, unknown>> {
  let m = vectorDataMemory.get(map)
  if (!m) {
    m = {}
    vectorDataMemory.set(map, m)
  }
  return m
}

function setVisibility(map: MapboxMap, layerId: string, visible: boolean): void {
  if (!map.getLayer(layerId)) return
  map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none')
}

function ensureRaster(
  map: MapboxMap,
  key: SiHydroLayerKey,
  url: string,
  coordinates: HydroCoordinates,
  visible: boolean,
  opacity: number,
): void {
  const sid = sourceId(key)
  const lid = LAYER_IDS[key][0]
  const mem = rasterMem(map)
  if (!map.getSource(sid)) {
    map.addSource(sid, {
      type: 'image',
      url,
      coordinates: coordinates as unknown as [
        [number, number],
        [number, number],
        [number, number],
        [number, number],
      ],
    })
    mem[key] = url
  } else if (mem[key] !== url) {
    try {
      ;(map.getSource(sid) as ImageSource).updateImage({ url, coordinates })
    } catch {
      /* mid-reload */
    }
    mem[key] = url
  }
  if (!map.getLayer(lid)) {
    map.addLayer({
      id: lid,
      type: 'raster',
      source: sid,
      paint: {
        'raster-opacity': opacity,
        'raster-fade-duration': 0,
        'raster-resampling': RASTER_RESAMPLING[key],
      },
    })
  } else {
    map.setPaintProperty(lid, 'raster-opacity', opacity)
  }
  setVisibility(map, lid, visible)
}

function streamColorExpr(mode: SiHydroStreamMode): unknown {
  if (mode === 'shreve') {
    // Additive magnitude: faint headwaters (1) → bold red trunk (high magnitude).
    return [
      'interpolate',
      ['linear'],
      ['to-number', ['get', 'shreve'], 1],
      1, '#cfe8ff',
      4, '#74b3ec',
      14, '#2f7fd8',
      40, '#d83b3b',
      80, '#b91c1c',
    ]
  }
  // Light-blue tributaries → bold red main channel by Strahler order.
  return [
    'interpolate',
    ['linear'],
    ['to-number', ['get', 'strahler'], 1],
    1, '#cfe8ff',
    2, '#74b3ec',
    3, '#2f7fd8',
    4, '#d83b3b',
    6, '#b91c1c',
  ]
}

function streamWidthExpr(mode: SiHydroStreamMode): unknown {
  if (mode === 'shreve') {
    return [
      'interpolate',
      ['linear'],
      ['to-number', ['get', 'shreve'], 1],
      1, 0.7,
      4, 1.3,
      14, 2.2,
      40, 3.4,
      80, 4.6,
    ]
  }
  return [
    'interpolate',
    ['linear'],
    ['to-number', ['get', 'strahler'], 1],
    1, 0.7,
    2, 1.3,
    3, 2.2,
    4, 3.4,
    6, 4.6,
  ]
}

function ensureStreams(
  map: MapboxMap,
  data: GeoJSON.FeatureCollection,
  visible: boolean,
  mode: SiHydroStreamMode,
): void {
  const sid = sourceId('streams')
  const mem = vectorMem(map)
  if (!map.getSource(sid)) {
    map.addSource(sid, { type: 'geojson', data })
    mem.streams = data
  } else if (mem.streams !== data) {
    try {
      ;(map.getSource(sid) as GeoJSONSource).setData(data)
    } catch {
      /* mid-reload */
    }
    mem.streams = data
  }
  if (!map.getLayer(STREAMS_LINE)) {
    map.addLayer({
      id: STREAMS_LINE,
      type: 'line',
      source: sid,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': streamColorExpr(mode) as unknown as string,
        'line-width': streamWidthExpr(mode) as unknown as number,
        'line-opacity': 0.95,
      },
    })
  } else if (mem.streamMode !== mode) {
    try {
      map.setPaintProperty(STREAMS_LINE, 'line-color', streamColorExpr(mode) as unknown as string)
      map.setPaintProperty(STREAMS_LINE, 'line-width', streamWidthExpr(mode) as unknown as number)
    } catch {
      /* mid-reload */
    }
  }
  mem.streamMode = mode
  setVisibility(map, STREAMS_LINE, visible)
}

function ensureWatershed(
  map: MapboxMap,
  data: GeoJSON.FeatureCollection,
  outlet: [number, number] | null,
  visible: boolean,
): void {
  const sid = sourceId('watershed')
  const mem = vectorMem(map)
  if (!map.getSource(sid)) {
    map.addSource(sid, { type: 'geojson', data })
    mem.watershed = data
  } else if (mem.watershed !== data) {
    try {
      ;(map.getSource(sid) as GeoJSONSource).setData(data)
    } catch {
      /* mid-reload */
    }
    mem.watershed = data
  }
  if (!map.getLayer(WATERSHED_FILL)) {
    map.addLayer({
      id: WATERSHED_FILL,
      type: 'fill',
      source: sid,
      paint: { 'fill-color': '#3b6fe0', 'fill-opacity': 0.32 },
    })
  }
  if (!map.getLayer(WATERSHED_LINE)) {
    map.addLayer({
      id: WATERSHED_LINE,
      type: 'line',
      source: sid,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#9ec3ff', 'line-width': 1.4, 'line-opacity': 0.9 },
    })
  }
  setVisibility(map, WATERSHED_FILL, visible)
  setVisibility(map, WATERSHED_LINE, visible)

  // Outlet pour-point (black dot with white ring).
  const outletData: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: outlet
      ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: outlet } }]
      : [],
  }
  if (!map.getSource(OUTLET_SOURCE)) {
    map.addSource(OUTLET_SOURCE, { type: 'geojson', data: outletData })
    mem.outlet = outlet
  } else if (mem.outlet !== outlet) {
    try {
      ;(map.getSource(OUTLET_SOURCE) as GeoJSONSource).setData(outletData)
    } catch {
      /* mid-reload */
    }
    mem.outlet = outlet
  }
  if (!map.getLayer(OUTLET_RING)) {
    map.addLayer({
      id: OUTLET_RING,
      type: 'circle',
      source: OUTLET_SOURCE,
      paint: {
        'circle-radius': 7,
        'circle-color': '#ffffff',
        'circle-opacity': 0.95,
        'circle-stroke-color': 'rgba(0,0,0,0.45)',
        'circle-stroke-width': 1,
      },
    })
  }
  if (!map.getLayer(OUTLET_DOT)) {
    map.addLayer({
      id: OUTLET_DOT,
      type: 'circle',
      source: OUTLET_SOURCE,
      paint: { 'circle-radius': 4, 'circle-color': '#0a0a0a' },
    })
  }
  setVisibility(map, OUTLET_RING, visible)
  setVisibility(map, OUTLET_DOT, visible)
}

function removeKey(map: MapboxMap, key: SiHydroLayerKey): void {
  for (const lid of LAYER_IDS[key]) {
    try {
      if (map.getLayer(lid)) map.removeLayer(lid)
    } catch {
      /* style reload */
    }
  }
  if (key === 'watershed') {
    try {
      if (map.getSource(OUTLET_SOURCE)) map.removeSource(OUTLET_SOURCE)
    } catch {
      /* still referenced */
    }
    delete vectorMem(map).outlet
  }
  const sid = sourceId(key)
  try {
    if (map.getSource(sid)) map.removeSource(sid)
  } catch {
    /* still referenced */
  }
  delete rasterMem(map)[key]
  delete vectorMem(map)[key]
}

function reorder(map: MapboxMap): void {
  for (const key of SI_HYDRO_LAYER_ORDER) {
    for (const lid of LAYER_IDS[key]) {
      if (!map.getLayer(lid)) continue
      try {
        map.moveLayer(lid)
      } catch {
        /* ignore */
      }
    }
  }
}

function styleReady(map: MapboxMap): boolean {
  try {
    return typeof map.isStyleLoaded === 'function' ? map.isStyleLoaded() : true
  } catch {
    return false
  }
}

const latestStateByMap = new WeakMap<MapboxMap, SiHydroRenderState>()
const retryArmedByMap = new WeakSet<MapboxMap>()

function armRetry(map: MapboxMap): void {
  if (retryArmedByMap.has(map)) return
  retryArmedByMap.add(map)
  const run = (): void => {
    if (!styleReady(map)) return
    retryArmedByMap.delete(map)
    try {
      map.off('idle', run)
      map.off('load', run)
      map.off('sourcedata', run)
    } catch {
      /* destroyed */
    }
    const latest = latestStateByMap.get(map)
    if (latest) syncSiHydroMapLayers(map, latest)
  }
  try {
    map.on('idle', run)
    map.on('load', run)
    map.on('sourcedata', run)
  } catch {
    retryArmedByMap.delete(map)
  }
}

/** Reconcile all hydro layers with the current render state (idempotent). */
export function syncSiHydroMapLayers(
  map: MapboxMap | null | undefined,
  state: SiHydroRenderState,
): void {
  if (!map) return
  latestStateByMap.set(map, state)
  if (!styleReady(map)) {
    armRetry(map)
    return
  }
  const { result, mounted, visibility, streamMode } = state
  const live = mounted ? result : null
  try {
    for (const key of RASTER_KEYS) {
      const url = live ? RASTER_URL_OF(live, key) : undefined
      if (live && url) {
        ensureRaster(map, key, url, live.coordinates, visibility[key], SI_HYDRO_DEFAULT_OPACITY[key])
      } else {
        removeKey(map, key)
      }
    }

    if (live?.streams) {
      ensureStreams(map, live.streams, visibility.streams, streamMode)
    } else {
      removeKey(map, 'streams')
    }

    if (live?.watershed) {
      ensureWatershed(map, live.watershed, live.outlet, visibility.watershed)
    } else {
      removeKey(map, 'watershed')
    }

    reorder(map)
  } catch (e) {
    console.warn('[siHydroMapLayers] sync failed', e)
  }
}

export function removeAllSiHydroMapLayers(map: MapboxMap | null | undefined): void {
  if (!map) return
  for (const key of SI_HYDRO_LAYER_ORDER) removeKey(map, key)
}
