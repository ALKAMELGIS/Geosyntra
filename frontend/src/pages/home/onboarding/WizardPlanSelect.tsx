import { useEffect, useId, useRef, useState } from 'react'
import {
  DEFAULT_SIGNUP_PLAN_ID,
  SIGNUP_PLAN_OPTIONS,
  signupPlanById,
  type SignupPlanOption,
} from '../../../lib/onboarding/signupPlans'
import type { BillingPlanId } from '../../../lib/onboarding/pricingPlans'

type WizardPlanSelectProps = {
  value: BillingPlanId
  onChange: (planId: BillingPlanId) => void
  hintId?: string
}

export function WizardPlanSelect({ value, onChange, hintId }: WizardPlanSelectProps) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const selected: SignupPlanOption = signupPlanById(value) ?? signupPlanById(DEFAULT_SIGNUP_PLAN_ID)!

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className={`home-wizard-role-select home-wizard-plan-select${open ? ' home-wizard-role-select--open' : ''}`}>
      <button
        type="button"
        className="home-wizard-role-select__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen(o => !o)}
      >
        <span className={`home-wizard-role-select__icon home-wizard-role-select__icon--${selected.id}`} aria-hidden>
          <i className={selected.iconClass} />
        </span>
        <span className="home-wizard-role-select__trigger-text">{selected.shortLabel}</span>
        <i className="fa-solid fa-chevron-down home-wizard-role-select__chevron" aria-hidden />
      </button>

      {open ? (
        <div className="home-wizard-role-select__panel home-wizard-plan-select__panel" role="presentation">
          <ul id={listId} className="home-wizard-role-select__list" role="listbox" aria-describedby={hintId}>
            {SIGNUP_PLAN_OPTIONS.map(plan => {
              const isSelected = plan.id === value
              return (
                <li key={plan.id} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={
                      'home-wizard-role-select__option' +
                      (isSelected ? ' home-wizard-role-select__option--active' : '')
                    }
                    onClick={() => {
                      onChange(plan.id)
                      setOpen(false)
                    }}
                  >
                    <span
                      className={`home-wizard-role-select__icon home-wizard-role-select__icon--${plan.id}`}
                      aria-hidden
                    >
                      <i className={plan.iconClass} />
                    </span>
                    <span className="home-wizard-role-select__option-label">{plan.shortLabel}</span>
                    {isSelected ? (
                      <i className="fa-solid fa-check home-wizard-role-select__check" aria-hidden />
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
