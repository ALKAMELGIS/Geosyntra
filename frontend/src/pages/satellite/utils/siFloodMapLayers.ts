/**
 * Imperative Map Layer Registry for the SAR Flood Monitoring tool. Mirrors the
 * Hydro registry: each output renders into its own persistent `si-flood-*`
 * source + layer with a stable z-order, AOI-clipped, never touching the basemap.
 * Resilient to transient `isStyleLoaded() === false` (camera/tiles/3D) by
 * re-applying the latest desired state once the map settles.
 */

import type { Map as MapboxMap, GeoJSONSource, ImageSource } from 'mapbox-gl'
import type { FloodCoordinates, FloodResult } from '../../../lib/floodSar/floodEngine'
import { FLOOD_CLASS_COLORS } from '../../../lib/floodSar/floodEngine'

export type SiFloodLayerKey = 'change' | 'flood' | 'boundaries'

/** Bottom → top: change detection lowest, flood extent, boundary outline on top. */
export const SI_FLOOD_LAYER_ORDER: SiFloodLayerKey[] = ['change', 'flood', 'boundaries']

export const SI_FLOOD_LAYER_LABEL: Record<SiFloodLayerKey, string> = {
  change: 'Flood · Change detection',
  flood: 'Flood · Extent (raster)',
  boundaries: 'Flood · Boundaries (vector)',
}

const BOUNDARY_FILL = 'si-flood-boundary-fill'
const BOUNDARY_LINE = 'si-flood-boundary-line'

const LAYER_IDS: Record<SiFloodLayerKey, string[]> = {
  change: ['si-flood-change-raster'],
  flood: ['si-flood-extent-raster'],
  boundaries: [BOUNDARY_FILL, BOUNDARY_LINE],
}

const sourceId = (key: SiFloodLayerKey): string => `si-flood-src-${key}`

export type SiFloodRasterOpacity = {
  flood: number
  change: number
}

export type SiFloodRenderState = {
  result: FloodResult | null
  mounted: boolean
  visibility: Record<SiFloodLayerKey, boolean>
  opacity: SiFloodRasterOpacity
}

const rasterUrlMemory = new WeakMap<MapboxMap, Partial<Record<SiFloodLayerKey, string>>>()
const vectorDataMemory = new WeakMap<MapboxMap, Partial<Record<SiFloodLayerKey, unknown>>>()

function rasterMem(map: MapboxMap): Partial<Record<SiFloodLayerKey, string>> {
  let m = rasterUrlMemory.get(map)
  if (!m) {
    m = {}
    rasterUrlMemory.set(map, m)
  }
  return m
}
function vectorMem(map: MapboxMap): Partial<Record<SiFloodLayerKey, unknown>> {
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
  key: SiFloodLayerKey,
  url: string,
  coordinates: FloodCoordinates,
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
        // Full-resolution crisp pixels — no bilinear smear muddying class colours.
        'raster-resampling': 'nearest',
        'raster-saturation': 0.3,
        'raster-contrast': 0.15,
      },
    })
  } else {
    map.setPaintProperty(lid, 'raster-opacity', opacity)
  }
  setVisibility(map, lid, visible)
}

function ensureBoundaries(
  map: MapboxMap,
  data: GeoJSON.FeatureCollection,
  visible: boolean,
): void {
  const sid = sourceId('boundaries')
  const mem = vectorMem(map)
  if (!map.getSource(sid)) {
    map.addSource(sid, { type: 'geojson', data })
    mem.boundaries = data
  } else if (mem.boundaries !== data) {
    try {
      ;(map.getSource(sid) as GeoJSONSource).setData(data)
    } catch {
      /* mid-reload */
    }
    mem.boundaries = data
  }
  if (!map.getLayer(BOUNDARY_FILL)) {
    map.addLayer({
      id: BOUNDARY_FILL,
      type: 'fill',
      source: sid,
      paint: { 'fill-color': FLOOD_CLASS_COLORS.newFlood, 'fill-opacity': 0.12 },
    })
  }
  if (!map.getLayer(BOUNDARY_LINE)) {
    map.addLayer({
      id: BOUNDARY_LINE,
      type: 'line',
      source: sid,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#ff5a5f', 'line-width': 2, 'line-opacity': 1 },
    })
  }
  setVisibility(map, BOUNDARY_FILL, visible)
  setVisibility(map, BOUNDARY_LINE, visible)
}

function removeKey(map: MapboxMap, key: SiFloodLayerKey): void {
  for (const lid of LAYER_IDS[key]) {
    try {
      if (map.getLayer(lid)) map.removeLayer(lid)
    } catch {
      /* style reload */
    }
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
  for (const key of SI_FLOOD_LAYER_ORDER) {
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

const latestStateByMap = new WeakMap<MapboxMap, SiFloodRenderState>()
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
    if (latest) syncSiFloodMapLayers(map, latest)
  }
  try {
    map.on('idle', run)
    map.on('load', run)
    map.on('sourcedata', run)
  } catch {
    retryArmedByMap.delete(map)
  }
}

/** Reconcile all flood layers with the current render state (idempotent). */
export function syncSiFloodMapLayers(
  map: MapboxMap | null | undefined,
  state: SiFloodRenderState,
): void {
  if (!map) return
  latestStateByMap.set(map, state)
  if (!styleReady(map)) {
    armRetry(map)
    return
  }
  const { result, mounted, visibility, opacity } = state
  const live = mounted ? result : null
  try {
    if (live?.changeImageUrl) {
      ensureRaster(map, 'change', live.changeImageUrl, live.coordinates, visibility.change, opacity.change)
    } else {
      removeKey(map, 'change')
    }

    if (live?.floodImageUrl) {
      ensureRaster(map, 'flood', live.floodImageUrl, live.coordinates, visibility.flood, opacity.flood)
    } else {
      removeKey(map, 'flood')
    }

    if (live?.boundaries) {
      ensureBoundaries(map, live.boundaries, visibility.boundaries)
    } else {
      removeKey(map, 'boundaries')
    }

    reorder(map)
  } catch (e) {
    console.warn('[siFloodMapLayers] sync failed', e)
  }
}

export function removeAllSiFloodMapLayers(map: MapboxMap | null | undefined): void {
  if (!map) return
  for (const key of SI_FLOOD_LAYER_ORDER) removeKey(map, key)
}
