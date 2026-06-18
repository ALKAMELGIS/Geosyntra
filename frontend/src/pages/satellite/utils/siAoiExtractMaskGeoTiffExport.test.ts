import { describe, expect, it } from 'vitest';
import {
  dataUrlToBlob,
  formatExtractMaskExportError,
  formatExtractMaskStatusLine,
  nextExtractSourceStagingLayerName,
  nextExportAoiGeoTiffLayerName,
} from './siAoiExtractMaskGeoTiffExport';

describe('siAoiExtractMaskGeoTiffExport', () => {
  it('decodes PNG data URLs without fetch', () => {
    const pngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const dataUrl = `data:image/png;base64,${pngBase64}`;
    const blob = dataUrlToBlob(dataUrl);
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('maps failed fetch to network error with recovery', () => {
    const info = formatExtractMaskExportError(new TypeError('Failed to fetch'));
    expect(info.category).toBe('network-error');
    expect(formatExtractMaskStatusLine(info)).toMatch(/Network error/);
    expect(formatExtractMaskStatusLine(info)).toMatch(/retry/i);
  });

  it('maps missing layer messages to layer-not-loaded', () => {
    const info = formatExtractMaskExportError(new Error('Raster capture failed. Ensure the index layer is visible.'));
    expect(info.category).toBe('layer-not-loaded');
  });

  it('names export and staging layers uniquely', () => {
    expect(nextExportAoiGeoTiffLayerName([])).toBe('Exported AOI GeoTIFF');
    expect(nextExportAoiGeoTiffLayerName(['Exported AOI GeoTIFF'])).toBe('Exported AOI GeoTIFF (2)');
    expect(nextExtractSourceStagingLayerName([], 'NDVI')).toBe('Source raster · NDVI');
  });
});
