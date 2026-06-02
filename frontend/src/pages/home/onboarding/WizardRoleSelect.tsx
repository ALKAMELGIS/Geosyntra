import { useEffect, useId, useRef, useState } from 'react'
import {
  GEOSYNTRA_ROLE_HIERARCHY,
  signupRoleBySlug,
  type GeosyntraRoleSlug,
} from '../../../lib/rbac/geosyntraRoles'

type WizardRoleSelectProps = {
  value: GeosyntraRoleSlug
  onChange: (slug: GeosyntraRoleSlug) => void
  hintId?: string
}

export function WizardRoleSelect({ value, onChange, hintId }: WizardRoleSelectProps) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const selected = signupRoleBySlug(value) ?? signupRoleBySlug('trial_user')!

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
    <div ref={rootRef} className={`home-wizard-role-select${open ? ' home-wizard-role-select--open' : ''}`}>
      <button
        type="button"
        className="home-wizard-role-select__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen(o => !o)}
      >
        <span className={`home-wizard-role-select__icon home-wizard-role-select__icon--${selected.slug}`} aria-hidden>
          <i className={selected.iconClass} />
        </span>
        <span className="home-wizard-role-select__trigger-text">{selected.shortLabel}</span>
        <i className="fa-solid fa-chevron-down home-wizard-role-select__chevron" aria-hidden />
      </button>

      {open ? (
        <div className="home-wizard-role-select__panel" role="presentation">
          <p className="home-wizard-role-select__panel-title">Select your workspace role</p>
          <ul id={listId} className="home-wizard-role-select__list" role="listbox" aria-describedby={hintId}>
            {GEOSYNTRA_ROLE_HIERARCHY.map(role => {
              const isSelected = role.slug === value
              const disabled = !role.selectableOnSignup
              return (
                <li key={role.slug} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={disabled}
                    className={
                      'home-wizard-role-select__option' +
                      (isSelected ? ' home-wizard-role-select__option--active' : '') +
                      (disabled ? ' home-wizard-role-select__option--locked' : '')
                    }
                    onClick={() => {
                      if (disabled) return
                      onChange(role.slug)
                      setOpen(false)
                    }}
                  >
                    <span
                      className={`home-wizard-role-select__icon home-wizard-role-select__icon--${role.slug}`}
                      aria-hidden
                    >
                      <i className={role.iconClass} />
                    </span>
                    <span className="home-wizard-role-select__option-body">
                      <span className="home-wizard-role-select__option-label">{role.shortLabel}</span>
                      {disabled ? (
                        <span className="home-wizard-role-select__option-meta">Admin-assigned only</span>
                      ) : role.requiresApproval ? (
                        <span className="home-wizard-role-select__option-meta">Requires approval</span>
                      ) : null}
                    </span>
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
