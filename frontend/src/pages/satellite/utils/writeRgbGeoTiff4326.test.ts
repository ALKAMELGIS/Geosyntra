import { describe, expect, it } from 'vitest';
import { encodeRgbGeoTiff4326, rgbaToRgbInterleaved } from './writeRgbGeoTiff4326';

describe('writeRgbGeoTiff4326', () => {
  it('writes a little-endian TIFF header and RGB strip', () => {
    const rgba = new Uint8ClampedArray([
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
      255, 255, 255, 255,
    ]);
    const rgb = rgbaToRgbInterleaved(rgba, 2 * 2);
    const buf = encodeRgbGeoTiff4326(2, 2, rgb, {
      west: 55.0,
      south: 25.0,
      east: 55.2,
      north: 25.2,
    });
    const bytes = new Uint8Array(buf);
    expect(bytes[0]).toBe(0x49);
    expect(bytes[1]).toBe(0x49);
    expect(bytes[2]).toBe(0x2a);
    expect(bytes[3]).toBe(0x00);
    expect(buf.byteLength).toBeGreaterThan(100);
  });
});
