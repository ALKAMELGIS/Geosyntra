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
import { readCurrentUser } from '../../../lib/auth'
import { useAuth } from '../../../state/auth'
import type { BillingPlanId } from '../../../lib/onboarding/pricingPlans'
import { activateWorkspaceForUser, processMockPayment } from '../../../lib/onboarding/activateWorkspace'
import { createStripeCheckout, isStripeConfigured } from '../../../lib/onboarding/stripeClient'
import { readWorkspaceState, trialDaysRemaining } from '../../../lib/onboarding/workspaceState'
import { SAAS_ROUTES } from '../../../lib/saasRoutes'
import type { WizardOpenOptions, WizardStep } from './homeOnboarding.types'

type HomeOnboardingContextValue = {
  open: boolean
  step: WizardStep
  authMode: 'signup' | 'signin'
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
  const [workspaceTick, setWorkspaceTick] = useState(0)

  const refreshWorkspace = useCallback(() => setWorkspaceTick(t => t + 1), [])

  const { user } = useAuth()
  const workspace = useMemo(() => {
    void workspaceTick
    return user ? readWorkspaceState(user.email) : null
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

  const openWizard = useCallback(
    (opts?: WizardOpenOptions) => {
      const u = readCurrentUser()
      const ws = u ? readWorkspaceState(u.email) : null
      if (ws?.workspaceReady) {
        navigate(SATELLITE_INTELLIGENCE_PATH)
        return
      }
      const requested = normalizeStep(opts?.step)
      const initialStep: WizardStep = requested === 'welcome' && u ? 'pricing' : requested
      setStep(initialStep)
      if (opts?.authMode) setAuthMode(opts.authMode)
      if (opts?.planId) setSelectedPlanId(opts.planId)
      setOpen(true)
      document.body.style.overflow = 'hidden'
    },
    [navigate],
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
    if (isStripeConfigured()) {
      const session = await createStripeCheckout(selectedPlanId)
      if (session?.url) {
        window.location.assign(session.url)
        return
      }
    }
    const pay = await processMockPayment(selectedPlanId)
    if (!pay.ok) throw new Error('error' in pay ? pay.error : 'Payment failed.')
    setStep('activation')
    await new Promise(r => window.setTimeout(r, 1100))
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
    closeWizard()
    navigate(SATELLITE_INTELLIGENCE_PATH)
  }, [closeWizard, navigate])

  const value = useMemo<HomeOnboardingContextValue>(
    () => ({
      open,
      step,
      authMode,
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
