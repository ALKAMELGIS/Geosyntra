import { lazy, Suspense, useCallback, useEffect, useMemo, useState, startTransition } from 'react'

import { useNavigate } from 'react-router-dom'

import { ScrollGlobe } from '../components/ui/landing-page'
import { SparklesCore } from '../components/ui/sparkles'

import { SaasNavigation } from '../components/saas/SaasEntryShell'

import { SAAS_ROUTES } from '../lib/saasRoutes'

import { prefetchRoute } from '../routes/routePrefetch'

import { useAuth } from '../state/auth'

import { LuxThemeLightToggle } from '../components/LuxThemeLightToggle'

import { homeSaasContent } from './home/homeSaasContent'

import { buildHomeGlobeSections } from './home/homeGlobeContent'
import { HOME_SCROLL_GLOBE_CONFIG } from './home/homeGlobeConfig'

import { HomeSaasHero } from './home/HomeSaasHero'
import { resolveHomeHeroAccessMode } from './home/homeHeroAccess'


const HomePricingSection = lazy(() =>
  import('./home/HomePricingSection').then(m => ({ default: m.HomePricingSection })),
)
const HomeSaasFooter = lazy(() =>
  import('./home/HomeSaasFooter').then(m => ({ default: m.HomeSaasFooter })),
)

import { HomeUserStatusBar } from './home/HomeUserStatusBar'

import { HomeOnboardingProvider, useHomeOnboarding } from './home/onboarding/HomeOnboardingContext'

import { HomeOnboardingWizard } from './home/onboarding/HomeOnboardingWizard'

import {
  navigateToHomeStart,
  repairBrokenInPageHashOnLoad,
  scrollToInPageSection,
} from '../lib/hashRouterInPageNav'
import {
  consumeHomeWizardIntent,
  readHomeWizardParams,
  stripHomeWizardQueryFromLocation,
} from '../lib/homeWizardEntry'
import { tryCompleteOAuthCallback } from '../lib/onboarding/localAuth'
import {
  activatePreAuthorizedWorkspace,
  ensurePlatformOwnerWorkspace,
} from '../lib/onboarding/activateWorkspace'
import { isUserEmailVerified } from '../lib/onboarding/onboardingPlanFlow'
import { activateTrialWorkspace, resolveAuthPlanRoute } from '../lib/onboarding/planSubscriptionFlow'
import { isPlatformOwnerUser } from '../lib/auth'

import './Home.css'

import './home/home-hero-access.css'

import './home/home-onboarding.css'



const HERO_PRIMARY_PATH = '/satellite/indices'

const HERO_SECONDARY_PATH = '/learn-more'



