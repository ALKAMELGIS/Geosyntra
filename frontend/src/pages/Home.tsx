import { startTransition } from 'react'
import { useNavigate } from 'react-router-dom'
import SaasEntryShell from '../components/saas/SaasEntryShell'
import { SAAS_ROUTES } from '../lib/saasRoutes'
import { homeSaasContent } from './home/homeSaasContent'
import { HomeSaasHero } from './home/HomeSaasHero'
import './Home.css'

/**
 * Home — SaaS entry surface (replaces legacy marketing landing + /login redirect).
 * Shell has no marketing copy; strings and hero body are injected from `homeSaasContent` / `HomeSaasHero`.
 */
export default function Home() {
  const navigate = useNavigate()

  const go = (path: string) => startTransition(() => navigate(path))

  return (
    <div className="home-saas-entry min-h-screen w-full max-w-full">
      <SaasEntryShell
        brand={homeSaasContent.brand}
        brandHref={SAAS_ROUTES.home}
        navItems={homeSaasContent.navItems}
        signInAction={{
          label: homeSaasContent.signInLabel,
          onClick: () => go(SAAS_ROUTES.authLogin),
          'aria-label': 'Sign in',
        }}
        hero={
          <HomeSaasHero
            startAction={{
              label: homeSaasContent.startLabel,
              onClick: () => go(SAAS_ROUTES.onboardingTrialStart),
              'aria-label': 'Continue to onboarding',
            }}
          />
        }
      />
    </div>
  )
}
