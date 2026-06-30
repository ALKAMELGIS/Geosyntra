import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  AREA_UNITS,
  DISTANCE_UNITS,
  angleAtVertex,
  bearingDegrees,
  circleRing,
  compass16,
  formatArea,
  formatDistance,
  formatLngLat,
  haversineMeters,
  midpoint,
  polygonAreaMeters,
  polylineMeters,
  rectangleRing,
  ringCentroid,
  type AreaUnit,
  type DistanceUnit,
  type LngLat,
} from '../utils/siMapMeasureGeo'
import './SiMapMeasureTool.css'

/**
 * Geosyntra · Unified Measurement Tool (ArcGIS-Pro style)
 * -------------------------------------------------------
 * A single panel that hosts every standard GIS measurement mode and draws the
 * results directly on the Mapbox map. Measurement graphics are owned here via a
 * dedicated source/layer stack that is re-installed on basemap (style) switches
 * so completed measurements survive navigation, zoom, pan, and basemap changes.
 */

export type MeasureMode =
  | 'distance'
  | 'area'
  | 'perimeter'
  | 'radius'
  | 'circle'
  | 'rectangle'
  | 'bearing'
  | 'coordinate'
  | 'elevation'
  | 'distance3d'
  | 'height'
  | 'angle'

type MeasureKind = 'single' | 'pair' | 'triple' | 'path' | 'closed'
type MeasureGeom = 'point' | 'line' | 'polygon' | 'circle' | 'rectangle'

type ModeMeta = {
  kind: MeasureKind
  geom: MeasureGeom
  icon: string
  label: string
  needsTerrain?: boolean
  needs3d?: boolean
}

const MODE_META: Record<MeasureMode, ModeMeta> = {
  distance: { kind: 'path', geom: 'line', icon: 'fa-solid fa-ruler-horizontal', label: 'Distance' },
  area: { kind: 'closed', geom: 'polygon', icon: 'fa-solid fa-draw-polygon', label: 'Area' },
  perimeter: { kind: 'closed', geom: 'polygon', icon: 'fa-solid fa-vector-square', label: 'Perimeter' },
  radius: { kind: 'pair', geom: 'circle', icon: 'fa-solid fa-circle-dot', label: 'Radius' },
  circle: { kind: 'pair', geom: 'circle', icon: 'fa-regular fa-circle', label: 'Circle' },
  rectangle: { kind: 'pair', geom: 'rectangle', icon: 'fa-regular fa-square', label: 'Rectangle' },
  bearing: { kind: 'pair', geom: 'line', icon: 'fa-solid fa-compass', label: 'Bearing' },
  coordinate: { kind: 'single', geom: 'point', icon: 'fa-solid fa-location-crosshairs', label: 'Coordinate' },
  elevation: { kind: 'single', geom: 'point', icon: 'fa-solid fa-mountain', label: 'Elevation', needsTerrain: true },
  distance3d: { kind: 'path', geom: 'line', icon: 'fa-solid fa-cube', label: '3D Distance', needs3d: true },
  height: { kind: 'pair', geom: 'line', icon: 'fa-solid fa-up-down', label: 'Height', needsTerrain: true },
  angle: { kind: 'triple', geom: 'line', icon: 'fa-solid fa-angle-left', label: 'Angle' },
}

const MODE_ORDER: MeasureMode[] = [
  'distance',
  'area',
  'perimeter',
  'radius',
  'circle',
  'rectangle',
  'bearing',
  'angle',
  'coordinate',
  'elevation',
  'distance3d',
  'height',
]

const SRC_ID = 'si-measure-src'
const LYR_FILL = 'si-measure-fill'
const LYR_LINE = 'si-measure-line'
const LYR_LINE_DRAFT = 'si-measure-line-draft'
const LYR_VERTEX = 'si-measure-vertex'
const LYR_LABEL = 'si-measure-label'

type MeasureRecord = {
  id: string
  mode: MeasureMode
  points: LngLat[]
  elevations: (number | null)[]
}

type ReadoutRow = { label: string; value: string }

