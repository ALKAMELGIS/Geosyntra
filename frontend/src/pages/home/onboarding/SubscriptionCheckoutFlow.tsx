import { useEffect, useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import type { StripeElementsOptions } from '@stripe/stripe-js'
import { getPricingPlan, type BillingPlanId } from '../../../lib/onboarding/pricingPlans'
import {
  apiBillingBankTransfer,
  apiBillingConfirmPayment,
  apiBillingCreateCheckout,
  apiBillingPaymentIntent,
} from '../../../lib/subscription/subscriptionApi'
import {
  createStripeCheckout,
  fetchPaymentIntentClientSecret,
  getStripePublishableKey,
  isStripeConfigured,
} from '../../../lib/onboarding/stripeClient'
import { processMockPayment } from '../../../lib/onboarding/activateWorkspace'
import { PLATFORM_MERCHANT_LABEL } from '../../../lib/onboarding/planSubscriptionFlow'
import { SaasButton } from '../../../components/saas/SaasEntryShell'
import type { CheckoutStep, PaymentMethodId } from '../../../lib/subscription/subscriptionTypes'

const STRIPE_APPEARANCE: StripeElementsOptions['appearance'] = {
  theme: 'night',
  variables: {
    colorPrimary: '#f8fafc',
    colorBackground: '#0a0f1a',
    colorText: '#e2e8f0',
    colorDanger: '#f87171',
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    borderRadius: '10px',
  },
}

type Props = {
  planId: BillingPlanId
  onBack: () => void
  onComplete: () => Promise<void>
}

const STEPS: { id: CheckoutStep; label: string }[] = [
  { id: 'summary', label: 'Plan' },
  { id: 'payment', label: 'Payment' },
  { id: 'confirm', label: 'Confirm' },
]

function StripeInlinePay({
  clientSecret,
  onPaid,
  onError,
}: {
  clientSecret: string
  onPaid: () => Promise<void>
  onError: (msg: string) => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!stripe || !elements) return
    setBusy(true)
    onError('')
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    })
    setBusy(false)
    if (error) {
      onError(error.message ?? 'Payment failed.')
      return
    }
    await onPaid()
  }

  return (
    <>
      <div className="home-checkout__element">
        <PaymentElement options={{ layout: 'tabs', wallets: { applePay: 'auto', googlePay: 'auto' } }} />
      </div>
      <SaasButton size="lg" variant="primary" className="home-checkout__submit" onClick={() => void submit()} disabled={busy}>
        {busy ? 'Processing…' : 'Pay $100 · secure'}
      </SaasButton>
    </>
  )
}

