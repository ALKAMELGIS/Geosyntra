import type { AiModelInfo, AiModelParameters } from './types'

function ringFromBbox(b: { west: number; south: number; east: number; north: number }): number[][] {
  return [
    [b.west, b.south],
    [b.east, b.south],
    [b.east, b.north],
    [b.west, b.north],
    [b.west, b.south],
  ]
}

function bboxFromGeometry(geom: GeoJSON.Geometry): { west: number; south: number; east: number; north: number } | null {
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  const visit = (coords: number[]) => {
    const [lng, lat] = coords
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return
    west = Math.min(west, lng)
    south = Math.min(south, lat)
    east = Math.max(east, lng)
    north = Math.max(north, lat)
  }
  const walk = (g: GeoJSON.Geometry) => {
    if (g.type === 'Polygon') {
      for (const ring of g.coordinates) for (const c of ring) visit(c)
    } else if (g.type === 'MultiPolygon') {
      for (const poly of g.coordinates) for (const ring of poly) for (const c of ring) visit(c)
    } else if (g.type === 'Point') {
      visit(g.coordinates)
    }
  }
  walk(geom)
  if (!Number.isFinite(west)) return null
  return { west, south, east, north }
}

/**
 * Browser-side preview when the AI Detection API is offline.
 * Places sample boxes inside the processing AOI using model class names when available.
 */
export function runClientMockDetection(args: {
  aoi: GeoJSON.Geometry
  model: AiModelInfo | null
  params: AiModelParameters
}): GeoJSON.FeatureCollection {
  const bbox = bboxFromGeometry(args.aoi)
  if (!bbox) {
    return { type: 'FeatureCollection', features: [] }
  }
  const classes =
    args.model?.classes?.length ? args.model.classes : ['object', 'feature', 'detection']
  const w = bbox.east - bbox.west
  const h = bbox.north - bbox.south
  const n = Math.min(12, Math.max(3, classes.length + 2))
  const features: GeoJSON.Feature[] = []

  for (let i = 0; i < n; i++) {
    const cls = classes[i % classes.length]!
    const cx = bbox.west + w * (0.2 + 0.6 * ((i * 0.37) % 1))
    const cy = bbox.south + h * (0.2 + 0.6 * ((i * 0.53) % 1))
    const halfW = w * 0.06
    const halfH = h * 0.05
    const conf = Math.max(
      args.params.threshold,
      Math.min(0.95, 0.55 + 0.08 * i + (args.params.test_time_augmentation ? 0.05 : 0)),
    )
    features.push({
      type: 'Feature',
      properties: {
        class: cls,
        className: cls,
        confidence: Number(conf.toFixed(3)),
        source: 'geosyntra-preview',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          ringFromBbox({
            west: cx - halfW,
            south: cy - halfH,
            east: cx + halfW,
            north: cy + halfH,
          }),
        ],
      },
    })
  }

  return { type: 'FeatureCollection', features }
}
