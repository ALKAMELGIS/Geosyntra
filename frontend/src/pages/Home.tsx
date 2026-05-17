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

import { readWorkspaceState } from '../lib/onboarding/workspaceState'

import './Home.css'

import './home/home-onboarding.css'



const HERO_PRIMARY_PATH = '/satellite/indices'

const HERO_SECONDARY_PATH = '/learn-more'



function HomePageContent() {

  const navigate = useNavigate()

  const { user } = useAuth()

  const { openWizard } = useHomeOnboarding()

  const [browseMode, setBrowseMode] = useState(true)



  const go = useCallback((path: string) => startTransition(() => navigate(path)), [navigate])

  const goPrimary = useCallback(() => go(HERO_PRIMARY_PATH), [go])

  const goSecondary = useCallback(() => go(HERO_SECONDARY_PATH), [go])

  const goSignIn = useCallback(() => openWizard({ step: user ? 'pricing' : 'auth' }), [openWizard, user])



  const startBuilding = useCallback(() => {

    const ws = user ? readWorkspaceState(user.email) : null

    if (ws?.workspaceReady) {

      go(HERO_PRIMARY_PATH)

      return

    }

    openWizard({ step: user ? 'pricing' : 'auth', planId: 'trial' })

  }, [openWizard, user, go])



  const globeSections = useMemo(

    () => buildHomeGlobeSections({ onPrimary: goPrimary, onSecondary: goSecondary }),

    [goPrimary, goSecondary],

  )



  useEffect(() => {
    if (typeof window === 'undefined') return
    const hash = window.location.hash
    if (hash === '#pricing') {
      window.requestAnimationFrame(() => {
        document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
    if (hash === '#get-started' || new URLSearchParams(window.location.search).get('start') === '1') {
      startBuilding()
    }
  }, [startBuilding])

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

        className="bg-gradient-to-br from-background via-muted/20 to-background"

        sections={globeSections}

        leadingSection={leadingSection}

        leadingSectionNav={{ id: 'start', badge: 'Start' }}

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


