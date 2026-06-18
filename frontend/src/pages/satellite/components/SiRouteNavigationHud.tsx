import { formatRouteDistance, formatRouteDuration } from '../../../lib/geoAiRoutePlan'
import type { NavigationTurnStep } from '../../../lib/geoAiRoutePlan'
import './SiRouteNavigationHud.css'

export function SiRouteNavigationHud({
  active,
  currentStep,
  stepIndex,
  totalSteps,
  remainingDistanceM,
  remainingDurationS,
  onStop,
  onRecenter,
}: {
  active: boolean
  currentStep: NavigationTurnStep | null
  stepIndex: number
  totalSteps: number
  remainingDistanceM?: number
  remainingDurationS?: number
  onStop: () => void
  onRecenter?: () => void
}) {
  if (!active) return null
  return (
    <div className="si-route-nav-hud" role="status" aria-live="polite">
      <div className="si-route-nav-hud__main">
        <p className="si-route-nav-hud__step">{currentStep?.instruction || 'Follow the route'}</p>
        <p className="si-route-nav-hud__meta">
          Step {Math.min(stepIndex + 1, totalSteps)}/{totalSteps} · ETA{' '}
          {formatRouteDuration(remainingDurationS)} · {formatRouteDistance(remainingDistanceM)}
        </p>
      </div>
      <div className="si-route-nav-hud__actions">
        {onRecenter ? (
          <button type="button" className="si-route-nav-hud__btn" onClick={onRecenter} title="Recenter">
            <i className="fa-solid fa-location-crosshairs" aria-hidden />
          </button>
        ) : null}
        <button type="button" className="si-route-nav-hud__btn si-route-nav-hud__btn--stop" onClick={onStop}>
          End
        </button>
      </div>
    </div>
  )
}
