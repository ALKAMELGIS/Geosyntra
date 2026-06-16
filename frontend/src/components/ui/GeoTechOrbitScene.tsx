import React, { useMemo } from 'react'
import { cn } from '../../lib/utils'
import './gs-globe.css'
import './gs-tech-globe.css'

type OrbitSpec = {
  rx: number
  ry: number
  tiltX: number
  tiltY: number
  duration: number
  delay: number
  reverse?: boolean
}

const ORBIT_SPECS: OrbitSpec[] = [
  { rx: 1.14, ry: 1.14, tiltX: 68, tiltY: 8, duration: 24, delay: 0 },
  { rx: 1.22, ry: 1.17, tiltX: 62, tiltY: 58, duration: 28, delay: -5, reverse: true },
  { rx: 1.28, ry: 1.28, tiltX: 74, tiltY: 118, duration: 26, delay: -9 },
  { rx: 1.34, ry: 1.2, tiltX: 56, tiltY: 168, duration: 30, delay: -14, reverse: true },
  { rx: 1.18, ry: 1.3, tiltX: 71, tiltY: 228, duration: 27, delay: -7 },
  { rx: 1.4, ry: 1.36, tiltX: 64, tiltY: 292, duration: 32, delay: -18, reverse: true },
]

const MESH_NODES: { top: string; left: string; delay: number }[] = [
  { top: '18%', left: '42%', delay: 0 },
  { top: '32%', left: '68%', delay: 0.4 },
  { top: '48%', left: '22%', delay: 0.8 },
  { top: '55%', left: '78%', delay: 1.1 },
  { top: '62%', left: '48%', delay: 0.2 },
  { top: '72%', left: '30%', delay: 1.4 },
  { top: '28%', left: '28%', delay: 0.6 },
  { top: '38%', left: '88%', delay: 1.8 },
  { top: '78%', left: '62%', delay: 0.9 },
  { top: '22%', left: '58%', delay: 1.2 },
  { top: '68%', left: '82%', delay: 0.3 },
  { top: '44%', left: '12%', delay: 1.6 },
]

export type GeoTechOrbitSceneProps = {
  size?: number
  satellites?: number
  live?: boolean
  /** Multiplier for orbit ring spin duration (e.g. 1.38 = medium-relaxed). */
  orbitPace?: number
  className?: string
  children?: React.ReactNode
}

export function GeoTechOrbitScene({
  size = 280,
  satellites = 6,
  live = false,
  orbitPace = 1,
  className,
  children,
}: GeoTechOrbitSceneProps) {
  const px = `${size}px`
  const orbitCount = Math.min(Math.max(0, satellites), ORBIT_SPECS.length)
  const activeOrbits = useMemo(() => ORBIT_SPECS.slice(0, orbitCount), [orbitCount])

  return (
    <div className={cn('gs-tech-scene', className)} style={{ width: px, height: px }}>
      {orbitCount > 0 ? (
        <div
          className={cn(
            'gs-globe-orbit-field gs-tech-orbit-field--tech',
            live && 'gs-globe-orbit-field--rs',
          )}
          aria-hidden
        >
          {activeOrbits.map((orbit, index) => (
            <div
              key={index}
              className="gs-globe-orbit-plane"
              style={{ transform: `rotateX(${orbit.tiltX}deg) rotateY(${orbit.tiltY}deg)` }}
            >
              <div
                className={
                  orbit.reverse ? 'gs-globe-orbit-track gs-globe-orbit-track--reverse' : 'gs-globe-orbit-track'
                }
                style={{
                  width: `calc(${px} * ${orbit.rx})`,
                  height: `calc(${px} * ${orbit.ry})`,
                  ['--gs-orbit-duration' as string]: `${orbit.duration * orbitPace}s`,
                  ['--gs-orbit-delay' as string]: `${orbit.delay}s`,
                }}
              >
                <span className="gs-globe-satellite" />
                {live ? <span className="gs-rs-beam" aria-hidden /> : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className={cn('gs-tech-mesh-wrap', live && 'gs-tech-mesh-wrap--live')}>
        <div className="gs-tech-glass-ring gs-tech-glass-ring--1" />
        <div className="gs-tech-glass-ring gs-tech-glass-ring--2" />
        <div className="gs-tech-mesh-core" />
        <div className="gs-tech-mesh-wire" aria-hidden>
          <span className="gs-tech-ring-line gs-tech-ring-line--lat-1" />
          <span className="gs-tech-ring-line gs-tech-ring-line--lat-2" />
          <span className="gs-tech-ring-line gs-tech-ring-line--lat-3" />
          <span className="gs-tech-ring-line gs-tech-ring-line--lat-4" />
          <span className="gs-tech-ring-line gs-tech-ring-line--lat-5" />
          <span className="gs-tech-ring-line gs-tech-ring-line--lat-6" />
          <span className="gs-tech-ring-line gs-tech-ring-line--lat-7" />
          <span className="gs-tech-ring-line gs-tech-ring-line--lat-8" />
          <span className="gs-tech-meridian gs-tech-meridian--1" />
          <span className="gs-tech-meridian gs-tech-meridian--2" />
          <span className="gs-tech-meridian gs-tech-meridian--3" />
          <span className="gs-tech-meridian gs-tech-meridian--4" />
          <span className="gs-tech-meridian gs-tech-meridian--5" />
          <span className="gs-tech-meridian gs-tech-meridian--6" />
        </div>
        <div className="gs-tech-node-field" aria-hidden>
          {MESH_NODES.map((n, i) => (
            <span
              key={i}
              className="gs-tech-node"
              style={{
                top: n.top,
                left: n.left,
                animationDelay: `${n.delay}s`,
              }}
            />
          ))}
        </div>
      </div>

      {children ? <div className="gs-tech-scene__center">{children}</div> : null}
    </div>
  )
}
