import type { NavigationTurnStep } from '../../../lib/geoAiRoutePlan'
import { formatRouteDistance, formatRouteDuration } from '../../../lib/geoAiRoutePlan'
import './SiRouteTurnByTurnList.css'

export function SiRouteTurnByTurnList({
  steps,
  activeIndex = 0,
  onSelectStep,
}: {
  steps: NavigationTurnStep[]
  activeIndex?: number
  onSelectStep?: (index: number) => void
}) {
  if (!steps.length) return null
  return (
    <div className="si-route-turns">
      <div className="si-route-turns__head">
        <i className="fa-solid fa-list-ol" aria-hidden />
        Turn-by-turn ({steps.length})
      </div>
      <ol className="si-route-turns__list">
        {steps.map((step, i) => (
          <li key={`${i}-${step.instruction.slice(0, 24)}`}>
            <button
              type="button"
              className={`si-route-turns__item${i === activeIndex ? ' is-active' : ''}`}
              onClick={() => onSelectStep?.(i)}
            >
              <span className="si-route-turns__idx">{i + 1}</span>
              <span className="si-route-turns__text">
                <span className="si-route-turns__instr">{step.instruction}</span>
                {step.streetName ? (
                  <span className="si-route-turns__street">{step.streetName}</span>
                ) : null}
                <span className="si-route-turns__meta">
                  {formatRouteDistance(step.distanceMeters)} ·{' '}
                  {formatRouteDuration(step.durationSeconds)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}