function HomePageContent() {

  const navigate = useNavigate()

  const { user, login } = useAuth()

  const { open: wizardOpen, openWizard, refreshWorkspace } = useHomeOnboarding()

  const [browseMode, setBrowseMode] = useState(false)



  const go = useCallback((path: string) => startTransition(() => navigate(path)), [navigate])

  const goPrimary = useCallback(() => go(HERO_PRIMARY_PATH), [go])

  const goSecondary = useCallback(() => go(HERO_SECONDARY_PATH), [go])

  const goSignIn = useCallback(
    () => openWizard({ step: 'welcome', authMode: 'signin' }),
    [openWizard],
  )



  const enterGeoAiWorkspace = useCallback(() => {
    if (user && isPlatformOwnerUser(user)) {
      ensurePlatformOwnerWorkspace(user)
      refreshWorkspace()
    }
    go(HERO_PRIMARY_PATH)
  }, [user, go, refreshWorkspace])

  const startFreeTrial = useCallback(() => {
    openWizard({
      step: user ? 'pricing' : 'welcome',
      planId: 'trial',
      authMode: user ? 'signin' : 'signup',
    })
  }, [openWizard, user])

  const heroAccessMode = useMemo(() => resolveHomeHeroAccessMode(user), [user])

  const startBuilding = useCallback(() => {
    if (heroAccessMode === 'start') {
      enterGeoAiWorkspace()
    } else {
      startFreeTrial()
    }
  }, [heroAccessMode, enterGeoAiWorkspace, startFreeTrial])



  const globeSections = useMemo(

    () => buildHomeGlobeSections({ onPrimary: goPrimary, onSecondary: goSecondary }),

    [goPrimary, goSecondary],

  )



  const applyWizardIntent = useCallback(
    (intent: { wizard: string; authMode: string; upgrade?: boolean; planId?: string }) => {
      const planId =
        intent.planId === 'trial' || intent.planId === 'pro' || intent.planId === 'enterprise'
          ? intent.planId
          : undefined
      if (intent.wizard === 'payment') {
        openWizard({
          step: 'payment',
          authMode: 'signin',
          planId: planId === 'pro' ? 'pro' : 'pro',
        })
        return
      }
      if (intent.wizard === 'launch') {
        openWizard({ step: 'launch', authMode: 'signin', planId: planId ?? 'trial' })
        return
      }
      if (intent.wizard === 'pricing') {
        openWizard({
          step: intent.upgrade || user ? 'pricing' : 'welcome',
          authMode: intent.authMode === 'signin' ? 'signin' : 'signup',
          upgrade: intent.upgrade === true,
          planId,
        })
      } else if (intent.authMode === 'signin') {
        openWizard({ step: 'welcome', authMode: 'signin' })
      } else {
        startBuilding()
      }
    },
    [openWizard, startBuilding, user],
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const repairedId = repairBrokenInPageHashOnLoad()
    let scrollTarget: string | null = repairedId
    try {
      const stored = sessionStorage.getItem('geosyntra-scroll-to')
      if (stored) {
        scrollTarget = stored
        sessionStorage.removeItem('geosyntra-scroll-to')
      }
    } catch {
      /* ignore */
    }
    if (scrollTarget) {
      window.requestAnimationFrame(() => scrollToInPageSection(`#${scrollTarget}`))
    }
    const { oauthCode } = readHomeWizardParams()
    if (oauthCode) {
      openWizard({ step: 'welcome', authMode: 'signin' })
      return
    }
    const intent = consumeHomeWizardIntent()
    if (intent) {
      applyWizardIntent(intent)
    }
    stripHomeWizardQueryFromLocation()
  }, [applyWizardIntent, openWizard])

  useEffect(() => {
    const { oauthCode } = readHomeWizardParams()
    if (!oauthCode) return
    let cancelled = false
    ;(async () => {
      const result = await tryCompleteOAuthCallback()
      if (cancelled || !result) return
      if (result.ok && 'user' in result) {
        if (!isUserEmailVerified(result.user)) {
          openWizard({ step: 'welcome', authMode: 'signin' })
          return
        }
        login(result.user)
        refreshWorkspace()
        const route = resolveAuthPlanRoute(result.user)
        if (route.kind === 'enter_workspace') {
          if (isPlatformOwnerUser(result.user)) {
            ensurePlatformOwnerWorkspace(result.user)
            refreshWorkspace()
          }
          navigateToHomeStart(navigate, { replace: true })
          return
        }
        if (route.kind === 'activate_provisioned') {
          activatePreAuthorizedWorkspace(result.user)
          refreshWorkspace()
          navigateToHomeStart(navigate, { replace: true })
          return
        }
        if (route.kind === 'activate_trial') {
          activateTrialWorkspace(result.user)
          refreshWorkspace()
          navigateToHomeStart(navigate, { replace: true })
          return
        }
        if (route.kind === 'open_payment') {
          navigateToHomeStart(navigate, { replace: true })
          return
        }
        navigateToHomeStart(navigate, { replace: true })
        return
      }
      if (!result.ok && result.error) {
        openWizard({ step: 'welcome', authMode: 'signin' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [login, openWizard, refreshWorkspace, go])

  useEffect(() => {

    if (typeof window === 'undefined') return

    const ric = window.requestIdleCallback ?? null

    const warm = () => {
      prefetchRoute(HERO_PRIMARY_PATH)
      prefetchRoute(HERO_SECONDARY_PATH)
      void import('./home/HomePricingSection')
      void import('./home/HomeSaasFooter')
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
        accessAction={
          heroAccessMode === 'start'
            ? {
                mode: 'start',
                label: homeSaasContent.heroStartLabel,
                onClick: enterGeoAiWorkspace,
                'aria-label': 'Open GeoAI workspace',
              }
            : {
                mode: 'trial',
                label: homeSaasContent.heroTrialLabel,
                onClick: startFreeTrial,
                'aria-label': 'Start your free 21-day trial with GeoSyntra',
              }
        }
      />

    </div>

  )



  return (

    <div className={browseMode ? 'home-merged home-landing home-merged--browse' : 'home-merged home-landing'}>

      <div className="home-merged__nav-sparks" aria-hidden>
        <SparklesCore
          background="transparent"
          minSize={0.3}
          maxSize={0.85}
          particleDensity={95}
          className="h-full w-full"
          particleColor="#CBD5E1"
          speed={0.75}
        />
      </div>

      <SaasNavigation

        className="home-merged__nav"

        brand={homeSaasContent.brand}

        brandScrollTargetId="start"

        navItems={[...homeSaasContent.navItems]}

        statusSlot={
          <div className="home-merged__nav-chrome">
            <HomeUserStatusBar />
            {!wizardOpen ? <LuxThemeLightToggle size="sm" className="lux-theme-light--home-nav" /> : null}
          </div>
        }

        signInAction={undefined}

      />



      <ScrollGlobe

        className="gs-scroll-globe--home-integrated"

        sections={globeSections}

        globeConfig={HOME_SCROLL_GLOBE_CONFIG}

        leadingGlobeClear

        leadingSection={leadingSection}

        leadingSectionNav={{ id: 'start', badge: 'Start' }}

        trailingSections={[
          {
            id: 'pricing',
            badge: 'Pricing',
            children: (
              <Suspense fallback={null}>
                <HomePricingSection />
              </Suspense>
            ),
          },
          {
            id: 'footer',
            badge: 'Footer',
            children: (
              <Suspense fallback={null}>
                <HomeSaasFooter browseMode={browseMode} onTrial={startBuilding} onSignIn={goSignIn} />
              </Suspense>
            ),
          },
        ]}

        onActiveSectionChange={index => setBrowseMode(index > 0)}

      />



      <HomeOnboardingWizard />

    </div>

  )

}



export default function Home() {

  return (

    <HomeOnboardingProvider>

      <HomePageContent />

    </HomeOnboardingProvider>

  )

}


