/** Fast Terrarium RGB(A) PNG encoder — avoids Canvas/toDataURL per DEM tile. */

const PNG_SIG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 1);
  return (c ^ 0xffffffff) >>> 0;
}

function writeU32BE(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, false);
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  writeU32BE(view, 0, data.length);
  out.set(typeBytes, 4);
  out.set(data, 8);
  const crcBuf = new Uint8Array(4 + data.length);
  crcBuf.set(typeBytes, 0);
  crcBuf.set(data, 4);
  writeU32BE(view, 8 + data.length, crc32(crcBuf));
  return out;
}

function isVitestRuntime(): boolean {
  return typeof process !== 'undefined' && process.env?.VITEST === 'true';
}

async function zlibDeflate(data: Uint8Array): Promise<Uint8Array> {
  if (isVitestRuntime()) {
    const { deflateSync } = await import('node:zlib');
    return new Uint8Array(deflateSync(data));
  }
  if (typeof CompressionStream !== 'undefined') {
    return zlibDeflateViaCompressionStream(data);
  }
  throw new Error('CompressionStream unavailable');
}

async function zlibDeflateViaCompressionStream(data: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined') {
    throw new Error('CompressionStream unavailable');
  }
  const stream = new CompressionStream('deflate');
  const writer = stream.writable.getWriter();
  await writer.write(data);
  await writer.close();
  const reader = stream.readable.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** Encode raw RGBA scanlines (filter-0) as PNG — async zlib via CompressionStream. */
export async function encodeRgbaPngFast(
  width: number,
  height: number,
  rgba: Uint8Array,
): Promise<ArrayBuffer> {
  const stride = width * 4;
  const raw = new Uint8Array(height * (1 + stride));
  for (let y = 0; y < height; y++) {
    const rowOff = y * (1 + stride);
    raw[rowOff] = 0;
    raw.set(rgba.subarray(y * stride, y * stride + stride), rowOff + 1);
  }
  const compressed = await zlibDeflate(raw);

  const ihdr = new Uint8Array(13);
  const ih = new DataView(ihdr.buffer);
  writeU32BE(ih, 0, width);
  writeU32BE(ih, 4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const chunks = [
    PNG_SIG,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', new Uint8Array(0)),
  ];
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out.buffer;
}

/** Terrarium RGB from meters — matches Mapbox `raster-dem` terrarium encoding. */
export function terrariumRgbFromMeters(heightM: number): [number, number, number] {
  const clamped = Math.max(-10000, Math.min(6553.5, heightM));
  const v = Math.round((clamped + 10000) / 0.1);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function elevationsToTerrariumRgba(
  elevations: Float32Array,
  noData = -9999,
): Uint8Array {
  const rgba = new Uint8Array(elevations.length * 4);
  for (let i = 0; i < elevations.length; i++) {
    const elev = elevations[i]!;
    const o = i * 4;
    if (!Number.isFinite(elev) || elev === noData) {
      rgba[o + 3] = 0;
      continue;
    }
    const [r, g, b] = terrariumRgbFromMeters(elev);
    rgba[o] = r;
    rgba[o + 1] = g;
    rgba[o + 2] = b;
    rgba[o + 3] = 255;
  }
  return rgba;
}
