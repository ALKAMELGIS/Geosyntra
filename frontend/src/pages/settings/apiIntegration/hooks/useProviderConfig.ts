import { useMemo } from 'react'
import type { AuthType, ProviderId, TokenFieldDef } from '../types'
import { AUTH_TYPE_LABELS, getFieldsForAuth, getProvider } from '../providers/registry'

export function useProviderConfig(providerId: ProviderId, authType: AuthType) {
  const provider = useMemo(() => getProvider(providerId), [providerId])

  const authOptions = useMemo(
    () =>
      provider.authTypes.map(id => ({
        id,
        label: AUTH_TYPE_LABELS[id],
      })),
    [provider.authTypes],
  )

  const fields: TokenFieldDef[] = useMemo(
    () => getFieldsForAuth(provider, authType),
    [provider, authType],
  )

  const dataMappingFields = provider.dataMappingFields

  return {
    provider,
    authOptions,
    fields,
    dataMappingFields,
    capabilities: provider.capabilities,
    defaultBaseUrl: provider.defaultBaseUrl,
  }
}
