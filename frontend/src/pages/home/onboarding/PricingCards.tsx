import { PRICING_PLANS, type BillingPlanId } from '../../../lib/onboarding/pricingPlans'
import { SaasButton } from '../../../components/saas/SaasEntryShell'

export type PricingCardsProps = {
  onSelectPlan: (planId: BillingPlanId) => void
  onGetStarted: (planId: BillingPlanId) => void
  compact?: boolean
  selectedPlanId?: BillingPlanId | null
}

export function PricingCards({ onSelectPlan, onGetStarted, compact, selectedPlanId }: PricingCardsProps) {
  return (
    <div className="home-pricing__stack">
      <div className="home-pricing__grid">
        {PRICING_PLANS.map(plan => (
          <article
            key={plan.id}
            className={`home-pricing__card${plan.highlighted ? ' home-pricing__card--featured' : ''}${selectedPlanId === plan.id ? ' home-pricing__card--selected' : ''}`}
          >
            {plan.highlighted ? <span className="home-pricing__badge">Most popular</span> : null}
            <header className="home-pricing__card-head">
              <h3 className="home-pricing__plan-name">{plan.name}</h3>
              <p className="home-pricing__price">
                <span className="home-pricing__price-value">{plan.priceLabel}</span>
                <span className="home-pricing__price-note">{plan.priceNote}</span>
              </p>
              <p className="home-pricing__desc">{plan.description}</p>
            </header>
            <ul className="home-pricing__features">
              {plan.features.map(f => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <div className="home-pricing__card-actions">
              <SaasButton
                size={compact ? 'sm' : 'lg'}
                variant={plan.highlighted ? 'primary' : 'ghost'}
                className="home-pricing__cta"
                onClick={() => onGetStarted(plan.id)}
              >
                {plan.cta}
              </SaasButton>
              <button type="button" className="home-pricing__compare" onClick={() => onSelectPlan(plan.id)}>
                View details
              </button>
            </div>
          </article>
        ))}
      </div>
      <p className="home-pricing__trust" aria-label="Accepted payment methods">
        <span>Visa</span>
        <span>Mastercard</span>
        <span>PayPal</span>
        <span className="home-pricing__trust-note">Secure checkout · Stripe-ready</span>
      </p>
    </div>
  )
}
