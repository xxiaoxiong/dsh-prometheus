export const OVERFLOW_VALUE = '__other__'

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:/-]*$/

export interface CardinalityOptions {
  maxValues: number
  maxValueLength: number
  onOverflow(label: DynamicLabel): void
}

export type DynamicLabel = 'provider' | 'model' | 'tool' | 'kind'

/**
 * Bounds metric series before values reach prom-client. Rejected values are
 * never logged, hashed, exported, or retained.
 */
export class CardinalityGuard {
  private readonly values = new Map<DynamicLabel, Set<string>>()

  constructor(private readonly options: CardinalityOptions) {}

  value(label: DynamicLabel, raw: string): string {
    if (raw.length === 0
      || raw.length > this.options.maxValueLength
      || !SAFE_IDENTIFIER.test(raw)) {
      this.options.onOverflow(label)
      return OVERFLOW_VALUE
    }

    let accepted = this.values.get(label)
    if (accepted === undefined) {
      accepted = new Set<string>()
      this.values.set(label, accepted)
    }
    if (accepted.has(raw)) return raw
    if (accepted.size >= this.options.maxValues) {
      this.options.onOverflow(label)
      return OVERFLOW_VALUE
    }
    accepted.add(raw)
    return raw
  }

  clear(): void {
    this.values.clear()
  }
}
