import { Suspense, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import Globe from './globe'
import { SparklesCore } from './sparkles'
import { cn } from '@/lib/utils'
import {
  DEFAULT_SCROLL_GLOBE_CONFIG,
  GLOBE_MOTION,
  type ScrollGlobeGlobeConfig,
} from './globe-engine'
import { useScrollGlobeMotion } from './useScrollGlobeMotion'
import './gs-section-rail.css'
import './gs-scroll-globe-transitions.css'
import { HomePartnerLogoSlider } from '../../pages/home/HomePartnerLogoSlider'

/** Home Start — one globe profile for every section (no remount / size thrash). */
const LEADING_CLEAR_GLOBE = {
  size: 268,
  satellites: 6,
  rsLive: false,
} as const

const SECTION_PANEL_EASE = [0.23, 1, 0.32, 1] as const

function ScrollGlobeTrailingFallback() {
  return (
    <div className="gs-scroll-globe-trailing__loader" role="status" aria-live="polite" aria-busy="true">
      <span className="gs-scroll-globe-trailing__loader-bar" aria-hidden />
    </div>
  )
}

function sectionPanelAnimate(activeSection: number, scrollIndex: number) {
  const distance = Math.abs(activeSection - scrollIndex)
  return {
    opacity: distance === 0 ? 1 : distance === 1 ? 0.86 : 0.72,
    y: distance === 0 ? 0 : distance === 1 ? 8 : 14,
  }
}

/**
 * ScrollGlobe — 1:1 port of the upstream landing-page bundle published at
 * https://21st.dev/r/m.umairwaheedansari/landing-page (live preview:
 * https://cdn.21st.dev/m.umairwaheedansari/landing-page/default/bundle.1758288581464.html
 * ).
 *
 * The component pins the `<Globe />` mark to viewport coordinates that change
 * per section — as the user scrolls between Welcome → Innovation → Future
 * → Future, the Earth glides + scales between four positions, producing the
 * "scroll-driven 3D landing" effect that defines the upstream design.
 *
 * Geosyntra-specific deviations from the upstream snippet (kept narrow on
 * purpose so visual parity stays byte-tight):
 *
 *  1. **Scroll-source detection** (this is the big one).
 *     The upstream demo lives at the document root, so it can attach to
 *     `window.scroll` and read `window.pageYOffset`. The Geosyntra app
 *     mounts the Home page inside `<main class="content">` which itself
 *     has `overflow-y: auto` (header + sidebar are pinned siblings). If we
 *     listen to `window` here, the scroll event never fires and the globe
 *     never moves. We therefore walk up the DOM at mount time, find the
 *     first ancestor whose computed `overflow-y` is `auto` or `scroll`, and
 *     attach to *that*. Falls through to `window` when run standalone (e.g.
 *     a Storybook preview, or a route that lives in the document scroll).
 *
 *  2. The hosting page can pass `className` (e.g. the upstream
 *     `bg-gradient-to-br from-background via-muted/20 to-background` sweep)
 *     and `onPrimaryAction`/`onSecondaryAction` so each CTA wires to a real
 *     platform route instead of the upstream `console.log`.
 *
 * Everything else — class strings, transition curves, section rhythm,
 * description copy, progress-bar gradient, label fade — mirrors the bundle
 * markup exactly so the page feels identical to the 21st.dev reference.
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

/** Section ids omitted from the right-rail dots (content still scrolls normally). */
export const SCROLL_GLOBE_RAIL_HIDDEN_SECTION_IDS = new Set<string>()

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

export type { ScrollGlobeGlobeConfig } from './globe-engine'
export { DEFAULT_SCROLL_GLOBE_CONFIG } from './globe-engine'

export interface ScrollGlobeLeadingNav {
  id: string
  badge: string
}

/** Extra full-width blocks after globe narrative (e.g. pricing, footer) — wired to the right-rail dots. */
export interface ScrollGlobeTrailingSection {
  id: string
  badge: string
  children: React.ReactNode
}

export interface ScrollGlobeProps {
  sections: ScrollGlobeSection[]
  globeConfig?: ScrollGlobeGlobeConfig
  className?: string
  /** Full-viewport SaaS / signup panel before the globe narrative sections. */
  leadingSection?: React.ReactNode
  leadingSectionNav?: ScrollGlobeLeadingNav
  /** Panels after the last globe story section (pricing, site footer, …). */
  trailingSections?: ScrollGlobeTrailingSection[]
  onActiveSectionChange?: (index: number) => void
  /** SaaS hero only — crisp centered globe without scrim/gradient/blur. */
  leadingGlobeClear?: boolean
}

export function ScrollGlobe({
  sections,
  globeConfig = DEFAULT_SCROLL_GLOBE_CONFIG,
  className,
  leadingSection,
  leadingSectionNav,
  trailingSections = [],
  onActiveSectionChange,
  leadingGlobeClear = false,
}: ScrollGlobeProps) {
  const hasLeading = Boolean(leadingSection)
  const trailingCount = trailingSections.length
  const innovationSparkleIndex = hasLeading ? 1 : 0
  const futureSectionIndex = innovationSparkleIndex + 1
  const pricingTrailIndex = trailingSections.findIndex(t => t.id === 'pricing')
  const pricingSectionIndex =
    pricingTrailIndex >= 0
      ? (hasLeading ? sections.length + 1 : sections.length) + pricingTrailIndex
      : -1
  const sectionCount = (hasLeading ? sections.length + 1 : sections.length) + trailingCount
  const containerRef = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef<(HTMLElement | null)[]>([])
  const {
    activeSection,
    scrollProgress,
    narrativeScrollT,
    globeTransform,
    parallaxElRef,
    globeArrived,
    globeOpacity,
    heroStarsOpacity,
    heroOverlayOpacity,
    heroScrimBlur,
    heroGlobeBlur,
    smoothScrollPath,
  } = useScrollGlobeMotion(containerRef, sectionRefs, {
    hasLeading,
    sectionCount,
    globeConfig,
    onActiveSectionChange,
    leadingGlobeClear,
  })
  /**
   * Active theme — flips between `'dark'` and `'light'` based on the
   * `<html data-theme>` attribute. Drives the `particleColor` for the
   * Hero Sparkles bar so the starfield stays visible in both themes
   * (white particles on dark, lacquered-black particles on white).
   * MutationObserver keeps it in sync when the floating
   * HeroThemeToggle (or the Settings page) flips the theme without
   * a remount.
   */
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() => {
    if (typeof document === 'undefined') return 'dark'
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
  })
  /* Particle colour derived from the theme. The light-mode value is a
   * deep slate / near-black (#0B1220) — high contrast on the frosted-
   * white background and matches the lacquered black wordmark above
   * the bar so the whole strip reads as one coherent dark mark in
   * Light Mode. */
  const particleColor = resolvedTheme === 'light' ? '#0B1220' : '#FFFFFF'

  /* Watch `<html data-theme>` for changes (Settings page, the floating
   * HeroThemeToggle, system-preference flips when in `'system'` mode).
   * The Sparkles particle colour and any other theme-derived visuals
   * re-render when this state flips, so we stay in lockstep with the
   * actual document state without depending on context wiring. */
  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    const sync = () => {
      setResolvedTheme(root.getAttribute('data-theme') === 'light' ? 'light' : 'dark')
    }
    sync()
    const obs = new MutationObserver(sync)
    obs.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])

  const isInnovationStyleGlobe = leadingGlobeClear
    ? activeSection >= innovationSparkleIndex
    : activeSection === innovationSparkleIndex ||
      activeSection === futureSectionIndex ||
      (pricingSectionIndex >= 0 && activeSection === pricingSectionIndex)
  const showNarrativeSparkles = isInnovationStyleGlobe

  return (
    /*
     * Outer ScrollGlobe shell — locked to the spec the user signed off on
     * (2026-05-13):
     *   - `min-h-screen`               full viewport height (≥ 100vh)
     *   - `w-full` + `max-w-full`      full width, never overflows parent
     *   - no `overflow-x-*` on shell   any non-visible overflow-x makes
     *                                  overflow-y compute to `auto` (nested bar);
     *                                  horizontal bleed is clipped by
     *                                  `main.content--landing-fullbleed` instead
     *
     * Per-section padding (responsive `px-*` + `py-*`) lives on the
     * `<section>` blocks below — adding it here would double-pad the
     * sections and break the upstream globe-position math (which is keyed
     * to vw/vh with no parent padding).
     */
    <div
      ref={containerRef}
      data-active-section={activeSection}
      data-globe-progress={smoothScrollPath ? Math.round(narrativeScrollT * 100) : undefined}
      className={cn(
        'gs-scroll-globe relative w-full max-w-full min-h-screen text-foreground',
        hasLeading ? 'gs-scroll-globe--with-leading bg-transparent' : 'bg-background',
        leadingGlobeClear ? 'gs-scroll-globe--leading-clear' : null,
        smoothScrollPath ? 'gs-scroll-globe--smooth-globe' : null,
        className,
      )}
    >
      {/* Top progress hairline — exact upstream gradient (primary → blue-600
          → blue-900) and the matching cool drop-shadow. The landing page is
          the only surface in the app that keeps the upstream blue cast; the
          rest of the chrome (header, sidebar, panels) stays neutral
          black-glass per the brand rules. */}
      <div
        className={cn(
          'fixed left-0 w-full h-0.5 bg-gradient-to-r from-border/20 via-border/40 to-border/20 z-[45]',
          hasLeading ? 'top-16' : 'top-0',
        )}
      >
        <motion.div
          className="h-full bg-gradient-to-r from-primary via-blue-600 to-blue-900 will-change-transform shadow-sm"
          style={{
            transform: `scaleX(${smoothScrollPath ? narrativeScrollT : scrollProgress})`,
            transformOrigin: 'left center',
            transition: smoothScrollPath ? 'none' : 'transform 0.15s ease-out',
            filter: 'drop-shadow(0 0 2px rgba(59, 130, 246, 0.3))',
          }}
        />
      </div>

      {/* Right-rail — section dots (gs-section-rail.css). */}
      <nav
        aria-label="Section navigation"
        className="gs-section-rail"
      >
          {[
            ...(leadingSectionNav
              ? [{ key: leadingSectionNav.id, badge: leadingSectionNav.badge, scrollIndex: 0 }]
              : []),
            ...sections
              .map((section, index) => ({
                key: section.id,
                badge: section.badge ?? `Section ${index + 1}`,
                scrollIndex: hasLeading ? index + 1 : index,
              }))
              .filter(entry => !SCROLL_GLOBE_RAIL_HIDDEN_SECTION_IDS.has(entry.key)),
            ...trailingSections.map((trail, index) => ({
              key: trail.id,
              badge: trail.badge,
              scrollIndex: (hasLeading ? sections.length + 1 : sections.length) + index,
            })),
          ].map(entry => {
            const isActive = activeSection === entry.scrollIndex
            const isPassed = activeSection > entry.scrollIndex
            return (
              <motion.div key={entry.key} className="gs-section-rail__node">
                <button
                  type="button"
                  onClick={() => {
                    sectionRefs.current[entry.scrollIndex]?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'center',
                    })
                  }}
                  className={cn(
                    'gs-section-rail__dot',
                    isActive && 'gs-section-rail__dot--active',
                    isPassed && !isActive && 'gs-section-rail__dot--passed',
                  )}
                  aria-label={`Go to ${entry.badge}`}
                  aria-current={isActive ? 'true' : undefined}
                >
                  <span className="gs-section-rail__label">{entry.badge}</span>
                </button>
              </motion.div>
            )
          })}
      </nav>

      {/* ──────────────────────────────────────────────────────────────
          Fixed layers (bottom → top):
            Hero stars (z-[4]) → Globe (z-10) → gradient (z-[12])
          Section panels z-30; nav z-40.
          ────────────────────────────────────────────────────────────── */}

      {/* SaaS hero + Welcome transition — subtle starfield behind globe */}
      {hasLeading ? (
        <motion.div
          aria-hidden
          className="gs-hero-globe-stars fixed inset-0 z-[4] pointer-events-none"
          initial={false}
          animate={{ opacity: heroStarsOpacity }}
          transition={{ duration: 0.55, ease: [0.23, 1, 0.32, 1] }}
        >
          <SparklesCore
            background="transparent"
            minSize={0.35}
            maxSize={0.9}
            particleDensity={120}
            className="w-full h-full"
            particleColor={particleColor}
            speed={0.85}
          />
        </motion.div>
      ) : null}

      {/* Radial scrim — keeps SaaS hero copy readable over the globe */}
      {hasLeading ? (
        <div
          aria-hidden
          className="gs-hero-globe-gradient fixed inset-0 z-[12] pointer-events-none"
          style={{
            opacity: heroOverlayOpacity,
            transition: GLOBE_MOTION.opacityTransition,
          }}
        />
      ) : null}

      {/* Narrative sparkles — stay mounted on Home so the layer never pops in/out. */}
      {leadingGlobeClear || hasLeading ? (
        <motion.div
          aria-hidden
          className="gs-innovation-sparkles fixed inset-0 z-[5] pointer-events-none"
          initial={false}
          animate={{
            opacity: leadingGlobeClear
              ? activeSection >= 1
                ? 0.92
                : 0
              : showNarrativeSparkles
                ? 1
                : 0,
          }}
          transition={{ duration: 0.55, ease: SECTION_PANEL_EASE }}
        >
          <SparklesCore
            background="transparent"
            minSize={0.4}
            maxSize={1.0}
            particleDensity={180}
            className="w-full h-full"
            particleColor={particleColor}
            speed={1.2}
          />
        </motion.div>
      ) : null}

      {/* Pinned globe — scroll-driven positions from `globeConfig`. */}
      <div
        aria-hidden
        className="gs-hero-globe fixed z-10 pointer-events-none will-change-transform"
          style={{
            transform: globeTransform,
            opacity: leadingGlobeClear || globeArrived ? globeOpacity : 0,
          top: 0,
          left: 0,
          width: 0,
          height: 0,
          filter: heroGlobeBlur > 0.05 ? `blur(${heroGlobeBlur}px)` : undefined,
          transition: smoothScrollPath
            ? `${GLOBE_MOTION.opacityTransition}, ${GLOBE_MOTION.filterTransition}`
            : `${GLOBE_MOTION.transformTransition}, ${GLOBE_MOTION.opacityTransition}, ${GLOBE_MOTION.filterTransition}`,
        }}
      >
        <motion.div
          ref={parallaxElRef}
          className="gs-hero-globe__parallax"
        >
          <motion.div
            className="gs-hero-globe__entrance"
            initial={false}
            animate={{ scale: leadingGlobeClear ? 1 : globeArrived ? 1 : 0.9 }}
            transition={{ duration: leadingGlobeClear ? 0 : 0.32, ease: SECTION_PANEL_EASE }}
            style={{ transformOrigin: 'center center' }}
          >
            <div
              className={cn(
                'gs-hero-globe__scale',
                leadingGlobeClear
                  ? 'scale-[1.05] sm:scale-[1.28] lg:scale-[1.48] 2xl:scale-[1.62]'
                  : 'scale-110 sm:scale-[1.72] lg:scale-[3.45] 2xl:scale-[4.15]',
              )}
            >
              <Globe
                size={
                  leadingGlobeClear
                    ? LEADING_CLEAR_GLOBE.size
                    : isInnovationStyleGlobe
                      ? 276
                      : 280
                }
                satellites={
                  leadingGlobeClear
                    ? LEADING_CLEAR_GLOBE.satellites
                    : isInnovationStyleGlobe
                      ? 6
                      : 0
                }
                rsLive={leadingGlobeClear ? LEADING_CLEAR_GLOBE.rsLive : isInnovationStyleGlobe}
              />
            </div>
          </motion.div>
        </motion.div>
      </div>

      {/* Section panels — each `min-h-screen` so a single scroll-snap step
          moves between them, and each carries an alignment + optional
          features/actions slot so the host page can compose new narratives
          without touching the component. */}
      {leadingSection ? (
        <section
          id={leadingSectionNav?.id ?? 'start'}
          ref={el => {
            sectionRefs.current[0] = el
          }}
          className="home-merged-saas gs-hero-leading-panel relative z-30 min-h-screen min-h-[100dvh] w-full max-w-full flex flex-col items-center justify-center pointer-events-none"
          style={
            leadingGlobeClear
              ? undefined
              : ({ '--gs-hero-scrim-blur': `${heroScrimBlur}px` } as React.CSSProperties)
          }
        >
          <motion.div
            className="gs-scroll-globe-section-panel pointer-events-auto w-full"
            initial={false}
            animate={sectionPanelAnimate(activeSection, 0)}
            transition={{ duration: 0.48, ease: SECTION_PANEL_EASE }}
          >
            {leadingSection}
          </motion.div>
        </section>
      ) : null}
      {sections.map((section, index) => {
        /** Innovation + Future share centered globe stack + pearl titles. */
        const welcomeVisualRhythm = section.id === 'innovation' || section.id === 'future'
        /** Centered copy over the fixed globe (Start uses leading panel). */
        const centeredGlobeStack = section.id === 'innovation' || section.id === 'future'
        const welcomeHeroAnchorTop = false
        const sectionScrollIndex = hasLeading ? index + 1 : index
        return (
        <section
          key={section.id}
          id={section.id}
          ref={el => {
            sectionRefs.current[hasLeading ? index + 1 : index] = el
          }}
          className={cn(
            /* z-30 above the fixed Globe (z-10). Section root is pointer-events-none
               so empty viewport area does not steal hovers; inner column re-enables. */
            'relative min-h-screen flex flex-col px-4 sm:px-6 md:px-8 lg:px-12 z-30 py-12 sm:py-16 lg:py-20',
            'w-full max-w-full overflow-hidden pointer-events-none',
            centeredGlobeStack && 'justify-center items-center text-center min-h-[100dvh]',
            !centeredGlobeStack && 'justify-center',
            !centeredGlobeStack && section.align === 'center' && 'items-center text-center',
            !centeredGlobeStack && section.align === 'right' && 'items-end text-right',
            !centeredGlobeStack && section.align !== 'center' && section.align !== 'right' && 'items-start text-left',
          )}
        >
          <motion.div
            className={cn(
              'gs-scroll-globe-section-panel pointer-events-auto w-full',
              centeredGlobeStack &&
                'max-w-xl sm:max-w-2xl md:max-w-2xl lg:max-w-3xl mx-auto relative z-10 flex flex-col items-center',
              !centeredGlobeStack &&
                cn(
                  'max-w-sm sm:max-w-lg md:max-w-2xl lg:max-w-4xl xl:max-w-5xl',
                  section.align === 'center' && 'mx-auto',
                ),
            )}
            initial={false}
            animate={sectionPanelAnimate(activeSection, sectionScrollIndex)}
            transition={{ duration: 0.48, ease: SECTION_PANEL_EASE }}
          >
            <h1
              className={cn(
                'font-bold leading-[1.1] tracking-tight',
                welcomeVisualRhythm && section.id === 'hero' ? 'mb-3 sm:mb-4' : 'mb-6 sm:mb-8',
                centeredGlobeStack && 'gs-innovation-headline',
                welcomeVisualRhythm
                  ? cn(
                      index === 0
                        ? 'text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl 2xl:text-9xl w-full'
                        : 'text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl 2xl:text-8xl w-full',
                      section.align === 'right' ? 'text-right' : 'text-center',
                    )
                  : 'text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl 2xl:text-7xl',
              )}
            >
              {section.subtitle && !welcomeVisualRhythm ? (
                <div
                  className={cn(
                    'space-y-1 sm:space-y-2',
                    section.align === 'center' && 'text-center',
                    section.align === 'right' && 'text-right',
                  )}
                >
                  <div className="bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
                    {section.title}
                  </div>
                  <div className="text-muted-foreground/90 text-[0.6em] sm:text-[0.7em] font-medium tracking-wider">
                    {section.subtitle}
                  </div>
                </div>
              ) : welcomeVisualRhythm ? (
                /*
                 * Pearl wordmark — Welcome (Geosyntra) + Innovation headline share
                 * the same luminous treatment (`Home.css` → `.gs-pearl-title`).
                 */
                <div className="gs-pearl-title bg-gradient-to-br from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                  {section.title}
                </div>
              ) : (
                <div className="bg-gradient-to-r from-foreground via-foreground to-foreground/80 bg-clip-text text-transparent">
                  {section.title}
                </div>
              )}
            </h1>

            {/*
             * Sparkles bar — Welcome (hero) only. Innovation uses the full-viewport
             * starfield layer (`gs-innovation-sparkles`) behind the globe; a second
             * sparkle bar here duplicated a large hit-target rectangle (tsparticles canvas).
             */}
            {welcomeVisualRhythm && section.id === 'hero' && (
              <div
                className={cn(
                  'gs-hero-sparkle-bar relative w-full max-w-[44rem] mt-1 sm:mt-2 mb-4 sm:mb-5 select-none h-28 sm:h-36',
                  section.align === 'right' ? 'ml-auto' : 'mx-auto',
                )}
              >
                <div className="gs-hero-sparkle-line gs-hero-sparkle-line--soft absolute inset-x-[15%] top-0 h-[2px] w-[70%] bg-gradient-to-r from-transparent via-slate-200/80 to-transparent blur-sm" />
                <div className="gs-hero-sparkle-line gs-hero-sparkle-line--hairline absolute inset-x-[15%] top-0 h-px w-[70%] bg-gradient-to-r from-transparent via-slate-100/90 to-transparent" />
                <div className="gs-hero-sparkle-line gs-hero-sparkle-line--core-soft absolute inset-x-[35%] top-0 h-[5px] w-[30%] bg-gradient-to-r from-transparent via-white/85 to-transparent blur-sm" />
                <div className="gs-hero-sparkle-line gs-hero-sparkle-line--core absolute inset-x-[35%] top-0 h-px w-[30%] bg-gradient-to-r from-transparent via-white to-transparent" />

                <SparklesCore
                  background="transparent"
                  minSize={0.4}
                  maxSize={1}
                  particleDensity={580}
                  className="w-full h-full"
                  particleColor={particleColor}
                />

                <div className="pointer-events-none absolute inset-0 w-full h-full bg-background [mask-image:radial-gradient(380px_180px_at_top,transparent_18%,black)]" />
              </div>
            )}

            <div
              className={cn(
                'text-muted-foreground/80 leading-relaxed mb-8 sm:mb-10 text-base sm:text-lg lg:text-xl font-light',
                section.align === 'center' || centeredGlobeStack
                  ? 'max-w-full mx-auto text-center'
                  : 'max-w-full text-left',
                /* Welcome hero — tight band above lede + CTAs (sparkle strip sits just above body copy). */
                section.id === 'hero' && 'mt-8 sm:mt-10 md:mt-12',
              )}
            >
              <p className="mb-3 sm:mb-4">{section.description}</p>
              {welcomeVisualRhythm && (
                <div
                  className={cn(
                    'flex flex-wrap items-center gap-3 sm:gap-4 text-xs sm:text-sm text-muted-foreground/60 mt-4 sm:mt-6',
                    section.align === 'center' || centeredGlobeStack ? 'justify-center' : 'justify-start',
                  )}
                >
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <div className="w-1 h-1 rounded-full bg-primary animate-pulse" />
                    <span>Interactive Experience</span>
                  </div>
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <div
                      className="w-1 h-1 rounded-full bg-primary animate-pulse"
                      style={{ animationDelay: '0.5s' }}
                    />
                    <span>Scroll to Explore</span>
                  </div>
                </div>
              )}
            </div>

            {section.features && (
              <div className="grid gap-3 sm:gap-4 mb-8 sm:mb-10">
                {section.features.map((feature, featureIndex) => (
                  <div
                    key={feature.title}
                    className={cn(
                      'group p-4 sm:p-5 lg:p-6 rounded-lg sm:rounded-xl border bg-card/50 backdrop-blur-sm hover:bg-card/80 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5',
                      'hover:border-primary/20 hover:-translate-y-1',
                    )}
                    style={{ animationDelay: `${featureIndex * 0.1}s` }}
                  >
                    <div className="flex items-start gap-3 sm:gap-4">
                      <div className="w-1.5 sm:w-2 h-1.5 sm:h-2 rounded-full bg-primary/60 mt-1.5 sm:mt-2 group-hover:bg-primary transition-colors flex-shrink-0" />
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
                {section.actions.map((action, actionIndex) => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={action.onClick}
                    className={cn(
                      'group relative px-6 sm:px-8 py-3 sm:py-4 rounded-lg sm:rounded-xl font-medium transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] text-sm sm:text-base',
                      'hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary/20 w-full sm:w-auto',
                      action.variant === 'primary'
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 hover:shadow-primary/30'
                        : 'border-2 border-border/60 bg-background/50 backdrop-blur-sm hover:bg-accent/50 hover:border-primary/30 text-foreground',
                    )}
                    style={{ animationDelay: `${actionIndex * 0.1 + 0.2}s` }}
                  >
                    <span className="relative z-10">{action.label}</span>
                    {action.variant === 'primary' && (
                      <div
                        aria-hidden
                        className="absolute inset-0 rounded-lg sm:rounded-xl bg-gradient-to-r from-primary to-primary/80 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                      />
                    )}
                  </button>
                ))}
              </div>
            )}

            {section.id === 'future' ? (
              <HomePartnerLogoSlider />
            ) : null}
          </motion.div>
        </section>
        )
      })}
      {trailingSections.map((trail, index) => {
        const scrollIndex = (hasLeading ? sections.length + 1 : sections.length) + index
        return (
          <div
            key={trail.id}
            ref={el => {
              sectionRefs.current[scrollIndex] = el
            }}
            className="gs-scroll-globe-trailing relative z-30 w-full max-w-full"
            data-scroll-globe-trailing={trail.id}
          >
            <motion.div
              className="gs-scroll-globe-section-panel w-full"
              initial={false}
              animate={sectionPanelAnimate(activeSection, scrollIndex)}
              transition={{ duration: 0.48, ease: SECTION_PANEL_EASE }}
            >
              <Suspense fallback={<ScrollGlobeTrailingFallback />}>{trail.children}</Suspense>
            </motion.div>
          </div>
        )
      })}
    </div>
  )
}

