/**
 * Per-category symbol styles (fill + outline) for unique-value symbology.
 */
import type { SymbologyCategoryStyle, SymbologyConfig } from '../../lib/gisLayerTypes';
import { darkenColor } from './symbologyHelpers';

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function defaultCategorySymbolStyle(
  fill: string,
  opts?: Partial<SymbologyCategoryStyle>,
): SymbologyCategoryStyle {
  const f = (fill || '#38bdf8').trim();
  return {
    fill: f,
    outline: opts?.outline?.trim() || darkenColor(f, 0.28),
    fillOpacity: typeof opts?.fillOpacity === 'number' ? clamp01(opts.fillOpacity) : 0.48,
    outlineOpacity: typeof opts?.outlineOpacity === 'number' ? clamp01(opts.outlineOpacity) : 1,
    outlineWidth:
      typeof opts?.outlineWidth === 'number' && Number.isFinite(opts.outlineWidth)
        ? Math.max(0.25, Math.min(12, opts.outlineWidth))
        : 1,
    rotation:
      typeof opts?.rotation === 'number' && Number.isFinite(opts.rotation)
        ? ((opts.rotation % 360) + 360) % 360
        : undefined,
    markerSize:
      typeof opts?.markerSize === 'number' && Number.isFinite(opts.markerSize)
        ? Math.max(2, Math.min(32, opts.markerSize))
        : undefined,
    lineDash:
      opts?.lineDash === 'dashed' ||
      opts?.lineDash === 'dotted' ||
      opts?.lineDash === 'dashdot' ||
      opts?.lineDash === 'solid'
        ? opts.lineDash
        : undefined,
  };
}

export function resolveCategoryStyleForKey(
  valueKey: string,
  rampFill: string,
  cfg: Pick<SymbologyConfig, 'categoryColors' | 'categoryStyles'>,
  layerDefaults: { fillOpacity: number; outlineWidth: number },
): SymbologyCategoryStyle {
  const custom = cfg.categoryStyles?.[valueKey];
  if (custom && typeof custom === 'object') {
    return defaultCategorySymbolStyle(custom.fill || rampFill, custom);
  }
  const legacyFill = cfg.categoryColors?.[valueKey];
  if (legacyFill && typeof legacyFill === 'string') {
    return defaultCategorySymbolStyle(legacyFill, {
      fillOpacity: layerDefaults.fillOpacity,
      outlineWidth: layerDefaults.outlineWidth,
    });
  }
  return defaultCategorySymbolStyle(rampFill, {
    fillOpacity: layerDefaults.fillOpacity,
    outlineWidth: layerDefaults.outlineWidth,
  });
}

export function categoryStyleToPersisted(style: SymbologyCategoryStyle): SymbologyCategoryStyle {
  return defaultCategorySymbolStyle(style.fill, style);
}

export function syncCategoryColorsFromStyles(
  styles: Record<string, SymbologyCategoryStyle> | undefined,
): Record<string, string> | undefined {
  if (!styles || typeof styles !== 'object') return undefined;
  const out: Record<string, string> = {};
  for (const [k, st] of Object.entries(styles)) {
    if (st?.fill) out[k] = st.fill;
  }
  return Object.keys(out).length ? out : undefined;
}