export type SiMapMeasureToolProps = {
  open: boolean
  onClose: () => void
  mapRef: { current: { getMap?: () => any } | any }
  mapLoaded: boolean
  terrainAvailable: boolean
  is3D: boolean
  /** Called when a measurement mode is armed — host should drop AOI draw to 'view'. */
  onArm?: () => void
}

/** Total target point count for fixed-size modes (single/pair/triple). */
function fixedCount(kind: MeasureKind): number | null {
  if (kind === 'single') return 1
  if (kind === 'pair') return 2
  if (kind === 'triple') return 3
  return null
}

/** Compute the human-readable rows + a short on-map label for a measurement. */
function statsFor(
  mode: MeasureMode,
  points: LngLat[],
  elevations: (number | null)[],
  du: DistanceUnit,
  au: AreaUnit,
): { rows: ReadoutRow[]; mapLabel: string; labelAt: LngLat | null } {
  const meta = MODE_META[mode]
  if (points.length === 0) return { rows: [], mapLabel: '', labelAt: null }

  if (meta.geom === 'point' || mode === 'coordinate' || mode === 'elevation') {
    const p = points[0]
    const rows: ReadoutRow[] = [
      { label: 'Longitude', value: `${p[0].toFixed(6)}°` },
      { label: 'Latitude', value: `${p[1].toFixed(6)}°` },
    ]
    let mapLabel = formatLngLat(p)
    if (mode === 'elevation') {
      const el = elevations[0]
      const elTxt = el == null ? '—' : `${el.toFixed(1)} m`
      rows.push({ label: 'Elevation', value: elTxt })
      mapLabel = `${elTxt}`
    }
    return { rows, mapLabel, labelAt: p }
  }

  if (mode === 'bearing') {
    if (points.length < 2) return { rows: [], mapLabel: '', labelAt: null }
    const [a, b] = points
    const az = bearingDegrees(a, b)
    const dist = haversineMeters(a, b)
    return {
      rows: [
        { label: 'Azimuth', value: `${az.toFixed(1)}° ${compass16(az)}` },
        { label: 'Distance', value: formatDistance(dist, du) },
      ],
      mapLabel: `${az.toFixed(1)}° · ${formatDistance(dist, du)}`,
      labelAt: midpoint(a, b),
    }
  }

  if (mode === 'angle') {
    if (points.length < 3) {
      const d = points.length === 2 ? haversineMeters(points[0], points[1]) : 0
      return { rows: [{ label: 'Segment', value: formatDistance(d, du) }], mapLabel: '', labelAt: null }
    }
    const ang = angleAtVertex(points[0], points[1], points[2])
    return {
      rows: [{ label: 'Angle', value: `${ang.toFixed(1)}°` }],
      mapLabel: `${ang.toFixed(1)}°`,
      labelAt: points[1],
    }
  }

  if (meta.geom === 'circle') {
    if (points.length < 2) return { rows: [], mapLabel: '', labelAt: points[0] ?? null }
    const r = haversineMeters(points[0], points[1])
    const area = Math.PI * r * r
    const circ = 2 * Math.PI * r
    const rows: ReadoutRow[] = [
      { label: 'Radius', value: formatDistance(r, du) },
      { label: 'Diameter', value: formatDistance(r * 2, du) },
      { label: 'Circumference', value: formatDistance(circ, du) },
      { label: 'Area', value: formatArea(area, au) },
    ]
    return {
      rows,
      mapLabel: mode === 'radius' ? `R ${formatDistance(r, du)}` : formatArea(area, au),
      labelAt: points[0],
    }
  }

  if (meta.geom === 'rectangle') {
    if (points.length < 2) return { rows: [], mapLabel: '', labelAt: null }
    const [a, b] = points
    const width = haversineMeters([a[0], a[1]], [b[0], a[1]])
    const height = haversineMeters([a[0], a[1]], [a[0], b[1]])
    const ring = rectangleRing(a, b)
    const area = polygonAreaMeters(ring)
    const perim = polylineMeters(ring)
    return {
      rows: [
        { label: 'Width', value: formatDistance(width, du) },
        { label: 'Height', value: formatDistance(height, du) },
        { label: 'Area', value: formatArea(area, au) },
        { label: 'Perimeter', value: formatDistance(perim, du) },
      ],
      mapLabel: formatArea(area, au),
      labelAt: ringCentroid(ring),
    }
  }

  if (mode === 'height') {
    if (points.length < 2) return { rows: [], mapLabel: '', labelAt: null }
    const e0 = elevations[0]
    const e1 = elevations[1]
    const dz = e0 != null && e1 != null ? Math.abs(e1 - e0) : null
    const horiz = haversineMeters(points[0], points[1])
    const slope = dz != null ? Math.sqrt(horiz * horiz + dz * dz) : null
    return {
      rows: [
        { label: 'Δ Height', value: dz == null ? '—' : `${dz.toFixed(1)} m` },
        { label: 'Horizontal', value: formatDistance(horiz, du) },
        { label: 'Slope dist.', value: slope == null ? '—' : formatDistance(slope, du) },
      ],
      mapLabel: dz == null ? '—' : `Δ ${dz.toFixed(1)} m`,
      labelAt: midpoint(points[0], points[1]),
    }
  }

  if (mode === 'distance3d') {
    if (points.length < 2) return { rows: [], mapLabel: '', labelAt: null }
    let total = 0
    for (let i = 1; i < points.length; i++) {
      const horiz = haversineMeters(points[i - 1], points[i])
      const a = elevations[i - 1]
      const b = elevations[i]
      const dz = a != null && b != null ? b - a : 0
      total += Math.sqrt(horiz * horiz + dz * dz)
    }
    return {
      rows: [
        { label: '3D Length', value: formatDistance(total, du) },
        { label: 'Vertices', value: String(points.length) },
      ],
      mapLabel: formatDistance(total, du),
      labelAt: points[points.length - 1],
    }
  }

  if (meta.kind === 'closed') {
    // area / perimeter
    const ring = points.slice()
    const area = ring.length >= 3 ? polygonAreaMeters(ring) : 0
    const closed = ring.length >= 3 ? [...ring, ring[0]] : ring
    const perim = polylineMeters(closed)
    const rows: ReadoutRow[] = [
      { label: 'Area', value: formatArea(area, au) },
      { label: 'Perimeter', value: formatDistance(perim, du) },
      { label: 'Vertices', value: String(ring.length) },
    ]
    return {
      rows,
      mapLabel: mode === 'perimeter' ? formatDistance(perim, du) : formatArea(area, au),
      labelAt: ring.length ? ringCentroid(ring) : null,
    }
  }

  // distance (path)
  const len = polylineMeters(points)
  const last = points.length >= 2 ? haversineMeters(points[points.length - 2], points[points.length - 1]) : 0
  return {
    rows: [
      { label: 'Total length', value: formatDistance(len, du) },
      { label: 'Last segment', value: formatDistance(last, du) },
      { label: 'Vertices', value: String(points.length) },
    ],
    mapLabel: formatDistance(len, du),
    labelAt: points[points.length - 1],
  }
}

