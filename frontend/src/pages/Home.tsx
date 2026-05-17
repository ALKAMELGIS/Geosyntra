import { useCallback, useEffect, useMemo, useState, startTransition } from 'react'

import { useNavigate } from 'react-router-dom'

import { ScrollGlobe } from '../components/ui/landing-page'

import { SaasNavigation } from '../components/saas/SaasEntryShell'

import { SAAS_ROUTES } from '../lib/saasRoutes'

import { prefetchRoute } from '../routes/routePrefetch'

import { useAuth } from '../state/auth'

import HeroThemeToggle from './components/HeroThemeToggle'

import { homeSaasContent } from './home/homeSaasContent'

import { buildHomeGlobeSections } from './home/homeGlobeContent'

import { HomeSaasHero } from './home/HomeSaasHero'

import { HomeSaasFooter } from './home/HomeSaasFooter'

import { HomePricingSection } from './home/HomePricingSection'

import { HomeUserStatusBar } from './home/HomeUserStatusBar'

import { HomeOnboardingProvider, useHomeOnboarding } from './home/onboarding/HomeOnboardingContext'

import { HomeOnboardingWizard } from './home/onboarding/HomeOnboardingWizard'

import { repairBrokenInPageHashOnLoad, scrollToInPageSection } from '../lib/hashRouterInPageNav'
import { readHomeWizardParams } from '../lib/homeWizardEntry'
import { readWorkspaceState } from '../lib/onboarding/workspaceState'

import './Home.css'

import './home/home-onboarding.css'



const HERO_PRIMARY_PATH = '/satellite/indices'

const HERO_SECONDARY_PATH = '/learn-more'



function HomePageContent() {

  const navigate = useNavigate()

  const { user } = useAuth()

  const { openWizard } = useHomeOnboarding()

  const [browseMode, setBrowseMode] = useState(false)



  const go = useCallback((path: string) => startTransition(() => navigate(path)), [navigate])

  const goPrimary = useCallback(() => go(HERO_PRIMARY_PATH), [go])

  const goSecondary = useCallback(() => go(HERO_SECONDARY_PATH), [go])

  const goSignIn = useCallback(
    () => openWizard({ step: user ? 'identity' : 'auth', authMode: 'signin' }),
    [openWizard, user],
  )

  const getStarted = useCallback(() => {
    const ws = user ? readWorkspaceState(user.email) : null
    if (ws?.workspaceReady) {
      go(HERO_PRIMARY_PATH)
      return
    }
    openWizard({ step: user ? 'pricing' : 'auth', authMode: 'signup' })
  }, [openWizard, user, go])



  const startBuilding = useCallback(() => {

    const ws = user ? readWorkspaceState(user.email) : null

    if (ws?.workspaceReady) {

      go(HERO_PRIMARY_PATH)

      return

    }

    openWizard({ step: user ? 'identity' : 'auth', planId: 'trial', authMode: 'signup' })

  }, [openWizard, user, go])



  const globeSections = useMemo(

    () => buildHomeGlobeSections({ onPrimary: goPrimary, onSecondary: goSecondary }),

    [goPrimary, goSecondary],

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
    if (scrollTarget && scrollTarget !== 'get-started') {
      window.requestAnimationFrame(() => scrollToInPageSection(`#${scrollTarget}`))
    }
    const { start, wizard, mode } = readHomeWizardParams()
    if (start || wizard) {
      if (wizard === 'pricing') {
        openWizard({ step: user ? 'pricing' : 'auth', authMode: 'signup' })
      } else if (mode === 'signin') {
        openWizard({ step: user ? 'identity' : 'auth', authMode: 'signin' })
      } else {
        startBuilding()
      }
      if (start || wizard) {
        try {
          window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`)
        } catch {
          /* ignore */
        }
      }
      return
    }
    if (repairedId === 'get-started' || window.location.hash === '#get-started') {
      startBuilding()
    }
  }, [startBuilding, openWizard, user])

  useEffect(() => {

    if (typeof window === 'undefined') return

    const ric = window.requestIdleCallback ?? null

    const warm = () => {

      prefetchRoute(HERO_PRIMARY_PATH)

      prefetchRoute(HERO_SECONDARY_PATH)

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
          onClick: startBuilding,
          'aria-label': 'Start building with GeoSyntra',
        }}
        secondaryAction={{
          label: homeSaasContent.getStartedLabel,
          onClick: getStarted,
          'aria-label': 'Get started with GeoSyntra',
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

        statusSlot={<HomeUserStatusBar />}

        signInAction={

          user

            ? undefined

            : {

                label: homeSaasContent.signInLabel,

                onClick: goSignIn,

                'aria-label': 'Sign in',

              }

        }

      />



      <ScrollGlobe

        className="gs-scroll-globe--home-integrated"

        sections={globeSections}

        leadingSection={leadingSection}

        leadingSectionNav={{ id: 'start', badge: 'Start' }}

        leadingGlobeClear

        onActiveSectionChange={index => setBrowseMode(index > 0)}

      />



      <HomePricingSection />



      {browseMode ? <HeroThemeToggle /> : null}



      <HomeSaasFooter browseMode={browseMode} onTrial={startBuilding} onSignIn={goSignIn} />



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


