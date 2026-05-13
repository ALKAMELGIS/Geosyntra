import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Globe from './globe'
import { SparklesCore } from './sparkles'
import { SplineScene } from './spline-scene'
import { cn } from '@/lib/utils'

/**
 * Spline scene URL — same interactive 3D robot the LearnMore hero uses
 * (shipped by the 21st.dev integration brief). Lifting it into the Home
 * hero gives the landing page a matching cinematic mark next to the
 * Geosyntra wordmark, with built-in mouse parallax (the Spline runtime
 * tracks the cursor itself — no extra wiring required).
 */
const SPLINE_HERO_SCENE_URL = 'https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode'

/**
 * ScrollGlobe — 1:1 port of the upstream landing-page bundle published at
 * https://21st.dev/r/m.umairwaheedansari/landing-page (live preview:
 * https://cdn.21st.dev/m.umairwaheedansari/landing-page/default/bundle.1758288581464.html
 * ).
 *
 * The component pins the `<Globe />` mark to viewport coordinates that change
 * per section — as the user scrolls between Welcome → Innovation → Discovery
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

/**
 * Same coordinates the upstream bundle ships — hero pins the globe mid-right
 * at 0.85× (downsized from the upstream 1.4× so it fits visually in front
 * of the new Spline robot's chest area, like the figure is holding it);
 * innovation drops it small & centred near the top; discovery throws it
 * 90 % off-screen for half-bleed effect; future centres a 1.8× mass behind
 * the closing copy.
 *
 * NOTE: the hero `left` value below is a *fallback* — at runtime
 * `buildGlobeTransform` ignores it for the hero (idx 0) and instead pins
 * the Globe to the Robot stage's exact horizontal centre via the CSS
 * expression `calc(100vw - min(29vw, 440px))` (the stage is right-anchored
 * with `width: min(58vw, 880px)`, so its centre = viewport-right − half-
 * stage). This keeps the Globe on the Robot's chest on every breakpoint
 * (small phone → 4K) instead of drifting around as a percentage of vw.
 */
const defaultGlobeConfig: { positions: ScrollGlobePosition[] } = {
  positions: [
    { top: '50%', left: '71%', scale: 0.85 },
    { top: '25%', left: '50%', scale: 0.9 },
    { top: '15%', left: '90%', scale: 2 },
    { top: '50%', left: '50%', scale: 1.8 },
  ],
}

/**
 * Compose the Globe wrapper transform string for a given section index.
 *
 * Hero (idx 0) uses a *right-anchored* `calc()` x-coordinate that mirrors
 * the Robot stage's own anchoring (`right: 0`, `width: min(58vw, 880px)`)
 * so the anchor point sits on the Robot's chest centre no matter the
 * viewport width. The self-translate is then `(-60%, -50%)` rather than
 * the usual `(-50%, -50%)` — the extra `-10%` of own width is a small,
 * *responsive* leftward nudge (scales naturally with the Globe's own
 * size at every breakpoint) so the Earth lands inside the figure's
 * left embrace instead of dead-on-axis. Matches the user's verbatim
 * spec: `translate3d(calc(100vw - min(29vw, 440px)), 50vh, 0)
 *        translate3d(-60%, -50%, 0) scale3d(0.85, 0.85, 1)`.
 *
 * Other sections fall back to the upstream `left%/top%` vw/vh
 * positioning for the cinematic glide between Innovation, Discovery
 * and Future panels (centred there with the standard `(-50%, -50%)`).
 *
 * Returned as a CSS transform string so the existing
 * `transition: transform` on the wrapper still interpolates smoothly
 * between sections (the browser resolves the calc()s to pixel values
 * before interpolating, so no layout discontinuity).
 */
function buildGlobeTransform(
  idx: number,
  pos: { top: number; left: number; scale: number },
): string {
  if (idx === 0) {
    return `translate3d(calc(100vw - min(29vw, 440px)), ${pos.top}vh, 0) translate3d(-60%, -50%, 0) scale3d(${pos.scale}, ${pos.scale}, 1)`
  }
  return `translate3d(${pos.left}vw, ${pos.top}vh, 0) translate3d(-50%, -50%, 0) scale3d(${pos.scale}, ${pos.scale}, 1)`
}

