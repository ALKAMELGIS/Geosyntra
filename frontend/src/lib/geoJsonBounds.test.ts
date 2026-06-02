import { describe, expect, it } from 'vitest'
import { getGeoJsonBounds, getGeoJsonPrimaryClusterBounds } from './geoJsonBounds'

function polygonAt(lng: number, lat: number, d = 0.002): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [lng, lat],
          [lng + d, lat],
          [lng + d, lat + d],
          [lng, lat + d],
          [lng, lat],
        ],
      ],
    },
  }
}

function cluster(lng: number, lat: number, n: number): GeoJSON.Feature[] {
  return Array.from({ length: n }, (_, i) => polygonAt(lng + (i % 8) * 0.01, lat + Math.floor(i / 8) * 0.01))
}

describe('getGeoJsonPrimaryClusterBounds', () => {
  it('returns null for a single compact cluster (caller fits full bounds)', () => {
    const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: cluster(54.8, 24.7, 60) }
    expect(getGeoJsonPrimaryClusterBounds(fc)).toBeNull()
  })

  it('fits the densest cluster when features span multiple regions', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [...cluster(54.8, 24.7, 80), ...cluster(-7.5, 33.5, 30), ...cluster(20.4, 44.8, 20)],
    }
    const full = getGeoJsonBounds(fc)!
    expect(full[2] - full[0]).toBeGreaterThan(40) // ~-7.5 → 54.9

    const dense = getGeoJsonPrimaryClusterBounds(fc)
    expect(dense).not.toBeNull()
    // Lands on the UAE cluster, not the continental spread.
    expect(dense![0]).toBeGreaterThan(54)
    expect(dense![2]).toBeLessThan(56)
    expect(dense![1]).toBeGreaterThan(24)
    expect(dense![3]).toBeLessThan(26)
  })

  it('returns null below the minimum feature count', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [polygonAt(54.8, 24.7), polygonAt(-7.5, 33.5)],
    }
    expect(getGeoJsonPrimaryClusterBounds(fc)).toBeNull()
  })
})
