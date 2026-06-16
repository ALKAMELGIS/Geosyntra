import type { IndexRampStop } from '../../../lib/siWmsIndexClassificationRamp';
import { siSampleRampColorAt } from '../../../lib/siWmsIndexClassificationRamp';
import type { SiExploreIndexBand } from './siExploreIndexesCatalog';
import {
  paintExploreIndexPreviewToCanvas,
  resolveExploreIndexScene,
  type ExploreIndexPreviewScene,
} from './siExploreIndexPreviewRaster';

export type { ExploreIndexPreviewScene };

export function exploreBandRenderProfile(band: SiExploreIndexBand): ExploreIndexPreviewScene {
  return resolveExploreIndexScene(band.id);
}

export function resolveExploreBandChartLayerId(band: SiExploreIndexBand): string {
  if (band.id === 'index-stack') return 'NDMI';
  const scene = resolveExploreIndexScene(band.id);
  switch (scene) {
    case 'ndwi':
      return 'NDWI';
    case 'ndmi':
      return 'NDMI';
    case 'evi':
      return 'EVI';
    case 'savi':
      return 'SAVI';
    case 'ndvi':
    default:
      return 'NDVI';
  }
}

function hexToRgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

/** Map decoded index raster values through a classification ramp (per-pixel RS coloring). */
export function renderExploreIndexValuesToImageData(
  values: Float32Array,
  width: number,
  height: number,
  stops: readonly IndexRampStop[],
): { data: Uint8ClampedArray; width: number; height: number } {
  const data = new Uint8ClampedArray(width * height * 4);
  const count = Math.min(values.length, width * height);
  for (let i = 0; i < count; i += 1) {
    const hex = siSampleRampColorAt(stops, values[i]!);
    const [r, g, b] = hexToRgb(hex);
    const o = i * 4;
    data[o] = r;
    data[o + 1] = g;
    data[o + 2] = b;
    data[o + 3] = 255;
  }
  return { data, width, height };
}

export { paintExploreIndexPreviewToCanvas };
