import { describe, expect, it, vi } from 'vitest'
import { CardinalityGuard, OVERFLOW_VALUE } from '../src/cardinality.js'

describe('CardinalityGuard', () => {
  it('accepts a bounded identifier vocabulary and reuses known values', () => {
    const onOverflow = vi.fn()
    const guard = new CardinalityGuard({ maxValues: 2, maxValueLength: 20, onOverflow })

    expect(guard.value('model', 'deepseek-chat')).toBe('deepseek-chat')
    expect(guard.value('model', 'deepseek-chat')).toBe('deepseek-chat')
    expect(guard.value('model', 'deepseek_reasoner')).toBe('deepseek_reasoner')
    expect(onOverflow).not.toHaveBeenCalled()
  })

  it('maps invalid, oversized, and excess values without retaining or returning them', () => {
    const onOverflow = vi.fn()
    const guard = new CardinalityGuard({ maxValues: 1, maxValueLength: 12, onOverflow })

    expect(guard.value('provider', 'safe')).toBe('safe')
    expect(guard.value('provider', 'second')).toBe(OVERFLOW_VALUE)
    expect(guard.value('tool', 'contains secret whitespace')).toBe(OVERFLOW_VALUE)
    expect(guard.value('kind', '../not-safe')).toBe(OVERFLOW_VALUE)
    expect(onOverflow).toHaveBeenCalledTimes(3)
  })

  it('releases its accepted-value state on disposal', () => {
    const guard = new CardinalityGuard({ maxValues: 1, maxValueLength: 20, onOverflow: () => {} })
    expect(guard.value('model', 'first')).toBe('first')
    expect(guard.value('model', 'second')).toBe(OVERFLOW_VALUE)
    guard.clear()
    expect(guard.value('model', 'second')).toBe('second')
  })
})