type AnyFeature = GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown>>

/** Build the on-map GeoJSON for a single record (or in-progress draft). */
function recordFeatures(
  mode: MeasureMode,
  points: LngLat[],
  elevations: (number | null)[],
  du: DistanceUnit,
  au: AreaUnit,
  draft: boolean,
): AnyFeature[] {
  const meta = MODE_META[mode]
  const feats: AnyFeature[] = []
  if (points.length === 0) return feats

  const pushLine = (coords: LngLat[]) => {
    if (coords.length < 2) return
    feats.push({ type: 'Feature', properties: { kind: 'line', draft }, geometry: { type: 'LineString', coordinates: coords } })
  }
  const pushPolygon = (ring: LngLat[]) => {
    if (ring.length < 3) return
    const closed = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring : [...ring, ring[0]]
    feats.push({ type: 'Feature', properties: { kind: 'fill', draft }, geometry: { type: 'Polygon', coordinates: [closed] } })
    feats.push({ type: 'Feature', properties: { kind: 'line', draft }, geometry: { type: 'LineString', coordinates: closed } })
  }

  if (meta.geom === 'circle' && points.length >= 2) {
    const r = haversineMeters(points[0], points[1])
    pushPolygon(circleRing(points[0], r))
    pushLine([points[0], points[1]]) // radius spoke
  } else if (meta.geom === 'rectangle' && points.length >= 2) {
    pushPolygon(rectangleRing(points[0], points[1]))
  } else if (meta.kind === 'closed') {
    if (points.length >= 3) pushPolygon(points)
    else pushLine(points)
  } else if (meta.geom === 'line') {
    pushLine(points)
  }

  // Vertices
  for (const p of points) {
    feats.push({ type: 'Feature', properties: { kind: 'vertex', draft }, geometry: { type: 'Point', coordinates: p } })
  }

  // Label
  const { mapLabel, labelAt } = statsFor(mode, points, elevations, du, au)
  if (mapLabel && labelAt) {
    feats.push({
      type: 'Feature',
      properties: { kind: 'label', label: mapLabel, draft },
      geometry: { type: 'Point', coordinates: labelAt },
    })
  }
  return feats
}

