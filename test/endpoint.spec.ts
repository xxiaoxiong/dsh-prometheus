import { createServer } from 'node:net'
import { Context } from '@deepseek-ai/cordis'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import { Gauge, Registry } from 'prom-client'
import { afterEach, describe, expect, it } from 'vitest'
import { installEndpoint } from '../src/endpoint.js'
import type { Config } from '../src/config.js'

const disposers: Array<() => Promise<void>> = []

afterEach(async () => {
  for (const dispose of disposers.splice(0).reverse()) await dispose()
})

function config(overrides: Partial<Config> = {}): Config {
  return {
    enabled: true,
    mode: 'standalone',
    host: '127.0.0.1',
    port: 0,
    path: '/metrics',
    allowRemote: false,
    maxLabelValues: 64,
    maxLabelValueLength: 80,
    ...overrides,
  }
}

function registry(): Registry {
  const output = new Registry()
  new Gauge({ name: 'dsh_endpoint_fixture', help: 'fixture', registers: [output] }).set(7)
  return output
}

describe('metric endpoint adapters', () => {
  it('serves GET/HEAD on a standalone loopback socket and closes it on fiber disposal', async () => {
    const ctx = new Context()
    let url = ''
    const fiber = await ctx.plugin(async function standaloneEndpointTest(inner: Context) {
      const active = await installEndpoint(inner, config(), registry())
      if (active.mode !== 'standalone') throw new Error('expected standalone endpoint')
      url = `http://${active.host}:${active.port}${active.path}`
    })
    disposers.push(fiber.dispose)

    const response = await fetch(url)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.text()).toContain('dsh_endpoint_fixture 7')
    const head = await fetch(url, { method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(await head.text()).toBe('')
    expect((await fetch(url, { method: 'POST' })).status).toBe(405)

    await fiber.dispose()
    disposers.pop()
    await expect(fetch(url)).rejects.toThrow()
  })

  it('prefers the public WebServer route in auto mode and unregisters it', async () => {
    const ctx = new Context()
    const webFiber = await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
    disposers.push(webFiber.dispose)
    let path = ''
    const endpointFiber = await ctx.plugin(async function webEndpointTest(inner: Context) {
      const active = await installEndpoint(inner, config({ mode: 'auto' }), registry())
      if (active.mode !== 'webserver') throw new Error('expected webserver endpoint')
      path = active.path
    })
    disposers.push(endpointFiber.dispose)
    const url = `http://127.0.0.1:${ctx.webServer.port}${path}`

    expect(await (await fetch(url)).text()).toContain('dsh_endpoint_fixture 7')
    await endpointFiber.dispose()
    disposers.pop()
    expect((await fetch(url)).status).toBe(404)
  })

  it('fails closed when explicit web mode inherits a remote-facing listener without opt-in', async () => {
    const port = await freePort()
    const ctx = new Context()
    const webFiber = await ctx.plugin(WebServer, { host: '0.0.0.0', port })
    disposers.push(webFiber.dispose)
    const fiber = ctx.plugin(async function remoteWebEndpointTest(inner: Context) {
      await installEndpoint(inner, config({ mode: 'webserver' }), registry())
    })
    await expect(fiber).rejects.toThrow(/allowRemote/)
  })
})

async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('no TCP address')
  await new Promise<void>(resolve => { server.close(() => { resolve() }) })
  return address.port
}
