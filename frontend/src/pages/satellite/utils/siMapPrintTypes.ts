import type { SiAoiLegendStripItem } from './siAoiReportSlotMapRender';

export type SiMapPrintPaper = 'A4' | 'A3';
export type SiMapPrintOrientation = 'portrait' | 'landscape';
export type SiMapPrintExtent = 'viewport' | 'aoi';

export type SiMapPrintSettings = {
  paper: SiMapPrintPaper;
  orientation: SiMapPrintOrientation;
  extent: SiMapPrintExtent;
  includeLegend: boolean;
  includeScale: boolean;
  includeNorthArrow: boolean;
  includeLayerList: boolean;
  includeTitle: boolean;
  includeDescription: boolean;
  includeWatermark: boolean;
  title: string;
  description: string;
  /** Output raster multiplier (2–3). */
  resolutionScale: 2 | 3;
};

export const DEFAULT_SI_MAP_PRINT_SETTINGS: SiMapPrintSettings = {
  paper: 'A4',
  orientation: 'landscape',
  extent: 'aoi',
  includeLegend: true,
  includeScale: true,
  includeNorthArrow: true,
  includeLayerList: false,
  includeTitle: true,
  includeDescription: false,
  includeWatermark: false,
  title: 'GeoSyntra map export',
  description: '',
  resolutionScale: 2,
};

export type SiMapPrintComposeInput = {
  mapPng: string;
  settings: SiMapPrintSettings;
  legendItems: SiAoiLegendStripItem[];
  layerLines: string[];
  mapLngLatBounds: import('./siAoiReportCartography').SiPdfLngLatBounds | null;
  metaLine?: string;
};

export function siMapPrintAspectRatio(settings: SiMapPrintSettings): number {
  const portrait = settings.orientation === 'portrait';
  if (settings.paper === 'A3') return portrait ? 297 / 420 : 420 / 297;
  return portrait ? 210 / 297 : 297 / 210;
}

export function siMapPrintPageLabel(settings: SiMapPrintSettings): string {
  return `${settings.paper} · ${settings.orientation}`;
}
