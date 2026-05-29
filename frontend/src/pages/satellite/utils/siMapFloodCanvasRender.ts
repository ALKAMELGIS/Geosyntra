import type { SiRainFlowField } from './siMapRainFlowField';
import { idxFlood } from './siMapFloodEngine';

let rasterCanvasCache: HTMLCanvasElement | null = null;

function depthToRgba(depth: number, alphaScale: number): [number, number, number, number] {
  const a = Math.min(255, Math.round(Math.min(0.92, depth * alphaScale) * 255));
  if (depth >= 0.55) return [30, 58, 138, a];
  if (depth >= 0.28) return [37, 99, 235, a];
  if (depth >= 0.12) return [14, 165, 233, a];
  return [125, 211, 252, Math.round(a * 0.82)];
}

/** Continuous water-surface raster — scaled grid, no points or circles. */
export function drawSiFloodWaterSurface(
  ctx: CanvasRenderingContext2D,
  field: SiRainFlowField,
  width: number,
  height: number,
  precip01: number,
  phase: number,
  playing: boolean,
): void {
  const { cols, rows, raster, cellWidth, cellHeight } = field;
  const pulse = playing ? 0.94 + Math.sin(phase * 2.1) * 0.05 : 1;
  const alphaScale = (0.55 + precip01 * 0.55) * pulse;

  if (!rasterCanvasCache) rasterCanvasCache = document.createElement('canvas');
  const rc = rasterCanvasCache;
  if (rc.width !== cols || rc.height !== rows) {
    rc.width = cols;
    rc.height = rows;
  }
  const rctx = rc.getContext('2d');
  if (!rctx) return;

  const img = rctx.createImageData(cols, rows);
  const data = img.data;
  const { inside, depth, accumulation } = raster;

  let maxAcc = 1;
  for (let i = 0; i < depth.length; i += 1) {
    if (inside[i] && accumulation[i]! > maxAcc) maxAcc = accumulation[i]!;
  }

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const i = idxFlood(cols, r, c);
      const px = (r * cols + c) * 4;
      if (!inside[i]) {
        data[px + 3] = 0;
        continue;
      }
      let d = depth[i]!;
      if (d < 0.025) {
        data[px + 3] = 0;
        continue;
      }
      const accNorm = accumulation[i]! / maxAcc;
      d = Math.min(1, d * (1 + accNorm * 0.12));
      const [red, green, blue, alpha] = depthToRgba(d, alphaScale);
      data[px] = red;
      data[px + 1] = green;
      data[px + 2] = blue;
      data[px + 3] = alpha;
    }
  }
  rctx.putImageData(img, 0, 0);

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(rc, 0, 0, cols, rows, 0, 0, width, height);

  if (playing) {
    const shimmer = 0.06 * (1 + Math.sin(phase * 3.2));
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = `rgba(186, 230, 253, ${shimmer * (0.35 + precip01 * 0.4)})`;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.restore();
}

export function drawSiFloodStreamlines(
  ctx: CanvasRenderingContext2D,
  field: SiRainFlowField,
  precip01: number,
  phase: number,
  playing: boolean,
): void {
  const lines = field.streamlines.length ? field.streamlines : field.paths;
  if (!lines.length) return;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const dashOffset = playing ? phase * 58 : 0;
  const lineAlpha = 0.42 + precip01 * 0.48;

  for (const path of lines) {
    if (path.length < 2) continue;
    ctx.beginPath();
    path.forEach((pt, idx) => {
      if (idx === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    const grad = ctx.createLinearGradient(
      path[0]!.x,
      path[0]!.y,
      path[path.length - 1]!.x,
      path[path.length - 1]!.y,
    );
    grad.addColorStop(0, `rgba(186, 230, 253, ${lineAlpha * 0.45})`);
    grad.addColorStop(0.45, `rgba(34, 211, 238, ${lineAlpha})`);
    grad.addColorStop(1, `rgba(29, 78, 216, ${lineAlpha * 0.95})`);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.4;
    if (playing) {
      ctx.setLineDash([14, 18]);
      ctx.lineDashOffset = -dashOffset;
    } else {
      ctx.setLineDash([]);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

/** Sparse flow-direction ticks along channels (not scatter dots). */
export function drawSiFloodFlowVectors(
  ctx: CanvasRenderingContext2D,
  field: SiRainFlowField,
  phase: number,
  playing: boolean,
): void {
  const stride = Math.max(3, Math.floor(Math.min(field.cols, field.rows) / 8));
  for (const cell of field.cells) {
    const c = Math.round((cell.x / field.cellWidth) - 0.5);
    const r = Math.round((cell.y / field.cellHeight) - 0.5);
    if (c % stride !== 0 || r % stride !== 0) continue;
    if (cell.flowDir < 0 || cell.depth < 0.14) continue;

    const ang = (Math.PI / 4) * cell.flowDir - Math.PI / 2;
    const len = (5 + cell.velocity * 16) * (playing ? 1 + Math.sin(phase + cell.x * 0.02) * 0.1 : 1);
    const ex = cell.x + Math.cos(ang) * len;
    const ey = cell.y + Math.sin(ang) * len;
    const alpha = 0.3 + cell.depth * 0.5;

    ctx.strokeStyle = `rgba(103, 232, 249, ${alpha})`;
    ctx.lineWidth = 1.4 + cell.velocity * 1.2;
    ctx.beginPath();
    ctx.moveTo(cell.x, cell.y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }
}

export function drawSiFloodChannelMask(
  ctx: CanvasRenderingContext2D,
  field: SiRainFlowField,
  width: number,
  height: number,
): void {
  const { cols, rows, raster } = field;
  let maxAcc = 1;
  for (let i = 0; i < raster.accumulation.length; i += 1) {
    if (raster.inside[i] && raster.accumulation[i]! > maxAcc) maxAcc = raster.accumulation[i]!;
  }
  const threshold = maxAcc * 0.35;

  ctx.save();
  ctx.strokeStyle = 'rgba(14, 116, 144, 0.55)';
  ctx.lineWidth = 1.5;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const i = idxFlood(cols, r, c);
      if (!raster.inside[i] || raster.accumulation[i]! < threshold || raster.depth[i]! < 0.08) continue;
      const x = c * field.cellWidth;
      const y = r * field.cellHeight;
      ctx.strokeRect(x + 1, y + 1, field.cellWidth - 2, field.cellHeight - 2);
    }
  }
  ctx.restore();
}
