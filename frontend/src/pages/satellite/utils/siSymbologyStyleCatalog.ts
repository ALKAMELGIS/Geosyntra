import type { SymbologyStyle } from '../layerTypes';
import type { SiFieldKind } from './siSymbologySmartMapping';
import type { SiGeometryKind } from './siSymbologyStyleResolve';
import { symbologyStyleIsNumericOnly } from './siSymbologyStyleResolve';

export type SiSymbologyStyleCatalogEntry = {
  value: SymbologyStyle;
  label: string;
  hint: string;
  thumb: string;
  /** Styles that work without choosing a field (e.g. Location only). */
  fieldOptional?: boolean;
};

const POINT_STYLES: SiSymbologyStyleCatalogEntry[] = [
  {
    value: 'location_only',
    label: 'Location only',
    hint: 'Show feature locations with one symbol — no attribute required.',
    thumb: 'location_only',
    fieldOptional: true,
  },
  {
    value: 'single',
    label: 'Single symbol',
    hint: 'One symbol for all features.',
    thumb: 'single',
    fieldOptional: true,
  },
  {
    value: 'unique',
    label: 'Types (unique symbols)',
    hint: 'Different symbol or color for each category value.',
    thumb: 'unique',
  },
  {
    value: 'heatmap',
    label: 'Heat map',
    hint: 'Smooth color surface showing point density or magnitude.',
    thumb: 'heatmap',
  },
  {
    value: 'color',
    label: 'Counts and amounts (color)',
    hint: 'Numeric classes shown with a color ramp.',
    thumb: 'color',
  },
  {
    value: 'size',
    label: 'Counts and amounts (size)',
    hint: 'Numeric classes shown with proportional symbol size.',
    thumb: 'size',
  },
  {
    value: 'class_breaks',
    label: 'Class breaks',
    hint: 'Group numeric values into classes with distinct colors.',
    thumb: 'class_breaks',
  },
  {
    value: 'dot_density',
    label: 'Dot density',
    hint: 'Represent quantity with randomly placed dots.',
    thumb: 'dot_density',
  },
  {
    value: 'pie_chart',
    label: 'Pie chart',
    hint: 'Pie slices show proportional mix of category values.',
    thumb: 'pie_chart',
  },
  {
    value: 'color_size',
    label: 'Color and size',
    hint: 'Combine color and proportional size by numeric value.',
    thumb: 'color_size',
  },
  {
    value: 'extrusion_3d',
    label: '3D extrusion',
    hint: 'Extrude points or markers in 3D by attribute height.',
    thumb: 'extrusion_3d',
  },
];

const POLYGON_STYLES: SiSymbologyStyleCatalogEntry[] = [
  {
    value: 'single_fill',
    label: 'Single fill',
    hint: 'One fill color for all polygons.',
    thumb: 'single_fill',
    fieldOptional: true,
  },
  {
    value: 'unique',
    label: 'Types (unique symbols)',
    hint: 'Different fill color for each category value.',
    thumb: 'unique',
  },
  {
    value: 'class_breaks',
    label: 'Class breaks',
    hint: 'Numeric classes with distinct fill colors.',
    thumb: 'class_breaks',
  },
  {
    value: 'choropleth',
    label: 'Choropleth map',
    hint: 'Shaded polygons by numeric value using a color ramp.',
    thumb: 'choropleth',
  },
  {
    value: 'heat_surface',
    label: 'Heat surface',
    hint: 'Smooth heat surface across polygon areas.',
    thumb: 'heat_surface',
  },
  {
    value: 'pie_chart',
    label: 'Pie chart',
    hint: 'Pie chart marker per polygon showing value mix.',
    thumb: 'pie_chart',
  },
  {
    value: 'dot_density',
    label: 'Dot density',
    hint: 'Random dots inside polygons represent quantity.',
    thumb: 'dot_density',
  },
  {
    value: 'extrusion_3d',
    label: '3D extrusion',
    hint: 'Extrude polygon footprints by height attribute.',
    thumb: 'extrusion_3d',
  },
];

const LINE_STYLES: SiSymbologyStyleCatalogEntry[] = [
  {
    value: 'single_line',
    label: 'Single line',
    hint: 'One line symbol for all features.',
    thumb: 'single_line',
    fieldOptional: true,
  },
  {
    value: 'unique',
    label: 'Types (unique symbols)',
    hint: 'Different line color for each category.',
    thumb: 'unique',
  },
  {
    value: 'class_breaks',
    label: 'Class breaks',
    hint: 'Numeric classes with distinct line colors.',
    thumb: 'class_breaks',
  },
  {
    value: 'flow_lines',
    label: 'Flow lines',
    hint: 'Tapered or animated flow along line paths.',
    thumb: 'flow_lines',
  },
  {
    value: 'traffic_style',
    label: 'Traffic style',
    hint: 'Traffic-style line coloring by speed or volume.',
    thumb: 'traffic_style',
  },
  {
    value: 'gradient_line',
    label: 'Gradient line',
    hint: 'Color gradient along each line by attribute.',
    thumb: 'gradient_line',
  },
  {
    value: 'width_by_attribute',
    label: 'Width by attribute',
    hint: 'Line width varies with numeric value.',
    thumb: 'width_by_attribute',
  },
  {
    value: 'direction_arrows',
    label: 'Direction arrows',
    hint: 'Arrows show line direction of travel.',
    thumb: 'direction_arrows',
  },
  {
    value: 'dashed_lines',
    label: 'Dashed lines',
    hint: 'Dashed pattern varies by category or class.',
    thumb: 'dashed_lines',
  },
  {
    value: 'line_3d',
    label: '3D line',
    hint: 'Lines rendered with 3D elevation or offset.',
    thumb: 'line_3d',
  },
];

export function getSymbologyCatalogForGeometry(
  geometryKind: SiGeometryKind,
): SiSymbologyStyleCatalogEntry[] {
  switch (geometryKind) {
    case 'line':
      return LINE_STYLES;
    case 'polygon':
      return POLYGON_STYLES;
    case 'point':
      return POINT_STYLES;
    default:
      return POINT_STYLES;
  }
}

export function filterSymbologyCatalogForField(
  catalog: SiSymbologyStyleCatalogEntry[],
  fieldKind: SiFieldKind,
  hasField: boolean,
): SiSymbologyStyleCatalogEntry[] {
  return catalog.filter(entry => {
    if (!hasField && !entry.fieldOptional) return false;
    if (fieldKind === 'numeric') return true;
    if (symbologyStyleIsNumericOnly(entry.value)) return false;
    return true;
  });
}

export function defaultSymbologyStyleForGeometry(
  geometryKind: SiGeometryKind,
  fieldKind: SiFieldKind,
): SymbologyStyle {
  if (fieldKind === 'text' || fieldKind === 'date') return 'unique';
  if (geometryKind === 'line') return 'class_breaks';
  if (geometryKind === 'polygon') return 'choropleth';
  return 'color';
}

export function symbologyPickStyleHint(fieldKind: SiFieldKind, geometryKind: SiGeometryKind): string {
  switch (fieldKind) {
    case 'numeric':
      if (geometryKind === 'line') {
        return 'These styles are good for visualizing a single numeric field.';
      }
      if (geometryKind === 'polygon') {
        return 'These styles are good for visualizing numeric counts and amounts.';
      }
      return 'These styles are good for visualizing a single numeric field.';
    case 'date':
      return 'Treat dates as categories or map them as ordered numeric values.';
    default:
      return 'These styles are good for visualizing categories in a text field.';
  }
}
