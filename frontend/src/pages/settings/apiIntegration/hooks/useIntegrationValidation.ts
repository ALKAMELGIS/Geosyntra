import { useEffect, useMemo, useState } from 'react'
import type { IntegrationDraft, ValidationResult } from '../types'
import { validateIntegrationDraft } from '../providers/validate'

const DEBOUNCE_MS = 320

export function useIntegrationValidation(draft: IntegrationDraft, secrets: Record<string, string>) {
  const [debounced, setDebounced] = useState({ draft, secrets })
  const [result, setResult] = useState<ValidationResult>(() => validateIntegrationDraft(draft, secrets))

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced({ draft, secrets }), DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [draft, secrets])

  useEffect(() => {
    setResult(validateIntegrationDraft(debounced.draft, debounced.secrets))
  }, [debounced])

  const fieldLevel = useMemo(() => result.fields, [result.fields])

  return { result, fieldLevel, isValid: result.valid }
}
