import { useEffect, useRef } from 'react';
import {
  siMapWeatherCloudVeilStrength,
  siMapWeatherNeedsParticleOverlay,
} from '../utils/siMapWeatherEffects';
import type { SiMapWeatherSettings } from '../utils/siMapWeatherTypes';

type Particle = { x: number; y: number; vx: number; vy: number; len: number; phase: number };

export type SiMapWeatherOverlayProps = {
  settings: SiMapWeatherSettings;
  active: boolean;
};

export function SiMapWeatherOverlay({ settings, active }: SiMapWeatherOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !active) return;

    const showParticles = siMapWeatherNeedsParticleOverlay(settings);
    const veil = siMapWeatherCloudVeilStrength(settings);
    if (!showParticles && veil < 0.03) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    const resize = () => {
      const r = parent.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(r.width * dpr));
      canvas.height = Math.max(1, Math.floor(r.height * dpr));
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(parent);

    const isSnow = settings.preset === 'snow';
    const count = Math.floor(
      (showParticles ? 40 + (settings.precipitation / 100) * (isSnow ? 220 : 180) : 0) +
        veil * 24,
    );
    particlesRef.current = Array.from({ length: count }, () => ({
      x: Math.random() * parent.clientWidth,
      y: Math.random() * parent.clientHeight,
      vx: (Math.random() - 0.5) * (isSnow ? 0.6 : 0.2),
      vy: 2 + Math.random() * (isSnow ? 2.5 : 6) * (settings.precipitation / 100 + 0.25),
      len: isSnow ? 2 + Math.random() * 3 : 8 + Math.random() * 14,
      phase: Math.random() * Math.PI * 2,
    }));

    let t0 = performance.now();
    const tick = (now: number) => {
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      ctx.clearRect(0, 0, w, h);

      if (veil > 0.03) {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, `rgba(248, 250, 252, ${0.02 + veil * 0.12})`);
        g.addColorStop(0.45, `rgba(203, 213, 225, ${0.04 + veil * 0.18})`);
        g.addColorStop(1, `rgba(148, 163, 184, ${0.02 + veil * 0.1})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }

      if (showParticles) {
        const dt = Math.min(32, now - t0);
        t0 = now;
        ctx.lineCap = 'round';
        for (const p of particlesRef.current) {
          p.x += p.vx * (dt / 16);
          p.y += p.vy * (dt / 16);
          if (p.y > h + 12) {
            p.y = -8;
            p.x = Math.random() * w;
          }
          if (p.x < -8) p.x = w + 8;
          if (p.x > w + 8) p.x = -8;

          if (isSnow) {
            ctx.fillStyle = `rgba(255,255,255,${0.35 + (settings.precipitation / 100) * 0.55})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 1.1 + (p.phase % 1.2), 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.strokeStyle = `rgba(148, 163, 184, ${0.25 + (settings.precipitation / 100) * 0.45})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x + p.vx * 2, p.y + p.len);
            ctx.stroke();
          }
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafRef.current);
    };
  }, [active, settings]);

  if (!active) return null;

  const show =
    siMapWeatherNeedsParticleOverlay(settings) || siMapWeatherCloudVeilStrength(settings) > 0.03;
  if (!show) return null;

  return (
    <canvas
      ref={canvasRef}
      className="si-map-weather-overlay"
      aria-hidden
      data-si-weather-overlay=""
    />
  );
}
