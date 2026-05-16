import { useState } from 'react'
import { cn } from '../../../../lib/utils'
import type { TokenFieldDef } from '../types'
import { ValidationStatus } from './ValidationStatus'
import type { FieldValidation } from '../types'

type Props = {
  field: TokenFieldDef
  value: string
  displayValue: string
  revealed: boolean
  validation?: FieldValidation
  onChange: (value: string) => void
  onToggleReveal: () => void
  onCopy: () => Promise<boolean>
}

export function SecureTokenInput({
  field,
  value,
  displayValue,
  revealed,
  validation,
  onChange,
  onToggleReveal,
  onCopy,
}: Props) {
  const [copied, setCopied] = useState(false)
  const isSecret = field.secret || field.kind === 'password'
  const inputType = isSecret && !revealed ? 'password' : field.kind === 'number' ? 'number' : 'text'

  const handleCopy = async () => {
    const ok = await onCopy()
    if (ok) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="api-integ-tw-field">
      <label className="api-integ-tw-label" htmlFor={`field-${field.id}`}>
        {field.label}
        {field.required ? <span className="text-red-400/80"> *</span> : null}
      </label>
      <div className="relative">
        <input
          id={`field-${field.id}`}
          type={inputType}
          className={cn('api-integ-tw-input pr-20', isSecret && !revealed && 'tracking-widest')}
          value={isSecret && !revealed && value ? displayValue : value}
          placeholder={field.placeholder}
          onChange={e => onChange(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          onFocus={() => {
            if (isSecret && !revealed && value) onToggleReveal()
          }}
        />
        {isSecret ? (
          <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
            <button
              type="button"
              className="api-integ-tw-icon-btn"
              onClick={onToggleReveal}
              title={revealed ? 'Hide' : 'Show'}
              aria-label={revealed ? 'Hide secret' : 'Show secret'}
            >
              <i className={cn('fa-solid', revealed ? 'fa-eye-slash' : 'fa-eye')} aria-hidden />
            </button>
            <button
              type="button"
              className="api-integ-tw-icon-btn"
              onClick={() => void handleCopy()}
              disabled={!value}
              title="Copy"
              aria-label="Copy to clipboard"
            >
              <i className={cn('fa-solid', copied ? 'fa-check' : 'fa-copy')} aria-hidden />
            </button>
          </div>
        ) : null}
      </div>
      {field.hint ? <p className="mt-1 text-[0.68rem] text-white/35">{field.hint}</p> : null}
      {validation ? <ValidationStatus validation={validation} /> : null}
    </div>
  )
}
