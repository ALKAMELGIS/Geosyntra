import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { isPlatformOwnerUser, readCurrentUser } from '../../../lib/auth'
import {
  activatePreAuthorizedWorkspace,
  activateWorkspaceForUser,
  ensurePlatformOwnerWorkspace,
} from '../../../lib/onboarding/activateWorkspace'
import { isUserEmailVerified, isUserPreAuthorizedByAdmin } from '../../../lib/onboarding/onboardingPlanFlow'
import { useAuth } from '../../../state/auth'
import { stripHomeWizardQueryFromLocation } from '../../../lib/homeWizardEntry'
import { readWorkspaceState, trialDaysRemaining } from '../../../lib/onboarding/workspaceState'
import { requiresUpgradeToPaid, syncTrialExpiry } from '../../../lib/onboarding/planSubscriptionFlow'
import { apiBillingConfirmPayment } from '../../../lib/subscription/subscriptionApi'
import { navigateToHomeStart } from '../../../lib/hashRouterInPageNav'
import { SAAS_ROUTES } from '../../../lib/saasRoutes'
import type { BillingPlanId, WizardOpenOptions, WizardStep } from './homeOnboarding.types'

const WIZARD_THEME_KEY = 'geosyntra-wizard-theme'

function readStoredWizardTheme(): 'light' | 'dark' {
  try {
    const v = sessionStorage.getItem(WIZARD_THEME_KEY)
    return v === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

type HomeOnboardingContextValue = {
  open: boolean
  step: WizardStep
  authMode: 'signup' | 'signin'
  wizardTheme: 'light' | 'dark'
  setWizardTheme: (theme: 'light' | 'dark') => void
  selectedPlanId: BillingPlanId | null
  workspaceReady: boolean
  trialDaysLeft: number | null
  openWizard: (opts?: WizardOpenOptions) => void
  closeWizard: () => void
  setStep: (step: WizardStep) => void
  setAuthMode: (mode: 'signup' | 'signin') => void
  selectPlan: (planId: BillingPlanId) => void
  openPayment: (planId: BillingPlanId) => void
  completePayment: () => Promise<void>
  runActivation: () => Promise<void>
  enterWorkspace: () => void
  refreshWorkspace: () => void
}

const HomeOnboardingContext = createContext<HomeOnboardingContextValue | null>(null)

const SATELLITE_INTELLIGENCE_PATH = SAAS_ROUTES.dashboardDefault

function normalizeStep(step?: WizardOpenOptions['step']): WizardStep {
  if (step === 'auth') return 'welcome'
  if (step === 'identity') return 'pricing'
  return step ?? 'welcome'
}

export function HomeOnboardingProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<WizardStep>('welcome')
  const [authMode, setAuthMode] = useState<'signup' | 'signin'>('signup')
  const [selectedPlanId, setSelectedPlanId] = useState<BillingPlanId | null>('trial')
  const [wizardTheme, setWizardThemeState] = useState<'light' | 'dark'>(readStoredWizardTheme)
  const [workspaceTick, setWorkspaceTick] = useState(0)

  const setWizardTheme = useCallback((theme: 'light' | 'dark') => {
    setWizardThemeState(theme)
    try {
      sessionStorage.setItem(WIZARD_THEME_KEY, theme)
    } catch {
      /* ignore */
    }
  }, [])

  const refreshWorkspace = useCallback(() => setWorkspaceTick(t => t + 1), [])

  const { user } = useAuth()
  const workspace = useMemo(() => {
    void workspaceTick
    if (!user) return null
    return syncTrialExpiry(user.email) ?? readWorkspaceState(user.email)
  }, [user, workspaceTick])

  const workspaceReady = Boolean(workspace?.workspaceReady)
  const trialDaysLeft = trialDaysRemaining(workspace)

  useEffect(() => {
    const onStorage = () => refreshWorkspace()
    const onWs = () => refreshWorkspace()
    window.addEventListener('storage', onStorage)
    window.addEventListener('geosyntra-workspace-change', onWs)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('geosyntra-workspace-change', onWs)
    }
  }, [refreshWorkspace])

  useEffect(() => {
    if (!user || isPlatformOwnerUser(user)) return
    if (!requiresUpgradeToPaid(user.email)) return
    setSelectedPlanId('pro')
    setStep('pricing')
    setAuthMode('signin')
    setOpen(true)
    document.body.style.overflow = 'hidden'
  }, [user, workspaceTick])

  useEffect(() => {
    const qs = new URLSearchParams(window.location.search)
    if (qs.get('checkout') !== 'success') return
    const u = readCurrentUser()
    const plan = (qs.get('plan') || 'pro') as BillingPlanId
    if (!u) return
    setOpen(true)
    setSelectedPlanId(plan)
    void (async () => {
      await apiBillingConfirmPayment(plan, 'stripe')
      activateWorkspaceForUser(u, plan, { paymentCompleted: true })
      refreshWorkspace()
      setStep('launch')
      qs.delete('checkout')
      qs.delete('plan')
      try {
        const url = new URL(window.location.href)
        url.search = qs.toString() ? `?${qs}` : ''
        window.history.replaceState({}, '', url.pathname + url.search + url.hash)
      } catch {
        stripHomeWizardQueryFromLocation()
      }
    })()
  }, [refreshWorkspace])

  const openWizard = useCallback(
    (opts?: WizardOpenOptions) => {
      const upgradeFlow = opts?.upgrade === true
      const u = readCurrentUser()
      if (!upgradeFlow && u && !isUserEmailVerified(u)) {
        setStep('welcome')
        setAuthMode('signin')
        setOpen(true)
        document.body.style.overflow = 'hidden'
        return
      }
      if (!upgradeFlow && u && requiresUpgradeToPaid(u.email)) {
        setSelectedPlanId(opts?.planId ?? 'pro')
        setStep('pricing')
        setAuthMode('signin')
        setOpen(true)
        document.body.style.overflow = 'hidden'
        return
      }
      if (!upgradeFlow && u && isPlatformOwnerUser(u)) {
        ensurePlatformOwnerWorkspace(u)
        refreshWorkspace()
        navigateToHomeStart(navigate, { replace: true })
        return
      }
      const ws = u ? readWorkspaceState(u.email) : null
      if (!upgradeFlow && ws?.workspaceReady) {
        navigateToHomeStart(navigate, { replace: true })
        return
      }
      if (!upgradeFlow && u && isUserPreAuthorizedByAdmin(u.email)) {
        activatePreAuthorizedWorkspace(u)
        refreshWorkspace()
        setOpen(true)
        setStep('launch')
        document.body.style.overflow = 'hidden'
        return
      }
      const requested = normalizeStep(opts?.step)
      const initialStep: WizardStep =
        upgradeFlow || (requested === 'welcome' && u) ? 'pricing' : requested
      setStep(initialStep)
      if (opts?.authMode) setAuthMode(opts.authMode)
      if (opts?.planId) setSelectedPlanId(opts.planId)
      setOpen(true)
      document.body.style.overflow = 'hidden'
    },
    [navigate, refreshWorkspace],
  )

  const closeWizard = useCallback(() => {
    setOpen(false)
    document.body.style.overflow = ''
  }, [])

  const selectPlan = useCallback((planId: BillingPlanId) => {
    setSelectedPlanId(planId)
    setStep('pricing')
  }, [])

  const openPayment = useCallback((planId: BillingPlanId) => {
    setSelectedPlanId(planId)
    setStep('payment')
    setOpen(true)
    document.body.style.overflow = 'hidden'
  }, [])

  const completePayment = useCallback(async () => {
    const u = readCurrentUser()
    if (!u || !selectedPlanId) return
    await apiBillingConfirmPayment(selectedPlanId, 'stripe')
    setStep('activation')
    await new Promise(r => window.setTimeout(r, 800))
    activateWorkspaceForUser(u, selectedPlanId, { paymentCompleted: true })
    refreshWorkspace()
    setStep('launch')
  }, [selectedPlanId, refreshWorkspace])

  const runActivation = useCallback(async () => {
    const u = readCurrentUser()
    if (!u || !selectedPlanId) return
    setStep('activation')
    await new Promise(r => window.setTimeout(r, 900))
    activateWorkspaceForUser(u, selectedPlanId, {
      paymentCompleted: selectedPlanId === 'trial',
    })
    refreshWorkspace()
    setStep('launch')
  }, [selectedPlanId, refreshWorkspace])

  const enterWorkspace = useCallback(() => {
    const u = readCurrentUser()
    if (u && !isUserEmailVerified(u)) {
      setStep('welcome')
      setAuthMode('signin')
      setOpen(true)
      document.body.style.overflow = 'hidden'
      return
    }
    if (u && requiresUpgradeToPaid(u.email)) {
      setSelectedPlanId('pro')
      setStep('pricing')
      setAuthMode('signin')
      setOpen(true)
      document.body.style.overflow = 'hidden'
      return
    }
    closeWizard()
    navigate(SATELLITE_INTELLIGENCE_PATH)
  }, [closeWizard, navigate])

  const value = useMemo<HomeOnboardingContextValue>(
    () => ({
      open,
      step,
      authMode,
      wizardTheme,
      setWizardTheme,
      selectedPlanId,
      workspaceReady,
      trialDaysLeft,
      openWizard,
      closeWizard,
      setStep,
      setAuthMode,
      selectPlan,
      openPayment,
      completePayment,
      runActivation,
      enterWorkspace,
      refreshWorkspace,
    }),
    [
      open,
      step,
      authMode,
      wizardTheme,
      setWizardTheme,
      selectedPlanId,
      workspaceReady,
      trialDaysLeft,
      openWizard,
      closeWizard,
      selectPlan,
      openPayment,
      completePayment,
      runActivation,
      enterWorkspace,
      refreshWorkspace,
    ],
  )

  return <HomeOnboardingContext.Provider value={value}>{children}</HomeOnboardingContext.Provider>
}

export function useHomeOnboarding(): HomeOnboardingContextValue {
  const ctx = useContext(HomeOnboardingContext)
  if (!ctx) throw new Error('useHomeOnboarding must be used within HomeOnboardingProvider')
  return ctx
}
