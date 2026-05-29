import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getPricingPlan, type BillingPlanId } from '../../../lib/onboarding/pricingPlans'
import { SaasButton } from '../../../components/saas/SaasEntryShell'

export type PaymentSheetProps = {
  open: boolean
  planId: BillingPlanId
  onClose: () => void
  onPaid: () => Promise<void>
}

type PayMethod = 'card' | 'paypal'

export function PaymentSheet({ open, planId, onClose, onPaid }: PaymentSheetProps) {
  const plan = getPricingPlan(planId)
  const [method, setMethod] = useState<PayMethod>('card')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const handlePay = async () => {
    setError('')
    setBusy(true)
    try {
      await onPaid()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payment failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AnimatePresence>
      {open && plan ? (
        <motion.div
          className="home-pay-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="home-pay-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button type="button" className="home-pay-sheet__backdrop" aria-label="Close" onClick={onClose} />
          <motion.div
            className="home-pay-sheet__panel"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
          >
            <header className="home-pay-sheet__head">
              <h2 id="home-pay-title">Complete checkout</h2>
              <p>
                {plan.name} · {plan.priceLabel} <span>{plan.priceNote}</span>
              </p>
              <button type="button" className="home-pay-sheet__close" onClick={onClose} aria-label="Close">
                ×
              </button>
            </header>

            <p className="home-pay-sheet__label">Select payment method</p>
            <div className="home-pay-sheet__methods" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={method === 'card'}
                className={method === 'card' ? 'is-active' : ''}
                onClick={() => setMethod('card')}
              >
                Visa / MasterCard
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={method === 'paypal'}
                className={method === 'paypal' ? 'is-active' : ''}
                onClick={() => setMethod('paypal')}
              >
                PayPal
              </button>
            </div>

            {method === 'card' ? (
              <form
                className="home-pay-sheet__form"
                onSubmit={e => {
                  e.preventDefault()
                  void handlePay()
                }}
              >
                <label>
                  Card number
                  <input type="text" inputMode="numeric" placeholder="4242 4242 4242 4242" autoComplete="cc-number" />
                </label>
                <div className="home-pay-sheet__row">
                  <label>
                    Expiry
                    <input type="text" placeholder="MM / YY" autoComplete="cc-exp" />
                  </label>
                  <label>
                    CVV
                    <input type="text" inputMode="numeric" placeholder="123" autoComplete="cc-csc" />
                  </label>
                </div>
                <label>
                  Name on card
                  <input type="text" placeholder="Full name" autoComplete="cc-name" />
                </label>
              </form>
            ) : (
              <div className="home-pay-sheet__paypal">
                <p>One-click checkout with PayPal — sandbox mode until Stripe is connected.</p>
                <SaasButton size="lg" variant="primary" className="w-full" onClick={() => void handlePay()} disabled={busy}>
                  Pay with PayPal
                </SaasButton>
              </div>
            )}

            {error ? <p className="home-pay-sheet__error">{error}</p> : null}

            {method === 'card' ? (
              <SaasButton size="lg" variant="primary" className="home-pay-sheet__submit" onClick={() => void handlePay()} disabled={busy}>
                {busy ? 'Processing…' : 'Pay securely'}
              </SaasButton>
            ) : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
