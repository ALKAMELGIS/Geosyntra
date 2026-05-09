import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Globe from '@/components/ui/globe'
import { cn } from '@/lib/utils'
import { useLanguage, type AppLanguage } from '@/lib/i18n'
import { homeMenuItems } from '@/config/homeMenu'
import { startSession } from '@/lib/auth'

export interface ScrollGlobeSection {
  id: string
  badge?: string
  title: string
  subtitle?: string
  description: string
  align?: 'left' | 'center' | 'right'
  /** Small lines under hero description (e.g. bilingual hints). */
  heroHints?: string[]
  features?: { title: string; description: string }[]
  actions?: { label: string; variant: 'primary' | 'secondary'; onClick?: () => void }[]
}

export interface ScrollGlobeProps {
  sections: ScrollGlobeSection[]
  globeConfig?: {
    positions: {
      top: string
      left: string
      scale: number
    }[]
  }
  className?: string
  /** Scroll this section into view once after mount (e.g. deep link from nav). */
  initialSectionId?: string | null
}

const defaultGlobeConfig = {
  positions: [
    { top: '50%', left: '75%', scale: 1.35 },
    { top: '28%', left: '52%', scale: 0.88 },
    { top: '18%', left: '88%', scale: 1.75 },
    { top: '48%', left: '48%', scale: 1.65 },
  ],
}

const parsePercent = (str: string): number => parseFloat(str.replace('%', ''))