export interface GlobeScrollDemoProps {
  /** Optional click handler for the hero "Begin Journey" + closing "Join the Movement" CTAs. */
  onPrimaryAction?: () => void
  /** Optional click handler for the hero "Learn More" + closing "Explore More" CTAs. */
  onSecondaryAction?: () => void
  /** Extra classes appended to the outer wrapper (e.g. the upstream gradient sweep). */
  className?: string
}

/**
 * Geosyntra-flavoured ScrollGlobe demo. Section copy mirrors the upstream
 * 21st.dev "Explore Our World" landing page (Welcome → Innovation →
 * Innovation → Future) aligned with the home scroll narrative.
 * bundle, but each CTA is wired through the host (Home page) to a real
 * platform route — turning the marketing splash into a working entry point.
 */
export default function GlobeScrollDemo({
  onPrimaryAction,
  onSecondaryAction,
  className,
}: GlobeScrollDemoProps = {}) {
  const primary = onPrimaryAction ?? (() => console.info('[home] primary CTA'))
  const secondary = onSecondaryAction ?? (() => console.info('[home] secondary CTA'))

  const sections: ScrollGlobeSection[] = [
    {
      id: 'hero',
      badge: 'Welcome',
      title: 'Geosyntra',
      description:
        'Journey through an intelligent geospatial ecosystem where GIS, Remote Sensing, and smart technologies converge. Explore dynamic spatial insights, advanced analytics, and immersive digital experiences designed to transform data into intelligent decision-making.',
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

  return <ScrollGlobe sections={sections} className={className} />
}
