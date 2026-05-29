import { describe, expect, it } from 'vitest'
import { findMatchingCustomLayers, findMatchingMapLayers, mergeMapSearchHits } from './siMapSearch'

describe('siMapSearch', () => {
  it('finds custom layers by name', () => {
    const hits = findMatchingCustomLayers(
      [
        { id: 'a1', name: 'Agro Structures', source: 'arcgis', visible: true },
        { id: 'b2', name: 'Roads', source: 'upload' },
      ],
      'agro',
    )
    expect(hits).toHaveLength(1)
    expect(hits[0]?.title).toBe('Agro Structures')
    expect(hits[0]?.layerKind).toBe('custom')
  })

  it('merges layer hits before places', () => {
    const merged = mergeMapSearchHits(
      [{ kind: 'layer', id: 'l1', title: 'L', subtitle: 'Layer', layerKind: 'custom', layerId: 'x' }],
      [{ kind: 'place', id: 'p1', title: 'P', subtitle: 'Place', feature: {} }],
      5,
    )
    expect(merged[0]?.kind).toBe('layer')
    expect(merged[1]?.kind).toBe('place')
  })

  it('finds wms layers by title', () => {
    const hits = findMatchingMapLayers(
      [],
      [{ name: 'NDVI', title: 'NDVI Index' }],
      'ndvi',
    )
    expect(hits[0]?.layerKind).toBe('wms')
  })
})
