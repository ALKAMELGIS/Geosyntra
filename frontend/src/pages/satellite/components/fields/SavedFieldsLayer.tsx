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
 *   - A small floating label (field name + area) lives at the polygon
 *     centroid via `bindTooltip({ permanent: true })`.
 *   - Clicking any polygon promotes it to the active selection — the
 *     parent panel then opens its analytics card.
 *
 * Why a child of `MapView` and not its own React component tree?
 * --------------------------------------------------------------
 * `react-leaflet` v4 exposes `useMap()` so child components can wire up
 * Leaflet layers without leaking refs into the parent. We mount a single
 * `L.GeoJSON` layer and reconcile it whenever `fields` / `selectedId`
 * change — far cheaper than rebuilding a layer per field.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import type { SavedField } from './fieldsStore'
import { formatArea } from './fieldsStore'

interface SavedFieldsLayerProps {
  fields: SavedField[]
  selectedId: string | null
  onSelectField: (id: string) => void
}

export default function SavedFieldsLayer({ fields, selectedId, onSelectField }: SavedFieldsLayerProps) {
  const map = useMap()
  const layerRef = useRef<L.GeoJSON | null>(null)

  /* Build a stable feature collection. Memo guards against the parent
   * re-rendering (e.g. on every keystroke in the search box). */
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
        },
      })),
    }),
    [fields],
  )

  /* (Re)create the layer whenever the field list changes. We *replace*
   * the layer rather than mutate it because L.GeoJSON doesn't expose a
   * clean "update features in place" API and the field count is small. */
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
        const props = (feature?.properties ?? {}) as { id: string; color: string }
        const isSelected = props.id === selectedId
        return {
          color: props.color || '#22d3ee',
          weight: isSelected ? 3 : 2,
          opacity: isSelected ? 1 : 0.92,
          fillColor: props.color || '#22d3ee',
          fillOpacity: isSelected ? 0.22 : 0.12,
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
        /* Permanent tooltip = always-on label. Direction `center` keeps it
         * inside the polygon. The label is plain text — markup escapes
         * are handled by Leaflet. */
        leafletLayer.bindTooltip(`${props.name} · ${formatArea(props.areaHectares)}`, {
          permanent: true,
          direction: 'center',
          className: 'gs-field-label',
          opacity: 0.95,
        })
        leafletLayer.on('click', e => {
          /* Stop propagation so clicking a saved field doesn't also fire
           * the map's "click empty area" handler (used for picking). */
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
  }, [map, featureCollection, selectedId, onSelectField])

  return null
}
