/** Location-allocation result line symbology — session-scoped, no re-run required. */
export type LaLineStyle = 'solid' | 'dashed' | 'dotted';

export type LaAllocationSymbology = {
  lineColor: string;
  lineWidth: number;
  lineOpacity: number;
  lineStyle: LaLineStyle;
  glowColor: string;
  glowIntensity: number;
  /** Point / facility / demand label size on the map (px). */
  labelFontSize: number;
};

export const LA_SYMBOLOGY_COLOR_PRESETS = [
  { id: 'white', label: 'White', color: '#FFFFFF' },
  { id: 'red', label: 'Red', color: '#FF0000' },
  { id: 'blue', label: 'Blue', color: '#3B82F6' },
  { id: 'green', label: 'Green', color: '#22C55E' },
  { id: 'yellow', label: 'Yellow', color: '#EAB308' },
  { id: 'orange', label: 'Orange', color: '#F97316' },
  { id: 'purple', label: 'Purple', color: '#A855F7' },
] as const;

export const DEFAULT_LA_ALLOCATION_SYMBOLOGY: LaAllocationSymbology = {
  lineColor: '#FFFFFF',
  lineWidth: 4,
  lineOpacity: 0.92,
  lineStyle: 'solid',
  glowColor: '#FF0000',
  glowIntensity: 0.65,
  labelFontSize: 10,
};

/** Mapbox text-size ramp — hidden below z9, full size from z11+. */
export function laLabelTextSizeRamp(fontSize: number): unknown[] {
  const px = Math.max(8, Math.min(18, fontSize));
  return ['interpolate', ['linear'], ['zoom'], 9, 0, 11, px];
}

export function laLineDashArray(style: LaLineStyle): number[] | undefined {
  if (style === 'dashed') return [4, 3];
  if (style === 'dotted') return [1, 2];
  return undefined;
}

export function laGlowLineWidth(sym: LaAllocationSymbology, selected = false): number {
  const base = sym.lineWidth + sym.glowIntensity * 6;
  return selected ? base + 3 : base;
}

export function laMainLineWidth(sym: LaAllocationSymbology, selected = false): number {
  const w = Math.max(3, Math.min(5, sym.lineWidth));
  return selected ? w + 2 : w;
}
