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

/** Workspace / drawn AOI polygons: no interior fill so index WMS layers stay visible. */
export const SI_AOI_MAP_OUTLINE_ONLY_FILL_PAINT = {
  'fill-color': 'rgba(0,0,0,0)',
  'fill-opacity': 0,
} as const

export const SI_AOI_MAP_OUTLINE_LINE_PAINT = {
  activeColor: '#e0f2fe',
  inactiveColor: '#4ade80',
  activeWidth: 3.2,
  inactiveWidth: 2.1,
  lineOpacity: 0.96,
} as const

/** In-progress AOI sketch (rectangle / circle / polygon) — high contrast on imagery. */
export const SI_AOI_DRAW_DRAFT_OUTLINE_PAINT = {
  fillOpacity: 0.14,
  glowOpacity: 0.48,
  glowBlur: 2.8,
  glowWidthExtra: 6,
  lineHighlight: '#f0fdf4',
  lineWidthExtra: 1.25,
  minLineWidth: 3.75,
} as const
