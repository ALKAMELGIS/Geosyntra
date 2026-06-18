import type { SiMapPrintSettings } from './siMapPrintTypes';

/** Fast live preview — full export uses `settings.resolutionScale`. */
export const SI_MAP_PRINT_PREVIEW_CAPTURE_SCALE = 1 as const;

export type SiMapPrintCaptureSlice = Pick<
  SiMapPrintSettings,
  'extent' | 'basemapMode' | 'resolutionScale'
>;

export function pickSiMapPrintCaptureSlice(settings: SiMapPrintSettings): SiMapPrintCaptureSlice {
  return {
    extent: settings.extent,
    basemapMode: settings.basemapMode,
    resolutionScale: settings.resolutionScale,
  };
}

export function siMapPrintCaptureSliceKey(slice: SiMapPrintCaptureSlice): string {
  return `${slice.extent}|${slice.basemapMode}|${slice.resolutionScale}`;
}

/** Settings that only affect canvas layout — safe to recompose without re-capturing the map. */
export function pickSiMapPrintComposeSlice(settings: SiMapPrintSettings): Omit<
  SiMapPrintSettings,
  keyof SiMapPrintCaptureSlice
> {
  const { extent: _e, basemapMode: _b, resolutionScale: _r, ...rest } = settings;
  return rest;
}

export function siMapPrintComposeSliceKey(
  slice: ReturnType<typeof pickSiMapPrintComposeSlice>,
  legendCount: number,
  layerIndexCount: number,
): string {
  return JSON.stringify({ ...slice, legendCount, layerIndexCount });
}