export function SubscriptionCheckoutFlow({ planId, onBack, onComplete }: Props) {
  const plan = getPricingPlan(planId)
  const [step, setStep] = useState<CheckoutStep>('summary')
  const [method, setMethod] = useState<PaymentMethodId>('card')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [bankRef, setBankRef] = useState<{ reference: string; note: string } | null>(null)

  useEffect(() => {
    if (step !== 'payment' || !isStripeConfigured() || method === 'bank_transfer' || method === 'stripe_checkout') {
      return
    }
    let cancelled = false
    void (async () => {
      const fromApi = await apiBillingPaymentIntent(planId)
      if (cancelled) return
      if (fromApi.ok) {
        setClientSecret(fromApi.clientSecret)
        return
      }
      const legacy = await fetchPaymentIntentClientSecret(planId)
      if (!cancelled) setClientSecret(legacy)
    })()
    return () => {
      cancelled = true
    }
  }, [step, method, planId])

  if (!plan) return null

  const finishPaid = async () => {
    setBusy(true)
    setError('')
    try {
      const confirmed = await apiBillingConfirmPayment(planId, method === 'bank_transfer' ? 'bank_transfer' : 'stripe')
      if (!confirmed.ok) {
        const mock = await processMockPayment(planId)
        if (!mock.ok) throw new Error('error' in mock ? mock.error : 'Could not confirm payment.')
      }
      setStep('confirm')
      await onComplete()
      setStep('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payment failed.')
    } finally {
      setBusy(false)
    }
  }

  const payWithStripeHosted = async () => {
    setBusy(true)
    setError('')
    try {
      const session = await apiBillingCreateCheckout(planId)
      if (session.ok) {
        window.location.assign(session.url)
        return
      }
      const legacy = await createStripeCheckout(planId)
      if (legacy?.url) {
        window.location.assign(legacy.url)
        return
      }
      setError('Stripe checkout is not configured. Use card payment or contact support.')
    } finally {
      setBusy(false)
    }
  }

  const startBankTransfer = async () => {
    setBusy(true)
    setError('')
    const result = await apiBillingBankTransfer(planId)
    setBusy(false)
    if (!result.ok || !result.instructions) {
      setError('Could not start bank transfer request.')
      return
    }
    setBankRef(result.instructions)
    setStep('confirm')
  }

  const stepIndex = STEPS.findIndex(s => s.id === step)

  return (
    <div className="home-checkout">
      <p className="home-checkout__merchant">
        Secure payments are processed on the <strong>{PLATFORM_MERCHANT_LABEL}</strong> merchant account (Stripe).
      </p>
      <nav className="home-checkout__steps" aria-label="Checkout progress">
        {STEPS.map((s, i) => (
          <span key={s.id} className={i <= stepIndex ? 'is-done' : ''}>
            <span className="home-checkout__step-num">{i + 1}</span>
            {s.label}
          </span>
        ))}
      </nav>

      {step === 'summary' ? (
        <div className="home-checkout__panel">
          <h3>{plan.name}</h3>
          <p className="home-checkout__price">
            {plan.priceLabel} <span>{plan.priceNote}</span>
          </p>
          <p className="home-checkout__desc">{plan.description}</p>
          <ul className="home-checkout__features">
            {plan.features.map(f => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <SaasButton size="lg" variant="primary" onClick={() => setStep('payment')}>
            Continue to payment
          </SaasButton>
        </div>
      ) : null}

      {step === 'payment' ? (
        <div className="home-checkout__panel">
          <p className="home-checkout__label">Payment method</p>
          <div className="home-checkout__methods">
            {(
              [
                { id: 'card' as const, label: 'Card', icon: 'fa-regular fa-credit-card' },
                { id: 'paypal' as const, label: 'PayPal', icon: 'fa-brands fa-paypal' },
                { id: 'bank_transfer' as const, label: 'Bank transfer', icon: 'fa-solid fa-building-columns' },
              ] as const
            ).map(m => (
              <button
                key={m.id}
                type="button"
                className={`home-checkout__method${method === m.id ? ' is-active' : ''}`}
                onClick={() => setMethod(m.id)}
              >
                <i className={m.icon} aria-hidden />
                {m.label}
              </button>
            ))}
          </div>

          {method === 'bank_transfer' ? (
            <div className="home-checkout__bank">
              <p>Transfer <strong>$100 USD</strong> to activate Pro after finance confirms receipt.</p>
              <SaasButton size="lg" variant="primary" disabled={busy} onClick={() => void startBankTransfer()}>
                {busy ? 'Submitting…' : 'Request bank transfer instructions'}
              </SaasButton>
            </div>
          ) : method === 'paypal' && isStripeConfigured() ? (
            <div className="home-checkout__note">
              <p>PayPal opens in Stripe Checkout (supports PayPal, cards, Apple Pay, Google Pay).</p>
              <SaasButton size="lg" variant="primary" disabled={busy} onClick={() => void payWithStripeHosted()}>
                Continue with Stripe Checkout
              </SaasButton>
            </div>
          ) : isStripeConfigured() && clientSecret ? (
            <Elements stripe={loadStripe(getStripePublishableKey())} options={{ clientSecret, appearance: STRIPE_APPEARANCE }}>
              <StripeInlinePay clientSecret={clientSecret} onPaid={() => finishPaid()} onError={setError} />
            </Elements>
          ) : (
            <div className="home-checkout__mock">
              <p className="home-checkout__mock-note">
                Demo mode — configure <code>STRIPE_SECRET_KEY</code> and <code>VITE_STRIPE_PUBLISHABLE_KEY</code> for live
                payments (Card, PayPal, Apple Pay, Google Pay).
              </p>
              <SaasButton size="lg" variant="primary" disabled={busy} onClick={() => void finishPaid()}>
                {busy ? 'Processing…' : `Complete payment · ${plan.priceLabel}`}
              </SaasButton>
            </div>
          )}

          <button type="button" className="home-wizard-back" onClick={() => setStep('summary')}>
            ← Back
          </button>
        </div>
      ) : null}

      {step === 'confirm' || step === 'done' ? (
        <div className="home-checkout__panel home-checkout__panel--success">
          <div className="home-checkout__success-icon" aria-hidden>
            <i className="fa-solid fa-circle-check" />
          </div>
          <h3>{step === 'done' ? 'Subscription active' : 'Almost there'}</h3>
          {bankRef ? (
            <p>
              Reference: <strong>{bankRef.reference}</strong>. {bankRef.note}
            </p>
          ) : (
            <p>Your {plan.name} plan is active. Paid features are unlocked.</p>
          )}
          {step === 'confirm' ? (
            <SaasButton
              size="lg"
              variant="primary"
              disabled={busy}
              onClick={() => {
                void (async () => {
                  setBusy(true)
                  try {
                    if (!bankRef) await finishPaid()
                    else {
                      setStep('done')
                      await onComplete()
                    }
                  } finally {
                    setBusy(false)
                  }
                })()
              }}
            >
              {bankRef ? 'Continue to workspace' : 'Confirm & enter workspace'}
            </SaasButton>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="home-wizard-form__error">{error}</p> : null}

      {step === 'summary' ? (
        <button type="button" className="home-wizard-back" onClick={onBack}>
          ← Back to plans
        </button>
      ) : null}
    </div>
  )
}
