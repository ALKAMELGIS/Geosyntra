import { useMemo, type CSSProperties } from 'react'

/**
 * Photoreal scrolling Earth used as the hero artwork on the Geosyntra landing.
 *
 * Self-contained: ships its own keyframes (rotate + twinkle), uses a locally
 * bundled equirectangular Earth image (`/landing/globe.jpeg`) so it never relies
 * on third-party CDNs, and renders an atmospheric inset shadow + starfield so
 * it sits cleanly on the AI black-glass background.
 */

const GLOBE_SIZE = 280

const STARS: { left: number; top: number; size: number; duration: number; delay: number }[] = [
  { left: -22, top: 14, size: 1.2, duration: 2.8, delay: 0.0 },
  { left: -42, top: 60, size: 1.4, duration: 3.6, delay: 0.4 },
  { left: 372, top: 42, size: 1.0, duration: 2.4, delay: 1.2 },
  { left: 318, top: 88, size: 1.4, duration: 3.0, delay: 0.6 },
  { left: 268, top: -32, size: 1.2, duration: 4.0, delay: 0.2 },
  { left: 110, top: -28, size: 1.0, duration: 2.4, delay: 1.6 },
  { left: 78, top: 320, size: 1.2, duration: 3.4, delay: 0.0 },
  { left: 220, top: 332, size: 1.4, duration: 2.6, delay: 0.8 },
  { left: 360, top: 290, size: 1.0, duration: 3.2, delay: 0.5 },
  { left: -28, top: 230, size: 1.2, duration: 2.0, delay: 0.9 },
]

export default function Globe() {
  const globeUrl = useMemo(() => `${import.meta.env.BASE_URL ?? '/'}landing/globe.jpeg`, [])

  const wrapperStyle = useMemo<CSSProperties>(
    () => ({
      width: GLOBE_SIZE,
      height: GLOBE_SIZE,
    }),
    [],
  )

  const earthStyle = useMemo<CSSProperties>(
    () => ({
      backgroundImage: `url('${globeUrl}')`,
      backgroundSize: 'cover',
      backgroundPosition: 'left',
      animation: 'gs-earth-rotate 32s linear infinite',
    }),
    [globeUrl],
  )

  return (
    <>
      <style>
        {`
          @keyframes gs-earth-rotate {
            0%   { background-position: 0 0; }
            100% { background-position: ${GLOBE_SIZE * 4}px 0; }
          }
          @keyframes gs-twinkle {
            0%, 100% { opacity: 0.15; transform: scale(0.85); }
            50%      { opacity: 1;    transform: scale(1.15); }
          }
          @keyframes gs-globe-halo {
            0%, 100% { opacity: 0.55; transform: scale(1); }
            50%      { opacity: 0.85; transform: scale(1.04); }
          }
          @media (prefers-reduced-motion: reduce) {
            .gs-globe-earth, .gs-globe-star, .gs-globe-halo {
              animation: none !important;
            }
          }
        `}
      </style>
      <div className="relative flex items-center justify-center" style={wrapperStyle}>
        <div
          aria-hidden
          className="gs-globe-halo absolute inset-[-22%] rounded-full pointer-events-none"
          style={{
            background:
              'radial-gradient(closest-side, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 40%, transparent 75%)',
            filter: 'blur(10px)',
            animation: 'gs-globe-halo 6s ease-in-out infinite',
          }}
        />

        <div
          className="gs-globe-earth relative w-full h-full rounded-full overflow-hidden"
          style={{
            ...earthStyle,
            boxShadow:
              '0 0 26px rgba(255, 255, 255, 0.18), -6px 0 10px rgba(186, 230, 253, 0.55) inset, 18px 2px 28px rgba(0, 0, 0, 0.85) inset, -28px -4px 38px rgba(186, 230, 253, 0.32) inset, 250px 0 60px rgba(0, 0, 0, 0.55) inset, 150px 0 40px rgba(0, 0, 0, 0.78) inset',
          }}
        >
          {STARS.map((s, i) => (
            <span
              key={i}
              aria-hidden
              className="gs-globe-star absolute rounded-full bg-white"
              style={{
                left: s.left,
                top: s.top,
                width: s.size,
                height: s.size,
                animation: `gs-twinkle ${s.duration}s ease-in-out ${s.delay}s infinite`,
                boxShadow: '0 0 4px rgba(255,255,255,0.65)',
              }}
            />
          ))}
        </div>
      </div>
    </>
  )
}
