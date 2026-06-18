import { useEffect, useRef } from 'react';
import './SiMapSpaceBackdrop.css';

type StarDepth = 'far' | 'mid' | 'near';

type StarSeed = {
  x: number;
  y: number;
  r: number;
  base: number;
  phase: number;
  twinkleSpeed: number;
  twinkleDepth: number;
  variable: boolean;
  depth: StarDepth;
  rgb: [number, number, number];
  spikes: boolean;
};

type DustParticle = {
  x: number;
  y: number;
  r: number;
  phase: number;
  drift: number;
  alpha: number;
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
  hue: number;
};

const STAR_LAYERS: Record<StarDepth, { count: number; parallax: number }> = {
  far: { count: 150, parallax: 0.28 },
  mid: { count: 88, parallax: 0.62 },
  near: { count: 32, parallax: 1.15 },
};

const DUST_COUNT = 36;
const MAX_COMETS = 2;
const COMET_MIN_GAP_MS = 9_000;
const COMET_MAX_GAP_MS = 34_000;

const STAR_PALETTE: [number, number, number][] = [
  [186, 210, 255],
  [214, 228, 255],
  [235, 242, 255],
  [255, 238, 210],
  [255, 205, 168],
];

function pickStarColor(): [number, number, number] {
  const roll = Math.random();
  if (roll < 0.42) return STAR_PALETTE[0];
  if (roll < 0.72) return STAR_PALETTE[1];
  if (roll < 0.88) return STAR_PALETTE[2];
  if (roll < 0.96) return STAR_PALETTE[3];
  return STAR_PALETTE[4];
}

function buildStars(width: number, height: number): StarSeed[] {
  const stars: StarSeed[] = [];
  for (const [depth, cfg] of Object.entries(STAR_LAYERS) as [StarDepth, { count: number; parallax: number }][]) {
    for (let i = 0; i < cfg.count; i++) {
      const large = depth === 'near' && Math.random() < 0.38;
      const mid = depth === 'mid' && Math.random() < 0.16;
      const r =
        depth === 'far'
          ? 0.45 + Math.random() * 0.25
          : large
            ? 1.25 + Math.random() * 0.55
            : mid
              ? 0.85 + Math.random() * 0.35
              : 0.55 + Math.random() * 0.35;

      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r,
        base: depth === 'far' ? 0.14 + Math.random() * 0.38 : 0.24 + Math.random() * 0.62,
        phase: Math.random() * Math.PI * 2,
        twinkleSpeed: 0.0007 + Math.random() * 0.0026,
        twinkleDepth: 0.4 + Math.random() * 0.6,
        variable: Math.random() < (depth === 'near' ? 0.22 : 0.1),
        depth,
        rgb: pickStarColor(),
        spikes: large && Math.random() < 0.55,
      });
    }
  }
  return stars;
}

function buildDust(width: number, height: number): DustParticle[] {
  const dust: DustParticle[] = [];
  for (let i = 0; i < DUST_COUNT; i++) {
    dust.push({
      x: Math.random() * width,
      y: Math.random() * height,
      r: 0.25 + Math.random() * 0.45,
      phase: Math.random() * Math.PI * 2,
      drift: 0.4 + Math.random() * 0.9,
      alpha: 0.04 + Math.random() * 0.08,
    });
  }
  return dust;
}

function starTwinkle(star: StarSeed, t: number): number {
  const fast = Math.sin(t * star.twinkleSpeed + star.phase);
  const slow = Math.sin(t * star.twinkleSpeed * 0.31 + star.phase * 1.73);
  let twinkle = 0.5 + 0.3 * fast + 0.2 * slow * star.twinkleDepth;
  if (star.variable) {
    twinkle *= 0.62 + 0.38 * Math.sin(t * 0.0014 + star.phase * 0.6);
  }
  return Math.max(0.14, Math.min(1.2, twinkle));
}

