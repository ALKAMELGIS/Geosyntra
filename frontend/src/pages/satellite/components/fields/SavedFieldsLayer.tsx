/**
 * Geosyntra · Saved Fields layer.
 *
 * Renders persisted `SavedField`s on the 2D Leaflet map (the only mode
 * that supports user drawing — the 3D Mapbox globe ignores this layer).
 *
 * Visual rules
 * ------------
 *   - Each field is a stroked polygon in its own color (`field.color`),
 *     12 % fill so the satellite imagery underneath stays legible.
 *   - The currently-selected field gets a 3 px stroke + 22 % fill +
 *     dashed outer halo so it pops above the others.
 *   - Optional `surfaceVizMetric` tints every field from its spectral
 *     snapshot (`indices`) so multiple AOIs read as independent analyses.
 *   - A small floating label (field name + area) lives at the polygon
 *     centroid via `bindTooltip({ permanent: true })`.
 *   - Clicking any polygon promotes it to the active selection — the
 *     parent panel then opens its analytics card.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import type { FieldSurfaceVizMetric, SavedField } from './fieldsStore'
import { formatArea, indexToVizUnit } from './fieldsStore'

interface SavedFieldsLayerProps {
  fields: SavedField[]
  selectedId: string | null
  surfaceVizMetric?: FieldSurfaceVizMetric
  onSelectField: (id: string) => void
}

function vizColor(v: number): string {
  const x = Math.max(0, Math.min(1, v))
  if (x < 0.35) return `rgb(${69 + Math.round(x * 80)}, ${10 + Math.round(x * 40)}, ${10 + Math.round(x * 30)})`
  if (x < 0.55) return `rgb(${220 + Math.round((x - 0.35) * 40)}, ${115 + Math.round((x - 0.35) * 80)}, ${38})`
  if (x < 0.75) return `rgb(${234 - Math.round((x - 0.55) * 40)}, ${179 + Math.round((x - 0.55) * 40)}, ${8})`
  return `rgb(${34 + Math.round((1 - x) * 40)}, ${197 - Math.round((1 - x) * 60)}, ${94})`
}

export default function SavedFieldsLayer({
  fields,
  selectedId,
  surfaceVizMetric = 'none',
  onSelectField,
}: SavedFieldsLayerProps) {
  const map = useMap()
  const layerRef = useRef<L.GeoJSON | null>(null)

  const featureCollection = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: fields.map(f => ({
        type: 'Feature' as const,
        geometry: f.geometry,
        properties: {
          id: f.id,
          name: f.name,
          color: f.color,
          areaHectares: f.areaHectares,
          crop: f.crop ?? '',
          vizVal: indexToVizUnit(surfaceVizMetric, f.indices),
        },
      })),
    }),
    [fields, surfaceVizMetric],
  )

  useEffect(() => {
    if (!map) return

    if (layerRef.current) {
      try {
        map.removeLayer(layerRef.current)
      } catch {
        /* ignore — layer might already be detached */
      }
      layerRef.current = null
    }

    const layer = L.geoJSON(featureCollection, {
      style: feature => {
        const props = (feature?.properties ?? {}) as { id: string; color: string; vizVal?: number }
        const isSelected = props.id === selectedId
        const useViz = surfaceVizMetric !== 'none' && typeof props.vizVal === 'number'
        const fillCol = useViz ? vizColor(props.vizVal as number) : props.color || '#22d3ee'
        return {
          color: props.color || '#22d3ee',
          weight: isSelected ? 3 : 2,
          opacity: isSelected ? 1 : 0.92,
          fillColor: fillCol,
          fillOpacity: useViz ? (isSelected ? 0.42 : 0.28) : isSelected ? 0.22 : 0.12,
          dashArray: isSelected ? undefined : undefined,
          interactive: true,
        }
      },
      onEachFeature: (feature, leafletLayer) => {
        const props = (feature.properties ?? {}) as {
          id: string
          name: string
          areaHectares: number
        }
        leafletLayer.bindTooltip(`${props.name} · ${formatArea(props.areaHectares)}`, {
          permanent: true,
          direction: 'center',
          className: 'gs-field-label',
          opacity: 0.95,
        })
        leafletLayer.on('click', e => {
          L.DomEvent.stopPropagation(e as unknown as Event)
          onSelectField(props.id)
        })
      },
    })

    layer.addTo(map)
    layerRef.current = layer

    return () => {
      if (layerRef.current && map.hasLayer(layerRef.current)) {
        try {
          map.removeLayer(layerRef.current)
        } catch {
          /* ignore */
        }
      }
      layerRef.current = null
    }
  }, [map, featureCollection, selectedId, onSelectField, surfaceVizMetric])

  return null
}
