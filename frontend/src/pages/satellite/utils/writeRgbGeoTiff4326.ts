/** Minimal uncompressed RGB GeoTIFF (EPSG:4326) writer for AOI extract-by-mask exports. */

export type GeoTiff4326BBox = {
  west: number;
  south: number;
  east: number;
  north: number;
};

function writeU16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

function writeU32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value, true);
}

function writeF64(view: DataView, offset: number, value: number) {
  view.setFloat64(offset, value, true);
}

function align4(n: number): number {
  return (n + 3) & ~3;
}

/** Pack RGBA canvas pixels into interleaved RGB (drops alpha). */
export function rgbaToRgbInterleaved(rgba: Uint8ClampedArray, pixelCount: number): Uint8Array {
  const rgb = new Uint8Array(pixelCount * 3);
  for (let i = 0; i < pixelCount; i++) {
    const s = i * 4;
    const d = i * 3;
    rgb[d] = rgba[s]!;
    rgb[d + 1] = rgba[s + 1]!;
    rgb[d + 2] = rgba[s + 2]!;
  }
  return rgb;
}

/**
 * Encode an north-up RGB image with geographic bounds in WGS84.
 * Pixel (0,0) maps to (west, north).
 */
export function encodeRgbGeoTiff4326(
  width: number,
  height: number,
  rgb: Uint8Array,
  bbox: GeoTiff4326BBox,
): ArrayBuffer {
  if (width < 1 || height < 1) throw new Error('GeoTIFF export requires a positive width and height.');
  if (rgb.length !== width * height * 3) throw new Error('RGB buffer size does not match image dimensions.');
  const { west, south, east, north } = bbox;
  if (![west, south, east, north].every(Number.isFinite)) throw new Error('Invalid geographic bounds.');
  if (east <= west || north <= south) throw new Error('Invalid geographic extent.');

  const pixelScaleX = (east - west) / width;
  const pixelScaleY = (south - north) / height;

  const bitsPerSample = new Uint16Array([8, 8, 8]);
  const modelPixelScale = new Float64Array([pixelScaleX, pixelScaleY, 0]);
  const modelTiepoint = new Float64Array([0, 0, 0, west, north, 0]);
  const geoKeys = new Uint16Array([
    1, 1, 0, 4,
    1024, 0, 1, 2,
    1025, 0, 1, 1,
    2048, 0, 1, 4326,
    2054, 0, 1, 9102,
  ]);

  const stripBytes = width * height * 3;
  const ifdEntryCount = 12;
  const headerSize = 8;
  const ifdOffset = headerSize;
  const ifdSize = 2 + ifdEntryCount * 12 + 4;
  let cursor = align4(ifdOffset + ifdSize);

  const bitsOffset = cursor;
  cursor = align4(cursor + bitsPerSample.byteLength);
  const scaleOffset = cursor;
  cursor = align4(cursor + modelPixelScale.byteLength);
  const tieOffset = cursor;
  cursor = align4(cursor + modelTiepoint.byteLength);
  const geoOffset = cursor;
  cursor = align4(cursor + geoKeys.byteLength);
  const stripOffset = cursor;
  cursor += stripBytes;

  const buf = new ArrayBuffer(cursor);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  bytes[0] = 0x49;
  bytes[1] = 0x49;
  writeU16(view, 2, 42);
  writeU32(view, 4, ifdOffset);

  writeU16(view, ifdOffset, ifdEntryCount);
  let entry = ifdOffset + 2;

  const tag = (code: number, type: number, count: number, valueOrOffset: number) => {
    writeU16(view, entry, code);
    writeU16(view, entry + 2, type);
    writeU32(view, entry + 4, count);
    writeU32(view, entry + 8, valueOrOffset);
    entry += 12;
  };

  tag(256, 4, 1, width);
  tag(257, 4, 1, height);
  tag(258, 3, 3, bitsOffset);
  tag(259, 3, 1, 1);
  tag(262, 3, 1, 2);
  tag(273, 4, 1, stripOffset);
  tag(277, 3, 1, 3);
  tag(278, 4, 1, height);
  tag(279, 4, 1, stripBytes);
  tag(33550, 12, 3, scaleOffset);
  tag(33922, 12, 6, tieOffset);
  tag(34735, 3, geoKeys.length, geoOffset);

  writeU32(view, entry, 0);

  new Uint8Array(buf, bitsOffset, bitsPerSample.byteLength).set(new Uint8Array(bitsPerSample.buffer));
  new Uint8Array(buf, scaleOffset, modelPixelScale.byteLength).set(new Uint8Array(modelPixelScale.buffer));
  new Uint8Array(buf, tieOffset, modelTiepoint.byteLength).set(new Uint8Array(modelTiepoint.buffer));
  new Uint8Array(buf, geoOffset, geoKeys.byteLength).set(new Uint8Array(geoKeys.buffer));
  bytes.set(rgb, stripOffset);

  return buf;
}
