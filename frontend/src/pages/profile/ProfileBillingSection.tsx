import { useEffect, useState } from 'react'
import { CreditCard, RefreshCw } from 'lucide-react'
import { navigateToHomeWizard } from '../../lib/homeWizardEntry'
import { useNavigate } from 'react-router-dom'
import { apiBillingInvoices } from '../../lib/subscription/subscriptionApi'
import { useSubscription } from '../../lib/subscription/useSubscription'
import type { BillingInvoice } from '../../lib/subscription/subscriptionTypes'
import { DISPLAY_STATUS_LABELS } from '../../lib/subscription/subscriptionTypes'
import { formatProfileDate } from './profileUtils'

function formatMoney(cents: number, currency = 'USD') {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100)
}

function statusClass(status: string) {
  if (status === 'paid') return 'profile-billing__pill--paid'
  if (status === 'pending') return 'profile-billing__pill--pending'
  return 'profile-billing__pill--muted'
}

export function ProfileBillingSection() {
  const navigate = useNavigate()
  const { subscription, usage, loading, refresh, displayStatus, trialDaysLeft, statusLabel } =
    useSubscription()
  const [invoices, setInvoices] = useState<BillingInvoice[]>([])
  const [invoicesLoading, setInvoicesLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      setInvoicesLoading(true)
      const result = await apiBillingInvoices()
      if (result.ok) setInvoices(result.invoices)
      setInvoicesLoading(false)
    })()
  }, [])

  if (loading || !subscription) {
    return <p className="profile-billing__loading">Loading subscription…</p>
  }

  const displayLabel = DISPLAY_STATUS_LABELS[displayStatus] ?? statusLabel

  return (
    <div className="profile-billing">
      <div className="profile-billing__header">
        <h2 className="profile-billing__title">Subscription & billing</h2>
        <button type="button" className="profile-billing__refresh" onClick={() => void refresh()}>
          <RefreshCw className="h-4 w-4" aria-hidden />
          Refresh
        </button>
      </div>

      <div className="profile-billing__grid">
        <article className="profile-billing__card">
          <p className="profile-billing__label">Status</p>
          <p className={`profile-billing__pill profile-billing__pill--${displayStatus}`}>{displayLabel}</p>
          {trialDaysLeft !== null ? (
            <p className="profile-billing__meta">
              <strong>{trialDaysLeft}</strong> day{trialDaysLeft === 1 ? '' : 's'} left in free trial
            </p>
          ) : null}
          {subscription.current_period_end ? (
            <p className="profile-billing__meta">
              Renews / ends: {formatProfileDate(subscription.current_period_end)}
            </p>
          ) : null}
          {subscription.billing_provider ? (
            <p className="profile-billing__meta">Provider: {subscription.billing_provider}</p>
          ) : null}
        </article>

        <article className="profile-billing__card">
          <p className="profile-billing__label">Plan</p>
          <p className="profile-billing__plan-name">
            {subscription.plan === 'pro' ? 'Pro · $100/mo' : subscription.plan === 'enterprise' ? 'Enterprise' : 'Free Trial'}
          </p>
          <p className="profile-billing__meta">AI queries today: {usage?.ai_queries ?? 0}</p>
          <button
            type="button"
            className="profile-billing__cta"
            onClick={() => navigateToHomeWizard(navigate, { wizard: 'pricing', upgrade: true })}
          >
            <CreditCard className="h-4 w-4" aria-hidden />
            {displayStatus === 'trial_expired' || subscription.plan === 'free' ? 'Upgrade to Pro' : 'Change plan'}
          </button>
        </article>
      </div>

      <section className="profile-billing__invoices">
        <h3>Invoices & payments</h3>
        {invoicesLoading ? (
          <p className="profile-billing__meta">Loading history…</p>
        ) : invoices.length === 0 ? (
          <p className="profile-billing__meta">No invoices yet. Payments appear here after checkout.</p>
        ) : (
          <div className="profile-billing__table-wrap">
            <table className="profile-billing__table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Renewal</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id}>
                    <td>{formatProfileDate(inv.paid_at || inv.created_at)}</td>
                    <td>{inv.description || inv.plan}</td>
                    <td>{formatMoney(inv.amount_cents, inv.currency)}</td>
                    <td>
                      <span className={`profile-billing__pill ${statusClass(inv.status)}`}>{inv.status}</span>
                    </td>
                    <td>{inv.period_end ? formatProfileDate(inv.period_end) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