function parallaxForDepth(depth: StarDepth): number {
  return STAR_LAYERS[depth].parallax;
}

function drawStarSpikes(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  alpha: number,
  rgb: [number, number, number],
  t: number,
  phase: number,
): void {
  const pulse = 0.55 + 0.45 * Math.sin(t * 0.0022 + phase);
  const a = alpha * pulse * 0.22;
  if (a < 0.02) return;
  const [red, green, blue] = rgb;
  const len = r * (5.5 + pulse * 2.2);
  ctx.strokeStyle = `rgba(${red}, ${green}, ${blue}, ${a})`;
  ctx.lineWidth = 0.55;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - len, y);
  ctx.lineTo(x + len, y);
  ctx.moveTo(x, y - len * 0.72);
  ctx.lineTo(x, y + len * 0.72);
  ctx.stroke();
}

function spawnComet(w: number, h: number): Comet {
  const margin = Math.max(w, h) * 0.1;
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

  const targetX = w * (0.12 + Math.random() * 0.76);
  const targetY = h * (0.12 + Math.random() * 0.76);
  const dx = targetX - x;
  const dy = targetY - y;
  const len = Math.hypot(dx, dy) || 1;
  const speed = 0.42 + Math.random() * 0.38;

  return {
    x,
    y,
    vx: (dx / len) * speed,
    vy: (dy / len) * speed,
    age: 0,
    duration: 900 + Math.random() * 1100,
    tail: 96 + Math.random() * 120,
    head: 1.2 + Math.random() * 1.1,
    hue: 195 + Math.random() * 45,
  };
}

