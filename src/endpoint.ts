import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { Socket } from 'node:net'
import type { Context } from '@deepseek-ai/cordis'
import type { WebServer } from '@deepseek-ai/dsh-host-webserver'
import type { Registry } from 'prom-client'
import type { Config } from './config.js'

export type ActiveEndpoint =
  | { readonly mode: 'webserver'; readonly path: string }
  | { readonly mode: 'standalone'; readonly host: string; readonly port: number; readonly path: string }

/** Select and install exactly one lifecycle-owned scrape endpoint. */
export async function installEndpoint(
  ctx: Context,
  config: Config,
  registry: Registry,
): Promise<ActiveEndpoint> {
  const webServer = ctx.get('webServer') as WebServer | undefined
  const webServerIsAllowed = webServer !== undefined
    && (webServer.host === '127.0.0.1' || config.allowRemote)

  if (config.mode === 'webserver' && webServer === undefined) {
    throw new Error('dsh-prometheus: mode webserver requires the webServer service')
  }
  if (config.mode === 'webserver' && !webServerIsAllowed) {
    throw new Error('dsh-prometheus: remote-facing webServer requires allowRemote: true')
  }
  if ((config.mode === 'auto' && webServerIsAllowed) || config.mode === 'webserver') {
    const selected = webServer as WebServer
    ctx.effect(() => selected.register({
      kind: 'exact',
      path: config.path,
      handler: (req, res) => serveMetrics(req, res, registry),
    }))
    return { mode: 'webserver', path: config.path }
  }

  return installStandalone(ctx, config, registry)
}

async function installStandalone(
  ctx: Context,
  config: Config,
  registry: Registry,
): Promise<ActiveEndpoint> {
  const sockets = new Set<Socket>()
  const server = createServer((req, res) => {
    const pathname = safePathname(req)
    if (pathname !== config.path) {
      res.writeHead(404, securityHeaders())
      res.end()
      return
    }
    void serveMetrics(req, res, registry)
  })
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.once('close', () => { sockets.delete(socket) })
  })

  await listen(server, config.port, config.host)
  const address = server.address()
  if (address === null || typeof address === 'string') {
    await closeServer(server, sockets)
    throw new Error('dsh-prometheus: standalone endpoint did not expose a TCP address')
  }
  ctx.effect(() => async () => { await closeServer(server, sockets) })
  return { mode: 'standalone', host: config.host, port: address.port, path: config.path }
}

async function serveMetrics(req: IncomingMessage, res: ServerResponse, registry: Registry): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { ...securityHeaders(), allow: 'GET, HEAD' })
    res.end()
    return
  }
  try {
    const body = await registry.metrics()
    res.writeHead(200, {
      ...securityHeaders(),
      'content-type': registry.contentType,
    })
    res.end(req.method === 'HEAD' ? undefined : body)
  } catch {
    res.writeHead(500, {
      ...securityHeaders(),
      'content-type': 'text/plain; charset=utf-8',
    })
    res.end('metrics unavailable\n')
  }
}

function securityHeaders(): Record<string, string> {
  return {
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  }
}

function safePathname(req: IncomingMessage): string | undefined {
  try {
    return new URL(req.url ?? '/', 'http://localhost').pathname
  } catch {
    return undefined
  }
}

async function listen(server: Server, port: number, host: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off('listening', onListening)
      reject(error)
    }
    const onListening = (): void => {
      server.off('error', onError)
      resolve()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, host)
  })
}

async function closeServer(server: Server, sockets: ReadonlySet<Socket>): Promise<void> {
  if (!server.listening) return
  const closed = new Promise<void>((resolve) => { server.close(() => { resolve() }) })
  server.closeAllConnections()
  for (const socket of sockets) socket.destroy()
  await closed
}
