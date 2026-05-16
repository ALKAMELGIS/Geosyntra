import { startTransition } from 'react'
import { useNavigate } from 'react-router-dom'
import SaasEntryShell from '../components/saas/SaasEntryShell'
import { SAAS_ROUTES } from '../lib/saasRoutes'
import { homeSaasContent } from './home/homeSaasContent'
import { HomeSaasHero } from './home/HomeSaasHero'
import './Home.css'

/**
 * Home — SaaS entry surface: shell is layout-only; copy and hero live in `homeSaasContent`.
 */
export default function Home() {
  const navigate = useNavigate()

  const go = (path: string) => startTransition(() => navigate(path))

  return (
    <div className="home-saas-entry min-h-screen w-full max-w-full">
      <SaasEntryShell
        brand={homeSaasContent.brand}
        brandHref="#/"
        navItems={homeSaasContent.navItems}
        signInAction={{
          label: homeSaasContent.signInLabel,
          onClick: () => go(SAAS_ROUTES.authLogin),
          'aria-label': 'Sign in',
        }}
        hero={
          <HomeSaasHero
            copy={homeSaasContent.hero}
            startAction={{
              label: homeSaasContent.startLabel,
              onClick: () => go(SAAS_ROUTES.onboardingTrialStart),
              'aria-label': 'Start free trial',
            }}
          />
        }
      />
    </div>
  )
}
