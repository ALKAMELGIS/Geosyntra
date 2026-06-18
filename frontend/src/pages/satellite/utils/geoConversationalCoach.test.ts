import { describe, expect, it } from 'vitest'
import { buildConversationalFlow, pickConversationalStep } from './geoConversationalCoach'

describe('geoConversationalCoach', () => {
  it('merges grounding chips before smart suggestions', () => {
    const steps = buildConversationalFlow({
      groundingChips: ['Route from map pin', 'Nearby restaurants'],
      smartContext: { hasAoi: true },
      smartEnabled: true,
    })
    expect(steps.length).toBeGreaterThan(2)
    expect(steps[0]?.source).toBe('grounding')
    expect(steps[0]?.insertText).toBe('Route from map pin')
  })

  it('picks one step by index', () => {
    const steps = buildConversationalFlow({
      groundingChips: ['A', 'B'],
      smartEnabled: false,
    })
    expect(pickConversationalStep(steps, 1)?.insertText).toBe('B')
  })
})
