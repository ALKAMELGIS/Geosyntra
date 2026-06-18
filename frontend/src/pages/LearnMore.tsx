import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Card } from '../components/ui/Card'
import { Spotlight } from '../components/ui/spotlight'
import GsIcon, { type GsIconName } from '../components/ui/GsIcon'
import './LearnMore.css'

/**
 * /learn-more — internal "About Geosyntra" surface wired to the Home
 * landing page's hero "Learn More" CTA.
 *
 * Anatomy (top → bottom, smooth-scroll between sections via the breadcrumb):
 *   1. Crumb + back affordance    — keeps the page rooted in the app shell
 *      instead of feeling like a marketing redirect.
 *   2. Hero (Spotlight + copy) — glass card with the platform headline
 *      and primary CTAs.
 *   3. About                       — short pitch, mirrors the Home hero
 *      copy + adds the platform mission.
 *   4. Capabilities grid           — 6 GIS / RS / AI capability tiles, each
 *      with a unified GsIcon glyph + short blurb. Auto-fits on every
 *      breakpoint.
 *   5. API & Integration            — three glass cards (REST/STAC, OGC,
 *      Webhooks/SDK) describing how Geosyntra plugs into other systems.
 *   6. Dashboard preview            — pseudo-screenshot rendered with CSS
 *      so the section ships zero binary assets and stays sharp on retina.
 *   7. Analytics & AI modules       — final glass row with three pillar
 *      tiles (Predictive, Generative, Realtime) + closing CTA.
 *
 * The whole surface respects:
 *   - Black Glass (dark) + White Glass (light) themes via existing
 *     `[data-theme]` design tokens.
 *   - `prefers-reduced-motion` (framer-motion `useReducedMotion`) so the
 *     stagger animations degrade to instant render for accessibility users.
 *   - The existing app shell (header + sidebar) — visitors keep their
 *     navigation context (sidebar still highlights Home).
 */

interface CapabilityItem {
  icon: GsIconName
  title: string
  description: string
}

const CAPABILITIES: CapabilityItem[] = [
  {
    icon: 'globe',
    title: 'Smart GIS Workspace',
    description:
      'Vector + raster authoring, layer styling, ArcGIS / Mapbox / Sentinel sources, on-the-fly SQL, and a Tables tool that mirrors every layer to a live grid.',
  },
  {
    icon: 'image',
    title: 'Remote Sensing Indices',
    description:
      'NDVI, NDMI, NDWI, EVI, MSI, NDRE, BSI — daily clipped for any AOI with multi-source fallback (Sentinel Hub, Microsoft Planetary, ESRI Image Server).',
  },
  {
    icon: 'sliders',
    title: 'Multi-dimensional Analytics',
    description:
      'Time-series + zonal stats over your AOIs, instantly chartable, exportable to CSV / GeoJSON, and replayable as animated heatmaps over the map.',
  },
  {
    icon: 'shield',
    title: 'Enterprise-grade Security',
    description:
      'Role-based access (Admin / Manager / Editor / Viewer), per-AOI scoping, audit log on every write, and on-prem-friendly auth that never leaves your VPC.',
  },
  {
    icon: 'paint-roller',
    title: 'Adaptive Theming',
    description:
      'Black Glass One UI + White Glass Lite Mode, RTL-aware, motion-aware, every panel themed via design tokens — no hard-coded colors anywhere in the chrome.',
  },
  {
    icon: 'check-circle',
    title: 'Operational Workflows',
    description:
      'Fertigation records, recipe builder, custom forms, scheduled reports, and a custom-page system that lets non-developers ship dashboards in minutes.',
  },
]

interface IntegrationItem {
  icon: GsIconName
  title: string
  blurb: string
  bullets: string[]
}

const INTEGRATIONS: IntegrationItem[] = [
  {
    icon: 'globe',
    title: 'REST + STAC',
    blurb: 'Pull anything you can render — out the front door.',
    bullets: ['Vector + raster JSON endpoints', 'STAC items + collections', 'Signed downloads + tokens'],
  },
  {
    icon: 'sliders',
    title: 'OGC Standards',
    blurb: 'WMS, WMTS, WFS, WCS — speak the geospatial lingua franca.',
    bullets: ['BBox + time queries', 'EPSG:4326 / 3857 reprojection', 'GetCapabilities discovery'],
  },
  {
    icon: 'check',
    title: 'Webhooks + SDK',
    blurb: 'Push events to your stack the moment they happen on the map.',
    bullets: ['HMAC-signed deliveries', 'TypeScript SDK', 'CLI for batch + CI'],
  },
]

interface AiModule {
  icon: GsIconName
  title: string
  description: string
}

