import React from 'react'

/** Earth texture (Unsplash — space / planet imagery). */
const GLOBE_BG =
  'https://images.unsplash.com/photo-1614730344863-4f3916fcbc53?auto=format&fit=crop&w=900&q=80'

const Globe: React.FC = () => {
  return (
    <>
      <style>
        {`
          @keyframes earthRotate {
            0% { background-position: 0% center; }
            100% { background-position: 200% center; }
          }
          @keyframes twinkling { 0%, 100% { opacity: 0.15; } 50% { opacity: 1; } }
          @keyframes twinkling-slow { 0%, 100% { opacity: 0.12; } 50% { opacity: 0.95; } }
          @keyframes twinkling-long { 0%, 100% { opacity: 0.1; } 50% { opacity: 1; } }
          @keyframes twinkling-fast { 0%, 100% { opacity: 0.18; } 50% { opacity: 1; } }
        `}
      </style>
      <div className="flex w-full items-center justify-center py-4 sm:py-6">
        <div
          className="relative h-[220px] w-[220px] overflow-hidden rounded-full shadow-[0_0_24px_rgba(56,189,248,0.25),inset_-8px_0_20px_rgba(0,0,0,0.45)] sm:h-[250px] sm:w-[250px]"
          style={{
            backgroundImage: `url('${GLOBE_BG}')`,
            backgroundSize: 'cover',
            backgroundPosition: 'left center',
            animation: 'earthRotate 36s linear infinite',
          }}
        >
          <div
            className="absolute left-[12%] top-[18%] h-1 w-1 rounded-full bg-white"
            style={{ animation: 'twinkling 3s infinite' }}
          />
          <div
            className="absolute left-[78%] top-[22%] h-1 w-1 rounded-full bg-white"
            style={{ animation: 'twinkling-slow 2.4s infinite' }}
          />
          <div
            className="absolute left-[52%] top-[68%] h-1 w-1 rounded-full bg-white"
            style={{ animation: 'twinkling-long 4s infinite' }}
          />
          <div
            className="absolute left-[30%] top-[72%] h-1 w-1 rounded-full bg-white"
            style={{ animation: 'twinkling-fast 1.6s infinite' }}
          />
          <div
            className="absolute left-[88%] top-[55%] h-1 w-1 rounded-full bg-white"
            style={{ animation: 'twinkling 2.8s infinite 0.4s' }}
          />
        </div>
      </div>
    </>
  )
}

export default Globe
