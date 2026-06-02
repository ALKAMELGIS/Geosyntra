import React, { useMemo } from 'react'
import { GeoTechOrbitScene } from './GeoTechOrbitScene'
import './gs-globe.css'

/**
 * Geosyntra Globe — cinematic Earth texture with atmospheric lighting stack
 * and optional orbital satellites for the integrated home hero.
 */
type GlobeOrbitSpec = {
  rx: number
  ry: number
  tiltX: number
  tiltY: number
  duration: number
  delay: number
  reverse?: boolean
}

const SATELLITE_ORBITS: GlobeOrbitSpec[] = [
  { rx: 1.14, ry: 1.14, tiltX: 68, tiltY: 8, duration: 24, delay: 0 },
  { rx: 1.22, ry: 1.17, tiltX: 62, tiltY: 58, duration: 28, delay: -5, reverse: true },
  { rx: 1.28, ry: 1.28, tiltX: 74, tiltY: 118, duration: 26, delay: -9 },
  { rx: 1.34, ry: 1.2, tiltX: 56, tiltY: 168, duration: 30, delay: -14, reverse: true },
  { rx: 1.18, ry: 1.3, tiltX: 71, tiltY: 228, duration: 27, delay: -7 },
  { rx: 1.4, ry: 1.36, tiltX: 64, tiltY: 292, duration: 32, delay: -18, reverse: true },
]

type GlobeProps = {
  /** Base sphere diameter in CSS pixels (scaled further by scroll motion). */
  size?: number
  /** Number of orbiting satellites (0 to hide). Default 6. */
  satellites?: number
  /** Innovation scene — spectral downlink beams + surface receive glow. */
  rsLive?: boolean
  /** `earth` — textured globe; `tech` — wireframe mesh + glass rings. */
  variant?: 'earth' | 'tech'
}

const GLOBE_TEXTURE_URL =
  'https://pub-940ccf6255b54fa799a9b01050e6c227.r2.dev/globe.jpeg'

const Globe: React.FC<GlobeProps> = ({
  size = 280,
  satellites = 6,
  rsLive = false,
  variant = 'earth',
}) => {
  if (variant === 'tech') {
    return (
      <GeoTechOrbitScene size={size} satellites={satellites} live={rsLive} className="mx-auto" />
    )
  }

  const px = `${size}px`
  const orbitCount = Math.min(Math.max(0, satellites), SATELLITE_ORBITS.length)
  const activeOrbits = useMemo(() => SATELLITE_ORBITS.slice(0, orbitCount), [orbitCount])

  return (
    <div
      className="gs-globe-shell flex items-center justify-center"
      style={{ width: px, height: px }}
    >
      {orbitCount > 0 ? (
        <div
          className={rsLive ? 'gs-globe-orbit-field gs-globe-orbit-field--rs' : 'gs-globe-orbit-field'}
          aria-hidden
        >
          {activeOrbits.map((orbit, index) => (
            <div
              key={index}
              className="gs-globe-orbit-plane"
              style={{
                transform: `rotateX(${orbit.tiltX}deg) rotateY(${orbit.tiltY}deg)`,
              }}
            >
              <div
                className={
                  orbit.reverse
                    ? 'gs-globe-orbit-track gs-globe-orbit-track--reverse'
                    : 'gs-globe-orbit-track'
                }
                style={{
                  width: `calc(${px} * ${orbit.rx})`,
                  height: `calc(${px} * ${orbit.ry})`,
                  ['--gs-orbit-duration' as string]: `${orbit.duration}s`,
                  ['--gs-orbit-delay' as string]: `${orbit.delay}s`,
                }}
              >
                <span className="gs-globe-satellite" />
                {rsLive ? <span className="gs-rs-beam" aria-hidden /> : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div
        className={
          rsLive
            ? 'gs-globe-earth gs-globe-earth--rs-live relative rounded-full overflow-hidden shadow-[0_0_20px_rgba(255,255,255,0.2),-5px_0_8px_#c3f4ff_inset,15px_2px_25px_#000_inset,-24px_-2px_34px_#c3f4ff99_inset,250px_0_44px_#00000066_inset,150px_0_38px_#000000aa_inset]'
            : 'gs-globe-earth relative rounded-full overflow-hidden shadow-[0_0_20px_rgba(255,255,255,0.2),-5px_0_8px_#c3f4ff_inset,15px_2px_25px_#000_inset,-24px_-2px_34px_#c3f4ff99_inset,250px_0_44px_#00000066_inset,150px_0_38px_#000000aa_inset]'
        }
        style={{
          width: px,
          height: px,
          backgroundImage: `url('${GLOBE_TEXTURE_URL}')`,
          backgroundSize: '200% 100%',
          backgroundRepeat: 'repeat-x',
          backgroundPosition: '50% 50%',
        }}
      >
        <div
          aria-hidden
          className="gs-globe-star gs-globe-star--a absolute left-[-20px] w-1 h-1 bg-white rounded-full"
        />
        <div
          aria-hidden
          className="gs-globe-star gs-globe-star--b absolute left-[-40px] top-[30px] w-1 h-1 bg-white rounded-full"
        />
        <div
          aria-hidden
          className="gs-globe-star gs-globe-star--c absolute left-[350px] top-[90px] w-1 h-1 bg-white rounded-full"
        />
        <div
          aria-hidden
          className="gs-globe-star gs-globe-star--d absolute left-[200px] top-[290px] w-1 h-1 bg-white rounded-full"
        />
        <div
          aria-hidden
          className="gs-globe-star gs-globe-star--e absolute left-[50px] top-[270px] w-1 h-1 bg-white rounded-full"
        />
        <div
          aria-hidden
          className="gs-globe-star gs-globe-star--f absolute left-[250px] top-[-50px] w-1 h-1 bg-white rounded-full"
        />
        <div
          aria-hidden
          className="gs-globe-star gs-globe-star--g absolute left-[290px] top-[60px] w-1 h-1 bg-white rounded-full"
        />
      </div>
    </div>
  )
}

export default React.memo(Globe)
