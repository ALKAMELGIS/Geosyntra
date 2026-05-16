import { useEffect, useMemo, useState } from 'react'
import type { IntegrationDraft, ValidationResult } from '../types'
import { validateIntegrationDraft } from '../providers/validate'

const DEBOUNCE_MS = 320

export function useIntegrationValidation(draft: IntegrationDraft) {
  const [debounced, setDebounced] = useState(draft)
  const [result, setResult] = useState<ValidationResult>(() => validateIntegrationDraft(draft))

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(draft), DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [draft])

  useEffect(() => {
    setResult(validateIntegrationDraft(debounced))
  }, [debounced])

  const fieldLevel = useMemo(() => result.fields, [result.fields])

  return { result, fieldLevel, isValid: result.valid }
}
