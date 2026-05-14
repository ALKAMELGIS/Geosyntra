import { useEffect, useMemo, useRef, useState } from 'react'
import { useSystemSettings } from '../../store/SystemSettingsContext'
import './HeroThemeToggle.css'

/**
 * HeroThemeToggle — small floating glass pill in the Home page top-right
 * that flips between Dark and Light previews instantly (no reload).
 *
 * Why it lives only on the Home page (and not in the global header):
 *   • The user's brief was explicit — "الإضافة يجب أن تكون Minimal و
 *     Integrated مع الصفحة الرئيسية فقط" → don't touch the global
 *     header, don't enlarge it, don't change layout. So this is a
 *     standalone fixed widget mounted by `Home.tsx` only, hidden on
 *     every other route.
 *   • It writes through `useSystemSettings()` so the toggle is the
 *     same source of truth the Settings page uses (no parallel state
 *     drift). The current themeMode is `'light' | 'dark' | 'system' |
 *     'custom'`. We collapse `system`/`custom` to whatever they
 *     currently *resolve* to on the document (via the
 *     `[data-theme]` attribute) for the visual state of the knob,
 *     and clicking flips strictly to `'dark'` or `'light'` so the
 *     user always gets a deterministic preview after the click.
 *
 * Visual model (Glassmorphism, futuristic GIS):
 *   • Pill 56×32 (compact). Subtle backdrop-filter blur + saturate.
 *   • Inner sliding "knob" with an icon (Sun ↔ Moon) that morphs in
 *     place via CSS transform — single 280 ms easing for the slide
 *     plus a soft rotate so the swap reads as one fluid motion.
 *   • Border glow & inner highlight tuned to match the Black-Glass
 *     One UI identity used elsewhere (header, navmenu, dock).
 *
 * Interaction polish:
 *   • Light mouse parallax — listens to `pointermove` once, normalises
 *     cursor to (-1, +1) per axis, and translates the pill by ±4 px.
 *     Composes fine with the Spline robot's own parallax (different
 *     amplitudes, different anchors → no visual conflict).
 *   • Light scroll feedback — slides up by ~6 px and dims to 0.85
 *     opacity once the user scrolls past the Hero (so it never
 *     competes with the Innovation / Discovery / Future copy).
 *   • Honours `prefers-reduced-motion`: skips parallax + scroll
 *     translate (pill stays anchored).
 *
 * Z-index: `z-index: 35` → above the section content (z-30) and the
 * Globe (z-10), but BELOW the right-rail nav (z-40) and the progress
 * hairline (z-50). Picked deliberately so the pill sits over the
 * landing background without ever obscuring the user's scroll
 * controls or the global header (which is inside `<main>` chrome at
 * an even higher app-shell z-stack on routes that show it — Home
 * mounts headerless so this is moot here).
 */
