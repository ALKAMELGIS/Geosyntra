import { useEffect, useRef } from 'react'
import type { Map as LeafletMap } from 'leaflet'
import L from 'leaflet'
import { useMap } from 'react-leaflet'
import { createEsriImageServerGridLayer } from '../../../lib/arcgisImageServer'

type Props = {
  serviceUrl: string
  opacity: number
  visible: boolean
  zIndex: number
}

export function EsriImageServerLayer({ serviceUrl, opacity, visible, zIndex }: Props) {
  const map = useMap() as LeafletMap
  const layerRef = useRef<L.GridLayer | null>(null)

  useEffect(() => {
    if (!visible) {
      if (layerRef.current) {
        map.removeLayer(layerRef.current)
        layerRef.current = null
      }
      return
    }
    const layer = createEsriImageServerGridLayer(serviceUrl, { opacity, zIndex })
    layer.setOpacity(opacity)
    layer.addTo(map)
    layerRef.current = layer
    return () => {
      map.removeLayer(layer)
      layerRef.current = null
    }
  }, [map, serviceUrl, visible, opacity, zIndex])

  useEffect(() => {
    layerRef.current?.setOpacity(opacity)
  }, [opacity])

  return null
}
