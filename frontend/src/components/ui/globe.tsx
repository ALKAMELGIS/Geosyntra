import React from 'react'

/**
 * Geosyntra Globe — cinematic Earth texture with atmospheric lighting stack.
 */
type GlobeProps = {
  /** Base sphere diameter in CSS pixels (scaled further by scroll motion). */
  size?: number
}

const Globe: React.FC<GlobeProps> = ({ size = 280 }) => {
  const px = `${size}px`
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
      <div
        className="gs-globe-shell flex items-center justify-center"
        style={{ width: px, height: px }}
      >
        <div
          className="gs-globe-earth relative rounded-full overflow-hidden shadow-[0_0_20px_rgba(255,255,255,0.2),-5px_0_8px_#c3f4ff_inset,15px_2px_25px_#000_inset,-24px_-2px_34px_#c3f4ff99_inset,250px_0_44px_#00000066_inset,150px_0_38px_#000000aa_inset]"
          style={{
            width: px,
            height: px,
            backgroundImage:
              "url('https://pub-940ccf6255b54fa799a9b01050e6c227.r2.dev/globe.jpeg')",
            backgroundSize: '200% 100%',
            backgroundRepeat: 'repeat-x',
            backgroundPosition: '0 50%',
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
