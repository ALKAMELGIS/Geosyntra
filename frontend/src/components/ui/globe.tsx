import React from 'react'

const GLOBE_TEXTURE_URL =
  'https://pub-940ccf6255b54fa799a9b01050e6c227.r2.dev/globe.jpeg'

/**
 * Geosyntra Globe — textured Earth with layered sky-blue halo, inner limb light,
 * and depth shadows so the map reads as embedded inside a luminous sphere.
 */
const Globe: React.FC = () => {
  return (
    <>
      <style>
        {`
          @keyframes earthRotate {
            0% { background-position: 0 0; }
            100% { background-position: 400px 0; }
          }
          @keyframes twinkling { 0%,100% { opacity:0.1; } 50% { opacity:1; } }
          @keyframes twinkling-slow { 0%,100% { opacity:0.1; } 50% { opacity:1; } }
          @keyframes twinkling-long { 0%,100% { opacity:0.1; } 50% { opacity:1; } }
          @keyframes twinkling-fast { 0%,100% { opacity:0.1; } 50% { opacity:1; } }
          @keyframes gs-globe-halo-pulse {
            0%, 100% { opacity: 0.72; transform: scale(1); }
            50% { opacity: 0.95; transform: scale(1.03); }
          }
          @keyframes gs-globe-shell-shimmer {
            0%, 100% { opacity: 0.55; }
            50% { opacity: 0.78; }
          }

          .gs-globe {
            position: relative;
            width: 250px;
            height: 250px;
            flex-shrink: 0;
            isolation: isolate;
          }

          .gs-globe-halo {
            position: absolute;
            inset: -22%;
            border-radius: 50%;
            pointer-events: none;
            z-index: 0;
            background:
              radial-gradient(
                circle at 38% 36%,
                rgba(186, 230, 255, 0.55) 0%,
                rgba(56, 189, 248, 0.28) 28%,
                rgba(14, 165, 233, 0.12) 52%,
                transparent 72%
              );
            filter: blur(18px);
            animation: gs-globe-halo-pulse 6s ease-in-out infinite;
          }

          .gs-globe-halo--outer {
            inset: -32%;
            z-index: -1;
            opacity: 0.65;
            background:
              radial-gradient(
                circle at 42% 40%,
                rgba(125, 211, 252, 0.35) 0%,
                rgba(56, 189, 248, 0.14) 45%,
                transparent 70%
              );
            filter: blur(28px);
            animation: gs-globe-halo-pulse 8s ease-in-out infinite reverse;
          }

          .gs-globe-shell {
            position: absolute;
            inset: -5%;
            border-radius: 50%;
            pointer-events: none;
            z-index: 1;
            border: 1px solid rgba(186, 230, 255, 0.28);
            background:
              radial-gradient(
                circle at 34% 32%,
                rgba(224, 242, 254, 0.22) 0%,
                rgba(125, 211, 252, 0.08) 42%,
                rgba(2, 6, 23, 0.35) 88%,
                rgba(0, 0, 0, 0.5) 100%
              );
            box-shadow:
              0 0 36px rgba(125, 211, 252, 0.42),
              0 0 72px rgba(56, 189, 248, 0.18),
              inset 0 0 28px rgba(186, 230, 255, 0.2),
              inset 0 0 64px rgba(14, 165, 233, 0.12);
            animation: gs-globe-shell-shimmer 5s ease-in-out infinite;
          }

          .gs-globe-earth {
            position: relative;
            z-index: 2;
            width: 100%;
            height: 100%;
            border-radius: 50%;
            overflow: hidden;
            box-shadow:
              0 0 22px rgba(255, 255, 255, 0.18),
              0 0 48px rgba(125, 211, 252, 0.38),
              0 0 88px rgba(56, 189, 248, 0.16),
              -6px 0 12px rgba(195, 244, 255, 0.65) inset,
              -28px -4px 38px rgba(147, 220, 255, 0.45) inset,
              16px 4px 28px rgba(0, 0, 0, 0.72) inset,
              220px 0 48px rgba(0, 0, 0, 0.55) inset,
              140px 0 40px rgba(0, 0, 0, 0.72) inset;
          }

          .gs-globe-inner-light {
            position: absolute;
            inset: 0;
            border-radius: 50%;
            pointer-events: none;
            z-index: 3;
            mix-blend-mode: screen;
            opacity: 0.72;
            background:
              radial-gradient(
                circle at 30% 34%,
                rgba(224, 242, 254, 0.75) 0%,
                rgba(186, 230, 255, 0.35) 22%,
                rgba(56, 189, 248, 0.12) 48%,
                transparent 68%
              );
          }

          .gs-globe-limb {
            position: absolute;
            inset: 0;
            border-radius: 50%;
            pointer-events: none;
            z-index: 4;
            background:
              radial-gradient(
                circle at 50% 50%,
                transparent 48%,
                rgba(2, 12, 27, 0.18) 72%,
                rgba(0, 0, 0, 0.42) 92%,
                rgba(0, 0, 0, 0.55) 100%
              );
          }

          .gs-globe-rim-glow {
            position: absolute;
            inset: 0;
            border-radius: 50%;
            pointer-events: none;
            z-index: 5;
            box-shadow:
              inset 0 0 18px rgba(186, 230, 255, 0.35),
              inset 0 0 42px rgba(56, 189, 248, 0.14);
          }

          @media (prefers-reduced-motion: reduce) {
            .gs-globe-earth,
            .gs-globe-star,
            .gs-globe-halo,
            .gs-globe-shell {
              animation: none !important;
            }
          }
        `}
      </style>
      <div className="gs-globe" aria-hidden>
        <div className="gs-globe-halo gs-globe-halo--outer" />
        <div className="gs-globe-halo" />
        <div className="gs-globe-shell" />
        <div
          className="gs-globe-earth"
          style={{
            backgroundImage: `url('${GLOBE_TEXTURE_URL}')`,
            backgroundSize: 'cover',
            backgroundPosition: 'left',
            animation: 'earthRotate 30s linear infinite',
          }}
        >
          <div className="gs-globe-inner-light" />
          <div className="gs-globe-limb" />
          <div className="gs-globe-rim-glow" />
          <div
            className="gs-globe-star absolute left-[-20px] w-1 h-1 bg-white rounded-full"
            style={{ animation: 'twinkling 3s infinite', zIndex: 6 }}
          />
          <div
            className="gs-globe-star absolute left-[-40px] top-[30px] w-1 h-1 bg-white rounded-full"
            style={{ animation: 'twinkling-slow 2s infinite', zIndex: 6 }}
          />
          <div
            className="gs-globe-star absolute left-[350px] top-[90px] w-1 h-1 bg-white rounded-full"
            style={{ animation: 'twinkling-long 4s infinite', zIndex: 6 }}
          />
          <div
            className="gs-globe-star absolute left-[200px] top-[290px] w-1 h-1 bg-white rounded-full"
            style={{ animation: 'twinkling 3s infinite', zIndex: 6 }}
          />
          <div
            className="gs-globe-star absolute left-[50px] top-[270px] w-1 h-1 bg-white rounded-full"
            style={{ animation: 'twinkling-fast 1.5s infinite', zIndex: 6 }}
          />
          <div
            className="gs-globe-star absolute left-[250px] top-[-50px] w-1 h-1 bg-white rounded-full"
            style={{ animation: 'twinkling-long 4s infinite', zIndex: 6 }}
          />
          <div
            className="gs-globe-star absolute left-[290px] top-[60px] w-1 h-1 bg-white rounded-full"
            style={{ animation: 'twinkling-slow 2s infinite', zIndex: 6 }}
          />
        </div>
      </div>
    </>
  )
}

export default Globe
