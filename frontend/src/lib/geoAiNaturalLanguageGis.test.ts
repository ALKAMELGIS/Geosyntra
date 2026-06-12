import { describe, expect, it } from 'vitest'
import type { GeoAiMapLayer } from './geoExplorerLayerContext'
import { haversineDistanceMeters } from './geoAiGeoJsonSpatial'
import type { GeoAiLayerRegistryEntry } from './geoAiLayerIntelligence'
import {
  normalizeGeoAiGisQuery,
  resolveGeoAiDataSource,
  resolveSemanticLayerHint,
  runGeoAiNlGisCommand,
} from './geoAiNaturalLanguageGis'

const wellsLayer: GeoAiMapLayer = {
  name: 'Water Wells',
  clientLayerId: 'wells-1',
  visible: true,
  geojson: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { Well_ID: 'W-01', Name: 'Well Alpha' },
        geometry: { type: 'Point', coordinates: [54.37, 24.45] },
      },
      {
        type: 'Feature',
        properties: { Well_ID: 'W-02', Name: 'Well Beta' },
        geometry: { type: 'Point', coordinates: [54.38, 24.46] },
      },
    ],
  },
}

const projectLayer: GeoAiMapLayer = {
  name: 'Project Boundary',
  clientLayerId: 'proj-1',
  visible: true,
  geojson: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { Project: 'Main' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[54.36, 24.44], [54.39, 24.44], [54.39, 24.47], [54.36, 24.47], [54.36, 24.44]]],
        },
      },
    ],
  },
}

const fieldsLayer: GeoAiMapLayer = {
  name: 'Agro Fields',
  clientLayerId: 'fields-1',
  visible: true,
  geojson: {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { Farm_Code: 'F1', AREA_HA: 50 }, geometry: { type: 'Polygon', coordinates: [] } },
      { type: 'Feature', properties: { Farm_Code: 'F2', AREA_HA: 150 }, geometry: { type: 'Polygon', coordinates: [] } },
      { type: 'Feature', properties: { Farm_Code: 'F3', AREA_HA: 120 }, geometry: { type: 'Polygon', coordinates: [] } },
    ],
  },
}

const registry: GeoAiLayerRegistryEntry[] = [
  {
    clientLayerId: 'wells-1',
    name: 'Water Wells',
    kind: 'vector',
    visible: true,
    featureCount: 2,
    fields: ['Well_ID', 'Name'],
    vector: wellsLayer,
  },
  {
    clientLayerId: 'proj-1',
    name: 'Project Boundary',
    kind: 'vector',
    visible: true,
    featureCount: 1,
    fields: ['Project'],
    vector: projectLayer,
  },
  {
    clientLayerId: 'fields-1',
    name: 'Agro Fields',
    kind: 'vector',
    visible: true,
    featureCount: 3,
    fields: ['Farm_Code', 'AREA_HA'],
    vector: fieldsLayer,
  },
]

describe('geoAiNaturalLanguageGis', () => {
  it('resolves semantic layer hints from Arabic terms', () => {
    const layers = [wellsLayer, fieldsLayer, projectLayer]
    expect(resolveSemanticLayerHint('كم عدد الآبار؟', layers)).toBe('Water Wells')
    expect(resolveSemanticLayerHint('كم عدد الحقول الزراعية؟', layers)).toBe('Agro Fields')
    expect(resolveSemanticLayerHint('inside the project boundary', layers)).toBe('Project Boundary')
  })

  it('normalizes Arabic show-within queries', () => {
    const layers = [wellsLayer, projectLayer]
    const q = normalizeGeoAiGisQuery('اعرض الآبار داخل المشروع', layers)
    expect(q).toContain('Water Wells')
    expect(q).toContain('Project Boundary')
  })

  it('counts agricultural fields in Arabic', () => {
    const result = runGeoAiNlGisCommand('كم عدد الحقول الزراعية؟', registry, [], { pinLngLat: null })
    expect(result?.handled).toBe(true)
    expect(result?.reply).toMatch(/3/)
  })

  it('filters lands over hectare threshold in Arabic', () => {
    const result = runGeoAiNlGisCommand('حدد الأراضي التي تزيد مساحتها عن 100 هكتار', registry, [], {
      pinLngLat: null,
    })
    expect(result?.handled).toBe(true)
    expect(result?.reply).toMatch(/2/)
    expect(result?.table?.rows.length).toBe(2)
  })

  it('finds nearest well to reference point', () => {
    const result = runGeoAiNlGisCommand('ما أقرب بئر لهذا الموقع؟', registry, [], {
      pinLngLat: [54.365, 24.445],
    })
    expect(result?.handled).toBe(true)
    expect(result?.reply).toMatch(/Well Alpha|W-01/)
    expect(result?.mapFirstSync?.selections.length).toBe(1)
  })

  it('routes data source to map layers when vector data exists', () => {
    expect(resolveGeoAiDataSource('count wells', registry, [])).toBe('map_layers')
  })

  it('computes haversine distance', () => {
    const d = haversineDistanceMeters(54.37, 24.45, 54.38, 24.46)
    expect(d).toBeGreaterThan(1000)
    expect(d).toBeLessThan(20000)
  })
})