export function ScrollGlobe({ sections, globeConfig = defaultGlobeConfig, className, initialSectionId }: ScrollGlobeProps) {
  const [activeSection, setActiveSection] = useState(0)
  const [scrollProgress, setScrollProgress] = useState(0)
  const [globeTransform, setGlobeTransform] = useState('')
  const sectionRefs = useRef<(HTMLElement | null)[]>([])
  const animationFrameId = useRef<number | undefined>(undefined)
  const didInitialScroll = useRef(false)

  const calculatedPositions = useMemo(() => {
    return globeConfig.positions.map((pos) => ({
      top: parsePercent(pos.top),
      left: parsePercent(pos.left),
      scale: pos.scale,
    }))
  }, [globeConfig.positions])

  const updateScrollPosition = useCallback(() => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop
    const docHeight = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
    const progress = Math.min(Math.max(scrollTop / docHeight, 0), 1)
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

    const currentPos = calculatedPositions[Math.min(newActiveSection, calculatedPositions.length - 1)]
    const transform = `translate3d(${currentPos.left}vw, ${currentPos.top}vh, 0) translate3d(-50%, -50%, 0) scale3d(${currentPos.scale}, ${currentPos.scale}, 1)`
    setGlobeTransform(transform)
    setActiveSection(newActiveSection)
  }, [calculatedPositions])

  useEffect(() => {
    let ticking = false
    const handleScroll = () => {
      if (!ticking) {
        animationFrameId.current = window.requestAnimationFrame(() => {
          updateScrollPosition()
          ticking = false
        })
        ticking = true
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    updateScrollPosition()
    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current)
    }
  }, [updateScrollPosition])

  useEffect(() => {
    const initialPos = calculatedPositions[0]
    const initialTransform = `translate3d(${initialPos.left}vw, ${initialPos.top}vh, 0) translate3d(-50%, -50%, 0) scale3d(${initialPos.scale}, ${initialPos.scale}, 1)`
    setGlobeTransform(initialTransform)
  }, [calculatedPositions])

  useEffect(() => {
    if (!initialSectionId || didInitialScroll.current) return
    const idx = sections.findIndex((s) => s.id === initialSectionId)
    if (idx < 0) return
    didInitialScroll.current = true
    const id = window.requestAnimationFrame(() => {
      sectionRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    return () => cancelAnimationFrame(id)
  }, [initialSectionId, sections])

  return (
    <div
      className={cn(
        'landing-scroll-globe-root relative min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-background text-foreground',
        className,
      )}
    >
      <div className="pointer-events-none fixed left-0 top-0 z-50 h-0.5 w-full bg-gradient-to-r from-border/20 via-border/40 to-border/20">
        <div
          className="h-full bg-gradient-to-r from-primary via-blue-600 to-blue-900 shadow-sm will-change-transform"
          style={{
            transform: `scaleX(${scrollProgress})`,
            transformOrigin: 'left center',
            transition: 'transform 0.15s ease-out',
            filter: 'drop-shadow(0 0 2px rgba(59, 130, 246, 0.3))',
          }}
        />
      </div>

      <div className="fixed right-2 top-1/2 z-40 hidden -translate-y-1/2 sm:right-4 sm:flex lg:right-8">
        <div className="relative space-y-3 sm:space-y-4 lg:space-y-6">
          {sections.map((section, index) => (
            <div key={section.id} className="group relative">
              <div
                className={cn(
                  'nav-label absolute right-5 top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-md border border-border/60 bg-background/95 px-2 py-1 text-xs font-medium shadow-xl backdrop-blur-md sm:right-6 sm:px-3 sm:py-1.5 sm:text-sm lg:right-8 lg:px-4 lg:py-2 lg:text-base',
                  activeSection === index ? 'animate-fadeOut opacity-100' : 'opacity-0',
                )}
              >
                <div className="flex items-center gap-1 sm:gap-1.5 lg:gap-2">
                  <div className="h-1 w-1 animate-pulse rounded-full bg-primary sm:h-1.5 sm:w-1.5 lg:h-2 lg:w-2" />
                  <span>{section.badge || `Section ${index + 1}`}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  sectionRefs.current[index]?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                  })
                }}
                className={cn(
                  'relative h-2 w-2 rounded-full border-2 transition-all duration-300 before:absolute before:inset-0 before:rounded-full before:transition-all before:duration-300 sm:h-2.5 sm:w-2.5 lg:h-3 lg:w-3',
                  activeSection === index
                    ? 'border-primary bg-primary shadow-lg before:animate-ping before:bg-primary/20'
                    : 'border-muted-foreground/40 bg-transparent hover:scale-125 hover:border-primary/60 hover:bg-primary/10',
                )}
                aria-label={`Go to ${section.badge || `section ${index + 1}`}`}
              />
            </div>
          ))}
          <div className="absolute bottom-0 left-1/2 top-0 -z-10 w-0.5 -translate-x-1/2 bg-gradient-to-b from-transparent via-primary/20 to-transparent lg:w-px" />
        </div>
      </div>

      <div
        className="pointer-events-none fixed z-10 transition-all duration-[1400ms] ease-[cubic-bezier(0.23,1,0.32,1)] will-change-transform"
        style={{
          transform: globeTransform,
          opacity: activeSection === 3 ? 0.42 : 0.88,
        }}
      >
        <div className="scale-75 sm:scale-90 lg:scale-100">
          <Globe />
        </div>
      </div>

      {sections.map((section, index) => (
        <section
          key={section.id}
          id={`landing-section-${section.id}`}
          ref={(el) => {
            sectionRefs.current[index] = el
          }}
          className={cn(
            'relative z-20 flex min-h-screen w-full max-w-full flex-col justify-center overflow-hidden px-4 py-12 sm:px-6 sm:py-16 md:px-8 lg:px-12 lg:py-20',
            section.align === 'center' && 'items-center text-center',
            section.align === 'right' && 'items-end text-right',
            section.align !== 'center' && section.align !== 'right' && 'items-start text-left',
          )}
        >
          <div
            className={cn(
              'w-full max-w-sm translate-y-0 opacity-100 transition-all duration-700 will-change-transform sm:max-w-lg md:max-w-2xl lg:max-w-4xl xl:max-w-5xl',
            )}
          >
            <h1
              className={cn(
                'mb-6 font-bold leading-[1.1] tracking-tight sm:mb-8',
                index === 0
                  ? 'text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl 2xl:text-8xl'
                  : 'text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl 2xl:text-7xl',
              )}
            >
              {section.subtitle ? (
                <div className="space-y-1 sm:space-y-2">
                  <div className="bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">{section.title}</div>
                  <div className="text-[0.6em] font-medium tracking-wider text-muted-foreground/90 sm:text-[0.7em]">{section.subtitle}</div>
                </div>
              ) : (
                <div className="bg-gradient-to-r from-foreground via-foreground to-foreground/80 bg-clip-text text-transparent">{section.title}</div>
              )}
            </h1>

            <div
              className={cn(
                'mb-8 text-base font-light leading-relaxed text-muted-foreground/80 sm:mb-10 sm:text-lg lg:text-xl',
                section.align === 'center' ? 'mx-auto max-w-full text-center' : 'max-w-full',
              )}
            >
              <p className="mb-3 sm:mb-4">{section.description}</p>
              {index === 0 && section.heroHints?.length ? (
                <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground/60 sm:mt-6 sm:gap-4 sm:text-sm">
                  {section.heroHints.map((hint, hi) => (
                    <div key={hi} className="flex items-center gap-1.5 sm:gap-2">
                      <div
                        className="h-1 w-1 animate-pulse rounded-full bg-primary"
                        style={hi ? { animationDelay: '0.5s' } : undefined}
                      />
                      <span>{hint}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {section.features ? (
              <div className="mb-8 grid gap-3 sm:mb-10 sm:gap-4">
                {section.features.map((feature) => (
                  <div
                    key={feature.title}
                    className="group rounded-lg border bg-card/50 p-4 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/20 hover:bg-card/80 hover:shadow-lg hover:shadow-primary/5 sm:rounded-xl sm:p-5 lg:p-6"
                  >
                    <div className="flex items-start gap-3 sm:gap-4">
                      <div className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary/60 transition-colors group-hover:bg-primary sm:mt-2 sm:h-2 sm:w-2" />
                      <div className="min-w-0 flex-1 space-y-1.5 sm:space-y-2">
                        <h3 className="text-base font-semibold text-card-foreground sm:text-lg">{feature.title}</h3>
                        <p className="text-sm leading-relaxed text-muted-foreground/80 sm:text-base">{feature.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {section.actions ? (
              <div
                className={cn(
                  'flex flex-col flex-wrap gap-3 sm:flex-row sm:gap-4',
                  section.align === 'center' && 'justify-center',
                  section.align === 'right' && 'justify-end',
                  (!section.align || section.align === 'left') && 'justify-start',
                )}
              >
                {section.actions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={action.onClick}
                    className={cn(
                      'group relative w-full rounded-lg px-6 py-3 text-sm font-medium transition-all duration-300 hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-primary/20 active:scale-[0.98] sm:w-auto sm:rounded-xl sm:px-8 sm:py-4 sm:text-base',
                      'hover:shadow-lg',
                      action.variant === 'primary'
                        ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 hover:shadow-primary/30'
                        : 'border-2 border-border/60 bg-background/50 text-foreground backdrop-blur-sm hover:border-primary/30 hover:bg-accent/50',
                    )}
                  >
                    <span className="relative z-10">{action.label}</span>
                    {action.variant === 'primary' ? (
                      <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-primary to-primary/80 opacity-0 transition-opacity duration-300 group-hover:opacity-100 sm:rounded-xl" />
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      ))}
    </div>
  )
}

function t(lang: AppLanguage, en: string, ar: string) {
  return lang === 'ar' ? ar : en
}

function mapOpenGroupToSectionId(openGroup?: string): string | null {
  if (!openGroup) return null
  const map: Record<string, string> = {
    dashboard: 'connected',
    satellite: 'connected',
    data: 'discovery',
    sensors: 'discovery',
    master: 'future',
    admin: 'future',
    account: 'future',
    'ai-agro-cloud-home': 'hero',
    'camera-direct': 'discovery',
    'gps-direct': 'discovery',
  }
  return map[openGroup] ?? 'connected'
}

function buildAgroSections(
  lang: AppLanguage,
  navigate: (path: string) => void,
  onLogout: () => void,
): ScrollGlobeSection[] {
  const nav = (path: string) => () => navigate(path)

  const topTiles = homeMenuItems
    .filter((m) => ['dashboard', 'satellite', 'data', 'sensors', 'ai-agro-cloud-home', 'master', 'admin'].includes(m.id))
    .map((m) => ({
      title: m.label[lang],
      description: m.items?.length
        ? t(lang, `${m.items.length} shortcuts in this group`, `${m.items.length} اختصار في هذه المجموعة`)
        : t(lang, 'Open module', 'فتح الوحدة'),
    }))

  return [
    {
      id: 'hero',
      badge: t(lang, 'Welcome', 'مرحباً'),
      title: t(lang, 'Agri Cloud', 'سحابة الزراعة'),
      subtitle: t(lang, 'Command Center', 'مركز القيادة'),
      description: t(
        lang,
        'Satellite intelligence, field operations, sensors, and AI in one workspace. Scroll to tour the platform — your globe stays in sync with each chapter.',
        'ذكاء الأقمار، العمليات الحقلية، الحساسات والذكاء الاصطنافي في مساحة واحدة. مرّر لتتعرّف على المنصة.',
      ),
      align: 'left',
      heroHints: [
        t(lang, 'GIS · AI · Operations', 'GIS · ذكاء اصطناعي · عمليات'),
        t(lang, 'Scroll to explore', 'مرّر للاستكشاف'),
      ],
      actions: [
        { label: t(lang, 'Agro Cloud Dashboard', 'لوحة Agro Cloud'), variant: 'primary', onClick: nav('/dashboards/agro-cloud') },
        { label: t(lang, 'AI AgroCloud', 'سحابة Agro الذكية'), variant: 'secondary', onClick: nav('/dashboards/ai-agro-cloud') },
      ],
    },
    {
      id: 'connected',
      badge: t(lang, 'Modules', 'الوحدات'),
      title: t(lang, 'Everything Connected', 'كل شيء مترابط'),
      description: t(
        lang,
        'Move from dashboards to imagery, irrigation, quality programs, and fleet tracking without losing context. Pick a pillar and dive in.',
        'انتقل من اللوحات إلى الصور والري وبرامج الجودة وتتبع الأسطول دون فقدان السياق.',
      ),
      align: 'center',
      features: topTiles.slice(0, 5),
    },
    {
      id: 'discovery',
      badge: t(lang, 'Field to Insight', 'من الحقل إلى الرؤية'),
      title: t(lang, 'Operational', 'العمليات'),
      subtitle: t(lang, 'Precision', 'بدقة'),
      description: t(
        lang,
        'Capture EC/pH, irrigation rounds, harvest batches, and QHIS evidence where work happens — then roll it up for leadership dashboards.',
        'سجّل الملوحة والري والحصاد وأدلة الجودة في مكان العمل، ثم اعرضها على لوحات القيادة.',
      ),
      align: 'left',
      features: [
        {
          title: t(lang, 'Satellite & GIS', 'الأقمار وGIS'),
          description: t(lang, 'Indices, multidimensional stacks, and map-ready layers.', 'مؤشرات، طبقات متعددة الأبعاد، وجاهزية للخرائط.'),
        },
        {
          title: t(lang, 'Operations & Data Entry', 'العمليات وإدخال البيانات'),
          description: t(lang, 'Structured forms for irrigation, harvest, and compliance trails.', 'نماذج منظمة للري والحصاد ومسارات الامتثال.'),
        },
        {
          title: t(lang, 'Sensors & Mobility', 'الحساسات والتنقل'),
          description: t(lang, 'Soil, weather, cameras, and GPS-linked assets in one telemetry fabric.', 'تربة وطقس وكاميرات وأصول مرتبطة بـ GPS.'),
        },
      ],
    },
    {
      id: 'future',
      badge: t(lang, 'Next', 'التالي'),
      title: t(lang, 'Configure', 'اضبط'),
      subtitle: t(lang, '& Scale', 'ووسّع'),
      description: t(
        lang,
        'Tune master data, dashboard bindings, and admin policies — then invite your team. Log out securely when you are done on shared devices.',
        'اضبط البيانات الرئيسية والروابط والسياسات، ثم ادعُ الفريق. سجّل الخروج على الأجهزة المشتركة.',
      ),
      align: 'center',
      actions: [
        { label: t(lang, 'System Settings', 'إعدادات النظام'), variant: 'primary', onClick: nav('/admin/system-settings') },
        { label: t(lang, 'Account', 'الحساب'), variant: 'secondary', onClick: nav('/account/settings') },
        { label: t(lang, 'Log out', 'تسجيل الخروج'), variant: 'secondary', onClick: onLogout },
      ],
    },
  ]
}

export type LandingPageProps = {
  initialOpenGroupId?: string
}

export default function LandingPage({ initialOpenGroupId }: LandingPageProps) {
  const navigate = useNavigate()
  const { language } = useLanguage()
  const initialSectionId = useMemo(() => mapOpenGroupToSectionId(initialOpenGroupId), [initialOpenGroupId])

  const sections = useMemo(
    () =>
      buildAgroSections(
        language,
        (path) => navigate(path),
        () => {
          startSession(null)
          navigate('/login', { replace: true })
        },
      ),
    [language, navigate],
  )

  return (
    <ScrollGlobe
      sections={sections}
      initialSectionId={initialSectionId}
      className="bg-gradient-to-br from-background via-muted/20 to-background"
    />
  )
}
