import type { SiAoiLegendStripItem } from './siAoiReportSlotMapRender';

export type SiMapPrintPaper = 'A4' | 'A3';
export type SiMapPrintOrientation = 'portrait' | 'landscape';
export type SiMapPrintExtent = 'viewport' | 'aoi';

/** Background during map capture — cartographic light gray, live map basemap, or white only. */
export type SiMapPrintBasemapMode = 'cartographic' | 'current' | 'none';

export type SiMapPrintElementId = 'title' | 'legend' | 'scaleNorth' | 'credits';

/** Fractional nudge applied when custom layout is enabled (× page W/H). */
export type SiMapPrintLayoutOffsets = Partial<
  Record<SiMapPrintElementId, { dxPct: number; dyPct: number }>
>;

export type SiMapPrintSettings = {
  paper: SiMapPrintPaper;
  orientation: SiMapPrintOrientation;
  extent: SiMapPrintExtent;
  /** Maximize map in the printable frame (reference layout). */
  fitMapOnPaper: boolean;
  basemapMode: SiMapPrintBasemapMode;
  includeLegend: boolean;
  includeScale: boolean;
  includeNorthArrow: boolean;
  includeLocator: boolean;
  includeLayerList: boolean;
  includeTitle: boolean;
  includeDescription: boolean;
  includeWatermark: boolean;
  /** Drag title, legend, scale/north, and credits on the live preview. */
  customLayout: boolean;
  layoutOffsets: SiMapPrintLayoutOffsets;
  /** Export PDF with vector chrome (text, scale, north, legend swatches) + high-res map image. */
  vectorPdf: boolean;
  title: string;
  description: string;
  /** Output raster multiplier (2–3). */
  resolutionScale: 2 | 3;
};

export const DEFAULT_SI_MAP_PRINT_SETTINGS: SiMapPrintSettings = {
  paper: 'A4',
  orientation: 'landscape',
  extent: 'aoi',
  fitMapOnPaper: true,
  basemapMode: 'current',
  includeLegend: true,
  includeScale: true,
  includeNorthArrow: true,
  includeLocator: true,
  includeLayerList: false,
  includeTitle: true,
  includeDescription: false,
  includeWatermark: false,
  customLayout: false,
  layoutOffsets: {},
  vectorPdf: true,
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