function drawComet(ctx: CanvasRenderingContext2D, comet: Comet, exposure: number): void {
  const life = 1 - comet.age / comet.duration;
  if (life <= 0) return;

  const fadeIn = Math.min(1, comet.age / 160);
  const fadeOut = Math.min(1, (comet.duration - comet.age) / 220);
  const alpha = life * fadeIn * fadeOut * exposure * 0.95;
  if (alpha < 0.03) return;

  const speed = Math.hypot(comet.vx, comet.vy) || 1;
  const nx = comet.vx / speed;
  const ny = comet.vy / speed;
  const tailX = comet.x - nx * comet.tail;
  const tailY = comet.y - ny * comet.tail;

  const grad = ctx.createLinearGradient(tailX, tailY, comet.x, comet.y);
  grad.addColorStop(0, `hsla(${comet.hue}, 72%, 78%, 0)`);
  grad.addColorStop(0.35, `hsla(${comet.hue}, 82%, 88%, ${alpha * 0.18})`);
  grad.addColorStop(0.72, `hsla(${comet.hue + 8}, 90%, 94%, ${alpha * 0.55})`);
  grad.addColorStop(1, `rgba(255, 255, 255, ${alpha})`);

  ctx.strokeStyle = grad;
  ctx.lineWidth = comet.head;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(comet.x, comet.y);
  ctx.stroke();

  const glow = ctx.createRadialGradient(comet.x, comet.y, 0, comet.x, comet.y, comet.head * 4.2);
  glow.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.95})`);
  glow.addColorStop(0.35, `hsla(${comet.hue}, 90%, 88%, ${alpha * 0.35})`);
  glow.addColorStop(1, `hsla(${comet.hue}, 70%, 70%, 0)`);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(comet.x, comet.y, comet.head * 4.2, 0, Math.PI * 2);
  ctx.fill();
}

type MilkyWayGrain = { x: number; y: number; r: number; a: number };

function buildMilkyWayGrains(seed: number): MilkyWayGrain[] {
  let s = seed || 1;
  const rand = () => {
    s = (s * 16_807 + 0) % 2_147_483_647;
    return (s & 0x7fffffff) / 0x7fffffff;
  };
  const grains: MilkyWayGrain[] = [];
  for (let i = 0; i < 52; i++) {
    grains.push({
      x: (rand() - 0.5) * 0.82,
      y: (rand() - 0.5) * 0.9,
      r: 0.35 + rand() * 0.65,
      a: 0.35 + rand() * 0.65,
    });
  }
  return grains;
}

function drawMilkyWayBand(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  exposure: number,
  grains: MilkyWayGrain[],
): void {
  ctx.save();
  ctx.globalAlpha = exposure * 0.42;
  ctx.translate(width * 0.52, height * 0.48);
  ctx.rotate(-0.42);
  const bandW = width * 1.35;
  const bandH = height * 0.22;
  const grad = ctx.createLinearGradient(-bandW * 0.5, 0, bandW * 0.5, 0);
  grad.addColorStop(0, 'rgba(120, 150, 210, 0)');
  grad.addColorStop(0.22, 'rgba(168, 188, 235, 0.04)');
  grad.addColorStop(0.48, 'rgba(210, 220, 255, 0.11)');
  grad.addColorStop(0.54, 'rgba(235, 238, 255, 0.14)');
  grad.addColorStop(0.62, 'rgba(198, 210, 245, 0.09)');
  grad.addColorStop(0.82, 'rgba(140, 165, 220, 0.03)');
  grad.addColorStop(1, 'rgba(100, 130, 200, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(-bandW * 0.5, -bandH * 0.5, bandW, bandH);

  ctx.globalAlpha = exposure * 0.18;
  for (const grain of grains) {
    ctx.fillStyle = `rgba(255, 255, 255, ${grain.a * 0.55})`;
    ctx.beginPath();
    ctx.arc(grain.x * bandW, grain.y * bandH, grain.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawHorizonGlow(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  exposure: number,
  pitch: number,
): void {
  const pitchT = Math.min(1, Math.max(0, (pitch - 42) / 38));
  const glow = exposure * pitchT * 0.55;
  if (glow < 0.03) return;

  const y = height * (0.72 + pitchT * 0.08);
  const grad = ctx.createRadialGradient(width * 0.5, y, 0, width * 0.5, y, width * 0.62);
  grad.addColorStop(0, `rgba(72, 132, 210, ${glow * 0.42})`);
  grad.addColorStop(0.35, `rgba(38, 88, 168, ${glow * 0.22})`);
  grad.addColorStop(0.72, `rgba(12, 32, 72, ${glow * 0.08})`);
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, height * 0.45, width, height * 0.55);
}

export type SiMapSpaceBackdropProps = {
  /** 0–1 visibility driven by camera pitch / 3D mode. */
  exposure: number;
  /** Optional bearing (deg) for parallax drift. */
  bearing?: number;
  /** Camera pitch (deg) — drives subtle limb glow near the horizon. */
  pitch?: number;
};

/**
 * Deep-space backdrop behind Mapbox — layered nebula, milky-way band, parallax stars,
 * cosmic dust, and rare shooting stars. Pauses when exposure is near zero.
 */
export function SiMapSpaceBackdrop({ exposure, bearing = 0, pitch = 0 }: SiMapSpaceBackdropProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<StarSeed[]>([]);
  const dustRef = useRef<DustParticle[]>([]);
  const cometsRef = useRef<Comet[]>([]);
  const milkyGrainsRef = useRef<MilkyWayGrain[]>([]);
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
      dustRef.current = buildDust(canvas.width, canvas.height);
      cometsRef.current = [];
      milkyGrainsRef.current = buildMilkyWayGrains(Math.floor(Math.random() * 1_000_000));
      nextCometAtRef.current = performance.now() + COMET_MIN_GAP_MS + Math.random() * 6000;
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || exposure < 0.04) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let lastT = 0;
    const driftRad = (bearing * Math.PI) / 180;

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

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      drawMilkyWayBand(ctx, canvas.width, canvas.height, exposure, milkyGrainsRef.current);
      drawHorizonGlow(ctx, canvas.width, canvas.height, exposure, pitch);

      const driftX = reducedMotion ? 0 : Math.cos(driftRad) * t * 0.000012;
      const driftY = reducedMotion ? 0 : Math.sin(driftRad) * t * 0.000009;

      for (const star of starsRef.current) {
        const twinkle = reducedMotion ? 1 : starTwinkle(star, t);
        const depthMul = parallaxForDepth(star.depth);
        const alpha = star.base * twinkle * exposure * (star.depth === 'far' ? 0.88 : 1);
        if (alpha < 0.03) continue;

        let x = star.x + driftX * depthMul;
        let y = star.y + driftY * depthMul;
        x = ((x % canvas.width) + canvas.width) % canvas.width;
        y = ((y % canvas.height) + canvas.height) % canvas.height;

        const [red, green, blue] = star.rgb;

        if (!reducedMotion && star.r > 0.95 && twinkle > 0.78) {
          ctx.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha * 0.1})`;
          ctx.beginPath();
          ctx.arc(x, y, star.r * (star.depth === 'near' ? 3.4 : 2.4), 0, Math.PI * 2);
          ctx.fill();
        }

        if (star.spikes && !reducedMotion && twinkle > 0.72) {
          drawStarSpikes(ctx, x, y, star.r, alpha, star.rgb, t, star.phase);
        }

        ctx.fillStyle = `rgba(${red}, ${green}, ${blue}, ${Math.min(1, alpha)})`;
        ctx.beginPath();
        ctx.arc(x, y, star.r, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!reducedMotion) {
        for (const grain of dustRef.current) {
          const gx = ((grain.x + driftX * grain.drift * 2.2) % canvas.width + canvas.width) % canvas.width;
          const gy = ((grain.y + driftY * grain.drift * 1.6 + Math.sin(t * 0.0004 + grain.phase) * 2) %
            canvas.height +
            canvas.height) %
            canvas.height;
          const ga = grain.alpha * exposure * (0.7 + 0.3 * Math.sin(t * 0.001 + grain.phase));
          ctx.fillStyle = `rgba(200, 220, 255, ${ga})`;
          ctx.beginPath();
          ctx.arc(gx, gy, grain.r, 0, Math.PI * 2);
          ctx.fill();
        }

        maybeSpawnComet(t);
        const nextComets: Comet[] = [];
        for (const comet of cometsRef.current) {
          comet.x += comet.vx * dt;
          comet.y += comet.vy * dt;
          comet.age += dt;
          if (comet.age < comet.duration + 240) {
            drawComet(ctx, comet, exposure);
            nextComets.push(comet);
          }
        }
        cometsRef.current = nextComets;
      }
    };

    const loop = (t: number) => {
      const dt = lastT ? Math.min(48, t - lastT) : 16;
      lastT = t;
      draw(t, dt);
      raf = requestAnimationFrame(loop);
    };

    draw(performance.now(), 16);
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [exposure, bearing, pitch]);

  if (exposure < 0.02) return null;

  const pitchGlow = Math.min(1, Math.max(0, ((pitch - 38) / 42) * exposure));

  return (
    <div
      className="si-map-space-backdrop"
      aria-hidden
      style={{
        opacity: Math.min(1, exposure * 1.08),
        ['--si-space-horizon-glow' as string]: String(pitchGlow),
      }}
    >
      <div className="si-map-space-backdrop__vignette" />
      <div className="si-map-space-backdrop__nebula si-map-space-backdrop__nebula--deep" />
      <div className="si-map-space-backdrop__nebula si-map-space-backdrop__nebula--mid" />
      <div className="si-map-space-backdrop__nebula si-map-space-backdrop__nebula--near" />
      <div className="si-map-space-backdrop__aurora" />
      <div className="si-map-space-backdrop__horizon" />
      <canvas ref={canvasRef} className="si-map-space-backdrop__stars" />
    </div>
  );
}
