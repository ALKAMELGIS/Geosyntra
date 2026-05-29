/**
 * Multi-field system token cards (Admin → API Tokens).
 * Maps one UI card to one or more registry `name` rows in `system_tokens`.
 */

export type SystemTokenFieldSpec = {
  key: string
  label: string
  tokenName: string
  required?: boolean
  secret?: boolean
  placeholder?: string
  hint?: string
  pattern?: RegExp
  patternMessage?: string
}

export type SystemTokenCompositeCard = {
  /** Primary registry name (card id, test target). */
  primaryName: string
  /** Registry names merged into this card (hidden as separate tiles). */
  linkedNames: string[]
  fields: SystemTokenFieldSpec[]
}

const WMS_INSTANCE_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const SENTINEL_HUB_WMS_CARD: SystemTokenCompositeCard = {
  primaryName: 'sentinelhub_wms',
  linkedNames: ['sentinelhub'],
  fields: [
    {
      key: 'oauth',
      label: 'OAuth access token',
      tokenName: 'sentinelhub',
      required: true,
      secret: true,
      placeholder: 'Paste Sentinel Hub OAuth token',
      hint: 'From Copernicus Data Space / Sentinel Hub dashboard.',
    },
    {
      key: 'wmsInstanceId',
      label: 'WMS instance ID',
      tokenName: 'sentinelhub_wms',
      required: true,
      secret: false,
      placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      hint: 'UUID of your Sentinel Hub WMS instance.',
      pattern: WMS_INSTANCE_UUID,
      patternMessage: 'Enter a valid WMS instance UUID.',
    },
  ],
}

const COMPOSITE_BY_PRIMARY = new Map<string, SystemTokenCompositeCard>([
  [SENTINEL_HUB_WMS_CARD.primaryName, SENTINEL_HUB_WMS_CARD],
])

export function systemTokenCompositeCard(name: string): SystemTokenCompositeCard | null {
  return COMPOSITE_BY_PRIMARY.get(name) ?? null
}

export function isLinkedSystemTokenName(name: string): boolean {
  if (COMPOSITE_BY_PRIMARY.has(name)) return false
  for (const card of COMPOSITE_BY_PRIMARY.values()) {
    if (card.linkedNames.includes(name)) return true
  }
  return false
}

export function emptyCompositeDraft(card: SystemTokenCompositeCard): Record<string, string> {
  return Object.fromEntries(card.fields.map(f => [f.key, '']))
}

export function validateCompositeDraft(
  card: SystemTokenCompositeCard,
  draft: Record<string, string>,
): string | null {
  for (const field of card.fields) {
    const v = String(draft[field.key] ?? '').trim()
    if (!v) continue
    if (field.pattern && !field.pattern.test(v)) {
      return field.patternMessage ?? `${field.label} is invalid.`
    }
  }
  return null
}
