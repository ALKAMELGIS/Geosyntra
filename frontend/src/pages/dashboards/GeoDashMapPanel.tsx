import { useCallback, useMemo, useState } from 'react'
import Map, { Layer, NavigationControl, Source } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useMapboxAccessToken } from '../../hooks/useMapboxAccessToken'

type LayerId = 'satellite' | 'streets' | 'pathways' | 'ndvi'

const SAT_STYLE = 'mapbox://styles/mapbox/satellite-v9'
const STREETS_STYLE = 'mapbox://styles/mapbox/light-v11'

/** Compact 2D Mapbox preview with basemap / overlay toggles for GeoDash enterprise map tab. */
export default function GeoDashMapPanel() {
  const token = useMapboxAccessToken()
  const [basemap, setBasemap] = useState<'satellite' | 'streets'>('satellite')
  const [pathways, setPathways] = useState(true)
  const [ndviOverlay, setNdviOverlay] = useState(false)

  const mapStyle = basemap === 'satellite' ? SAT_STYLE : STREETS_STYLE

  const pathwayGeoJson = useMemo(
    () =>
      ({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { name: 'Route A' },
            geometry: {
              type: 'LineString',
              coordinates: [
                [55.2, 25.15],
                [55.35, 25.22],
                [55.42, 25.18],
              ],
            },
          },
        ],
      }) as const,
    [],
  )

  const ndviPoly = useMemo(
    () =>
      ({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { ndvi: 0.72 },
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [55.25, 25.12],
                  [55.32, 25.12],
                  [55.32, 25.18],
                  [55.25, 25.18],
                  [55.25, 25.12],
                ],
              ],
            },
          },
        ],
      }) as const,
    [],
  )

  const toggleLayer = useCallback((id: LayerId) => {
    if (id === 'satellite') setBasemap('satellite')
    if (id === 'streets') setBasemap('streets')
    if (id === 'pathways') setPathways(v => !v)
    if (id === 'ndvi') setNdviOverlay(v => !v)
  }, [])

  if (!token) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 text-center text-sm text-amber-100">
        Add a Mapbox token in System Settings → API Tokens (or <code className="rounded bg-black/30 px-1">VITE_MAPBOX_TOKEN</code>) to
        enable the live map preview.
      </div>
    )
  }

  return (
    <div className="relative h-full min-h-[360px] overflow-hidden rounded-2xl border border-white/10 shadow-glass">
      <Map
        mapboxAccessToken={token}
        initialViewState={{ longitude: 55.3, latitude: 25.18, zoom: 10 }}
        mapStyle={mapStyle}
        reuseMaps
        attributionControl={false}
        style={{ width: '100%', height: '100%', minHeight: 360 }}
      >
        <NavigationControl position="top-right" showCompass visualizePitch={false} />
        {pathways ? (
          <Source id="gd-pathways" type="geojson" data={pathwayGeoJson as any}>
            <Layer
              id="gd-pathways-line"
              type="line"
              paint={{ 'line-color': '#fbbf24', 'line-width': 3, 'line-opacity': 0.9 }}
            />
          </Source>
        ) : null}
        {ndviOverlay ? (
          <Source id="gd-ndvi" type="geojson" data={ndviPoly as any}>
            <Layer
              id="gd-ndvi-fill"
              type="fill"
              paint={{ 'fill-color': '#22c55e', 'fill-opacity': 0.35 }}
            />
            <Layer
              id="gd-ndvi-outline"
              type="line"
              paint={{ 'line-color': '#15803d', 'line-width': 1.5 }}
            />
          </Source>
        ) : null}
      </Map>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3">
        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-white/15 bg-slate-950/70 px-3 py-2 text-xs text-slate-100 backdrop-blur-md">
          <span className="font-semibold uppercase tracking-wide text-slate-400">Layers</span>
          <button
            type="button"
            onClick={() => toggleLayer('satellite')}
            className={`rounded-lg px-2 py-1 font-medium ${basemap === 'satellite' ? 'bg-emerald-600 text-white' : 'bg-white/10 hover:bg-white/20'}`}
          >
            Satellite
          </button>
          <button
            type="button"
            onClick={() => toggleLayer('streets')}
            className={`rounded-lg px-2 py-1 font-medium ${basemap === 'streets' ? 'bg-emerald-600 text-white' : 'bg-white/10 hover:bg-white/20'}`}
          >
            Reference
          </button>
          <button
            type="button"
            onClick={() => toggleLayer('pathways')}
            className={`rounded-lg px-2 py-1 font-medium ${pathways ? 'bg-amber-500/90 text-slate-950' : 'bg-white/10 hover:bg-white/20'}`}
          >
            Logistics
          </button>
          <button
            type="button"
            onClick={() => toggleLayer('ndvi')}
            className={`rounded-lg px-2 py-1 font-medium ${ndviOverlay ? 'bg-emerald-500/90 text-slate-950' : 'bg-white/10 hover:bg-white/20'}`}
          >
            NDVI (demo)
          </button>
        </div>
      </div>
    </div>
  )
}
