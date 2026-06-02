import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  planAllowsFeature,
  normalizePlanId,
  GEO_FEATURES,
} from '../../server/billing/planDefinitions.js'

describe('planDefinitions', () => {
  it('normalizes plan ids', () => {
    assert.equal(normalizePlanId('PRO'), 'pro')
    assert.equal(normalizePlanId('enterprise'), 'enterprise')
    assert.equal(normalizePlanId(''), 'free')
  })

  it('free allows basic POI and blocks AOI', () => {
    assert.equal(planAllowsFeature('free', GEO_FEATURES.POI_SEARCH_BASIC), true)
    assert.equal(planAllowsFeature('free', GEO_FEATURES.AOI_ANALYSIS), false)
    assert.equal(planAllowsFeature('pro', GEO_FEATURES.AOI_ANALYSIS), true)
    assert.equal(planAllowsFeature('enterprise', GEO_FEATURES.API_ACCESS), true)
  })
})
