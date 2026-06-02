import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  buildGlobeParallaxTransform,
  buildGlobeTransform,
  buildGlobeWaypoints,
  computeNarrativeScrollProgress,
  DEFAULT_SCROLL_GLOBE_CONFIG,
  GLOBE_MOTION,
  interpolateGlobePath,
  lerpGlobePosition,
  resolveGlobeConfig,
  resolveGlobeOpacity,
  resolveHeroGlobeBlur,
  resolveHeroScrimBlur,
  type ScrollGlobeGlobeConfig,
} from './globe-engine'

export type UseScrollGlobeMotionOpts = {
  hasLeading: boolean
  sectionCount: number
  globeConfig?: ScrollGlobeGlobeConfig
  onActiveSectionChange?: (index: number) => void
  /** Home SaaS hero — full-opacity centered globe, no scrim blur or gradient overlay. */
  leadingGlobeClear?: boolean
}

function findScrollContainer(el: HTMLElement | null): HTMLElement | Window {
  if (typeof window === 'undefined') return window
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

export function useScrollGlobeMotion(
  containerRef: React.RefObject<HTMLElement | null>,
  sectionRefs: React.MutableRefObject<(HTMLElement | null)[]>,
  opts: UseScrollGlobeMotionOpts,
) {
  const {
    hasLeading,
    sectionCount,
    globeConfig = DEFAULT_SCROLL_GLOBE_CONFIG,
    onActiveSectionChange,
    leadingGlobeClear = false,
  } = opts

  const resolved = useMemo(() => resolveGlobeConfig(globeConfig), [globeConfig])
  const smoothScrollPath = globeConfig.motionMode === 'smooth'
  const globeWaypoints = useMemo(
    () => buildGlobeWaypoints(resolved, hasLeading),
    [resolved, hasLeading],
  )
  const narrativeEndIndex = Math.max(0, globeWaypoints.length - 1)
  const lastSectionIndex = hasLeading ? sectionCount : Math.max(0, sectionCount - 1)

  const [activeSection, setActiveSection] = useState(0)
  const activeSectionRef = useRef(0)
  const narrativeScrollTRef = useRef(0)
  const [scrollProgress, setScrollProgress] = useState(0)
  const [globeTransform, setGlobeTransform] = useState('')
  const parallaxElRef = useRef<HTMLDivElement | null>(null)
  const [globeArrived, setGlobeArrived] = useState(false)
  const [leadingScrollT, setLeadingScrollT] = useState(0)
  const [narrativeScrollT, setNarrativeScrollT] = useState(0)
  const [heroStarsOpacity, setHeroStarsOpacity] = useState(() => (hasLeading ? 0.85 : 0))
  const [heroOverlayOpacity, setHeroOverlayOpacity] = useState(() => (hasLeading ? 1 : 0))
  const [globeOpacity, setGlobeOpacity] = useState(() => (hasLeading ? 0.94 : 0))
  const [heroScrimBlur, setHeroScrimBlur] = useState(10)
  const [heroGlobeBlur, setHeroGlobeBlur] = useState(0)

  const scrollSourceRef = useRef<HTMLElement | Window | null>(null)
  const animationFrameId = useRef<number | undefined>(undefined)
  const activeSectionNotifyRef = useRef(0)
  const globeArrivedRef = useRef(false)
  const parallaxRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 })
  const parallaxRafRef = useRef<number | undefined>(undefined)
  const mobileReducedRef = useRef(false)
  const reduceMotionRef = useRef(false)

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

    let camera = resolved.positions[0] ?? resolved.leading
    let scrollDriftY = 0
    let leadT = 0
    let pathT = 0

    const useSmoothPath =
      smoothScrollPath && !reduceMotionRef.current && !mobileReducedRef.current

    const holdCenteredGlobe = leadingGlobeClear && hasLeading

    if (useSmoothPath) {
      if (holdCenteredGlobe) {
        camera = resolved.leading
        pathT =
          newActiveSection > narrativeEndIndex
            ? 1
            : narrativeEndIndex > 0
              ? computeNarrativeScrollProgress(sectionRefs.current, narrativeEndIndex)
              : 0
      } else if (newActiveSection > narrativeEndIndex) {
        camera = globeWaypoints[globeWaypoints.length - 1]!
        pathT = 1
      } else {
        pathT = computeNarrativeScrollProgress(sectionRefs.current, narrativeEndIndex)
        camera = interpolateGlobePath(globeWaypoints, pathT)
      }
      leadT = pathT
      scrollDriftY = 0
    } else if (hasLeading) {
      const leadingEl = sectionRefs.current[0]
      const welcomeEl = sectionRefs.current[1]
      if (leadingGlobeClear && newActiveSection <= 1) {
        camera = resolved.leading
        leadT = newActiveSection === 0 ? 0 : 1
        scrollDriftY = 0
      } else if (newActiveSection === 0 && leadingEl) {
        const rect = leadingEl.getBoundingClientRect()
        const vh = window.innerHeight || 1
        const sectionCenter = rect.top + rect.height / 2
        const centerDrift = Math.abs(sectionCenter - viewportCenter)
        leadT = Math.min(Math.max((centerDrift - vh * 0.06) / (vh * 0.42), 0), 1)
        camera = lerpGlobePosition(resolved.leading, resolved.positions[0]!, leadT)
        scrollDriftY = -leadT * GLOBE_MOTION.scrollDriftVh
      } else if (newActiveSection === 1 && leadingEl && welcomeEl) {
        const wRect = welcomeEl.getBoundingClientRect()
        const vh = window.innerHeight || 1
        leadT = Math.min(Math.max(1 - Math.abs(wRect.top + wRect.height / 2 - viewportCenter) / (vh * 0.5), 0), 1)
        const welcomePos = resolved.positions[0]!
        camera = leadT >= 0.9 ? welcomePos : lerpGlobePosition(resolved.leading, welcomePos, leadT)
      } else {
        const globeIdx = Math.max(0, newActiveSection - 1)
        const idx = Math.min(globeIdx, resolved.positions.length - 1)
        camera = resolved.positions[idx]!
      }
    } else {
      const idx = Math.min(newActiveSection, resolved.positions.length - 1)
      camera = resolved.positions[idx]!
    }

    setLeadingScrollT(leadT)
    const nextNarrativeT = useSmoothPath
      ? pathT
      : narrativeEndIndex > 0
        ? Math.min(newActiveSection / narrativeEndIndex, 1)
        : 0
    narrativeScrollTRef.current = nextNarrativeT
    setNarrativeScrollT(nextNarrativeT)
    setGlobeTransform(buildGlobeTransform(camera, { scrollDriftY }))
    setActiveSection(newActiveSection)
    activeSectionRef.current = newActiveSection

    const onLeading = useSmoothPath
      ? hasLeading && pathT < 0.18
      : hasLeading && newActiveSection === 0
    const onWelcome = useSmoothPath
      ? hasLeading && pathT >= 0.18 && pathT < 0.36
      : hasLeading && newActiveSection === 1
    const nearLeading = useSmoothPath ? hasLeading && pathT < 0.4 : hasLeading && newActiveSection <= 1
    const heroClear = leadingGlobeClear && (useSmoothPath ? pathT < 0.16 : onLeading)
    const welcomeClear =
      leadingGlobeClear &&
      (useSmoothPath ? pathT >= 0.16 && pathT < 0.34 : onWelcome && leadT >= 0.85)
    const innovationFutureClear =
      leadingGlobeClear &&
      (useSmoothPath
        ? pathT >= 0.32
        : hasLeading && newActiveSection >= 1)
    const globeVisualClear =
      leadingGlobeClear && hasLeading
        ? true
        : heroClear || welcomeClear || innovationFutureClear
    const fadeLeadT = useSmoothPath ? pathT : leadT
    setHeroStarsOpacity(
      leadingGlobeClear && hasLeading
        ? newActiveSection === 0
          ? 0.85
          : 0
        : nearLeading
          ? Math.max(0.35, 1 - fadeLeadT * 0.55)
          : 0,
    )
    setHeroOverlayOpacity(
      globeVisualClear ? 0 : onLeading ? 1 : nearLeading ? Math.max(0, 1 - fadeLeadT) : 0,
    )

    setGlobeOpacity(
      resolveGlobeOpacity({
        hasLeading,
        activeSection: newActiveSection,
        lastSectionIndex,
        globeArrived: globeArrivedRef.current,
        reduceMotion: reduceMotionRef.current,
        mobileReduced: mobileReducedRef.current,
        leadingGlobeClear,
      }),
    )
    setHeroScrimBlur(globeVisualClear ? 0 : resolveHeroScrimBlur(fadeLeadT))
    setHeroGlobeBlur(globeVisualClear ? 0 : resolveHeroGlobeBlur(fadeLeadT))

    if (activeSectionNotifyRef.current !== newActiveSection) {
      activeSectionNotifyRef.current = newActiveSection
      onActiveSectionChange?.(newActiveSection)
    }
  }, [
    globeWaypoints,
    hasLeading,
    lastSectionIndex,
    narrativeEndIndex,
    resolved,
    sectionRefs,
    onActiveSectionChange,
    leadingGlobeClear,
    smoothScrollPath,
  ])

  useEffect(() => {
    globeArrivedRef.current = globeArrived
    if (globeArrived) updateScrollPosition()
  }, [globeArrived, updateScrollPosition])

  useEffect(() => {
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
    updateScrollPosition()
    const settleTimer = window.setTimeout(updateScrollPosition, 60)

    return () => {
      source.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current)
      window.clearTimeout(settleTimer)
    }
  }, [containerRef, updateScrollPosition])

  useEffect(() => {
    setGlobeTransform(buildGlobeTransform(hasLeading ? resolved.leading : resolved.positions[0]!))
    const el = parallaxElRef.current
    if (el) el.style.transform = buildGlobeParallaxTransform(0, 0, false)
  }, [hasLeading, resolved])

  useEffect(() => {
    if (typeof window === 'undefined') {
      setGlobeArrived(true)
      return
    }
    reduceMotionRef.current = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)
    mobileReducedRef.current = Boolean(window.matchMedia?.('(max-width: 767px)')?.matches)
    const onResize = () => {
      mobileReducedRef.current = window.matchMedia('(max-width: 767px)').matches
    }
    window.addEventListener('resize', onResize, { passive: true })

    if (reduceMotionRef.current || leadingGlobeClear) {
      globeArrivedRef.current = true
      setGlobeArrived(true)
      return () => window.removeEventListener('resize', onResize)
    }
    const raf = window.requestAnimationFrame(() => {
      globeArrivedRef.current = true
      setGlobeArrived(true)
    })
    return () => {
      window.cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [leadingGlobeClear])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (reduceMotionRef.current) return

    const onMove = (e: PointerEvent) => {
      const cx = window.innerWidth / 2
      const cy = window.innerHeight / 2
      parallaxRef.current.tx = Math.max(-1, Math.min(1, (e.clientX - cx) / cx))
      parallaxRef.current.ty = Math.max(-1, Math.min(1, (e.clientY - cy) / cy))
    }

    const tick = () => {
      const p = parallaxRef.current
      const k = mobileReducedRef.current ? GLOBE_MOTION.parallaxLerp * 0.55 : GLOBE_MOTION.parallaxLerp
      p.x += (p.tx - p.x) * k
      p.y += (p.ty - p.y) * k
      const parallaxOn = leadingGlobeClear
        ? globeArrivedRef.current
        : smoothScrollPath
          ? narrativeScrollTRef.current > 0.08 && activeSectionRef.current <= narrativeEndIndex
          : activeSectionRef.current <= (hasLeading ? 1 : 0)
      const el = parallaxElRef.current
      if (el) {
        el.style.transform = buildGlobeParallaxTransform(p.x, p.y, parallaxOn)
      }
      parallaxRafRef.current = window.requestAnimationFrame(tick)
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    parallaxRafRef.current = window.requestAnimationFrame(tick)

    return () => {
      window.removeEventListener('pointermove', onMove)
      if (parallaxRafRef.current) cancelAnimationFrame(parallaxRafRef.current)
    }
  }, [hasLeading, leadingGlobeClear, smoothScrollPath, narrativeEndIndex])

  return {
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
    leadingScrollT,
    lastSectionIndex,
    smoothScrollPath,
  }
}
