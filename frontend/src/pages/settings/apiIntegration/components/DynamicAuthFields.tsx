import { AnimatePresence, motion } from 'framer-motion'
import type { AuthType, ProviderId, TokenFieldDef } from '../types'
import type { FieldValidation } from '../types'
import { SecureTokenInput } from './SecureTokenInput'

type Props = {
  authType: AuthType
  authOptions: { id: AuthType; label: string }[]
  fields: TokenFieldDef[]
  config: Record<string, string>
  secrets: Record<string, string>
  revealed: Record<string, boolean>
  fieldValidation: Record<string, FieldValidation>
  onAuthTypeChange: (auth: AuthType) => void
  onConfigChange: (fieldId: string, value: string) => void
  onSecretChange: (fieldId: string, value: string) => void
  onToggleReveal: (fieldId: string) => void
  onCopy: (fieldId: string) => Promise<boolean>
  displayValue: (fieldId: string, raw: string) => string
}

export function DynamicAuthFields({
  authType,
  authOptions,
  fields,
  config,
  secrets,
  revealed,
  fieldValidation,
  onAuthTypeChange,
  onConfigChange,
  onSecretChange,
  onToggleReveal,
  onCopy,
  displayValue,
}: Props) {
  return (
    <div>
      <div className="api-integ-tw-field mb-4 max-w-xs">
        <label className="api-integ-tw-label" htmlFor="auth-type-select">
          Auth Type
        </label>
        <select
          id="auth-type-select"
          className="api-integ-tw-input"
          value={authType}
          onChange={e => onAuthTypeChange(e.target.value as AuthType)}
        >
          {authOptions.map(o => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={fields.map(f => f.id).join(',')}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          className="grid gap-3 sm:grid-cols-2"
        >
          {fields.map(field => {
            const isSecret = Boolean(field.secret || field.kind === 'password')
            const raw = (isSecret ? secrets[field.id] : config[field.id]) ?? ''
            return (
              <SecureTokenInput
                key={field.id}
                field={field}
                value={raw}
                displayValue={displayValue(field.id, raw)}
                revealed={Boolean(revealed[field.id])}
                validation={fieldValidation[field.id]}
                onChange={v => (isSecret ? onSecretChange(field.id, v) : onConfigChange(field.id, v))}
                onToggleReveal={() => onToggleReveal(field.id)}
                onCopy={() => onCopy(field.id)}
              />
            )
          })}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
