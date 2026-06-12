import type { SymbologyStyle } from '../layerTypes';

export type SiGeometryKind = 'point' | 'line' | 'polygon' | 'other';

/** Collapse ArcGIS display styles to the engine primitives used for Mapbox paints. */
export function resolveSymbologyEngineStyle(style: SymbologyStyle): SymbologyStyle {
  switch (style) {
    case 'location_only':
    case 'single_fill':
    case 'single_line':
      return 'single';
    case 'class_breaks':
    case 'choropleth':
    case 'heatmap':
    case 'heat_surface':
      return 'color';
    case 'width_by_attribute':
      return 'size';
    case 'predominance':
    case 'pie_chart':
    case 'donut_chart':
    case 'flow_lines':
    case 'traffic_style':
    case 'gradient_line':
    case 'direction_arrows':
    case 'dashed_lines':
      return 'unique';
    case 'extrusion_3d':
    case 'line_3d':
      return 'color';
    default:
      return style;
  }
}

export function symbologyStyleRequiresField(style: SymbologyStyle): boolean {
  const engine = resolveSymbologyEngineStyle(style);
  return engine !== 'single' && style !== 'location_only';
}

export function symbologyStyleIsNumericOnly(style: SymbologyStyle): boolean {
  const engine = resolveSymbologyEngineStyle(style);
  return (
    engine === 'color' ||
    engine === 'size' ||
    engine === 'color_size' ||
    style === 'dot_density' ||
    style === 'threshold_markers' ||
    style === 'heatmap' ||
    style === 'heat_surface' ||
    style === 'extrusion_3d' ||
    style === 'line_3d'
  );
}

export function symbologyStyleArcGisLabel(style: SymbologyStyle): string {
  const labels: Record<SymbologyStyle, string> = {
    single: 'Location (single symbol)',
    location_only: 'Location only',
    single_fill: 'Single fill',
    single_line: 'Single line',
    unique: 'Types (unique symbols)',
    color: 'Counts and amounts (color)',
    class_breaks: 'Class breaks',
    choropleth: 'Choropleth map',
    size: 'Counts and amounts (size)',
    width_by_attribute: 'Width by attribute',
    color_size: 'Color and size',
    dot_density: 'Dot density',
    heatmap: 'Heat map',
    heat_surface: 'Heat surface',
    predominance: 'Predominance',
    pie_chart: 'Pie chart',
    donut_chart: 'Donut chart',
    extrusion_3d: '3D extrusion',
    line_3d: '3D line',
    flow_lines: 'Flow lines',
    traffic_style: 'Traffic style',
    gradient_line: 'Gradient line',
    direction_arrows: 'Direction arrows',
    dashed_lines: 'Dashed lines',
    threshold_markers: 'Classified markers',
  };
  return labels[style] ?? style;
}

export function symbologyStyleOptionsSectionTitle(style: SymbologyStyle): string {
  return symbologyStyleArcGisLabel(style);
}

export function isGraduatedSymbologyStyleResolved(style: SymbologyStyle): boolean {
  const engine = resolveSymbologyEngineStyle(style);
  return (
    engine === 'color' ||
    engine === 'size' ||
    engine === 'color_size' ||
    style === 'dot_density' ||
    style === 'threshold_markers'
  );
}

export function symbologyStyleAppearancePatch(style: SymbologyStyle): {
  strokeStyle?: 'solid' | 'dashed' | 'dotted' | 'dashdot';
  fillStyle?: string;
} | null {
  switch (style) {
    case 'dashed_lines':
      return { strokeStyle: 'dashed' };
    case 'flow_lines':
      return { strokeStyle: 'solid' };
    case 'traffic_style':
      return { strokeStyle: 'solid' };
    case 'gradient_line':
      return { strokeStyle: 'solid', fillStyle: 'gradient' };
    default:
      return null;
  }
}
