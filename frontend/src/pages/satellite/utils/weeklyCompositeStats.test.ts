import { describe, expect, it } from 'vitest'
import { formatStatFixed, normalizeWeeklyCompositeStats } from './weeklyCompositeStats'

describe('weeklyCompositeStats', () => {
  it('normalizes undefined mean/min/max to finite values', () => {
    const stats = normalizeWeeklyCompositeStats({ mean: undefined, min: undefined, max: undefined }, [-1, 1])
    expect(Number.isFinite(stats.mean)).toBe(true)
    expect(Number.isFinite(stats.min)).toBe(true)
    expect(Number.isFinite(stats.max)).toBe(true)
    expect(stats.min).toBeLessThanOrEqual(stats.max)
  })

  it('formatStatFixed never throws on undefined', () => {
    expect(formatStatFixed(undefined, 3)).toBe('—')
    expect(() => formatStatFixed(0.42, 3)).not.toThrow()
    expect(formatStatFixed(0.42, 3)).toBe('0.420')
  })
})
