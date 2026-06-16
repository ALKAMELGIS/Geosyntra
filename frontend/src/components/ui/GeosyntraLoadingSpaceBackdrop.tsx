import { useEffect, useRef } from 'react';
import './geosyntra-loading-space.css';

type StarSeed = {
  x: number;
  y: number;
  r: number;
  alpha: number;
  phase: number;
  twinkle: number;
};

type Comet = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  duration: number;
  tail: number;
  head: number;
};

const STAR_COUNT = 920;
const MAX_COMETS = 2;
const COMET_MIN_GAP_MS = 22_000;
const COMET_MAX_GAP_MS = 48_000;

function buildStars(width: number, height: number): StarSeed[] {
  const stars: StarSeed[] = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    const roll = Math.random();
    const r =
      roll < 0.78
        ? 0.45 + Math.random() * 0.45
        : roll < 0.95
          ? 0.95 + Math.random() * 0.55
          : 1.25 + Math.random() * 0.75;
    const alpha = 0.12 + Math.random() * 0.78;
    stars.push({
      x: Math.random() * width,
      y: Math.random() * height,
      r,
      alpha,
      phase: Math.random() * Math.PI * 2,
      twinkle: 0.00012 + Math.random() * 0.00045,
    });
  }
  return stars;
}

function spawnComet(w: number, h: number): Comet {
  const margin = Math.max(w, h) * 0.14;
  const edge = Math.floor(Math.random() * 4);
  let x = 0;
  let y = 0;
  if (edge === 0) {
    x = Math.random() * w;
    y = -margin;
  } else if (edge === 1) {
    x = w + margin;
    y = Math.random() * h;
  } else if (edge === 2) {
    x = Math.random() * w;
    y = h + margin;
  } else {
    x = -margin;
    y = Math.random() * h;
  }

  const targetX = w * (0.1 + Math.random() * 0.8);
  const targetY = h * (0.1 + Math.random() * 0.8);
  const dx = targetX - x;
  const dy = targetY - y;
  const len = Math.hypot(dx, dy) || 1;
  const speed = 0.016 + Math.random() * 0.014;

  return {
    x,
    y,
    vx: (dx / len) * speed,
    vy: (dy / len) * speed,
    age: 0,
    duration: 14_000 + Math.random() * 10_000,
    tail: 320 + Math.random() * 220,
    head: 1.35 + Math.random() * 0.85,
  };
}