export function SiMapMeasureTool({
  open,
  onClose,
  mapRef,
  mapLoaded,
  terrainAvailable,
  is3D,
  onArm,
}: SiMapMeasureToolProps) {
  const [mode, setMode] = useState<MeasureMode>('distance')
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>('m')
  const [areaUnit, setAreaUnit] = useState<AreaUnit>('ha')
  const [snap, setSnap] = useState(true)
  const [finished, setFinished] = useState<MeasureRecord[]>([])
  const [draftPoints, setDraftPoints] = useState<LngLat[]>([])
  const [redoStack, setRedoStack] = useState<LngLat[]>([])
  const [hover, setHover] = useState<LngLat | null>(null)

  // Free-drag position (null = default anchored top-left).
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)

  const onDragStart = useCallback((e: ReactPointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return // don't drag from the close button
    const panel = (e.currentTarget as HTMLElement).closest('.si-measure-panel') as HTMLElement | null
    if (!panel) return
    const rect = panel.getBoundingClientRect()
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top }
    const onMove = (ev: PointerEvent) => {
      if (!dragRef.current) return
      const w = panel.offsetWidth
      const h = panel.offsetHeight
      const x = Math.max(6, Math.min(window.innerWidth - w - 6, ev.clientX - dragRef.current.dx))
      const y = Math.max(6, Math.min(window.innerHeight - h - 6, ev.clientY - dragRef.current.dy))
      setPos({ x, y })
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [])

  // Mirror the draft into a ref so map listeners can read it without re-binding.
  const draftRef = useRef<LngLat[]>([])
  draftRef.current = draftPoints

  const getMap = useCallback((): any | null => {
    const m = mapRef?.current?.getMap?.() ?? mapRef?.current
    return m ?? null
  }, [mapRef])

  const elevAt = useCallback(
    (p: LngLat): number | null => {
      const m = getMap()
      try {
        const e = m?.queryTerrainElevation?.({ lng: p[0], lat: p[1] }, { exaggerated: false })
        return typeof e === 'number' && Number.isFinite(e) ? e : null
      } catch {
        return null
      }
    },
    [getMap],
  )

  // Live readout for the current draft (with hover preview appended).
  const livePoints = useMemo(() => {
    if (!hover) return draftPoints
    const meta = MODE_META[mode]
    const cap = fixedCount(meta.kind)
    if (cap != null && draftPoints.length >= cap) return draftPoints
    return [...draftPoints, hover]
  }, [draftPoints, hover, mode])

  const liveElevations = useMemo(
    () => livePoints.map(p => (MODE_META[mode].needsTerrain || MODE_META[mode].needs3d ? elevAt(p) : null)),
    [livePoints, mode, elevAt],
  )

  const liveStats = useMemo(
    () => statsFor(mode, livePoints, liveElevations, distanceUnit, areaUnit),
    [mode, livePoints, liveElevations, distanceUnit, areaUnit],
  )

  // ---- Map graphics install (survives basemap/style switches) -------------
  const installLayers = useCallback(() => {
    const m = getMap()
    if (!m || typeof m.getStyle !== 'function') return
    try {
      if (!m.getSource(SRC_ID)) {
        m.addSource(SRC_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      }
      if (!m.getLayer(LYR_FILL)) {
        m.addLayer({
          id: LYR_FILL,
          type: 'fill',
          source: SRC_ID,
          filter: ['==', ['get', 'kind'], 'fill'],
          paint: { 'fill-color': '#22d3ee', 'fill-opacity': 0.12 },
        })
      }
      if (!m.getLayer(LYR_LINE)) {
        m.addLayer({
          id: LYR_LINE,
          type: 'line',
          source: SRC_ID,
          filter: ['all', ['==', ['get', 'kind'], 'line'], ['!=', ['get', 'draft'], true]],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#22d3ee', 'line-width': 2.2 },
        })
      }
      if (!m.getLayer(LYR_LINE_DRAFT)) {
        m.addLayer({
          id: LYR_LINE_DRAFT,
          type: 'line',
          source: SRC_ID,
          filter: ['all', ['==', ['get', 'kind'], 'line'], ['==', ['get', 'draft'], true]],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#67e8f9', 'line-width': 1.8, 'line-dasharray': [2, 1.5] },
        })
      }
      if (!m.getLayer(LYR_VERTEX)) {
        m.addLayer({
          id: LYR_VERTEX,
          type: 'circle',
          source: SRC_ID,
          filter: ['==', ['get', 'kind'], 'vertex'],
          paint: {
            'circle-radius': 4,
            'circle-color': '#0f172a',
            'circle-stroke-color': '#67e8f9',
            'circle-stroke-width': 2,
          },
        })
      }
      if (!m.getLayer(LYR_LABEL)) {
        m.addLayer({
          id: LYR_LABEL,
          type: 'symbol',
          source: SRC_ID,
          filter: ['==', ['get', 'kind'], 'label'],
          layout: {
            'text-field': ['get', 'label'],
            'text-size': 12,
            'text-offset': [0, -1.1],
            'text-anchor': 'bottom',
            'text-allow-overlap': true,
            'text-ignore-placement': true,
          },
          paint: {
            'text-color': '#ecfeff',
            'text-halo-color': '#0f172a',
            'text-halo-width': 1.6,
          },
        })
      }
    } catch {
      /* style mid-rebuild — retry on next styledata */
    }
  }, [getMap])

  const renderGraphics = useCallback(() => {
    const m = getMap()
    const src = m?.getSource?.(SRC_ID) as { setData?: (d: unknown) => void } | undefined
    if (!src?.setData) return
    const feats: AnyFeature[] = []
    for (const rec of finished) feats.push(...recordFeatures(rec.mode, rec.points, rec.elevations, distanceUnit, areaUnit, false))
    if (livePoints.length) feats.push(...recordFeatures(mode, livePoints, liveElevations, distanceUnit, areaUnit, true))
    try {
      src.setData({ type: 'FeatureCollection', features: feats })
    } catch {
      /* ignore */
    }
  }, [getMap, finished, livePoints, liveElevations, mode, distanceUnit, areaUnit])

  // Install on open + re-install on style (basemap) switches.
  useEffect(() => {
    if (!open || !mapLoaded) return
    const m = getMap()
    if (!m) return
    installLayers()
    renderGraphics()
    const onStyle = () => {
      installLayers()
      renderGraphics()
    }
    m.on('styledata', onStyle)
    return () => {
      try {
        m.off('styledata', onStyle)
      } catch {
        /* ignore */
      }
    }
  }, [open, mapLoaded, getMap, installLayers, renderGraphics])

  // Keep graphics in sync with state.
  useEffect(() => {
    if (!open) return
    renderGraphics()
  }, [open, renderGraphics])

  // Remove graphics entirely when the tool closes.
  useEffect(() => {
    if (open) return
    const m = getMap()
    if (!m) return
    try {
      for (const id of [LYR_LABEL, LYR_VERTEX, LYR_LINE_DRAFT, LYR_LINE, LYR_FILL]) if (m.getLayer?.(id)) m.removeLayer(id)
      if (m.getSource?.(SRC_ID)) m.removeSource(SRC_ID)
      m.getCanvas && (m.getCanvas().style.cursor = '')
    } catch {
      /* ignore */
    }
  }, [open, getMap])

  // ---- Map interaction ----------------------------------------------------
  const commitDraft = useCallback(
    (pts: LngLat[]) => {
      if (!pts.length) return
      const els = pts.map(p => (MODE_META[mode].needsTerrain || MODE_META[mode].needs3d ? elevAt(p) : null))
      setFinished(prev => [...prev, { id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, mode, points: pts, elevations: els }])
      setDraftPoints([])
      setRedoStack([])
      setHover(null)
    },
    [mode, elevAt],
  )

  useEffect(() => {
    if (!open || !mapLoaded) return
    const m = getMap()
    if (!m) return
    const canvas = m.getCanvas?.()
    if (canvas) canvas.style.cursor = 'crosshair'

    const meta = MODE_META[mode]
    const cap = fixedCount(meta.kind)
    // Stop the basemap from zooming when finishing a path with a double-click.
    const dczWasEnabled = !!m.doubleClickZoom?.isEnabled?.()
    if (cap == null) m.doubleClickZoom?.disable?.()

    const samePoint = (a: LngLat, b: LngLat) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9

    const onClick = (e: any) => {
      const p: LngLat = [e.lngLat.lng, e.lngLat.lat]
      // Snap to the draft start (close polygons / reuse first vertex).
      let pt = p
      if (snap && draftRef.current.length) {
        const first = draftRef.current[0]
        const px = m.project(first)
        const dx = px.x - e.point.x
        const dy = px.y - e.point.y
        if (Math.hypot(dx, dy) <= 10) pt = first
      }
      setRedoStack([])
      if (cap === 1) {
        commitDraft([pt])
        return
      }
      setDraftPoints(prev => {
        if (prev.length && samePoint(prev[prev.length - 1], pt)) return prev
        const next = [...prev, pt]
        if (cap != null && next.length >= cap) {
          commitDraft(next)
          return []
        }
        return next
      })
    }

    const onMove = (e: any) => setHover([e.lngLat.lng, e.lngLat.lat])

    const onDblClick = (e: any) => {
      if (cap != null) return
      e.preventDefault?.()
      setDraftPoints(prev => {
        if (prev.length >= 2) commitDraft(prev)
        return prev.length >= 2 ? [] : prev
      })
    }

    const onContext = (e: any) => {
      // Right-click removes the last draft point (undo while drawing).
      e.preventDefault?.()
      setDraftPoints(prev => prev.slice(0, -1))
    }

    m.on('click', onClick)
    m.on('mousemove', onMove)
    m.on('dblclick', onDblClick)
    m.on('contextmenu', onContext)
    return () => {
      try {
        m.off('click', onClick)
        m.off('mousemove', onMove)
        m.off('dblclick', onDblClick)
        m.off('contextmenu', onContext)
        if (cap == null && dczWasEnabled) m.doubleClickZoom?.enable?.()
      } catch {
        /* ignore */
      }
    }
  }, [open, mapLoaded, getMap, mode, snap, commitDraft])

  // Keyboard: Enter finishes a path, Escape cancels the current draft.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDraftPoints([])
        setRedoStack([])
        setHover(null)
      } else if (e.key === 'Enter') {
        setDraftPoints(prev => {
          if (prev.length >= 2) commitDraft(prev)
          return prev.length >= 2 ? [] : prev
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, commitDraft])

  const armMode = useCallback(
    (next: MeasureMode) => {
      onArm?.()
      setMode(next)
      setDraftPoints([])
      setRedoStack([])
      setHover(null)
    },
    [onArm],
  )

  const undoPoint = useCallback(() => {
    setDraftPoints(prev => {
      if (!prev.length) return prev
      const last = prev[prev.length - 1]
      setRedoStack(r => [...r, last])
      return prev.slice(0, -1)
    })
  }, [])

  const redoPoint = useCallback(() => {
    setRedoStack(prev => {
      if (!prev.length) return prev
      const p = prev[prev.length - 1]
      setDraftPoints(d => [...d, p])
      return prev.slice(0, -1)
    })
  }, [])

  const clearCurrent = useCallback(() => {
    setDraftPoints([])
    setRedoStack([])
    setHover(null)
  }, [])

  const clearAll = useCallback(() => {
    setFinished([])
    setDraftPoints([])
    setRedoStack([])
    setHover(null)
  }, [])

  if (!open) return null

  const meta = MODE_META[mode]
  const showAreaUnit = meta.geom === 'polygon' || meta.geom === 'circle' || meta.geom === 'rectangle'

  return (
    <section
      className="si-measure-panel"
      role="region"
      aria-label="Measurement tools"
      style={pos ? { left: pos.x, top: pos.y, right: 'auto' } : undefined}
    >
      <header className="si-measure-panel__head" onPointerDown={onDragStart} title="Drag to move">
        <span className="si-measure-panel__title">
          <i className="fa-solid fa-ruler-combined" aria-hidden /> Measurement
        </span>
        <button
          type="button"
          className="si-measure-icon-btn"
          title="Close measurement"
          aria-label="Close measurement"
          onClick={onClose}
        >
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </header>

      <div className="si-measure-modes" role="toolbar" aria-label="Measurement modes">
        {MODE_ORDER.map(id => {
          const mm = MODE_META[id]
          const disabled = (mm.needsTerrain && !terrainAvailable) || (mm.needs3d && !is3D)
          return (
            <button
              key={id}
              type="button"
              className={`si-measure-mode${mode === id ? ' si-measure-mode--on' : ''}`}
              title={
                disabled
                  ? mm.needs3d
                    ? `${mm.label} — enable 3D view first`
                    : `${mm.label} — terrain/elevation not available`
                  : mm.label
              }
              aria-label={mm.label}
              aria-pressed={mode === id}
              disabled={disabled}
              onClick={() => armMode(id)}
            >
              <i className={mm.icon} aria-hidden />
              <span className="si-measure-mode__label">{mm.label}</span>
            </button>
          )
        })}
      </div>

      <div className="si-measure-units">
        <label className="si-measure-unit">
          <span>Distance</span>
          <select value={distanceUnit} onChange={e => setDistanceUnit(e.target.value as DistanceUnit)}>
            {DISTANCE_UNITS.map(u => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </label>
        {showAreaUnit ? (
          <label className="si-measure-unit">
            <span>Area</span>
            <select value={areaUnit} onChange={e => setAreaUnit(e.target.value as AreaUnit)}>
              {AREA_UNITS.map(u => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="si-measure-snap" title="Snap to the first vertex to close shapes">
          <input type="checkbox" checked={snap} onChange={e => setSnap(e.target.checked)} />
          <span>Snap</span>
        </label>
      </div>

      <div className="si-measure-readout" aria-live="polite">
        {liveStats.rows.length ? (
          liveStats.rows.map(r => (
            <div key={r.label} className="si-measure-readout__row">
              <span className="si-measure-readout__label">{r.label}</span>
              <span className="si-measure-readout__value">{r.value}</span>
            </div>
          ))
        ) : (
          <p className="si-measure-readout__hint">
            {meta.kind === 'single'
              ? 'Click a point on the map.'
              : meta.kind === 'path' || meta.kind === 'closed'
                ? 'Click to add points · double-click / Enter to finish · right-click to undo.'
                : `Click ${fixedCount(meta.kind)} points on the map.`}
          </p>
        )}
      </div>

      <div className="si-measure-actions" role="toolbar" aria-label="Measurement actions">
        <button type="button" className="si-measure-act" title="Undo last point" disabled={!draftPoints.length} onClick={undoPoint}>
          <i className="fa-solid fa-rotate-left" aria-hidden /> Undo
        </button>
        <button type="button" className="si-measure-act" title="Redo point" disabled={!redoStack.length} onClick={redoPoint}>
          <i className="fa-solid fa-rotate-right" aria-hidden /> Redo
        </button>
        <button type="button" className="si-measure-act" title="Clear current measurement" disabled={!draftPoints.length} onClick={clearCurrent}>
          <i className="fa-solid fa-delete-left" aria-hidden /> Clear
        </button>
        <button
          type="button"
          className="si-measure-act si-measure-act--danger"
          title="Clear all measurements"
          disabled={!finished.length && !draftPoints.length}
          onClick={clearAll}
        >
          <i className="fa-solid fa-trash" aria-hidden /> Clear all
        </button>
      </div>

      {finished.length ? (
        <p className="si-measure-foot">
          {finished.length} measurement{finished.length === 1 ? '' : 's'} on map
        </p>
      ) : null}
    </section>
  )
}
