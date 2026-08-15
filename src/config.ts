import z from '@deepseek-ai/schemastery'

export type EndpointMode = 'auto' | 'webserver' | 'standalone'

export interface Config {
  /** Disable every listener and endpoint without removing the bundle row. */
  enabled: boolean
  /** Prefer a public DSH WebServer route, require it, or always own a socket. */
  mode: EndpointMode
  /** Standalone listener host. Remote binding also requires allowRemote. */
  host: '127.0.0.1' | '0.0.0.0'
  /** Standalone listener port. Zero requests an ephemeral test/development port. */
  port: number
  /** Exact HTTP pathname used by either endpoint adapter. */
  path: string
  /** Explicit acknowledgement that the endpoint may be remotely reachable. */
  allowRemote: boolean
  /** Maximum accepted dynamic values for each label key. */
  maxLabelValues: number
  /** Maximum length of one accepted dynamic label value. */
  maxLabelValueLength: number
}

export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
  mode: z.union([z.const('auto'), z.const('webserver'), z.const('standalone')]).default('auto'),
  host: z.union([z.const('127.0.0.1'), z.const('0.0.0.0')]).default('127.0.0.1'),
  port: z.natural().max(65_535).default(9464),
  path: z.string().default('/metrics'),
  allowRemote: z.boolean().default(false),
  maxLabelValues: z.natural().min(1).max(1_024).default(64),
  maxLabelValueLength: z.natural().min(8).max(256).default(80),
})

/** Cross-field and pathname checks that Schemastery does not express. */
export function validateConfig(config: Config): void {
  if (!config.path.startsWith('/')) {
    throw new Error('dsh-prometheus: path must start with "/"')
  }
  if (config.path.length > 1 && config.path.endsWith('/')) {
    throw new Error('dsh-prometheus: path must not have a trailing slash')
  }
  if (config.path.includes('?') || config.path.includes('#')) {
    throw new Error('dsh-prometheus: path must not contain a query or fragment')
  }
  if (config.host === '0.0.0.0' && !config.allowRemote) {
    throw new Error('dsh-prometheus: host 0.0.0.0 requires allowRemote: true')
  }
}
