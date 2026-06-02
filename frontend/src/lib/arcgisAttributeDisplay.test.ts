import { describe, expect, it } from 'vitest'
import {
  formatFeaturePropertiesForPopup,
  resolveIdentifyPopupTitle,
  sanitizePopupDisplayValue,
} from './arcgisAttributeDisplay'

describe('sanitizePopupDisplayValue', () => {
  it('strips stored code suffix', () => {
    expect(sanitizePopupDisplayValue('Automatic (stored code: 11002)')).toBe('Automatic')
  })

  it('strips code suffix', () => {
    expect(sanitizePopupDisplayValue('Netafim (code: 12003)')).toBe('Netafim')
  })

  it('leaves plain values unchanged', () => {
    expect(sanitizePopupDisplayValue('NH 15')).toBe('NH 15')
  })
})

describe('resolveIdentifyPopupTitle', () => {
  it('combines layer and feature name', () => {
    expect(
      resolveIdentifyPopupTitle({ FARM_NAME: 'NH 15' }, 'FeatureServer 21'),
    ).toBe('FeatureServer 21: NH 15')
  })

  it('returns layer only when no name field', () => {
    expect(resolveIdentifyPopupTitle({ AREA_HA: 1 }, 'FeatureServer 21')).toBe('FeatureServer 21')
  })
})

describe('formatFeaturePropertiesForPopup', () => {
  it('does not append stored codes without arc def', () => {
    const out = formatFeaturePropertiesForPopup(
      { CLIMATE_CONTRO: 'Automatic (stored code: 11002)' },
      { properties: { CLIMATE_CONTRO: 'Automatic (stored code: 11002)' } },
      null,
    )
    expect(out.CLIMATE_CONTRO).toBe('Automatic')
  })
})
