import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import Globe from './globe'
import { cn } from '@/lib/utils'

/**
 * 3D scroll-driven landing built around `<Globe />`. Each section pins the globe
 * at a different viewport coordinate / scale so the Earth glides between hero,
 * innovation, discovery, and future panels as the user scrolls.
 *
 * Adapted from https://21st.dev/r/m.umairwaheedansari/landing-page and re-skinned
 * for the Geosyntra Platform AI black-glass theme.
 */

type SectionAlign = 'left' | 'center' | 'right'

export interface ScrollGlobeAction {
  label: string
  variant: 'primary' | 'secondary'
  onClick?: () => void
}

export interface ScrollGlobeFeature {
  title: string
  description: string
}

export interface ScrollGlobeSection {
  id: string
  badge?: string
  title: string
  subtitle?: string
  description: string
  align?: SectionAlign
  features?: ScrollGlobeFeature[]
  actions?: ScrollGlobeAction[]
}

export interface ScrollGlobePosition {
  top: string
  left: string
  scale: number
}

export interface ScrollGlobeProps {
  sections: ScrollGlobeSection[]
  globeConfig?: { positions: ScrollGlobePosition[] }
  className?: string
}

const defaultGlobeConfig = {
  positions: [
    { top: '50%', left: '78%', scale: 1.25 }, // hero — right side, eye level
    { top: '22%', left: '50%', scale: 0.85 }, // innovation — top centre, smaller
    { top: '50%', left: '94%', scale: 1.7 },  // discovery — right edge, half-bleed
    { top: '50%', left: '50%', scale: 1.7 },  // future — full-centre backdrop
  ],
}

const parsePercent = (s: string): number => parseFloat(s.replace('%', ''))

