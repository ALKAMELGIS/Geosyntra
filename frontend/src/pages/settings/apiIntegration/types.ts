import type { ApiTokenTypeId } from '../../../lib/apiIntegrationTypes'

export type IntegrationEnvironment = 'development' | 'staging' | 'production'

export type IntegrationStatus =
  | 'connected'
  | 'disconnected'
  | 'expired'
  | 'invalid'
  | 'pending'
  | 'testing'
  | 'rate_limited'

export type AuthType =
  | 'api_key'
  | 'oauth2'
  | 'bearer'
  | 'basic'
  | 'jwt'
  | 'custom_header'
  | 'username_password'
  | 'client_credentials'

export type ProviderCategory = 'gis' | 'satellite' | 'weather' | 'ai' | 'storage' | 'database'

export type ProviderId =
  | 'mapbox'
  | 'arcgis_online'
  | 'arcgis_enterprise'
  | 'google_maps'
  | 'openrouteservice'
  | 'graphhopper'
  | 'cesium_ion'
  | 'here_maps'
  | 'sentinel_hub'
  | 'planet_labs'
  | 'earth_engine'
  | 'maxar'
  | 'copernicus'
  | 'landsat'
  | 'openweather'
  | 'tomorrow_io'
  | 'weather_api'
  | 'openai'
  | 'claude'
  | 'gemini'
  | 'deepseek'
  | 'groq'
  | 'azure_openai'
  | 'aws_s3'
  | 'azure_blob'
  | 'minio'
  | 'postgresql'
  | 'mongodb'

export type FieldKind = 'text' | 'password' | 'url' | 'number' | 'select'

export type TokenFieldDef = {
  id: string
  label: string
  kind?: FieldKind
  placeholder?: string
  required?: boolean
  secret?: boolean
  options?: { value: string; label: string }[]
  hint?: string
  pattern?: RegExp
  patternMessage?: string
}

export type ProviderConfig = {
  id: ProviderId
  label: string
  category: ProviderCategory
  iconClass: string
  description: string
  capabilities: string[]
  defaultBaseUrl?: string
  authTypes: AuthType[]
  defaultAuthType: AuthType
  /** Fields keyed by auth type */
  fieldsByAuth: Partial<Record<AuthType, TokenFieldDef[]>>
  /** Optional data-mapping keys for weather / sensor APIs */
  dataMappingFields?: { id: string; label: string; placeholder: string }[]
  /** Legacy vault slot for primary secret persistence */
  vaultTypeId?: ApiTokenTypeId
  /** Hostinger env only — no token save, test, or vault */
  envOnly?: boolean
  testEndpoint?: (values: Record<string, string>) => Promise<{ ok: boolean; latencyMs: number; message?: string }>
}

export type ValidationLevel = 'success' | 'warning' | 'error' | 'idle'

export type FieldValidation = {
  level: ValidationLevel
  message?: string
}

export type ValidationResult = {
  valid: boolean
  fields: Record<string, FieldValidation>
  globalMessage?: string
}

export type IntegrationDraft = {
  id?: string
  name: string
  providerId: ProviderId
  environment: IntegrationEnvironment
  integrationType: string
  authType: AuthType
  provider: string
  baseUrl: string
  pollingMinutes: number
  active: boolean
  notes: string
  config: Record<string, string>
  dataMapping: Record<string, string>
  status: IntegrationStatus
  lastCheckedAt: string | null
  lastSuccessAt: string | null
  latencyMs: number | null
}

export type IntegrationRecord = IntegrationDraft & {
  id: string
  createdAt: string
  updatedAt: string
}

export type SaveIntegrationPayload = {
  draft: IntegrationDraft
  secrets: Record<string, string>
}

export type TestConnectionPayload = {
  providerId: ProviderId
  authType: AuthType
  baseUrl: string
  secrets: Record<string, string>
}

export type TestConnectionResult = {
  status: IntegrationStatus
  latencyMs: number
  message: string
}
