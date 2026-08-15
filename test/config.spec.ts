import { describe, expect, it } from 'vitest'
import { validateConfig, type Config } from '../src/config.js'

const base = (): Config => ({
  enabled: true,
  mode: 'auto',
  host: '127.0.0.1',
  port: 9464,
  path: '/metrics',
  allowRemote: false,
  maxLabelValues: 64,
  maxLabelValueLength: 80,
})

describe('validateConfig', () => {
  it('accepts the safe loopback defaults', () => {
    expect(() => { validateConfig(base()) }).not.toThrow()
  })

  it('fails closed for an unacknowledged remote bind', () => {
    expect(() => { validateConfig({ ...base(), host: '0.0.0.0' }) }).toThrow(/allowRemote/)
    expect(() => { validateConfig({ ...base(), host: '0.0.0.0', allowRemote: true }) }).not.toThrow()
  })

  it.each(['metrics', '/metrics/', '/metrics?x=1', '/metrics#fragment'])(
    'rejects unsafe or non-exact path %s',
    path => { expect(() => { validateConfig({ ...base(), path }) }).toThrow() },
  )
})
