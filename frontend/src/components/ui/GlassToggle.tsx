import './glass-toggle.css'

export type GlassToggleProps = {
  id: string
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  hint?: string
  disabled?: boolean
  className?: string
}

/** Accessible glassmorphism toggle — replaces native checkboxes in auth & settings. */
export function GlassToggle({ id, checked, onChange, label, hint, disabled, className }: GlassToggleProps) {
  return (
    <label
      className={`gs-glass-toggle${disabled ? ' gs-glass-toggle--disabled' : ''}${className ? ` ${className}` : ''}`}
      htmlFor={id}
    >
      <span className="gs-glass-toggle__text">
        <span className="gs-glass-toggle__label">{label}</span>
        {hint ? <span className="gs-glass-toggle__hint">{hint}</span> : null}
      </span>
      <span className="gs-glass-toggle__switch">
        <input
          id={id}
          type="checkbox"
          role="switch"
          aria-checked={checked}
          checked={checked}
          disabled={disabled}
          onChange={e => onChange(e.target.checked)}
        />
        <span className="gs-glass-toggle__track" aria-hidden />
        <span className="gs-glass-toggle__thumb" aria-hidden />
      </span>
    </label>
  )
}
