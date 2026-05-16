import { AnimatePresence, motion } from 'framer-motion'
import type { AuthType, TokenFieldDef } from '../types'
import type { FieldValidation } from '../types'
import { SecureTokenInput } from './SecureTokenInput'
import { SelectMenu } from './SelectMenu'

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
  const showAuthPicker = authOptions.length > 1
  const singleColumn = fields.length <= 2

  return (
    <motion.div className="api-integ-auth-fields">
      {showAuthPicker ? (
        <SelectMenu
          label="Connection type"
          id="auth-type-select"
          value={authType}
          options={authOptions.map(o => ({ value: o.id, label: o.label }))}
          onChange={v => onAuthTypeChange(v as AuthType)}
        />
      ) : null}

      <AnimatePresence mode="wait">
        <motion.div
          key={fields.map(f => f.id).join(',')}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
          className={
            singleColumn ? 'api-integ-auth-fields__grid api-integ-auth-fields__grid--single' : 'api-integ-auth-fields__grid'
          }
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
    </motion.div>
  )
}
