import { useEffect, useState, type FormEvent } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import type { StripeElementsOptions } from '@stripe/stripe-js'
import {
  fetchPaymentIntentClientSecret,
  getStripePublishableKey,
  isStripeConfigured,
} from '../../../lib/onboarding/stripeClient'
import { getPricingPlan, type BillingPlanId } from '../../../lib/onboarding/pricingPlans'
import { SaasButton } from '../../../components/saas/SaasEntryShell'

const STRIPE_APPEARANCE: StripeElementsOptions['appearance'] = {
  theme: 'night',
  variables: {
    colorPrimary: '#f8fafc',
    colorBackground: '#0a0f1a',
    colorText: '#e2e8f0',
    colorDanger: '#f87171',
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    borderRadius: '10px',
    spacingUnit: '4px',
  },
  rules: {
    '.Input': {
      border: '1px solid rgba(255, 255, 255, 0.12)',
      boxShadow: 'none',
      backgroundColor: 'rgba(0, 0, 0, 0.35)',
    },
    '.Label': {
      color: 'rgba(203, 213, 225, 0.9)',
    },
  },
}

type CheckoutProps = {
  planId: BillingPlanId
  onBack: () => void
  onPaid: () => Promise<void>
}

function StripePaymentForm({ onPaid, onBack }: { onPaid: () => Promise<void>; onBack: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!stripe || !elements) return
    setError('')
    setBusy(true)
    try {
      const { error: stripeError } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: window.location.href },
        redirect: 'if_required',
      })
      if (stripeError) {
        setError(stripeError.message ?? 'Payment could not be completed.')
        return
      }
      await onPaid()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payment failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="home-wizard-pay__form"
      onSubmit={e => {
        e.preventDefault()
        void submit()
      }}
    >
      <div className="home-wizard-pay__element">
        <PaymentElement options={{ layout: 'tabs' }} />
      </div>
      {error ? <p className="home-wizard-form__error">{error}</p> : null}
      <SaasButton
        size="lg"
        variant="primary"
        className="home-wizard-pay__submit"
        onClick={() => void submit()}
      >
        {busy ? 'Processing…' : 'Pay securely'}
      </SaasButton>
      <button type="button" className="home-wizard-back" onClick={onBack}>
        ← Back to plans
      </button>
    </form>
  )
}

function MockPaymentElement({ planId, onPaid, onBack }: CheckoutProps) {
  const plan = getPricingPlan(planId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await onPaid()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="home-wizard-pay__form home-wizard-pay__form--mock" onSubmit={e => void submit(e)}>
      <div className="home-wizard-pay__mock-badge" role="status">
        Stripe Payment Element · sandbox
      </div>
      <div className="home-wizard-pay__mock-fields" aria-label="Payment details">
        <label>
          Card number
          <input type="text" inputMode="numeric" placeholder="4242 4242 4242 4242" autoComplete="cc-number" />
        </label>
        <div className="home-wizard-pay__mock-row">
          <label>
            Expiry
            <input type="text" placeholder="MM / YY" autoComplete="cc-exp" />
          </label>
          <label>
            CVC
            <input type="text" inputMode="numeric" placeholder="123" autoComplete="cc-csc" />
          </label>
        </div>
        <label>
          Country
          <select defaultValue="US">
            <option value="US">United States</option>
            <option value="AE">United Arab Emirates</option>
            <option value="GB">United Kingdom</option>
            <option value="SA">Saudi Arabia</option>
          </select>
        </label>
      </div>
      <p className="home-wizard-pay__mock-note">
        Set <code>VITE_STRIPE_PUBLISHABLE_KEY</code> and wire <code>POST /api/billing/payment-intent</code> for live
        Stripe Elements.
      </p>
      {error ? <p className="home-wizard-form__error">{error}</p> : null}
      <SaasButton size="lg" variant="primary" className="home-wizard-pay__submit">
        {busy ? 'Processing…' : `Subscribe · ${plan?.priceLabel ?? ''}`}
      </SaasButton>
      <button type="button" className="home-wizard-back" onClick={onBack}>
        ← Back to plans
      </button>
    </form>
  )
}

export function StripeCheckoutPanel({ planId, onPaid, onBack }: CheckoutProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [loading, setLoading] = useState(isStripeConfigured())
  const plan = getPricingPlan(planId)

  useEffect(() => {
    if (!isStripeConfigured()) {
      setLoading(false)
      return
    }
    let cancelled = false
    void fetchPaymentIntentClientSecret(planId).then(secret => {
      if (!cancelled) {
        setClientSecret(secret)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [planId])

  if (loading) {
    return <p className="home-wizard-pay__loading">Preparing secure checkout…</p>
  }

  if (!isStripeConfigured() || !clientSecret) {
    return <MockPaymentElement planId={planId} onPaid={onPaid} onBack={onBack} />
  }

  const stripePromise = loadStripe(getStripePublishableKey())
  const options: StripeElementsOptions = {
    clientSecret,
    appearance: STRIPE_APPEARANCE,
  }

  return (
    <div className="home-wizard-pay">
      {plan ? (
        <p className="home-wizard-pay__summary">
          <strong>{plan.name}</strong> · {plan.priceLabel} <span>{plan.priceNote}</span>
        </p>
      ) : null}
      <Elements stripe={stripePromise} options={options}>
        <StripePaymentForm onPaid={onPaid} onBack={onBack} />
      </Elements>
    </div>
  )
}