const parsePercent = (str: string): number => parseFloat(str.replace('%', ''))

/**
 * Walk up from `el` and return the first ancestor whose computed `overflow-y`
 * is `auto` or `scroll` — i.e. the element that actually receives wheel /
 * touchmove → scroll events when this region is scrolled. Falls back to
 * `window` when nothing matches (page lives in the document scroll).
 *
 * We deliberately check `overflow-y` rather than the `overflow` shorthand:
 * the Geosyntra `<main class="content">` sets `overflow-y: auto` +
 * `overflow-x: hidden`, which would not match a strict `overflow: auto` test.
 */
function findScrollContainer(el: HTMLElement | null): HTMLElement | Window {
  if (typeof window === 'undefined') return typeof globalThis !== 'undefined' ? (globalThis as unknown as Window) : (null as unknown as Window)
  let node: HTMLElement | null = el?.parentElement ?? null
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node)
    if (style.overflowY === 'auto' || style.overflowY === 'scroll') return node
    node = node.parentElement
  }
  return window
}

const isWindow = (target: HTMLElement | Window): target is Window =>
  typeof window !== 'undefined' && target === window

export function ScrollGlobe({ sections, globeConfig = defaultGlobeConfig, className }: ScrollGlobeProps) {
  const [activeSection, setActiveSection] = useState(0)
  const [scrollProgress, setScrollProgress] = useState(0)
  const [globeTransform, setGlobeTransform] = useState('')
  /**
   * Hero entrance flag. Initial render paints the Globe at opacity 0 +
   * scale 0.9 so the browser has *something* on screen the very first
   * frame, then the *next* RAF flips this to `true` and the wrapper's
   * 280 ms transition runs the joint opacity + scale beat. No setTimeout,
   * no perceived loading phase — the whole Hero arrives in a single
   * sub-half-second motion (per the user's "حركة واحدة سريعة لا تتجاوز
   * 0.5 ثانية" directive).
   */
  const [globeArrived, setGlobeArrived] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef<(HTMLElement | null)[]>([])
  const animationFrameId = useRef<number | undefined>(undefined)
  const scrollSourceRef = useRef<HTMLElement | Window | null>(null)

  const calculatedPositions = useMemo(
    () =>
      globeConfig.positions.map(pos => ({
        top: parsePercent(pos.top),
        left: parsePercent(pos.left),
        scale: pos.scale,
      })),
    [globeConfig.positions],
  )

  /**
   * Direct scroll → globe-transform mapping (no easing on the value itself —
   * the smoothness comes from the 1.4 s CSS transition on the wrapper).
   *
   * Section detection uses `getBoundingClientRect()` which is viewport-
   * relative, so it doesn't matter whether the scroller is `window` or an
   * inner `<main>` — the section closest to the viewport vertical centre
   * is always the active one.
   */
  const updateScrollPosition = useCallback(() => {
    const source = scrollSourceRef.current
    let scrollTop = 0
    let scrollHeight = 0
    let clientHeight = window.innerHeight
    if (source && !isWindow(source)) {
      scrollTop = source.scrollTop
      scrollHeight = source.scrollHeight
      clientHeight = source.clientHeight
    } else {
      scrollTop = window.pageYOffset || document.documentElement.scrollTop
      scrollHeight = document.documentElement.scrollHeight
      clientHeight = window.innerHeight
    }
    const docHeight = scrollHeight - clientHeight
    const progress = docHeight > 0 ? Math.min(Math.max(scrollTop / docHeight, 0), 1) : 0
    setScrollProgress(progress)

    const viewportCenter = window.innerHeight / 2
    let newActiveSection = 0
    let minDistance = Infinity

    sectionRefs.current.forEach((ref, index) => {
      if (!ref) return
      const rect = ref.getBoundingClientRect()
      const sectionCenter = rect.top + rect.height / 2
      const distance = Math.abs(sectionCenter - viewportCenter)
      if (distance < minDistance) {
        minDistance = distance
        newActiveSection = index
      }
    })

    const idx = Math.min(newActiveSection, calculatedPositions.length - 1)
    const currentPos = calculatedPositions[idx]
    setGlobeTransform(buildGlobeTransform(idx, currentPos))
    setActiveSection(idx)
  }, [calculatedPositions])

  useEffect(() => {
    /* Find the real scroller once on mount. We do this lazily inside the
     * effect (not at render time) so the DOM is fully wired up before we
     * walk it. */
    const source = findScrollContainer(containerRef.current)
    scrollSourceRef.current = source

    let ticking = false
    const handleScroll = () => {
      if (ticking) return
      animationFrameId.current = window.requestAnimationFrame(() => {
        updateScrollPosition()
        ticking = false
      })
      ticking = true
    }

    source.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll, { passive: true })
    /* Two RAFs — one ticks immediately so the initial position is correct,
     * the second covers the case where the scroller's `scrollHeight` is
     * still settling (web fonts / images loading). */
    updateScrollPosition()
    const settleTimer = window.setTimeout(updateScrollPosition, 60)

    return () => {
      source.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current)
      window.clearTimeout(settleTimer)
    }
  }, [updateScrollPosition])

  /* When `calculatedPositions` changes (e.g. host page swaps `globeConfig`),
   * jump the globe to the new hero position so it doesn't snap from a stale
   * coordinate. Uses `buildGlobeTransform` so the hero gets its right-
   * anchored calc() form (locked to the Robot stage centre) instead of a
   * vw-based percentage. */
  useEffect(() => {
    setGlobeTransform(buildGlobeTransform(0, calculatedPositions[0]))
  }, [calculatedPositions])

  /* Hero entrance — single instant beat. We paint frame 1 at opacity 0
   * + scale 0.9 (just enough to give the transition something to lerp
   * from), then on the very next animation frame flip to the final
   * state. Total perceived delay = 1 frame (~16 ms) + the wrapper's
   * 280 ms transition = ~300 ms. No setTimeout, no staggered choreo,
   * nothing that reads as "loading". Reduced-motion users skip the
   * lerp entirely and see the final state immediately. */
  useEffect(() => {
    if (typeof window === 'undefined') {
      setGlobeArrived(true)
      return
    }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setGlobeArrived(true)
      return
    }
    const raf = window.requestAnimationFrame(() => setGlobeArrived(true))
    return () => window.cancelAnimationFrame(raf)
  }, [])


  return (
    /*
     * Outer ScrollGlobe shell — locked to the spec the user signed off on
     * (2026-05-13):
     *   - `min-h-screen`               full viewport height (≥ 100vh)
     *   - `w-full` + `max-w-full`      full width, never overflows parent
     *   - `overflow-x-hidden`          guards the fixed-position globe from
     *                                  triggering a horizontal scrollbar on
     *                                  ultra-wide breakpoints
     *
     * Per-section padding (responsive `px-*` + `py-*`) lives on the
     * `<section>` blocks below — adding it here would double-pad the
     * sections and break the upstream globe-position math (which is keyed
     * to vw/vh with no parent padding).
     */
    <div
      ref={containerRef}
      className={cn(
        'gs-scroll-globe relative w-full max-w-full overflow-x-hidden min-h-screen bg-background text-foreground',
        className,
      )}
    >
      {/* Top progress hairline — exact upstream gradient (primary → blue-600
          → blue-900) and the matching cool drop-shadow. The landing page is
          the only surface in the app that keeps the upstream blue cast; the
          rest of the chrome (header, sidebar, panels) stays neutral
          black-glass per the brand rules. */}
      <div className="fixed top-0 left-0 w-full h-0.5 bg-gradient-to-r from-border/20 via-border/40 to-border/20 z-50">
        <div
          className="h-full bg-gradient-to-r from-primary via-blue-600 to-blue-900 will-change-transform shadow-sm"
          style={{
            transform: `scaleX(${scrollProgress})`,
            transformOrigin: 'left center',
            transition: 'transform 0.15s ease-out',
            filter: 'drop-shadow(0 0 2px rgba(59, 130, 246, 0.3))',
          }}
        />
      </div>

      {/* Right-rail navigation — dot per section, with a label that fades in
          on the active dot for ~2.2 s and drifts out (Tailwind keyframe
          `fadeOut` registered in `tailwind.config.js`). Click a dot to
          smooth-scroll to that section. */}
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
                  'bg-background/95 backdrop-blur-md border border-border/60 shadow-xl z-50',
                  activeSection === index ? 'animate-fadeOut' : 'opacity-0',
                )}
              >
                <div className="flex items-center gap-1 sm:gap-1.5 lg:gap-2">
                  <div className="w-1 sm:w-1.5 lg:w-2 h-1 sm:h-1.5 lg:h-2 rounded-full bg-primary animate-pulse" />
                  <span className="text-xs sm:text-sm lg:text-base">
                    {section.badge ?? `Section ${index + 1}`}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  /* Use `scrollIntoView` on the section element. Browsers
                   * resolve smooth-scroll relative to the nearest scroll
                   * container automatically, so this works whether the page
                   * scrolls in `<main>` (Geosyntra shell) or `window`
                   * (standalone preview). */
                  sectionRefs.current[index]?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                  })
                }}
                className={cn(
                  'relative w-2 h-2 sm:w-2.5 sm:h-2.5 lg:w-3 lg:h-3 rounded-full border-2 transition-all duration-300 hover:scale-125',
                  'before:absolute before:inset-0 before:rounded-full before:transition-all before:duration-300',
                  activeSection === index
                    ? 'bg-primary border-primary shadow-lg before:animate-ping before:bg-primary/20'
                    : 'bg-transparent border-muted-foreground/40 hover:border-primary/60 hover:bg-primary/10',
                )}
                aria-label={`Go to ${section.badge ?? `section ${index + 1}`}`}
              />
            </div>
          ))}
        </div>
        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 lg:w-px bg-gradient-to-b from-transparent via-primary/20 to-transparent -translate-x-1/2 -z-10" />
      </nav>

      {/* ──────────────────────────────────────────────────────────────
          Hero 3D stage — Spline robot (back) + Globe (front).

          Both layers are FIXED at the document root so the section
          stacking contexts (z-30) can't trap them.

          Movement model (current spec — 2026-05-14):
            • Robot           NO wrapper-level parallax. The figure
                              stays perfectly still positionally; the
                              built-in Spline runtime keeps its own
                              internal head + body cursor tracking, so
                              the robot still "follows" the mouse with
                              its eyes / pose without the wrapper ever
                              shifting (no jitter, no drift).
            • Globe           Anchored on the Robot's chest with a
                              small leftward nudge so it sits inside
                              the figure's left embrace.

          Entrance choreography:
            • Single fast beat, ≤ 0.5 s end-to-end. Robot fades in via
              the CSS `gs-hero-robot-fade` keyframe (240 ms). Globe
              flips on the very next RAF after mount and runs a 280 ms
              opacity + 320 ms scale (0.9 → 1.0) transition jointly,
              no setTimeout, no staggered delay. The whole Hero reads
              as one instant motion — no perceived loading phase.

          Hero positioning:
            • Robot stage     `right: 0`, `width: min(58vw, 880px)` →
                              centre x = `100vw - min(29vw, 440px)`.
            • Globe (hero)    transform uses the same expression for
                              its x-coordinate minus a 1 cm leftward
                              nudge → sits in the figure's left embrace.

          Layer hierarchy (back → front, per user spec):
            Robot 3D            z-[8]
            Globe 3D            z-10
            UI overlay / nav    z-40  (right-rail nav, progress bar z-50)
            Section content     z-30  (Geosyntra title, Sparkles, CTAs)
          ────────────────────────────────────────────────────────────── */}
      {/* Robot — only meaningful in Hero, fades when the user scrolls
          past it. `pointer-events-none` on the wrapper so the figure
          never blocks page scrolling; the inner Spline canvas re-
          enables pointer events for the built-in mouse parallax. */}
      <div
        aria-hidden
        className="gs-hero-robot fixed inset-y-0 right-0 z-[8] hidden md:flex items-center justify-end pointer-events-none transition-opacity duration-[260ms] ease-out"
        style={{
          width: 'min(58vw, 880px)',
          opacity: activeSection === 0 ? 1 : 0,
        }}
      >
        <div className="gs-hero-robot__stage relative w-full h-[72%] max-h-[68vh] mr-2 md:mr-6 lg:mr-10 xl:mr-14 pointer-events-auto">
          <SplineScene scene={SPLINE_HERO_SCENE_URL} className="w-full h-full" />
        </div>
      </div>

      {/* The pinned globe layer. The wrapper transition is split into two
          tracks so the *scroll glide* between sections still feels
          cinematic (550 ms transform) but the *initial arrival* is over
          quickly (280 ms opacity).
            • In Hero (idx 0), `globeTransform` resolves to the
              right-anchored calc() form (locked to the Robot stage
              centre) so the Earth lands squarely on the figure's chest.
            • Outside Hero, `globeTransform` falls back to the upstream
              vw-based positioning so Innovation / Discovery / Future
              keep their original cinematic glide.
          Opacity gates on `globeArrived` for the entrance beat AND on
          `activeSection === last` for the closing fade. */}
      <div
        aria-hidden
        className="gs-hero-globe fixed z-10 pointer-events-none will-change-transform"
        style={{
          transform: globeTransform,
          opacity: globeArrived
            ? activeSection === sections.length - 1
              ? 0.4
              : 0.92
            : 0,
          transition:
            'transform 550ms cubic-bezier(0.23, 1, 0.32, 1), opacity 280ms ease-out',
        }}
      >
        <div
          className="gs-hero-globe__entrance"
          style={{
            transform: globeArrived ? 'scale(1)' : 'scale(0.9)',
            transition:
              'transform 320ms cubic-bezier(0.23, 1, 0.32, 1)',
            transformOrigin: 'center center',
          }}
        >
          {/* Per-breakpoint scale-up of the upstream 250×250 globe so the
              sphere reads as the dominant visual on larger screens
              (≈ 375 px on tablet, ≈ 750 px on desktop, ≈ 875 px on 2xl)
              while still fitting comfortably on narrow phones. The
              per-section `scale3d(...)` set in
              `defaultGlobeConfig.positions[].scale` multiplies on top
              of this base. */}
          <div className="scale-100 sm:scale-150 lg:scale-[3] 2xl:scale-[3.5]">
            <Globe />
          </div>
        </div>
      </div>

      {/* Section panels — each `min-h-screen` so a single scroll-snap step
          moves between them, and each carries an alignment + optional
          features/actions slot so the host page can compose new narratives
          without touching the component. */}
      {sections.map((section, index) => (
        <section
          key={section.id}
          ref={el => {
            sectionRefs.current[index] = el
          }}
          className={cn(
            /* z-30 puts the section above both the Globe (z-10) and the
               Robot (z-[8]) per the user's layer hierarchy:
                 Geosyntra title + Sparkles → CTAs → Globe → Robot.

               Pointer-events-none on the section root is critical: the
               section element spans the FULL viewport width even though
               the visible content column is constrained to ~40% on the
               left. Without this, the section's empty right-half would
               eat every mousemove / hover at z-30, blocking the Spline
               robot (z-[8]) from receiving its built-in cursor parallax
               (head turn, body sway, eye tracking). We then re-enable
               pointer events on the inner content column below so the
               h1, Sparkles, description and CTA buttons stay fully
               interactive. */
            'relative min-h-screen flex flex-col justify-center px-4 sm:px-6 md:px-8 lg:px-12 z-30 py-12 sm:py-16 lg:py-20',
            'w-full max-w-full overflow-hidden pointer-events-none',
            section.align === 'center' && 'items-center text-center',
            section.align === 'right' && 'items-end text-right',
            section.align !== 'center' && section.align !== 'right' && 'items-start text-left',
          )}
        >
          <div
            className={cn(
              'pointer-events-auto w-full max-w-sm sm:max-w-lg md:max-w-2xl lg:max-w-4xl xl:max-w-5xl will-change-transform transition-all duration-700',
              'opacity-100 translate-y-0',
              /* Hero text column stays narrower on tablets/desktops so the
                 right-side Spline robot + Globe stage has room to breathe.
                 The non-hero sections keep their original generous widths. */
              index === 0 && 'md:max-w-[44%] lg:max-w-[42%] xl:max-w-[40%]',
            )}
          >
            <h1
              className={cn(
                'font-bold mb-6 sm:mb-8 leading-[1.1] tracking-tight',
                index === 0
                  ? 'text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl 2xl:text-8xl'
                  : 'text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl 2xl:text-7xl',
              )}
            >
              {section.subtitle ? (
                <div className="space-y-1 sm:space-y-2">
                  <div className="bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
                    {section.title}
                  </div>
                  <div className="text-muted-foreground/90 text-[0.6em] sm:text-[0.7em] font-medium tracking-wider">
                    {section.subtitle}
                  </div>
                </div>
              ) : index === 0 ? (
                /*
                 * Hero brand mark — Geosyntra in pearl-white glossy fill.
                 * Stack:
                 *   - Layered gradient (#fff → #cbd5e1 → #f8fafc → #94a3b8)
                 *     clipped to text → simulates a polished pearl reflecting
                 *     a soft cool light from the upper-left to the lower-right.
                 *   - Soft drop-shadow halo via `gs-pearl-title` keeps the
                 *     mark luminous against the dark globe backdrop without
                 *     turning into a glow blob.
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
             * Sparkles bar — only for the Hero section. Mirrors the upstream
             * Aceternity SparklesPreview demo (gradient lines + drifting
             * starfield + radial mask) but neutralises the indigo / sky
             * accents to a cool white-glass ramp so it stays inside the
             * Geosyntra Black-Glass identity.
             */}
            {index === 0 && (
              <div className="relative w-full max-w-[40rem] h-28 sm:h-36 -mt-2 mb-6 sm:mb-8 select-none">
                <div className="absolute inset-x-[15%] top-0 h-[2px] w-[70%] bg-gradient-to-r from-transparent via-slate-200/80 to-transparent blur-sm" />
                <div className="absolute inset-x-[15%] top-0 h-px w-[70%] bg-gradient-to-r from-transparent via-slate-100/90 to-transparent" />
                <div className="absolute inset-x-[35%] top-0 h-[5px] w-[30%] bg-gradient-to-r from-transparent via-white/85 to-transparent blur-sm" />
                <div className="absolute inset-x-[35%] top-0 h-px w-[30%] bg-gradient-to-r from-transparent via-white to-transparent" />

                <SparklesCore
                  background="transparent"
                  minSize={0.4}
                  maxSize={1}
                  particleDensity={520}
                  className="w-full h-full"
                  particleColor="#FFFFFF"
                />

                {/* Soft radial mask so the starfield bleeds out at the edges
                    (no hard rectangle) and never paints over the description
                    paragraph below. */}
                <div className="pointer-events-none absolute inset-0 w-full h-full bg-background [mask-image:radial-gradient(380px_180px_at_top,transparent_18%,black)]" />
              </div>
            )}

            <div
              className={cn(
                'text-muted-foreground/80 leading-relaxed mb-8 sm:mb-10 text-base sm:text-lg lg:text-xl font-light',
                section.align === 'center' ? 'max-w-full mx-auto text-center' : 'max-w-full',
              )}
            >
              <p className="mb-3 sm:mb-4">{section.description}</p>
              {index === 0 && (
                <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs sm:text-sm text-muted-foreground/60 mt-4 sm:mt-6">
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
          </div>
        </section>
      ))}
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
 * Discovery → Future) so the narrative beats stay 1:1 with the reference
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
      id: 'discovery',
      badge: 'Discovery',
      title: 'Expanding',
      subtitle: 'Possibilities',
      description:
        "As we push beyond familiar boundaries, new worlds of opportunity emerge from the horizon. What seemed impossible yesterday becomes tomorrow's foundation for extraordinary achievements.",
      align: 'left',
      features: [
        {
          title: 'Limitless Exploration',
          description: 'Discover new dimensions of possibility and innovation',
        },
        {
          title: 'Seamless Integration',
          description: 'Where cutting-edge technology meets human intuition',
        },
        {
          title: 'Future-Ready Solutions',
          description: "Built for tomorrow's challenges and opportunities",
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

  return <ScrollGlobe sections={sections} className={className} />
}
