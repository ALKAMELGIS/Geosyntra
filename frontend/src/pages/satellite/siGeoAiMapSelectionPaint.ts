/**
 * Mapbox GL paint for Geo AI ↔ table linked selection.
 * Cyan-forward so it matches live AOI draw chrome (not legacy green).
 */
export const SI_GEO_AI_MAP_SELECTION_PAINT = {
  fillColor: '#22d3ee',
  fillOpacity: 0.08,
  lineColor: '#a5f3fc',
  lineWidth: 2.25,
  lineOpacity: 0.88,
  pointRadius: 8,
  pointColor: 'rgba(34, 211, 238, 0.45)',
  pointOpacity: 0.82,
  pointStrokeWidth: 1.5,
  pointStrokeColor: 'rgba(224, 242, 254, 0.75)',
} as const
