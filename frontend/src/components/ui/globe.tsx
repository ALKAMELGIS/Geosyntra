import React from 'react'

/**
 * Geosyntra Globe — 1:1 port of the upstream `m.umairwaheedansari/landing-page`
 * bundle (https://21st.dev/r/m.umairwaheedansari/landing-page).
 *
 * Why we keep the upstream R2 URL instead of bundling locally:
 *   The previous local rewrite (`/landing/globe.jpeg` via
 *   `import.meta.env.BASE_URL`) failed on GitHub Pages — the asset path
 *   resolved through Vite's `base` indirection and rendered as a flat dark
 *   blob (no Earth texture). Pulling the texture straight from the same
 *   Cloudflare R2 bucket the upstream demo ships restores the cinematic
 *   wrap (continents lit by the cyan inset, terminator on the right edge,
 *   subtle outer glow) shown in the reference render. The bucket is the
 *   shadcn-registry origin, so it carries the same uptime + caching as the
 *   upstream component.
 *
 * The shadow stack is what creates the "planet from space" illusion:
 *   - Outer 20px white halo  → atmospheric corona
 *   - Cyan inset (-5px / -24px) on the upper-left → sun lighting
 *   - Black inset (250px) on the right → terminator (planet's dark side)
 *   - Black inset (150px) deeper inside the right hemisphere → core shadow
 * Removing or rewriting any of these breaks the sphere illusion, so the
 * stack is preserved verbatim from the upstream snippet.
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
          @media (prefers-reduced-motion: reduce) {
            .gs-globe-earth, .gs-globe-star { animation: none !important; }
          }
        `}
      </style>
      <div className="flex items-center justify-center h-screen">
        <div
          className="gs-globe-earth relative w-[250px] h-[250px] rounded-full overflow-hidden shadow-[0_0_20px_rgba(255,255,255,0.2),-5px_0_8px_#c3f4ff_inset,15px_2px_25px_#000_inset,-24px_-2px_34px_#c3f4ff99_inset,250px_0_44px_#00000066_inset,150px_0_38px_#000000aa_inset]"
          style={{
            backgroundImage:
              "url('https://pub-940ccf6255b54fa799a9b01050e6c227.r2.dev/globe.jpeg')",
            backgroundSize: 'cover',
            backgroundPosition: 'left',
            animation: 'earthRotate 30s linear infinite',
          }}
        >
          <div
            aria-hidden
            className="gs-globe-star absolute left-[-20px] w-1 h-1 bg-white rounded-full"
            style={{ animation: 'twinkling 3s infinite' }}
          />
          <div
            aria-hidden
            className="gs-globe-star absolute left-[-40px] top-[30px] w-1 h-1 bg-white rounded-full"
            style={{ animation: 'twinkling-slow 2s infinite' }}
          />
          <div
            aria-hidden
            className="gs-globe-star absolute left-[350px] top-[90px] w-1 h-1 bg-white rounded-full"
            style={{ animation: 'twinkling-long 4s infinite' }}
          />
          <div
            aria-hidden
            className="gs-globe-star absolute left-[200px] top-[290px] w-1 h-1 bg-white rounded-full"
            style={{ animation: 'twinkling 3s infinite' }}
          />
          <div
            aria-hidden
            className="gs-globe-star absolute left-[50px] top-[270px] w-1 h-1 bg-white rounded-full"
            style={{ animation: 'twinkling-fast 1.5s infinite' }}
          />
          <div
            aria-hidden
            className="gs-globe-star absolute left-[250px] top-[-50px] w-1 h-1 bg-white rounded-full"
            style={{ animation: 'twinkling-long 4s infinite' }}
          />
          <div
            aria-hidden
            className="gs-globe-star absolute left-[290px] top-[60px] w-1 h-1 bg-white rounded-full"
            style={{ animation: 'twinkling-slow 2s infinite' }}
          />
        </div>
      </div>
    </>
  )
}

export default Globe
