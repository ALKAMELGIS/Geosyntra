import type { AuthType, FieldValidation, IntegrationDraft, ProviderId, ValidationResult } from '../types'
import { getFieldsForAuth, getProvider } from './registry'

const URL_RE = /^https?:\/\/.+/i

export function validateUrl(value: string): FieldValidation {
  if (!value.trim()) return { level: 'idle' }
  if (!URL_RE.test(value.trim())) return { level: 'error', message: 'Enter a valid http(s) URL' }
  return { level: 'success', message: 'Valid URL' }
}

export function validateMapboxToken(value: string): FieldValidation {
  const v = value.trim()
  if (!v) return { level: 'idle' }
  if (/^pk\./.test(v)) return { level: 'success', message: 'Public token (pk)' }
  if (/^sk\./.test(v)) return { level: 'warning', message: 'Secret token (sk) — restrict exposure' }
  return { level: 'error', message: 'Expected pk.* or sk.* prefix' }
}

export function validateOpenAiKey(value: string): FieldValidation {
  const v = value.trim()
  if (!v) return { level: 'idle' }
  if (/^sk-/.test(v)) return { level: 'success', message: 'OpenAI key format' }
  return { level: 'warning', message: 'Unusual key format' }
}

export function validateField(
  providerId: ProviderId,
  fieldId: string,
  value: string,
): FieldValidation {
  if (providerId === 'mapbox' && (fieldId === 'accessToken' || fieldId === 'publicToken' || fieldId === 'secretToken')) {
    return validateMapboxToken(value)
  }
  if (providerId === 'openai' && fieldId === 'apiKey') return validateOpenAiKey(value)
  if (fieldId.includes('Url') || fieldId === 'baseUrl' || fieldId === 'portalUrl' || fieldId === 'endpoint') {
    return value ? validateUrl(value) : { level: 'idle' }
  }
  return { level: 'idle' }
}

export function validateIntegrationDraft(draft: IntegrationDraft): ValidationResult {
  const provider = getProvider(draft.providerId)
  const fields = getFieldsForAuth(provider, draft.authType)
  const fieldResults: Record<string, FieldValidation> = {}
  let valid = true

  if (!draft.name.trim()) {
    valid = false
    fieldResults._name = { level: 'error', message: 'Name is required' }
  }

  if (draft.baseUrl.trim() && validateUrl(draft.baseUrl).level === 'error') {
    valid = false
    fieldResults.baseUrl = validateUrl(draft.baseUrl)
  }

  for (const f of fields) {
    const val = draft.config[f.id] ?? ''
    if (f.required && !val.trim()) {
      valid = false
      fieldResults[f.id] = { level: 'error', message: 'Required' }
      continue
    }
    if (f.pattern && val && !f.pattern.test(val)) {
      valid = false
      fieldResults[f.id] = { level: 'error', message: f.patternMessage ?? 'Invalid format' }
      continue
    }
    const live = validateField(draft.providerId, f.id, val)
    if (live.level === 'error') {
      valid = false
      fieldResults[f.id] = live
    } else if (live.level === 'success' || live.level === 'warning') {
      fieldResults[f.id] = live
    }
  }

  return { valid, fields: fieldResults }
}

export function primarySecretKey(providerId: ProviderId, authType: AuthType): string {
  const provider = getProvider(providerId)
  const fields = getFieldsForAuth(provider, authType)
  const secret = fields.find(f => f.secret && f.required) ?? fields.find(f => f.secret)
  return secret?.id ?? 'apiKey'
}
