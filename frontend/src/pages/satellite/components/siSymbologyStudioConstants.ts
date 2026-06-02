import type { SymbologyColorRamp, SymbologyStyle } from '../layerTypes';
import type { SiLayerAppearancePersisted } from '../siSymbolStyleStudio';

/** Neutral studio defaults — avoids legacy green (#22c55e) in the symbology UI. */
export const SI_SYM_STUDIO_NEUTRAL = {
  stroke: '#94a3b8',
  fill: '#38bdf8',
  accent: '#7dd3fc',
  muted: '#64748b',
} as const;

export type SiSymbologyStyleOption = {
  value: SymbologyStyle;
  label: string;
  hint: string;
  group: 'Basic' | 'Categories' | 'Quantitative' | 'Advanced';
};

export const SI_SYMBOLOGY_STYLE_OPTIONS: SiSymbologyStyleOption[] = [
  { value: 'single', label: 'Single symbol', hint: 'One symbol for all features', group: 'Basic' },
  { value: 'unique', label: 'Unique values', hint: 'Distinct color per category', group: 'Categories' },
  { value: 'color', label: 'Graduated colors', hint: 'Numeric classes with color ramp', group: 'Quantitative' },
  { value: 'size', label: 'Graduated symbols', hint: 'Numeric classes with line/point size', group: 'Quantitative' },
  { value: 'color_size', label: 'Graduated colors & size', hint: 'Combined color and size by value', group: 'Quantitative' },
  { value: 'dot_density', label: 'Dot density', hint: 'Dashed line patterns by class', group: 'Advanced' },
  { value: 'threshold_markers', label: 'Classified markers', hint: 'Base symbol + threshold points', group: 'Advanced' },
];

export const SI_SYMBOLOGY_RAMP_OPTIONS: { value: SymbologyColorRamp; label: string }[] = [
  { value: 'viridis', label: 'Viridis' },
  { value: 'plasma', label: 'Plasma' },
  { value: 'magma', label: 'Magma' },
  { value: 'inferno', label: 'Inferno' },
  { value: 'turbo', label: 'Turbo' },
  { value: 'cividis', label: 'Cividis' },
  { value: 'blues', label: 'Blues' },
  { value: 'greens', label: 'Greens' },
  { value: 'spectral', label: 'Spectral' },
  { value: 'earth', label: 'Earth' },
  { value: 'gray', label: 'Gray' },
];

/** Luxury dark-theme swatches for quick apply in the studio. */
export const SI_SYM_LUXURY_COLOR_PRESETS: { id: string; label: string; stroke: string; fill: string }[] = [
  { id: 'ice', label: 'Ice', stroke: '#7dd3fc', fill: '#38bdf8' },
  { id: 'slate', label: 'Slate', stroke: '#94a3b8', fill: '#64748b' },
  { id: 'violet', label: 'Violet', stroke: '#c4b5fd', fill: '#8b5cf6' },
  { id: 'amber', label: 'Amber', stroke: '#fcd34d', fill: '#f59e0b' },
  { id: 'rose', label: 'Rose', stroke: '#fda4af', fill: '#f43f5e' },
  { id: 'mint', label: 'Mint', stroke: '#6ee7b7', fill: '#10b981' },
  { id: 'coral', label: 'Coral', stroke: '#fdba74', fill: '#fb923c' },
  { id: 'mono', label: 'Mono', stroke: '#e2e8f0', fill: '#cbd5e1' },
];

export const SI_STYLE_PRESET_CHIPS: Array<{ id: string; label: string; patch: Partial<SiLayerAppearancePersisted> }> = [
  {
    id: 'pro-outline',
    label: 'Pro outline',
    patch: {
      color: SI_SYM_STUDIO_NEUTRAL.stroke,
      fillColor: SI_SYM_STUDIO_NEUTRAL.fill,
      strokeStyle: 'solid',
      weight: 2,
      polygonFillAlpha: 0.32,
      fillStyle: 'solid',
      blendMode: 'normal',
      opacity: 1,
    },
  },
  {
    id: 'glass-fill',
    label: 'Glass fill',
    patch: {
      color: '#64748b',
      fillColor: '#38bdf8',
      polygonFillAlpha: 0.48,
      weight: 1.2,
      opacity: 0.88,
      fillStyle: 'solid',
      blendMode: 'normal',
    },
  },
  {
    id: 'survey',
    label: 'Survey dashed',
    patch: {
      strokeStyle: 'dashed',
      weight: 2,
      polygonFillAlpha: 0.2,
      fillStyle: 'pattern',
      color: '#94a3b8',
      fillColor: '#64748b',
    },
  },
  {
    id: 'bold',
    label: 'Bold lines',
    patch: { weight: 4.5, strokeStyle: 'solid', polygonFillAlpha: 0.38, pointRadius: 9, color: '#e2e8f0', fillColor: '#7dd3fc' },
  },
  {
    id: 'hatch',
    label: 'Hatch fill',
    patch: { fillStyle: 'hatch', polygonFillAlpha: 0.42, color: '#cbd5e1', fillColor: '#475569' },
  },
  {
    id: 'gradient',
    label: 'Gradient fill',
    patch: { fillStyle: 'gradient', polygonFillAlpha: 0.55, color: '#7dd3fc', fillColor: '#6366f1' },
  },
  {
    id: 'multiply',
    label: 'Multiply blend',
    patch: { blendMode: 'multiply', polygonFillAlpha: 0.5, fillStyle: 'solid', fillColor: '#38bdf8', color: '#334155' },
  },
];

export function normalizeSymbologyHexForInput(raw: string, fallback: string): string {
  const h = String(raw ?? '').trim();
  if (!h.startsWith('#')) return fallback;
  if (h.length === 4) {
    const r = h[1]!;
    const g = h[2]!;
    const b = h[3]!;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{6}$/.test(h)) return h.toLowerCase();
  return fallback;
}
