import type { ConversationalStep } from '../utils/geoConversationalCoach'
import './GeoConversationalCoach.css'

export type GeoConversationalCoachProps = {
  step: ConversationalStep | null
  stepIndex: number
  totalSteps: number
  groundingActive?: boolean
  disabled?: boolean
  hidden?: boolean
  onUse: (insertText: string) => void
  onNext: () => void
  onDismiss: () => void
}

export function GeoConversationalCoach({
  step,
  stepIndex,
  totalSteps,
  disabled,
  hidden,
  onUse,
  onNext,
  onDismiss,
}: GeoConversationalCoachProps) {
  if (hidden || !step) return null

  const hasNext = stepIndex < totalSteps - 1

  return (
    <div className="si-geo-explorer-row si-geo-explorer-row--model geo-coach">
      <div className="si-geo-explorer-avatar geo-coach__avatar" aria-hidden>
        <i className="fa-solid fa-wand-magic-sparkles" />
      </div>
      <div className="geo-coach__body">
        <p className="geo-coach__prompt">{step.prompt}</p>
        <div className="geo-coach__actions" role="group" aria-label="Suggested prompt actions">
          <button
            type="button"
            className="geo-coach__action geo-coach__action--primary"
            disabled={disabled}
            onClick={() => onUse(step.insertText)}
          >
            Continue
          </button>
          {hasNext ? (
            <>
              <span className="geo-coach__sep" aria-hidden>
                ·
              </span>
              <button
                type="button"
                className="geo-coach__action"
                disabled={disabled}
                onClick={onNext}
              >
                Another idea
              </button>
            </>
          ) : null}
          <span className="geo-coach__sep" aria-hidden>
            ·
          </span>
          <button
            type="button"
            className="geo-coach__action"
            disabled={disabled}
            onClick={onDismiss}
            aria-label="Dismiss suggestions"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}