const AI_MODULES: AiModule[] = [
  {
    icon: 'sliders',
    title: 'Predictive Analytics',
    description:
      'Yield forecasts, anomaly detection, drought + heat-stress probabilities — trained per-region on your historical satellite + sensor stack.',
  },
  {
    icon: 'paint-roller',
    title: 'Generative Geo-AI',
    description:
      'Ask "show me unhealthy parcels in the last week" and the assistant writes the SQL, paints the map, and explains what it found — with citations.',
  },
  {
    icon: 'check-circle',
    title: 'Real-time Inference',
    description:
      'Stream sensor + satellite events through edge models, route alerts via webhook + email, and replay everything on the operations timeline.',
  },
]

/**
 * Section list for the snap-dot rail (id matches the `<section id>`).
 * Mirrors the topbar shortcut nav so the two stay in sync — change
 * here, the topbar's `[label, id]` map below picks it up automatically.
 */
const SNAP_SECTIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'hero', label: 'Hero' },
  { id: 'about', label: 'About' },
  { id: 'capabilities', label: 'Capabilities' },
  { id: 'api', label: 'API' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'ai', label: 'AI Modules' },
] as const

export default function LearnMore() {
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion() ?? false

  /**
   * Smooth-scroll the matching section into view when a breadcrumb link
   * is clicked. Scoped to the LearnMore root so the handler doesn't
   * accidentally hijack scroll inside other surfaces if the user opens
   * this page in a popover later.
   */
  const rootRef = useRef<HTMLDivElement>(null)
  const onCrumbClick = (id: string) => {
    const target = rootRef.current?.querySelector(`#${id}`)
    if (target) target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
  }

  /**
   * Active-section tracking for the snap-dot rail.
   *
   * `IntersectionObserver` fires whenever a section crosses the
   * viewport-centric horizontal band defined by `rootMargin`. We pin the
   * observer's root to `.learn-more-page` (the actual scroller now that
   * the page is a snap container) and use a tall negative top margin +
   * negative bottom margin so only the section currently filling the
   * middle slab of the viewport is reported as intersecting. Whichever
   * section last intersected wins → its dot lights up.
   *
   * IO is *much* cheaper than wiring a `scroll` listener that walks
   * `getBoundingClientRect()` every frame, and it stays robust if the
   * page reflows (e.g. web fonts or images loading).
   */
  const [activeSection, setActiveSection] = useState<string>('hero')
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const sections = SNAP_SECTIONS.map(s => root.querySelector<HTMLElement>(`#${s.id}`)).filter(
      (el): el is HTMLElement => el != null,
    )
    if (!sections.length) return
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id)
          }
        }
      },
      {
        root,
        /* Only count a section as "active" once it covers the middle 30%
         * of the viewport — keeps the dot from flickering between two
         * sections during the snap easing. */
        rootMargin: '-35% 0px -35% 0px',
        threshold: 0,
      },
    )
    sections.forEach(s => observer.observe(s))
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    document.title = 'Learn More — Geosyntra'
  }, [])

  /* Cubic bezier control points for the page-wide reveal easing. Hoisted
   * + `as const` so TypeScript infers a fixed-length tuple instead of a
   * generic `number[]` (which framer-motion v11+ rejects in
   * `transition.ease`). */
  const REVEAL_EASE = [0.22, 1, 0.36, 1] as const

  /** Stagger child reveal for `motion.section` blocks (degrades to instant for reduced motion). */
  const sectionMotion = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 24 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, amount: 0.15 },
        transition: { duration: 0.55, ease: REVEAL_EASE },
      }

  return (
    <div className="learn-more-page" ref={rootRef}>
      {/* Floating snap-dot rail — one dot per snap section, lights up
       * the active one as the user pages through. Hidden on phones via
       * the `lm-snap-dots` CSS rule (the topbar shortcuts cover that
       * breakpoint). */}
      <aside className="lm-snap-dots" aria-label="Section navigation">
        {SNAP_SECTIONS.map(s => (
          <button
            key={s.id}
            type="button"
            className={`lm-snap-dot${activeSection === s.id ? ' lm-snap-dot--active' : ''}`}
            aria-label={`Go to ${s.label}`}
            aria-current={activeSection === s.id ? 'true' : undefined}
            onClick={() => onCrumbClick(s.id)}
          >
            <span className="lm-snap-dot__label">{s.label}</span>
          </button>
        ))}
      </aside>

      <header className="lm-topbar">
        <div className="lm-topbar__left">
          <button
            type="button"
            className="lm-back-btn"
            onClick={() => navigate('/')}
            aria-label="Back to Home"
          >
            <GsIcon name="close" size={16} className="lm-back-btn__chevron" />
            <span>Back</span>
          </button>
          <nav aria-label="Breadcrumb" className="lm-crumbs">
            <button type="button" className="lm-crumb" onClick={() => navigate('/')}>
              Home
            </button>
            <span className="lm-crumb-sep" aria-hidden>
              ›
            </span>
            <span className="lm-crumb lm-crumb--active" aria-current="page">
              Learn More
            </span>
          </nav>
        </div>
        <nav aria-label="Page sections" className="lm-section-nav">
          {[
            ['About', 'about'],
            ['Capabilities', 'capabilities'],
            ['API', 'api'],
            ['Dashboard', 'dashboard'],
            ['AI Modules', 'ai'],
          ].map(([label, id]) => (
            <button
              key={id}
              type="button"
              className="lm-section-nav__btn"
              onClick={() => onCrumbClick(id)}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      {/* === Hero — Spotlight + copy === */}
      <motion.section
        id="hero"
        className="lm-section lm-section--hero"
        {...sectionMotion}
      >
        <Card className="lm-hero-card relative w-full min-h-[420px] md:min-h-[500px] overflow-hidden">
          <Spotlight className="-top-40 left-0 md:left-60 md:-top-20" size={500} />

          <div className="relative z-10 flex h-full min-h-[inherit] flex-col justify-center p-8 md:p-12 max-w-3xl">
              <span className="lm-hero-eyebrow">Geosyntra Platform</span>
              <h1 className="lm-hero-title">
                <span className="lm-hero-title__line">Geospatial Intelligence,</span>
                <span className="lm-hero-title__line lm-hero-title__line--accent">
                  Engineered for Operations.
                </span>
              </h1>
              <p className="lm-hero-lead">
                Geosyntra fuses GIS, Remote Sensing, and AI into a single Black-Glass workspace —
                so analysts, agronomists, and operators turn satellite + sensor data into
                decisions in minutes, not weeks.
              </p>
              <div className="lm-hero-actions">
                <button
                  type="button"
                  className="lm-btn lm-btn--primary"
                  onClick={() => navigate('/satellite/indices')}
                >
                  <GsIcon name="image" size={15} /> Open Satellite Intelligence
                </button>
                <button
                  type="button"
                  className="lm-btn lm-btn--ghost"
                  onClick={() => navigate('/')}
                >
                  <GsIcon name="globe" size={15} /> Back to Home
                </button>
              </div>
            </div>
        </Card>
      </motion.section>

      {/* === About === */}
      <motion.section id="about" className="lm-section lm-section--about" {...sectionMotion}>
        <div className="lm-section-head">
          <span className="lm-section-eyebrow">About</span>
          <h2 className="lm-section-title">A geospatial OS for the field and the boardroom.</h2>
        </div>
        <div className="lm-about-grid">
          <p className="lm-about-lead">
            Geosyntra is an enterprise GIS + Remote Sensing platform built for organisations that
            need to <strong>see, understand, and act on the land they manage</strong>. We deliver a
            single workspace where satellite imagery, IoT sensors, operational forms, and AI
            assistants live side-by-side — with the security, scoping, and audit posture
            production teams expect.
          </p>
          <div className="lm-about-stats">
            {[
              ['7+', 'Vegetation indices live'],
              ['4', 'Imagery providers'],
              ['100%', 'Themed via design tokens'],
              ['RTL', 'First-class Arabic support'],
            ].map(([n, label]) => (
              <div key={label} className="lm-stat">
                <div className="lm-stat__num">{n}</div>
                <div className="lm-stat__label">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* === Capabilities — Smart GIS / RS === */}
      <motion.section id="capabilities" className="lm-section" {...sectionMotion}>
        <div className="lm-section-head">
          <span className="lm-section-eyebrow">Capabilities</span>
          <h2 className="lm-section-title">Smart GIS, Remote Sensing, and the operational layer.</h2>
          <p className="lm-section-sub">
            Six pillars built into the platform — every one wired to the same auth, theming, and
            audit stack.
          </p>
        </div>
        <div className="lm-cap-grid">
          {CAPABILITIES.map((c, i) => (
            <motion.div
              key={c.title}
              className="lm-cap-card"
              {...(reduceMotion
                ? {}
                : {
                    initial: { opacity: 0, y: 18 },
                    whileInView: { opacity: 1, y: 0 },
                    viewport: { once: true, amount: 0.25 },
                    transition: { duration: 0.45, delay: i * 0.06, ease: REVEAL_EASE },
                  })}
            >
              <div className="lm-cap-card__icon" aria-hidden>
                <GsIcon name={c.icon} size={20} />
              </div>
              <h3 className="lm-cap-card__title">{c.title}</h3>
              <p className="lm-cap-card__body">{c.description}</p>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* === API + Integration === */}
      <motion.section id="api" className="lm-section" {...sectionMotion}>
        <div className="lm-section-head">
          <span className="lm-section-eyebrow">API & Integration</span>
          <h2 className="lm-section-title">Plug Geosyntra into your stack.</h2>
          <p className="lm-section-sub">
            Speak REST, STAC, OGC, or webhooks — Geosyntra meets your data infrastructure where
            it lives.
          </p>
        </div>
        <div className="lm-int-grid">
          {INTEGRATIONS.map(item => (
            <Card key={item.title} className="lm-int-card">
              <div className="lm-int-card__head">
                <span className="lm-int-card__icon" aria-hidden>
                  <GsIcon name={item.icon} size={20} />
                </span>
                <div>
                  <h3 className="lm-int-card__title">{item.title}</h3>
                  <p className="lm-int-card__blurb">{item.blurb}</p>
                </div>
              </div>
              <ul className="lm-int-card__bullets">
                {item.bullets.map(b => (
                  <li key={b}>
                    <GsIcon name="check" size={13} /> {b}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </motion.section>

      {/* === Dashboard Preview === */}
      <motion.section id="dashboard" className="lm-section" {...sectionMotion}>
        <div className="lm-section-head">
          <span className="lm-section-eyebrow">Dashboard</span>
          <h2 className="lm-section-title">A workspace that gets out of the way.</h2>
          <p className="lm-section-sub">
            Black-Glass chrome, frosted panels, and a map that always takes centre-stage. Every
            tool docks where you need it; nothing competes with the data.
          </p>
        </div>
        <Card className="lm-dash-card">
          <div className="lm-dash-frame" aria-hidden>
            <div className="lm-dash-frame__chrome">
              <span className="lm-dash-frame__dot lm-dash-frame__dot--r" />
              <span className="lm-dash-frame__dot lm-dash-frame__dot--y" />
              <span className="lm-dash-frame__dot lm-dash-frame__dot--g" />
              <span className="lm-dash-frame__addr">geosyntra.app/satellite/indices</span>
            </div>
            <div className="lm-dash-frame__body">
              <div className="lm-dash-frame__rail">
                {Array.from({ length: 7 }).map((_, i) => (
                  <span key={i} className="lm-dash-frame__rail-pip" />
                ))}
              </div>
              <div className="lm-dash-frame__map">
                <div className="lm-dash-frame__topo" />
                <div className="lm-dash-frame__pin lm-dash-frame__pin--a" />
                <div className="lm-dash-frame__pin lm-dash-frame__pin--b" />
                <div className="lm-dash-frame__pin lm-dash-frame__pin--c" />
              </div>
              <div className="lm-dash-frame__panel">
                <div className="lm-dash-frame__panel-row" style={{ width: '70%' }} />
                <div className="lm-dash-frame__panel-row" style={{ width: '95%' }} />
                <div className="lm-dash-frame__panel-row" style={{ width: '60%' }} />
                <div className="lm-dash-frame__panel-row" style={{ width: '85%' }} />
                <div className="lm-dash-frame__panel-bar" />
                <div className="lm-dash-frame__panel-row" style={{ width: '50%' }} />
                <div className="lm-dash-frame__panel-row" style={{ width: '40%' }} />
              </div>
            </div>
          </div>
        </Card>
      </motion.section>

      {/* === AI Modules === */}
      <motion.section id="ai" className="lm-section" {...sectionMotion}>
        <div className="lm-section-head">
          <span className="lm-section-eyebrow">Analytics & AI</span>
          <h2 className="lm-section-title">Three AI pillars, one operations layer.</h2>
          <p className="lm-section-sub">
            Predictive, generative, and real-time models — all sharing the same data + auth, all
            speaking your map.
          </p>
        </div>
        <div className="lm-ai-grid">
          {AI_MODULES.map((m, i) => (
            <motion.div
              key={m.title}
              className="lm-ai-card"
              {...(reduceMotion
                ? {}
                : {
                    initial: { opacity: 0, y: 16 },
                    whileInView: { opacity: 1, y: 0 },
                    viewport: { once: true, amount: 0.25 },
                    transition: { duration: 0.45, delay: i * 0.08, ease: REVEAL_EASE },
                  })}
            >
              <div className="lm-ai-card__icon" aria-hidden>
                <GsIcon name={m.icon} size={22} />
              </div>
              <h3 className="lm-ai-card__title">{m.title}</h3>
              <p className="lm-ai-card__body">{m.description}</p>
            </motion.div>
          ))}
        </div>

        <div className="lm-cta-row">
          <button
            type="button"
            className="lm-btn lm-btn--primary lm-btn--lg"
            onClick={() => navigate('/satellite/indices')}
          >
            <GsIcon name="globe" size={16} /> Launch the Workspace
          </button>
          <button
            type="button"
            className="lm-btn lm-btn--ghost lm-btn--lg"
            onClick={() => navigate('/')}
          >
            Back to Home
          </button>
        </div>
      </motion.section>
    </div>
  )
}