function drawComet(ctx: CanvasRenderingContext2D, comet: Comet): void {
  const life = 1 - comet.age / comet.duration;
  if (life <= 0) return;

  const fadeIn = Math.min(1, comet.age / 900);
  const fadeOut = Math.min(1, (comet.duration - comet.age) / 1200);
  const alpha = life * fadeIn * fadeOut * 0.88;
  if (alpha < 0.02) return;

  const speed = Math.hypot(comet.vx, comet.vy) || 1;
  const nx = comet.vx / speed;
  const ny = comet.vy / speed;
  const tailX = comet.x - nx * comet.tail;
  const tailY = comet.y - ny * comet.tail;

  const dustGrad = ctx.createLinearGradient(tailX, tailY, comet.x, comet.y);
  dustGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
  dustGrad.addColorStop(0.12, `rgba(180, 195, 220, ${alpha * 0.04})`);
  dustGrad.addColorStop(0.38, `rgba(210, 225, 245, ${alpha * 0.14})`);
  dustGrad.addColorStop(0.68, `rgba(235, 242, 255, ${alpha * 0.32})`);
  dustGrad.addColorStop(0.9, `rgba(248, 252, 255, ${alpha * 0.55})`);
  dustGrad.addColorStop(1, `rgba(255, 255, 255, ${alpha * 0.82})`);

  ctx.strokeStyle = dustGrad;
  ctx.lineWidth = comet.head * 2.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(comet.x - nx * comet.head * 2, comet.y - ny * comet.head * 2);
  ctx.stroke();

  const coreGrad = ctx.createLinearGradient(tailX, tailY, comet.x, comet.y);
  coreGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
  coreGrad.addColorStop(0.55, `rgba(220, 235, 255, ${alpha * 0.42})`);
  coreGrad.addColorStop(0.82, `rgba(255, 255, 255, ${alpha * 0.78})`);
  coreGrad.addColorStop(1, `rgba(255, 255, 255, ${alpha * 0.98})`);

  ctx.strokeStyle = coreGrad;
  ctx.lineWidth = comet.head;
  ctx.beginPath();
  ctx.moveTo(tailX + nx * comet.tail * 0.08, tailY + ny * comet.tail * 0.08);
  ctx.lineTo(comet.x, comet.y);
  ctx.stroke();

  const coma = ctx.createRadialGradient(comet.x, comet.y, 0, comet.x, comet.y, comet.head * 7);
  coma.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.95})`);
  coma.addColorStop(0.22, `rgba(186, 228, 255, ${alpha * 0.42})`);
  coma.addColorStop(0.5, `rgba(140, 200, 230, ${alpha * 0.12})`);
  coma.addColorStop(1, 'rgba(120, 170, 210, 0)');
  ctx.fillStyle = coma;
  ctx.beginPath();
  ctx.arc(comet.x, comet.y, comet.head * 7, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Pure black starfield + slow realistic comets for the map loading screen (image-2 style).
 */
export function GeosyntraLoadingSpaceBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<StarSeed[]>([]);
  const cometsRef = useRef<Comet[]>([]);
  const nextCometAtRef = useRef(0);
  const sizeRef = useRef({ w: 0, h: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const host = canvas.parentElement;
      if (!host) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (w <= 0 || h <= 0) return;
      sizeRef.current = { w, h };
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      starsRef.current = buildStars(canvas.width, canvas.height);
      cometsRef.current = [];
      nextCometAtRef.current = performance.now() + 6000 + Math.random() * 12_000;
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let lastT = 0;

    const maybeSpawnComet = (t: number) => {
      if (reducedMotion) return;
      if (cometsRef.current.length >= MAX_COMETS) return;
      if (t < nextCometAtRef.current) return;
      const { w, h } = sizeRef.current;
      if (!w || !h) return;
      cometsRef.current.push(spawnComet(canvas.width, canvas.height));
      nextCometAtRef.current =
        t + COMET_MIN_GAP_MS + Math.random() * (COMET_MAX_GAP_MS - COMET_MIN_GAP_MS);
    };

    const draw = (t: number, dt: number) => {
      const { w, h } = sizeRef.current;
      if (!w || !h || !starsRef.current.length) return;

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (const star of starsRef.current) {
        const twinkle = reducedMotion
          ? 1
          : 0.84 + 0.16 * Math.sin(t * star.twinkle + star.phase);
        const alpha = star.alpha * twinkle;
        if (alpha < 0.03) continue;

        const tint = star.alpha > 0.55 ? 255 : 198 + Math.floor(star.alpha * 62);
        const grey = tint - 6 + Math.floor(star.r * 3);
        ctx.fillStyle = `rgba(${grey}, ${grey + 5}, ${tint}, ${Math.min(0.92, alpha)})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!reducedMotion) {
        maybeSpawnComet(t);
        const nextComets: Comet[] = [];
        for (const comet of cometsRef.current) {
          comet.x += comet.vx * dt;
          comet.y += comet.vy * dt;
          comet.age += dt;
          if (comet.age < comet.duration + 600) {
            drawComet(ctx, comet);
            nextComets.push(comet);
          }
        }
        cometsRef.current = nextComets;
      }
    };

    const loop = (t: number) => {
      const dt = lastT ? Math.min(40, t - lastT) : 16;
      lastT = t;
      draw(t, dt);
      raf = requestAnimationFrame(loop);
    };

    draw(performance.now(), 16);
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="gs-loading-space" aria-hidden>
      <canvas ref={canvasRef} className="gs-loading-space__canvas" />
    </div>
  );
}
