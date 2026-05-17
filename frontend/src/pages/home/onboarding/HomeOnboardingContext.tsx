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
import type { WizardOpenOptions, WizardStep } from './homeOnboarding.types'

type HomeOnboardingContextValue = {
  open: boolean
  step: WizardStep
  selectedPlanId: BillingPlanId | null
  paymentOpen: boolean
  workspaceReady: boolean
  trialDaysLeft: number | null
  openWizard: (opts?: WizardOpenOptions) => void
  closeWizard: () => void
  setStep: (step: WizardStep) => void
  selectPlan: (planId: BillingPlanId) => void
  openPayment: (planId: BillingPlanId) => void
  closePayment: () => void
  completePayment: () => Promise<void>
  runActivation: () => Promise<void>
  enterWorkspace: () => void
  refreshWorkspace: () => void
}

const HomeOnboardingContext = createContext<HomeOnboardingContextValue | null>(null)

const DASHBOARD_PATH = '/satellite/indices'

export function HomeOnboardingProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<WizardStep>('auth')
  const [selectedPlanId, setSelectedPlanId] = useState<BillingPlanId | null>('trial')
  const [paymentOpen, setPaymentOpen] = useState(false)
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
        navigate(DASHBOARD_PATH)
        return
      }
      const initialStep: WizardStep = opts?.step ?? (u ? 'pricing' : 'auth')
      setStep(initialStep)
      if (opts?.planId) setSelectedPlanId(opts.planId)
      setPaymentOpen(false)
      setOpen(true)
      document.body.style.overflow = 'hidden'
    },
    [navigate],
  )

  const closeWizard = useCallback(() => {
    setOpen(false)
    setPaymentOpen(false)
    document.body.style.overflow = ''
  }, [])

  const selectPlan = useCallback((planId: BillingPlanId) => {
    setSelectedPlanId(planId)
    setStep('pricing')
  }, [])

  const openPayment = useCallback((planId: BillingPlanId) => {
    setSelectedPlanId(planId)
    setPaymentOpen(true)
  }, [])

  const closePayment = useCallback(() => setPaymentOpen(false), [])

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
    if (!pay.ok) throw new Error(pay.error)
    setPaymentOpen(false)
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
    navigate(DASHBOARD_PATH)
  }, [closeWizard, navigate])

  const value = useMemo<HomeOnboardingContextValue>(
    () => ({
      open,
      step,
      selectedPlanId,
      paymentOpen,
      workspaceReady,
      trialDaysLeft,
      openWizard,
      closeWizard,
      setStep,
      selectPlan,
      openPayment,
      closePayment,
      completePayment,
      runActivation,
      enterWorkspace,
      refreshWorkspace,
    }),
    [
      open,
      step,
      selectedPlanId,
      paymentOpen,
      workspaceReady,
      trialDaysLeft,
      openWizard,
      closeWizard,
      selectPlan,
      openPayment,
      closePayment,
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
