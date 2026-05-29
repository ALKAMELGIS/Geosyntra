import {
  arcLegendLabelForFieldValue,
  buildArcFieldsByLower,
  getArcDisplayValue,
  type ArcgisLayerDefLite,
} from '../../../lib/arcgisAttributeDisplay';
import { darkenColor, type SymbologyContext } from '../symbologyHelpers';
import type { SymbologyStyle } from '../layerTypes';
import type { SiSymbologyAppearance } from '../siSymbolStyleStudio';
import { strokeDashSvgFromStyle } from '../siSymbolStyleStudio';

export type SiSymbologyLegendItem = {
  label: string;
  valueKey?: string;
  kind: 'line' | 'point' | 'polygon';
  color: string;
  width: number;
  dash?: string;
  fill?: string;
};

/** Stable keys for user-defined class-break colors in `categoryColors`. */
export function siClassColorKey(index: number): string {
  return `__si_class_${index}`;
}

export function buildSiSymbologyLegendItems(args: {
  style: SymbologyStyle;
  classes: number;
  field: string;
  geometryKind: 'point' | 'line' | 'polygon' | 'mixed';
  ctx: SymbologyContext | null;
  appearance: SiSymbologyAppearance;
  layerColor: string;
  layerFeatures: unknown[];
  arcDef: ArcgisLayerDefLite | null;
  uniqueLegendLabel: (val: string) => string;
}): SiSymbologyLegendItem[] {
  const {
    style,
    classes,
    geometryKind,
    ctx,
    appearance,
    layerColor,
    uniqueLegendLabel,
  } = args;
  const items: SiSymbologyLegendItem[] = [];
  if (!ctx) return items;

  const baseStroke = appearance.color || layerColor || '#94a3b8';
  const baseWeight = appearance.weight;
  const previewDash = strokeDashSvgFromStyle(appearance.strokeStyle);
  const kind: 'line' | 'point' | 'polygon' =
    geometryKind === 'polygon' ? 'polygon' : geometryKind === 'point' ? 'point' : 'line';

  if (style === 'single') {
    items.push({
      label: 'Base symbol',
      valueKey: '__si_single_fill',
      kind,
      color: baseStroke,
      width: baseWeight,
      dash: previewDash || undefined,
      fill: appearance.fillColor,
    });
    return items;
  }

  if (style === 'unique') {
    if (kind === 'line') {
      const vals = ctx.categories.length
        ? ctx.categories
        : [...new Set([...Object.keys(ctx.categoryColors), ...Object.keys(ctx.uniqueDashes)])];
      vals.slice(0, 20).forEach(val => {
        const stroke = ctx.categoryColors[val] ?? baseStroke;
        items.push({
          label: uniqueLegendLabel(val),
          valueKey: val,
          kind,
          color: stroke,
          width: ctx.categoryOutlineWidth[val] ?? baseWeight,
          dash: ctx.uniqueDashes[val] ?? '',
        });
      });
      if (vals.length === 0) items.push({ label: 'No values', kind, color: baseStroke, width: baseWeight });
      return items;
    }
    const vals = ctx.categories.length ? ctx.categories : Object.keys(ctx.categoryColors);
    vals.slice(0, 20).forEach(val => {
      const fill = ctx.categoryColors[val] ?? ctx.otherColor;
      const outline = ctx.categoryOutlines[val] ?? darkenColor(fill, 0.25);
      items.push({
        label: uniqueLegendLabel(val),
        valueKey: val,
        kind,
        color: outline,
        width: ctx.categoryOutlineWidth[val] ?? baseWeight,
        fill,
      });
    });
    if (vals.length === 0) {
      items.push({ label: 'No values', kind, color: baseStroke, width: baseWeight, fill: baseStroke });
    }
    return items;
  }

  if (style === 'threshold_markers') {
    items.push({ label: 'Base', kind, color: baseStroke, width: baseWeight });
    items.push({
      label: `Marker ≥ ${ctx.threshold.toFixed(2)}`,
      kind: 'point',
      color: '#ef4444',
      width: 4,
      fill: '#ef4444',
    });
    return items;
  }

  const showColor = style === 'color' || style === 'color_size';
  const showSize = style === 'size' || style === 'color_size';
  const breaks = ctx.breaks;
  for (let i = 0; i < Math.min(classes, breaks.length - 1); i += 1) {
    const a = breaks[i]!;
    const b = breaks[i + 1]!;
    const label = `${a.toFixed(2)} – ${b.toFixed(2)}`;
    const color = showColor ? (ctx.colors[i] ?? baseStroke) : baseStroke;
    const width = showSize ? (ctx.widths[i] ?? baseWeight) : baseWeight;
    const dash = style === 'dot_density' ? ctx.dotDashes[i] : undefined;
    const classKey = siClassColorKey(i);
    if (kind === 'polygon') {
      const fill = showColor ? color : baseStroke;
      items.push({
        label,
        valueKey: classKey,
        kind,
        color: darkenColor(fill, 0.25),
        width,
        dash,
        fill,
      });
    } else if (kind === 'point') {
      const fill = showColor ? color : baseStroke;
      items.push({
        label,
        valueKey: classKey,
        kind,
        color: darkenColor(fill, 0.25),
        width,
        dash,
        fill,
      });
    } else {
      items.push({ label, valueKey: classKey, kind, color, width, dash });
    }
  }
  return items;
}

export function makeUniqueLegendLabel(
  fieldNm: string,
  layerFeatures: unknown[],
  arcDef: ArcgisLayerDefLite | null,
): (val: string) => string {
  const fieldsByLower = buildArcFieldsByLower(arcDef);
  return (val: string) => {
    if (!fieldNm) return val;
    const rep = layerFeatures.find((f: unknown) => {
      const props = (f as { properties?: Record<string, unknown> })?.properties;
      const r = props?.[fieldNm];
      if (r === null || r === undefined || r === '') return false;
      return String(r) === val;
    });
    if (rep && arcDef) {
      const raw = (rep as { properties?: Record<string, unknown> }).properties?.[fieldNm];
      return getArcDisplayValue(rep, fieldNm, raw, arcDef, fieldsByLower, 'description').display || val;
    }
    if (arcDef) return arcLegendLabelForFieldValue(fieldNm, val, arcDef, fieldsByLower);
    return val;
  };
}
