import type { SiAoiLegendStripItem } from './siAoiReportSlotMapRender';

export type SiMapPrintLegendLayerInput = {
  name: string;
  visible: boolean;
  color?: string;
  fillColor?: string;
  symbologyEntries?: { label: string; color: string }[];
};

/** Build print legend from visible map layers (WMS ramp + vector symbology). */
export function buildSiMapPrintLegendItems(input: {
  wmsItems: SiAoiLegendStripItem[];
  wmsVisible: boolean;
  basemapLabel?: string;
  layers: SiMapPrintLegendLayerInput[];
  maxItems?: number;
}): SiAoiLegendStripItem[] {
  const max = input.maxItems ?? 28;
  const out: SiAoiLegendStripItem[] = [];
  const seen = new Set<string>();

  const push = (label: string, color: string) => {
    const key = `${label}|${color}`;
    if (!label.trim() || seen.has(key)) return;
    seen.add(key);
    out.push({ label: label.trim(), color });
  };

  if (input.basemapLabel?.trim()) {
    push(`Basemap: ${input.basemapLabel.trim()}`, '#cbd5e1');
  }

  if (input.wmsVisible && input.wmsItems.length) {
    for (const it of input.wmsItems) push(it.label, it.color);
  }

  for (const layer of input.layers) {
    if (!layer.visible) continue;
    if (layer.symbologyEntries?.length) {
      for (const e of layer.symbologyEntries.slice(0, 12)) push(`${layer.name}: ${e.label}`, e.color);
    } else {
      const c = layer.fillColor || layer.color || '#64748b';
      push(layer.name, c);
    }
    if (out.length >= max) break;
  }

  return out.slice(0, max);
}
