import { useCallback, useEffect, useMemo, useState, startTransition } from 'react'
import { useNavigate } from 'react-router-dom'
import { ScrollGlobe } from '../components/ui/landing-page'
import { SaasNavigation } from '../components/saas/SaasEntryShell'
import { SAAS_ROUTES } from '../lib/saasRoutes'
import { prefetchRoute } from '../routes/routePrefetch'
import HeroThemeToggle from './components/HeroThemeToggle'
import { homeSaasContent } from './home/homeSaasContent'
import { buildHomeGlobeSections } from './home/homeGlobeContent'
import { HomeSaasHero } from './home/HomeSaasHero'
import './Home.css'

const HERO_PRIMARY_PATH = '/satellite/indices'
const HERO_SECONDARY_PATH = '/learn-more'

/**
 * Home — five full-viewport panels in one scroll:
 *   1. SaaS entry (signup / trial)
 *   2–5. ScrollGlobe narrative (Welcome → Innovation → Discovery → Future)
 */
export default function Home() {
  const navigate = useNavigate()
  const [browseMode, setBrowseMode] = useState(false)

  const go = useCallback((path: string) => startTransition(() => navigate(path)), [navigate])
  const goPrimary = useCallback(() => go(HERO_PRIMARY_PATH), [go])
  const goSecondary = useCallback(() => go(HERO_SECONDARY_PATH), [go])
  const goTrial = useCallback(() => go(SAAS_ROUTES.onboardingTrialStart), [go])
  const goSignIn = useCallback(() => go(SAAS_ROUTES.authLogin), [go])

  const globeSections = useMemo(
    () => buildHomeGlobeSections({ onPrimary: goPrimary, onSecondary: goSecondary }),
    [goPrimary, goSecondary],
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const ric = window.requestIdleCallback ?? null
    const warm = () => {
      prefetchRoute(HERO_PRIMARY_PATH)
      prefetchRoute(HERO_SECONDARY_PATH)
      prefetchRoute(SAAS_ROUTES.onboardingTrialStart)
    }
    if (ric) {
      const id = ric(warm, { timeout: 1500 })
      return () => window.cancelIdleCallback?.(id)
    }
    const tid = window.setTimeout(warm, 600)
    return () => window.clearTimeout(tid)
  }, [])

  const leadingSection = (
    <div className="home-merged-saas__inner saas-entry__hero-inner">
      <HomeSaasHero
        copy={homeSaasContent.hero}
        startAction={{
          label: homeSaasContent.startLabel,
          onClick: goTrial,
          'aria-label': 'Start free trial',
        }}
      />
      <p className="home-merged-saas__scroll-hint" aria-hidden>
        Scroll to explore the platform
      </p>
    </div>
  )

  return (
    <div className={browseMode ? 'home-merged home-landing home-merged--browse' : 'home-merged home-landing'}>
      <SaasNavigation
        className="home-merged__nav"
        brand={homeSaasContent.brand}
        brandScrollTargetId="start"
        navItems={homeSaasContent.navItems}
        signInAction={{
          label: homeSaasContent.signInLabel,
          onClick: goSignIn,
          'aria-label': 'Sign in',
        }}
      />

      <ScrollGlobe
        className="bg-gradient-to-br from-background via-muted/20 to-background"
        sections={globeSections}
        leadingSection={leadingSection}
        leadingSectionNav={{ id: 'start', badge: 'Start' }}
        onActiveSectionChange={index => setBrowseMode(index > 0)}
      />

      {browseMode ? <HeroThemeToggle /> : null}
    </div>
  )
}