export function ScrollGlobe({ sections, globeConfig = defaultGlobeConfig, className }: ScrollGlobeProps) {
  const [activeSection, setActiveSection] = useState(0)
  const [scrollProgress, setScrollProgress] = useState(0)
  const [globeTransform, setGlobeTransform] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef<(HTMLElement | null)[]>([])
  const animationFrameId = useRef<number | undefined>(undefined)

  const calculatedPositions = useMemo(
    () =>
      globeConfig.positions.map(p => ({
        top: parsePercent(p.top),
        left: parsePercent(p.left),
        scale: p.scale,
      })),
    [globeConfig.positions],
  )

  const updateScrollPosition = useCallback(() => {
    const scrollEl = containerRef.current?.parentElement ?? document.documentElement
    const scrollTop = scrollEl.scrollTop || window.pageYOffset
    const docHeight =
      (scrollEl.scrollHeight || document.documentElement.scrollHeight) -
      (scrollEl.clientHeight || window.innerHeight)
    const progress = docHeight > 0 ? Math.min(Math.max(scrollTop / docHeight, 0), 1) : 0
    setScrollProgress(progress)

    const viewportCenter = window.innerHeight / 2
    let next = 0
    let minDistance = Infinity
    sectionRefs.current.forEach((ref, i) => {
      if (!ref) return
      const rect = ref.getBoundingClientRect()
      const center = rect.top + rect.height / 2
      const dist = Math.abs(center - viewportCenter)
      if (dist < minDistance) {
        minDistance = dist
        next = i
      }
    })

    const idx = Math.min(next, calculatedPositions.length - 1)
    const pos = calculatedPositions[idx]
    setGlobeTransform(
      `translate3d(${pos.left}vw, ${pos.top}vh, 0) translate3d(-50%, -50%, 0) scale3d(${pos.scale}, ${pos.scale}, 1)`,
    )
    setActiveSection(idx)
  }, [calculatedPositions])

  useEffect(() => {
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      animationFrameId.current = window.requestAnimationFrame(() => {
        updateScrollPosition()
        ticking = false
      })
      ticking = true
    }
    const scrollTarget: Window | HTMLElement = containerRef.current?.parentElement ?? window
    scrollTarget.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    updateScrollPosition()
    return () => {
      scrollTarget.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current)
    }
  }, [updateScrollPosition])

  useEffect(() => {
    const initial = calculatedPositions[0]
    setGlobeTransform(
      `translate3d(${initial.left}vw, ${initial.top}vh, 0) translate3d(-50%, -50%, 0) scale3d(${initial.scale}, ${initial.scale}, 1)`,
    )
  }, [calculatedPositions])

  return (
    <div
      ref={containerRef}
      className={cn(
        'gs-scroll-globe relative w-full max-w-screen overflow-x-hidden min-h-screen text-foreground',
        className,
      )}
    >
      <div className="fixed top-0 left-0 w-full h-0.5 bg-gradient-to-r from-border/20 via-border/40 to-border/20 z-50">
        <div
          className="h-full bg-gradient-to-r from-primary via-accent to-primary/60 will-change-transform shadow-sm"
          style={{
            transform: `scaleX(${scrollProgress})`,
            transformOrigin: 'left center',
            transition: 'transform 0.15s ease-out',
            filter: 'drop-shadow(0 0 4px hsl(var(--primary) / 0.45))',
          }}
        />
      </div>

      <nav
        aria-label="Section navigation"
        className="hidden sm:flex fixed right-2 sm:right-4 lg:right-8 top-1/2 -translate-y-1/2 z-40"
      >
        <div className="space-y-3 sm:space-y-4 lg:space-y-6">
          {sections.map((section, index) => (
            <div key={section.id} className="relative group">
              <div
                className={cn(
                  'nav-label absolute right-5 sm:right-6 lg:right-8 top-1/2 -translate-y-1/2',
                  'px-2 sm:px-3 lg:px-4 py-1 sm:py-1.5 lg:py-2 rounded-md sm:rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap',
                  'bg-background/80 backdrop-blur-md border border-border/60 shadow-xl z-50',
                  activeSection === index ? 'animate-fadeOut' : 'opacity-0',
                )}
              >
                <div className="flex items-center gap-1 sm:gap-1.5 lg:gap-2">
                  <span className="w-1 sm:w-1.5 lg:w-2 h-1 sm:h-1.5 lg:h-2 rounded-full bg-primary animate-pulse" />
                  <span className="text-xs sm:text-sm lg:text-base">
                    {section.badge ?? `Section ${index + 1}`}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  sectionRefs.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }
                className={cn(
                  'relative w-2 h-2 sm:w-2.5 sm:h-2.5 lg:w-3 lg:h-3 rounded-full border-2 transition-all duration-300 hover:scale-125',
                  'before:absolute before:inset-0 before:rounded-full before:transition-all before:duration-300',
                  activeSection === index
                    ? 'bg-primary border-primary shadow-lg before:animate-ping before:bg-primary/30'
                    : 'bg-transparent border-muted-foreground/40 hover:border-primary/60 hover:bg-primary/10',
                )}
                aria-label={`Go to ${section.badge ?? `section ${index + 1}`}`}
              />
            </div>
          ))}
        </div>
        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 lg:w-px bg-gradient-to-b from-transparent via-primary/20 to-transparent -translate-x-1/2 -z-10" />
      </nav>

      <div
        aria-hidden
        className="fixed inset-0 z-10 pointer-events-none will-change-transform transition-all duration-[1400ms] ease-[cubic-bezier(0.23,1,0.32,1)]"
        style={{
          transform: globeTransform,
          filter: `opacity(${activeSection === sections.length - 1 ? 0.4 : 0.85})`,
        }}
      >
        <div className="scale-75 sm:scale-90 lg:scale-100 origin-center">
          <Globe />
        </div>
      </div>

      {sections.map((section, index) => (
        <section
          key={section.id}
          ref={el => {
            sectionRefs.current[index] = el
          }}
          className={cn(
            'relative min-h-screen flex flex-col justify-center px-4 sm:px-6 md:px-8 lg:px-12 z-20 py-12 sm:py-16 lg:py-20',
            'w-full max-w-full overflow-hidden',
            section.align === 'center' && 'items-center text-center',
            section.align === 'right' && 'items-end text-right',
            section.align !== 'center' && section.align !== 'right' && 'items-start text-left',
          )}
        >
          <div className="w-full max-w-sm sm:max-w-lg md:max-w-2xl lg:max-w-4xl xl:max-w-5xl will-change-transform transition-all duration-700 opacity-100 translate-y-0">
            <h1
              className={cn(
                'font-bold mb-6 sm:mb-8 leading-[1.1] tracking-tight',
                index === 0
                  ? 'text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl 2xl:text-8xl'
                  : 'text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl 2xl:text-7xl',
              )}
            >
              {section.subtitle ? (
                <span className="block space-y-1 sm:space-y-2">
                  <span className="block bg-gradient-to-r from-foreground via-primary to-accent bg-clip-text text-transparent">
                    {section.title}
                  </span>
                  <span className="block text-muted-foreground/90 text-[0.6em] sm:text-[0.7em] font-medium tracking-wider">
                    {section.subtitle}
                  </span>
                </span>
              ) : (
                <span className="bg-gradient-to-r from-foreground via-primary to-accent bg-clip-text text-transparent">
                  {section.title}
                </span>
              )}
            </h1>

            <div
              className={cn(
                'text-muted-foreground/80 leading-relaxed mb-8 sm:mb-10 text-base sm:text-lg lg:text-xl font-light',
                section.align === 'center' ? 'max-w-full mx-auto text-center' : 'max-w-full',
              )}
            >
              <p className="mb-3 sm:mb-4">{section.description}</p>
              {index === 0 && (
                <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs sm:text-sm text-muted-foreground/60 mt-4 sm:mt-6">
                  <span className="flex items-center gap-1.5 sm:gap-2">
                    <span className="w-1 h-1 rounded-full bg-primary animate-pulse" />
                    Interactive Experience
                  </span>
                  <span className="flex items-center gap-1.5 sm:gap-2">
                    <span
                      className="w-1 h-1 rounded-full bg-accent animate-pulse"
                      style={{ animationDelay: '0.5s' }}
                    />
                    Scroll to Explore
                  </span>
                </div>
              )}
            </div>

            {section.features && (
              <div className="grid gap-3 sm:gap-4 mb-8 sm:mb-10">
                {section.features.map(feature => (
                  <div
                    key={feature.title}
                    className={cn(
                      'group p-4 sm:p-5 lg:p-6 rounded-lg sm:rounded-xl border bg-card/50 backdrop-blur-sm hover:bg-card/80 transition-all duration-300',
                      'hover:shadow-lg hover:shadow-primary/10 hover:border-primary/25 hover:-translate-y-1',
                    )}
                  >
                    <div className="flex items-start gap-3 sm:gap-4">
                      <span className="w-1.5 sm:w-2 h-1.5 sm:h-2 rounded-full bg-primary/60 mt-1.5 sm:mt-2 group-hover:bg-primary transition-colors flex-shrink-0" />
                      <div className="flex-1 space-y-1.5 sm:space-y-2 min-w-0">
                        <h3 className="font-semibold text-card-foreground text-base sm:text-lg">
                          {feature.title}
                        </h3>
                        <p className="text-muted-foreground/80 leading-relaxed text-sm sm:text-base">
                          {feature.description}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {section.actions && (
              <div
                className={cn(
                  'flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4',
                  section.align === 'center' && 'justify-center',
                  section.align === 'right' && 'justify-end',
                  (!section.align || section.align === 'left') && 'justify-start',
                )}
              >
                {section.actions.map(action => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={action.onClick}
                    className={cn(
                      'group relative px-6 sm:px-8 py-3 sm:py-4 rounded-lg sm:rounded-xl font-medium transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] text-sm sm:text-base',
                      'hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 w-full sm:w-auto',
                      action.variant === 'primary'
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 hover:shadow-primary/30'
                        : 'border-2 border-border/60 bg-background/40 backdrop-blur-sm hover:bg-accent/20 hover:border-primary/40 text-foreground',
                    )}
                  >
                    <span className="relative z-10">{action.label}</span>
                    {action.variant === 'primary' && (
                      <span
                        aria-hidden
                        className="absolute inset-0 rounded-lg sm:rounded-xl bg-gradient-to-r from-primary via-accent to-primary opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                      />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      ))}
    </div>
  )
}

export interface GlobeScrollDemoProps {
  /** Optional click handlers so embedding pages can wire CTAs to navigation. */
  onPrimaryAction?: () => void
  onSecondaryAction?: () => void
}

/**
 * Geosyntra-flavoured ScrollGlobe demo. Structure, copy length, and rhythm
 * mirror the upstream 21st.dev "Explore Our World" landing page bundle so the
 * narrative arc stays familiar (Welcome → Innovation → Discovery → Future).
 * CTAs are wired to platform routes so the page becomes a real entry point
 * rather than a pure marketing splash.
 */
export default function GlobeScrollDemo({ onPrimaryAction, onSecondaryAction }: GlobeScrollDemoProps = {}) {
  const primary = onPrimaryAction ?? (() => console.info('[home] primary CTA'))
  const secondary = onSecondaryAction ?? (() => console.info('[home] secondary CTA'))

  const sections: ScrollGlobeSection[] = [
    {
      id: 'hero',
      badge: 'Welcome',
      title: 'Explore',
      subtitle: 'Our World',
      description:
        'Journey through an immersive experience where technology meets innovation. Watch as perspectives shift and possibilities unfold with every interaction, creating a symphony of digital artistry.',
      align: 'left',
      actions: [
        { label: 'Begin Journey', variant: 'primary', onClick: primary },
        { label: 'Learn More', variant: 'secondary', onClick: secondary },
      ],
    },
    {
      id: 'innovation',
      badge: 'Innovation',
      title: 'Connected Worldwide',
      description:
        'From every corner of the globe, we witness the interconnected web of human achievement. Each connection represents progress, every interaction drives innovation forward into uncharted territories.',
      align: 'center',
    },
    {
      id: 'discovery',
      badge: 'Discovery',
      title: 'Expanding',
      subtitle: 'Possibilities',
      description:
        'As we push beyond familiar boundaries, new worlds of opportunity emerge from the horizon. What seemed impossible yesterday becomes tomorrow\'s foundation for extraordinary achievements.',
      align: 'left',
      features: [
        {
          title: 'Limitless Exploration',
          description: 'Discover new dimensions of possibility and innovation.',
        },
        {
          title: 'Seamless Integration',
          description: 'Where cutting-edge technology meets human intuition.',
        },
        {
          title: 'Future-Ready Solutions',
          description: 'Built for tomorrow\'s challenges and opportunities.',
        },
      ],
    },
    {
      id: 'future',
      badge: 'Future',
      title: 'Our Shared',
      subtitle: 'Tomorrow',
      description:
        'In this moment of unity, we see not just a planet, but a canvas of infinite human potential. Every connection represents hope, every innovation builds bridges to our collective future of endless possibilities.',
      align: 'center',
      actions: [
        { label: 'Join the Movement', variant: 'primary', onClick: primary },
        { label: 'Explore More', variant: 'secondary', onClick: secondary },
      ],
    },
  ]

  return <ScrollGlobe sections={sections} />
}
