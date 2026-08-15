import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { Context, type Fiber } from '@deepseek-ai/cordis'
import { AgentRegistry } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import {
  createUserMessage,
  LlmAdapter,
  LlmRuntime,
  type GenerateOptions,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'
import { SessionId, SessionStore } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { SubagentRuntime } from '@deepseek-ai/dsh-subagent'
import { LocalJobRegistry } from '@deepseek-ai/dsh-jobs-local'
import { describe, expect, it } from 'vitest'
import prometheusPlugin, { type PrometheusConfig } from '../src/index.js'

const PRIVATE_PROMPT = 'COMPOSITION_PRIVATE_PROMPT'
const PRIVATE_PATH = 'C:/customers/acme/private.txt'

class FixtureAdapter extends LlmAdapter {
  async * stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: PRIVATE_PROMPT }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: PRIVATE_PROMPT } }
    yield { type: 'usage', usage: { inputTokens: 8, outputTokens: 3 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

describe('real DSH rc.6 composition', () => {
  it('observes public services, scrapes valid metrics, preserves privacy, and uninstalls cleanly', async () => {
    const ctx = new Context()
    const fibers: Fiber[] = []
    let detachController: (() => void) | undefined
    try {
      fibers.push(await ctx.plugin(SessionStore))
      fibers.push(await ctx.plugin(AgentRegistry))
      fibers.push(await ctx.plugin(LlmRuntime))
      fibers.push(await ctx.plugin(SystemPrompt))
      fibers.push(await ctx.plugin(ToolRuntime))
      fibers.push(await ctx.plugin(SubagentRuntime))
      fibers.push(await ctx.plugin(LocalJobRegistry, {}))
      fibers.push(await ctx.plugin(AgentLoop, { agents: [] }))

      const adapterFiber = await ctx.plugin({
        name: 'fixture-adapter',
        inject: ['llm'],
        apply(inner: Context) {
          inner.llm.registerAdapter(['fixture-provider'], new FixtureAdapter())
        },
      })
      fibers.push(adapterFiber)

      const port = await freePort()
      const config: PrometheusConfig = {
        enabled: true,
        mode: 'standalone',
        host: '127.0.0.1',
        port,
        path: '/metrics',
        allowRemote: false,
        maxLabelValues: 64,
        maxLabelValueLength: 80,
      }
      const metricsFiber = await ctx.plugin(prometheusPlugin, config)
      fibers.push(metricsFiber)

      const agent = ctx.agentLoop.create(SessionId('private-session-id'), {
        provider: 'fixture-provider',
        model: 'fixture-model',
      }, {
        cwd: resolve('test/fixtures/private-workspace'),
      })
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: PRIVATE_PROMPT }],
        source: { kind: 'user' },
      }))
      await agent.whenIdle()
      expect(agent.session.events.at(-1)?.type).toBe('turn/end')

      detachController = ctx.jobs.attachController('prometheus-composition-test')
      type Outcome = { status: 'completed' | 'killed'; detail: string; output: string }
      let resolveDone!: (value: Outcome) => void
      let jobSettled = false
      const settleJob = (value: Outcome): void => {
        if (jobSettled) return
        jobSettled = true
        resolveDone(value)
      }
      const done = new Promise<Outcome>((resolve) => {
        resolveDone = resolve
      })
      const jobId = ctx.jobs.start({
        kind: 'bash',
        label: PRIVATE_PATH,
        run: () => ({
          cancel: () => { settleJob({ status: 'killed', detail: 'cleanup', output: '' }) },
          done,
        }),
      })
      let body = await (await fetch(`http://127.0.0.1:${port}/metrics`)).text()
      expect(body).toContain('dsh_jobs_active{kind="bash"} 1')
      expect(body).toContain('dsh_jobs_started_total{kind="bash"} 1')

      settleJob({ status: 'completed', detail: PRIVATE_PROMPT, output: PRIVATE_PATH })
      await ctx.jobs.wait(jobId, 5_000)
      await Promise.resolve()

      const response = await fetch(`http://127.0.0.1:${port}/metrics`)
      expect(response.status).toBe(200)
      body = await response.text()
      expect(body).toContain('dsh_sessions_active 1')
      expect(body).toContain('dsh_agent_turns_total{status="completed"} 1')
      expect(body).toContain('dsh_llm_requests_total{provider="fixture-provider",model="fixture-model",purpose="agent",status="stop"} 1')
      expect(body).toContain('dsh_llm_input_tokens_total{provider="fixture-provider",model="fixture-model"} 8')
      expect(body).toContain('dsh_jobs_active{kind="bash"} 0')
      expect(body).toContain('dsh_jobs_completed_total{kind="bash"} 1')
      expect(body).not.toContain(PRIVATE_PROMPT)
      expect(body).not.toContain(PRIVATE_PATH)
      expect(body).not.toContain('private-session-id')
      expect(body).not.toContain('private\\workspace')

      await metricsFiber.dispose()
      fibers.pop()
      await expect(fetch(`http://127.0.0.1:${port}/metrics`)).rejects.toThrow()

      // The observed services remain usable after the plugin has been removed.
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'second turn after metrics uninstall' }],
        source: { kind: 'user' },
      }))
      await agent.whenIdle()
    } finally {
      detachController?.()
      for (const fiber of fibers.reverse()) await fiber.dispose()
    }
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