export default function HeroThemeToggle() {
  const { settings, setSettings } = useSystemSettings()

  /* What does the toggle visually represent right now? Read from the
   * document attribute so that `themeMode === 'system'` (or `'custom'`)
   * still produces a correct visual state — those modes resolve to a
   * concrete data-theme on the <html> element. */
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() => {
    if (typeof document === 'undefined') return 'dark'
    const attr = document.documentElement.getAttribute('data-theme')
    return attr === 'light' ? 'light' : 'dark'
  })

  /* Keep `resolvedTheme` in sync with the actual <html data-theme>
   * even when something else changes the theme (Settings page, system
   * preference flip in `system` mode, etc.). Using a MutationObserver
   * is cheaper and more reliable than reacting to `settings.themeMode`
   * because the document attribute is the *real* visual state. */
  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    const sync = () => {
      const attr = root.getAttribute('data-theme')
      setResolvedTheme(attr === 'light' ? 'light' : 'dark')
    }
    sync()
    const obs = new MutationObserver(sync)
    obs.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])

  /* Mouse parallax — single rAF-throttled pointermove listener feeds
   * a transform offset on the pill. Disabled if the user prefers
   * reduced motion (`reduceMotionRef`). Amplitude is intentionally
   * tiny (4 px) so the pill never competes with the Spline robot's
   * own cursor tracking or the section content. */
  const reduceMotionRef = useRef(false)
  const [mouseOffset, setMouseOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    reduceMotionRef.current = mq.matches
    const onChange = () => {
      reduceMotionRef.current = mq.matches
      if (mq.matches) {
        setMouseOffset({ x: 0, y: 0 })
        setScrolled(false)
      }
    }
    if (mq.addEventListener) mq.addEventListener('change', onChange)
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    let raf = 0
    let lastX = 0
    let lastY = 0
    const flush = () => {
      raf = 0
      setMouseOffset({ x: lastX, y: lastY })
    }
    const onMove = (e: PointerEvent) => {
      if (reduceMotionRef.current) return
      const w = window.innerWidth || 1
      const h = window.innerHeight || 1
      lastX = (e.clientX / w - 0.5) * 2
      lastY = (e.clientY / h - 0.5) * 2
      if (!raf) raf = window.requestAnimationFrame(flush)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  /* Light scroll feedback — once the user scrolls past 60 % of the
   * first viewport, dim+nudge the pill so it stays out of the way of
   * the cinematic globe glide between Innovation / Discovery /
   * Future. We don't want a hard hide — the pill should stay
   * reachable on every section per the user's "Fixed أعلى اليمين"
   * spec. The scroll listener attaches to `window` and to the nearest
   * scrollable ancestor (mirror of the trick used in
   * `landing-page.tsx` for the same reason — the Geosyntra shell
   * scrolls inside `<main>`, not on `window`). */
  useEffect(() => {
    if (typeof window === 'undefined') return
    let ticking = false
    const probe = () => {
      ticking = false
      const y = window.scrollY || document.documentElement.scrollTop
      const main = document.querySelector('main.content') as HTMLElement | null
      const innerY = main ? main.scrollTop : 0
      const total = Math.max(y, innerY)
      const threshold = window.innerHeight * 0.6
      setScrolled(total > threshold)
    }
    const onScroll = () => {
      if (ticking) return
      ticking = true
      window.requestAnimationFrame(probe)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    const main = document.querySelector('main.content') as HTMLElement | null
    if (main) main.addEventListener('scroll', onScroll, { passive: true })
    probe()
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (main) main.removeEventListener('scroll', onScroll)
    }
  }, [])

  const handleToggle = () => {
    const next: 'light' | 'dark' = resolvedTheme === 'light' ? 'dark' : 'light'
    setSettings({ ...settings, themeMode: next })
  }

  /* Compose the inline transform every render. The pill anchors with
   * `position: fixed; top: …; right: …;` in CSS, so we only override
   * `transform` here for the parallax + scroll nudge — never `top`
   * or `right` (those stay declarative so `z-index` stacking and
   * RTL flipping behave normally). */
  const transformStyle = useMemo(() => {
    const px = (mouseOffset.x * 4).toFixed(2)
    const py = (mouseOffset.y * 4 - (scrolled ? 6 : 0)).toFixed(2)
    return `translate3d(${px}px, ${py}px, 0)`
  }, [mouseOffset.x, mouseOffset.y, scrolled])

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label={
        resolvedTheme === 'light' ? 'Switch to Dark preview' : 'Switch to Light preview'
      }
      title={
        resolvedTheme === 'light' ? 'Switch to Dark preview' : 'Switch to Light preview'
      }
      data-state={resolvedTheme}
      data-scrolled={scrolled ? 'true' : 'false'}
      className="hero-theme-toggle"
      style={{
        transform: transformStyle,
        opacity: scrolled ? 0.85 : 1,
      }}
    >
      <span className="hero-theme-toggle__track" aria-hidden>
        <span className="hero-theme-toggle__rail" />
        <span className="hero-theme-toggle__knob">
          {/* Two icons stacked — one fades + rotates out, the other
              fades + rotates in. Single transition per icon → reads
              as one fluid morph instead of two separate fades. */}
          <SunIcon className="hero-theme-toggle__icon hero-theme-toggle__icon--sun" />
          <MoonIcon className="hero-theme-toggle__icon hero-theme-toggle__icon--moon" />
        </span>
      </span>
    </button>
  )
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.4v2.4" />
      <path d="M12 19.2v2.4" />
      <path d="M4.4 4.4l1.7 1.7" />
      <path d="M17.9 17.9l1.7 1.7" />
      <path d="M2.4 12h2.4" />
      <path d="M19.2 12h2.4" />
      <path d="M4.4 19.6l1.7-1.7" />
      <path d="M17.9 6.1l1.7-1.7" />
    </svg>
  )
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1Z" />
    </svg>
  )
}
