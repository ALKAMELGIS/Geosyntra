import { navigateToHomeWizard } from '../../lib/homeWizardEntry'
import { SUBSCRIPTION_PLAN_LABELS, type SubscriptionPlanId } from '../../lib/geoEnterpriseUserModel'
import './GeoAiUpgradePrompt.css'

export type GeoAiUpgradePromptProps = {
  plan: SubscriptionPlanId
  message: string
  upgradePlan?: 'pro' | 'enterprise'
  compact?: boolean
  onDismiss?: () => void
}

export function GeoAiUpgradePrompt({
  plan,
  message,
  upgradePlan = 'pro',
  compact = false,
  onDismiss,
}: GeoAiUpgradePromptProps) {
  const handleUpgrade = () => {
    if (upgradePlan === 'enterprise') {
      window.open('mailto:sales@geosyntra.com?subject=Enterprise%20plan', '_blank')
      return
    }
    navigateToHomeWizard({ wizard: 'pricing', authMode: 'signin', upgrade: true })
  }

  return (
    <div
      className={'geo-ai-upgrade-prompt' + (compact ? ' geo-ai-upgrade-prompt--compact' : '')}
      role="status"
    >
      <span className="geo-ai-upgrade-prompt__badge" aria-hidden>
        {SUBSCRIPTION_PLAN_LABELS[plan]}
      </span>
      <p className="geo-ai-upgrade-prompt__text">{message}</p>
      <div className="geo-ai-upgrade-prompt__actions">
        <button type="button" className="geo-ai-upgrade-prompt__cta" onClick={handleUpgrade}>
          {upgradePlan === 'enterprise' ? 'Talk to sales' : 'Upgrade to Pro'}
        </button>
        {onDismiss ? (
          <button type="button" className="geo-ai-upgrade-prompt__dismiss" onClick={onDismiss}>
            Not now
          </button>
        ) : null}
      </div>
    </div>
  )
}
